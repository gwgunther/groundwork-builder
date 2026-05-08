#!/usr/bin/env node
/**
 * Test harness for the refactored ai-content.js (content map with
 * additionalContent + differentiators consumption + contentAudit field).
 *
 * Usage:
 *   node scripts/pipeline/test-content-map.js --silver /tmp/silver-test/silver.json
 *
 * Validates:
 *  - did the model actually USE additionalContent for hero/about/philosophy?
 *  - did it weave differentiators into service intros?
 *  - is contentAudit coherent + complete (every section has an entry)?
 *  - any contentAudit key inconsistency we should enforce in the prompt?
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';
dotenvConfig({ path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runContentMapping } from './lib/ai-content.js';
import { runContentMap } from './lib/ai-content-map.js';
import { loadPreset } from './lib/preset-loader.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { silver: null, outDir: '/tmp/silver-test' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--silver') opts.silver = args[++i];
    else if (args[i] === '--out') opts.outDir = args[++i];
  }
  if (!opts.silver) {
    console.error('Usage: test-content-map.js --silver <path-to-silver.json>');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await mkdir(opts.outDir, { recursive: true });

  // ── Load silver ──────────────────────────────────────────────────────────
  console.log(`[test] Loading silver from ${opts.silver}...`);
  const silver = JSON.parse(await readFile(opts.silver, 'utf-8'));

  // Reconstruct back-compat doctor / additionalDoctors fields stripped by JSON serialization
  silver.doctor           = silver.doctors?.[0]      || null;
  silver.additionalDoctors = silver.doctors?.slice(1) || [];

  console.log(`[test] Loaded: ${silver.practice?.name}, ${silver.doctors?.length || 0} doctors, ${silver.services?.offered?.length || 0} services, ${silver.additionalContent?.length || 0} prose blocks, ${silver.differentiators?.length || 0} differentiators`);

  // ── Load preset ──────────────────────────────────────────────────────────
  const preset = await loadPreset('dental');

  // ── Run Content Map (blueprint / audit) ──────────────────────────────────
  console.log('\n[test] Phase 2e: Running Content Map (blueprint)...');
  const tMap = Date.now();
  const blueprint = await runContentMap(silver, silver, null, preset, { verbose: true });
  const mapElapsed = ((Date.now() - tMap) / 1000).toFixed(1);

  if (!blueprint) {
    console.error('[test] Content Map returned null.');
    process.exit(1);
  }

  const blueprintPath = resolve(opts.outDir, 'content-blueprint.json');
  await writeFile(blueprintPath, JSON.stringify(blueprint, null, 2));
  const cov = blueprint.coverage || {};
  console.log(`[test] Blueprint saved → ${blueprintPath} (${mapElapsed}s)`);
  console.log(`         coverage: ${cov.totalSections || '?'} sections, quality=${JSON.stringify(cov.byQuality || {})}, action=${JSON.stringify(cov.byAction || {})}`);

  // ── Run Content Write (consumes blueprint) ──────────────────────────────
  console.log('\n[test] Phase 2f: Running Content Write (consuming blueprint)...');
  const t0 = Date.now();
  const contentMap = await runContentMapping(silver, silver, null, preset, { verbose: true }, blueprint);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!contentMap) {
    console.error('[test] Content Write returned null. Likely a JSON parse failure or truncation.');
    console.error('       Check the prompt length above — if it\'s near the maxTokens output cap, bump it.');
    process.exit(1);
  }

  const outPath = resolve(opts.outDir, 'content-map.json');
  await writeFile(outPath, JSON.stringify(contentMap, null, 2));
  console.log(`[test] Content map saved → ${outPath} (${elapsed}s)`);

  // ── Diagnostic report ───────────────────────────────────────────────────
  console.log('\n══════════════ CONTENT MAP REPORT ══════════════');

  console.log(`\nHomepage:`);
  console.log(`  heroHeadline:    ${truncate(contentMap.homepage?.heroHeadline)}`);
  console.log(`  heroSubheadline: ${truncate(contentMap.homepage?.heroSubheadline)}`);
  console.log(`  heroTagline:     ${truncate(contentMap.homepage?.heroTagline)}`);
  console.log(`  ctaText:         ${contentMap.homepage?.ctaText || '(missing)'}`);
  console.log(`  valueProp:       ${truncate(contentMap.homepage?.valueProp)}`);

  console.log(`\nAbout:`);
  console.log(`  headline:    ${truncate(contentMap.about?.headline)}`);
  console.log(`  introParagraph: ${truncate(contentMap.about?.introParagraph)}`);
  console.log(`  philosophy:  ${truncate(contentMap.about?.philosophy)}`);

  console.log(`\nServices: ${Object.keys(contentMap.services || {}).length} entries`);
  for (const [slug, svc] of Object.entries(contentMap.services || {}).slice(0, 8)) {
    console.log(`  ${slug}:`);
    console.log(`    headline: ${truncate(svc.headline)}`);
    console.log(`    intro:    ${truncate(svc.intro, 120)}`);
    if (svc.differentiatorsWoven?.length) {
      console.log(`    DIFFERENTIATORS WOVEN: ${svc.differentiatorsWoven.join(', ')}`);
    }
  }
  const totalServices = Object.keys(contentMap.services || {}).length;
  if (totalServices > 8) console.log(`  ... and ${totalServices - 8} more`);

  console.log(`\nFAQs: ${(contentMap.faqs || []).length}`);
  for (const f of (contentMap.faqs || []).slice(0, 3)) {
    console.log(`  Q: ${truncate(f.question, 80)}`);
    console.log(`  A: ${truncate(f.answer, 120)}`);
  }

  console.log(`\nBlogTopics: ${(contentMap.blogTopics || []).length}`);
  for (const t of (contentMap.blogTopics || []).slice(0, 5)) {
    console.log(`  - ${t.title}`);
  }

  // ── contentAudit coherence check (now from blueprint, not contentMap) ──
  console.log('\n══════════════ CONTENT AUDIT REPORT (from blueprint) ══════════════');
  const audit = blueprint.contentAudit || {};
  const auditKeys = Object.keys(audit);
  console.log(`Audit entries: ${auditKeys.length}`);
  if (auditKeys.length === 0) {
    console.log('⚠️  contentAudit field is EMPTY or MISSING — model did not produce it');
  } else {
    // Group by quality + action for summary
    const byQuality = {};
    const byAction  = {};
    for (const entry of Object.values(audit)) {
      byQuality[entry.quality || '(missing)'] = (byQuality[entry.quality || '(missing)'] || 0) + 1;
      byAction [entry.action  || '(missing)'] = (byAction [entry.action  || '(missing)'] || 0) + 1;
    }
    console.log('  by quality:', byQuality);
    console.log('  by action: ', byAction);

    console.log('\nAudit entries (top 10):');
    for (const [key, e] of auditKeys.slice(0, 10).map(k => [k, audit[k]])) {
      console.log(`  ${key.padEnd(40)} q=${(e.quality||'?').padEnd(10)} a=${(e.action||'?').padEnd(10)} src=${e.source || 'null'}`);
    }
    if (auditKeys.length > 10) console.log(`  ... and ${auditKeys.length - 10} more`);

    // Check for missing required entries (common ones we'd expect)
    const expected = [
      'homepage.heroHeadline',
      'about.introParagraph',
      'about.philosophy',
    ];
    const missing = expected.filter(k => !(k in audit));
    if (missing.length) {
      console.log(`\n⚠️  Expected audit keys missing: ${missing.join(', ')}`);
    } else {
      console.log('\n✓ Core expected audit keys all present');
    }
  }

  // ── additionalContent usage check ──────────────────────────────────────
  console.log('\n══════════════ SOURCE USAGE REPORT ══════════════');
  // Did the model pull from additionalContent? Check if any audit entry's
  // source matches a path that had an additionalContent block.
  const acSources = new Set((silver.additionalContent || []).map(ac => ac.source).filter(Boolean));
  const usedAcSources = new Set();
  for (const entry of Object.values(audit)) {
    if (entry?.source && acSources.has(entry.source)) {
      usedAcSources.add(entry.source);
    }
  }
  console.log(`additionalContent sources available: ${acSources.size}`);
  console.log(`additionalContent sources actually referenced in audit: ${usedAcSources.size}`);
  if (usedAcSources.size > 0) {
    console.log(`  Pages referenced: ${[...usedAcSources].join(', ')}`);
  }

  // Did the model weave differentiators?
  const wovenDifs = new Set();
  for (const svc of Object.values(contentMap.services || {})) {
    for (const lbl of svc.differentiatorsWoven || []) wovenDifs.add(lbl);
  }
  const totalDifs = (silver.differentiators || []).length;
  console.log(`\nDifferentiators woven into service intros: ${wovenDifs.size}/${totalDifs}`);
  if (wovenDifs.size > 0) {
    for (const lbl of [...wovenDifs].slice(0, 5)) console.log(`  - "${lbl}"`);
  }
  if (wovenDifs.size === 0) {
    console.log('  ⚠️  Zero differentiators woven — either no services matched any differentiator, or the model ignored the instruction');
  }

  console.log('\n══════════════ DONE ══════════════');
  console.log(`Content map: ${outPath}`);
}

function truncate(str, max = 80) {
  if (str == null) return '(null)';
  const s = String(str).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

main().catch(err => {
  console.error('\n[test] FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
