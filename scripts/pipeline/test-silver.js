#!/usr/bin/env node
/**
 * Test harness for the refactored ai-silver.js (parallel per-page extraction).
 *
 * Usage:
 *   node scripts/pipeline/test-silver.js --url https://example-practice.com
 *   node scripts/pipeline/test-silver.js --url https://example.com --bronze-cache /tmp/bronze.json
 *
 * Saves bronze + silver JSON to /tmp/silver-test/ and prints a diagnostic
 * report focused on the things the parallel refactor should improve:
 *  - did we extract from MORE pages than the old 8-page cap?
 *  - did doctors[] capture the full set?
 *  - did additionalContent grow vs. the old design?
 *  - any merge anomalies (missing scalars, dup-able doctors, etc.)?
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';
dotenvConfig({ path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scrape } from './lib/scraper.js';
import { extractSilver, filterUsefulPages } from './lib/ai-silver.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: null, bronzeCache: null, outDir: '/tmp/silver-test' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url')          opts.url = args[++i];
    else if (args[i] === '--bronze-cache') opts.bronzeCache = args[++i];
    else if (args[i] === '--out')     opts.outDir = args[++i];
  }
  if (!opts.url && !opts.bronzeCache) {
    console.error('Usage: test-silver.js --url <site-url> [--bronze-cache <path>]');
    process.exit(1);
  }
  return opts;
}

function bytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function main() {
  const opts = parseArgs();
  await mkdir(opts.outDir, { recursive: true });

  // ── 1. Bronze (scrape or cached) ─────────────────────────────────────────
  let bronze;
  if (opts.bronzeCache && existsSync(opts.bronzeCache)) {
    console.log(`[test] Loading cached bronze from ${opts.bronzeCache}...`);
    bronze = JSON.parse(await readFile(opts.bronzeCache, 'utf-8'));
  } else {
    console.log(`[test] Scraping ${opts.url}...`);
    const t0 = Date.now();
    bronze = await scrape(opts.url, { verbose: false });
    console.log(`[test] Scrape complete (${((Date.now() - t0) / 1000).toFixed(1)}s, ${bronze.pageCount} pages).`);

    const bronzePath = resolve(opts.outDir, 'bronze.json');
    const bronzeJson = JSON.stringify(bronze, null, 2);
    await writeFile(bronzePath, bronzeJson);
    console.log(`[test] Bronze saved → ${bronzePath} (${bytes(bronzeJson.length)})`);
  }

  // ── 2. Filter preview (no API calls) ─────────────────────────────────────
  const useful = filterUsefulPages(bronze.pages || []);
  console.log(`\n[test] Filter preview: ${useful.length}/${bronze.pages?.length || 0} pages survive noise filter`);
  console.log('[test] Pages that will be extracted:');
  for (const p of useful) {
    console.log(`         ${p.path.padEnd(40)} (${p.wordCount}w)`);
  }
  const dropped = (bronze.pages || []).filter(p => !useful.includes(p));
  if (dropped.length) {
    console.log(`[test] Dropped as noise/short:`);
    for (const p of dropped.slice(0, 20)) {
      console.log(`         ${p.path.padEnd(40)} (${p.wordCount || 0}w)`);
    }
    if (dropped.length > 20) console.log(`         ... and ${dropped.length - 20} more`);
  }

  // ── 3. Silver (parallel per-page) ────────────────────────────────────────
  console.log('\n[test] Running parallel silver extraction...');
  const t0 = Date.now();
  const silver = await extractSilver(bronze);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (Object.keys(silver).length === 0) {
    console.error('[test] Silver returned empty. Aborting.');
    process.exit(1);
  }

  const silverPath = resolve(opts.outDir, 'silver.json');
  // Serialize, dropping the back-compat getters
  const serializable = JSON.parse(JSON.stringify(silver));
  const silverJson = JSON.stringify(serializable, null, 2);
  await writeFile(silverPath, silverJson);
  console.log(`[test] Silver saved → ${silverPath} (${bytes(silverJson.length)}, ${elapsed}s)`);

  // ── 4. Diagnostic report ─────────────────────────────────────────────────
  console.log('\n══════════════ DIAGNOSTIC REPORT ══════════════');
  console.log(`Practice:        ${silver.practice?.name || '(missing!)'}`);
  console.log(`Phone:           ${silver.practice?.phone || '(missing)'}`);
  console.log(`Email:           ${silver.practice?.email || '(missing)'}`);
  console.log(`Address:         ${silver.address?.full || '(missing)'}`);
  console.log(`Hours:           ${silver.hours?.raw || JSON.stringify(silver.hours?.display) || '(missing)'}`);
  console.log(`Google review:   ${silver.practice?.googleReviewLink || '(missing)'}`);
  console.log(`Google profile:  ${silver.practice?.googleProfileLink || '(missing)'}`);

  console.log(`\nDoctors:         ${silver.doctors?.length || 0}`);
  for (const d of silver.doctors || []) {
    const bioLen = (d.bio || '').length;
    console.log(`  - ${d.name} (${d.credentials || 'no creds'}) bio:${bioLen}c photo:${d.photoPath ? 'Y' : 'N'} specialties:${d.specialties?.length || 0}`);
  }

  console.log(`\nServices:        ${silver.services?.offered?.length || 0}`);
  for (const s of (silver.services?.offered || []).slice(0, 15)) {
    console.log(`  - ${s.name} [${s.category}]`);
  }
  if ((silver.services?.offered?.length || 0) > 15) {
    console.log(`  ... and ${silver.services.offered.length - 15} more`);
  }

  console.log(`\nDifferentiators: ${silver.differentiators?.length || 0}`);
  for (const d of silver.differentiators || []) {
    console.log(`  - [${d.type}] ${d.label}  (src: ${d.source || '?'})`);
  }

  console.log(`\nAdditionalContent blocks: ${silver.additionalContent?.length || 0}`);
  // Show source distribution
  const bySource = {};
  for (const ac of silver.additionalContent || []) {
    bySource[ac.source || '?'] = (bySource[ac.source || '?'] || 0) + 1;
  }
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}× from ${src}`);
  }

  console.log(`\nTestimonials:    ${silver.content?.testimonials?.length || 0}`);
  console.log(`FAQs:            ${silver.content?.faqs?.length || 0}`);
  console.log(`Insurance:       ${silver.content?.insurance?.length || 0}`);
  console.log(`Specials:        ${silver.content?.specials?.length || 0}`);
  console.log(`heroTagline:     ${silver.content?.heroTagline ? '"' + silver.content.heroTagline.slice(0, 80) + '"' : '(missing)'}`);
  console.log(`aboutText len:   ${silver.content?.aboutText?.length || 0}c`);

  console.log(`\nImages:`);
  console.log(`  hero:        ${silver.images?.hero?.length || 0}`);
  console.log(`  team:        ${silver.images?.team?.length || 0}`);
  console.log(`  office:      ${silver.images?.office?.length || 0}`);
  console.log(`  gallery:     ${silver.images?.gallery?.length || 0}`);
  console.log(`  beforeAfter: ${silver.images?.beforeAfter?.length || 0}`);

  // Coverage check — were per-page extractions actually capturing content from
  // the long tail (pages 9+ in the old design)?
  const pagesContributingAC = new Set(Object.keys(bySource));
  const longTailContributors = [...pagesContributingAC].filter((p, i) => i >= 8);
  console.log(`\n══════════════ CATCH-ALL VERIFICATION ══════════════`);
  console.log(`Pages contributing additionalContent: ${pagesContributingAC.size}`);
  console.log(`(Old 8-page design would have capped this at most 8)`);
  console.log(`Long-tail pages (would have been silently dropped under old design): ${longTailContributors.length > 0 ? longTailContributors.join(', ') : '(none — site has ≤8 useful pages)'}`);

  console.log('\n══════════════ DONE ══════════════');
  console.log(`Silver:  ${silverPath}`);
  console.log(`Bronze:  ${resolve(opts.outDir, 'bronze.json')}`);
}

main().catch(err => {
  console.error('\n[test] FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
