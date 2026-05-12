#!/usr/bin/env node
/**
 * Groundwork Builder — Standalone Site Audit
 *
 * Scrapes an existing site, runs PageSpeed + tech audit + AI content audit,
 * and generates two client-facing HTML reports. No site generation.
 *
 * Usage:
 *   node scripts/pipeline/audit-site.js --url https://example.com
 *   node scripts/pipeline/audit-site.js --url https://example.com --output _audits/smith-dental
 *   node scripts/pipeline/audit-site.js --url https://example.com --skip-pagespeed
 *   node scripts/pipeline/audit-site.js --url https://example.com --verbose
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';

// Load .env from repo root (same pattern as build-site.js)
dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { scrape }                 from './lib/scraper.js';
import { extractSilver }          from './lib/ai-silver.js';
import { analyzeImages }          from './lib/ai-images.js';
import { runPageSpeed }           from './lib/pagespeed.js';
import { runTechAudit }           from './lib/tech-audit.js';
import { runTrustScan }           from './lib/trust-scanner.js';
import { runHostingScan }         from './lib/hosting-scanner.js';
import { runGbpScan }             from './lib/gbp-scanner.js';
import { aggregateGrowthScore }   from './lib/findings.js';
import { runSiteAudit }           from './lib/ai-audit.js';
import { generateAuditReports }   from './lib/audit-report-generator.js';
import { mergeData }              from './lib/merger.js';
import { loadPreset }             from './lib/preset-loader.js';

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url:             null,
    output:          null,
    preset:          'dental',
    skipPagespeed:   false,
    verbose:         false,
    previewUrl:      null,
    placeId:         null,
    businessName:    null,
    skipGbp:         false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        opts.url = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--preset':
        opts.preset = args[++i];
        break;
      case '--skip-pagespeed':
        opts.skipPagespeed = true;
        break;
      case '--preview-url':
        opts.previewUrl = args[++i];
        break;
      case '--place-id':
        opts.placeId = args[++i];
        break;
      case '--business-name':
        opts.businessName = args[++i];
        break;
      case '--skip-gbp':
        opts.skipGbp = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (args[i].startsWith('--')) {
          console.warn(`Unknown flag: ${args[i]}`);
        }
        break;
    }
  }

  if (!opts.url) {
    console.error('Error: --url is required.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
Groundwork Builder — Site Audit

Usage:
  node scripts/pipeline/audit-site.js [options]

Options:
  --url <url>            Site URL to audit (required)
  --output <path>        Output directory (default: _audits/<slug>)
  --preset <name>        Vertical preset (default: dental)
  --skip-pagespeed       Skip Google PageSpeed Insights API call
  --preview-url <url>    Link to a Groundwork preview for this site
  --place-id <id>        Google Place ID to scan GBP directly (skips lookup)
  --business-name <q>    Business name to text-search for GBP (default: silver practice name + city)
  --skip-gbp             Skip the GBP scan entirely
  --verbose              Detailed output
  --help                 Show this help

Examples:
  node scripts/pipeline/audit-site.js --url https://smithdental.com
  node scripts/pipeline/audit-site.js --url https://smithdental.com --output _audits/smith-dental
  node scripts/pipeline/audit-site.js --url https://smithdental.com --skip-pagespeed
`.trim());
}

// ---------------------------------------------------------------------------
// Slugify helper (replicated locally to avoid importing from utils)
// ---------------------------------------------------------------------------

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'audit';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log('');
  console.log('=== Groundwork Builder — Site Audit ===');
  console.log('');
  console.log(`  URL:     ${opts.url}`);
  console.log(`  Preset:  ${opts.preset}`);
  console.log('');

  // ── Load preset ─────────────────────────────────────────────────────────
  console.log(`[Preset] Loading "${opts.preset}" preset...`);
  const preset = await loadPreset(opts.preset);
  console.log(`[Preset] ${preset.name}`);
  console.log('');

  // ── Phase 1: Scrape → Bronze ─────────────────────────────────────────────
  console.log('[Phase 1] Crawling site (bronze)...');
  let bronze = null;
  try {
    bronze = await scrape(opts.url, { verbose: opts.verbose });
    console.log(`  Crawled ${bronze.pageCount} pages.`);
  } catch (err) {
    console.error(`  Crawl failed: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // ── Phase 1b: Image analysis (cached in Supabase by URL + slug) ────────
  console.log('[Phase 1b] Analyzing images...');
  // Derive slug from URL hostname for now — replaced by practice slug after silver
  const urlSlug = slugify(new URL(opts.url).hostname.replace(/^www\./, '').split('.')[0]);
  try {
    bronze.imageAnalysis = await analyzeImages(bronze, urlSlug, { verbose: opts.verbose });
    const count = Object.keys(bronze.imageAnalysis).length;
    console.log(`  ${count} images analyzed.`);
  } catch (err) {
    console.warn(`  Image analysis failed (non-fatal): ${err.message}`);
    bronze.imageAnalysis = {};
  }
  console.log('');

  // ── Phase 2: Silver extraction ───────────────────────────────────────────
  console.log('[Phase 2] Extracting silver data via Claude...');
  let scraped = null;
  try {
    scraped = await extractSilver(bronze);
    console.log('  Silver extraction complete.');
  } catch (err) {
    console.warn(`  Silver extraction failed (non-fatal): ${err.message}`);
    scraped = {};
  }
  console.log('');

  // Save silver for debugging (written after outputDir is resolved below)
  const _silverForSave = scraped;

  // Resolve practice name early for output dir
  const practiceName = scraped?.practice?.name
    || (new URL(opts.url).hostname.replace(/^www\./, '').split('.')[0])
    || 'Site Audit';

  // Resolve output dir
  let outputDir = opts.output;
  if (!outputDir) {
    const slug = slugify(practiceName);
    outputDir = resolve('_audits', slug);
  }
  outputDir = resolve(outputDir);
  const dataDir = join(outputDir, '_data');
  await mkdir(dataDir, { recursive: true });
  console.log(`[Output] ${outputDir}`);
  console.log('');

  // Save silver data for debugging
  await writeFile(join(dataDir, 'silver.json'), JSON.stringify(_silverForSave, null, 2), 'utf-8').catch(() => {});

  // ── Phase 3: PageSpeed ───────────────────────────────────────────────────
  let pagespeed = null;
  if (!opts.skipPagespeed) {
    console.log('[Phase 3] Running PageSpeed Insights...');
    try {
      pagespeed = await runPageSpeed(opts.url);
      const m = pagespeed.mobile;
      const d = pagespeed.desktop;
      if (m) console.log(`  Mobile:  perf=${m.performance} seo=${m.seo} a11y=${m.accessibility} bp=${m.bestPractices}`);
      if (d) console.log(`  Desktop: perf=${d.performance} seo=${d.seo} a11y=${d.accessibility} bp=${d.bestPractices}`);
      await writeFile(join(dataDir, 'pagespeed.json'), JSON.stringify(pagespeed, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`  PageSpeed failed (non-fatal): ${err.message}`);
      pagespeed = { mobile: null, desktop: null };
    }
  } else {
    console.log('[Phase 3] Skipping PageSpeed (--skip-pagespeed).');
    // Try to reuse previously saved pagespeed data
    try {
      const { readFile } = await import('node:fs/promises');
      const saved = JSON.parse(await readFile(join(dataDir, 'pagespeed.json'), 'utf-8'));
      pagespeed = saved;
      console.log('  Loaded cached PageSpeed data.');
    } catch {
      pagespeed = { mobile: null, desktop: null };
    }
  }
  console.log('');

  // ── Phase 4: Tech Audit ──────────────────────────────────────────────────
  console.log('[Phase 4] Running tech audit...');
  const techAudit = runTechAudit(bronze, pagespeed);
  console.log(`  ${techAudit.summary.critical} critical · ${techAudit.summary.warnings} warnings · ${techAudit.summary.passed} passed`);
  await writeFile(join(dataDir, 'tech-audit.json'), JSON.stringify(techAudit, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4b: Trust scan ────────────────────────────────────────────────
  console.log('[Phase 4b] Running trust scan...');
  const trustScan = runTrustScan(bronze);
  console.log(`  ${trustScan.summary.critical} critical · ${trustScan.summary.warnings} warnings · ${trustScan.summary.passed} passed`);
  await writeFile(join(dataDir, 'trust-scan.json'), JSON.stringify(trustScan, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4c: Hosting scan ──────────────────────────────────────────────
  console.log('[Phase 4c] Running hosting scan...');
  let hostingScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  try {
    hostingScan = await runHostingScan(bronze);
    console.log(`  ${hostingScan.summary.critical} critical · ${hostingScan.summary.warnings} warnings · ${hostingScan.summary.passed} passed`);
    if (hostingScan.meta?.hostname) {
      console.log(`  Host: ${hostingScan.meta.hostname} · NS: ${(hostingScan.meta.nameservers || []).slice(0, 2).join(', ') || 'n/a'}`);
    }
  } catch (err) {
    console.warn(`  Hosting scan failed (non-fatal): ${err.message}`);
  }
  await writeFile(join(dataDir, 'hosting-scan.json'), JSON.stringify(hostingScan, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4d: GBP scan (Places Details API) ─────────────────────────────
  let gbpScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  if (opts.skipGbp) {
    console.log('[Phase 4d] Skipping GBP scan (--skip-gbp).');
    console.log('');
  } else if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[Phase 4d] Skipping GBP scan (GOOGLE_PLACES_API_KEY not set).');
    console.log('');
  } else {
    console.log('[Phase 4d] Running GBP scan...');
    try {
      const businessName = opts.businessName
        || (scraped?.practice?.name && scraped?.address?.city
            ? `${scraped.practice.name} ${scraped.address.city}`
            : scraped?.practice?.name || practiceName);
      gbpScan = await runGbpScan({ placeId: opts.placeId, businessName });
      if (gbpScan.meta?.found === false) {
        console.log(`  No GBP match for "${gbpScan.meta.query}".`);
      } else {
        console.log(`  Resolved: ${gbpScan.meta.displayName} · ${gbpScan.meta.userRatingCount} reviews`);
        console.log(`  ${gbpScan.summary.critical} critical · ${gbpScan.summary.warnings} warnings · ${gbpScan.summary.passed} passed`);
      }
    } catch (err) {
      console.warn(`  GBP scan failed (non-fatal): ${err.message}`);
    }
    await writeFile(join(dataDir, 'gbp-scan.json'), JSON.stringify(gbpScan, null, 2), 'utf-8');
    console.log('');
  }

  // ── Combined Growth Score across all detector outputs ───────────────────
  const allFindings = [
    ...techAudit.findings,
    ...trustScan.findings,
    ...hostingScan.findings,
    ...gbpScan.findings,
  ];
  const growthScore = aggregateGrowthScore(allFindings);
  if (growthScore != null) {
    console.log(`  Growth Score: ${growthScore}/100 (site + perf + trust + hosting + gbp)`);
    console.log('');
  }
  await writeFile(
    join(dataDir, 'findings.json'),
    JSON.stringify({ growthScore, findings: allFindings }, null, 2),
    'utf-8',
  );

  // ── Phase 5: AI Audit ────────────────────────────────────────────────────
  console.log('[Phase 5] Running AI content audit...');
  let aiAudit = null;
  try {
    const merged = mergeData(scraped, null, preset);
    aiAudit = await runSiteAudit(scraped, merged, preset, { verbose: opts.verbose });
    if (aiAudit) {
      console.log('  AI audit complete.');
      await writeFile(join(dataDir, 'ai-audit.json'), JSON.stringify(aiAudit, null, 2), 'utf-8');
    } else {
      console.log('  AI audit skipped (no API key or failed).');
    }
  } catch (err) {
    console.warn(`  AI audit failed (non-fatal): ${err.message}`);
  }
  console.log('');

  // ── Phase 6: Generate Reports ────────────────────────────────────────────
  console.log('[Phase 6] Generating audit reports...');
  // Synthesized "tech audit" view for the report = all findings merged so the
  // Findings tab renders site + perf + trust + hosting + GBP in one place.
  const combinedTechAudit = {
    findings: allFindings,
    summary: {
      critical: allFindings.filter(f => f.severity === 'critical').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      passed:   allFindings.filter(f => f.severity === 'passed').length,
    },
    growthScore,
  };
  const { fullPath, summaryPath } = await generateAuditReports(outputDir, {
    url: opts.url,
    practiceName,
    pagespeed,
    techAudit: combinedTechAudit,
    aiAudit,
    scraped,
    previewUrl: opts.previewUrl || null,
    growthScore,
    gbpMeta: gbpScan.meta || null,
  });
  console.log('');

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(56));
  console.log('  AUDIT SUMMARY');
  console.log('='.repeat(56));
  console.log('');
  console.log(`  Practice:  ${practiceName}`);
  console.log(`  URL:       ${opts.url}`);
  console.log(`  Pages:     ${bronze.pageCount}`);
  console.log('');

  if (pagespeed?.mobile) {
    const m = pagespeed.mobile;
    console.log(`  Scores (mobile):`);
    console.log(`    Performance:    ${m.performance ?? '—'}`);
    console.log(`    SEO:            ${m.seo ?? '—'}`);
    console.log(`    Accessibility:  ${m.accessibility ?? '—'}`);
    console.log(`    Best Practices: ${m.bestPractices ?? '—'}`);
    console.log('');
  }

  console.log(`  Tech findings:`);
  console.log(`    Critical:  ${techAudit.summary.critical}`);
  console.log(`    Warnings:  ${techAudit.summary.warnings}`);
  console.log(`    Passed:    ${techAudit.summary.passed}`);
  console.log('');

  if (techAudit.summary.critical > 0) {
    const crits = techAudit.findings.filter(f => f.severity === 'critical');
    console.log('  Critical issues:');
    for (const f of crits) {
      console.log(`    - [${f.category}] ${f.title}`);
    }
    console.log('');
  }

  console.log(`  Output:`);
  console.log(`    Full report:    ${fullPath}`);
  console.log(`    Summary:        ${summaryPath}`);
  console.log(`    Raw data:       ${dataDir}/`);
  console.log(`  Time: ${elapsed}s`);
  console.log('');
  console.log('='.repeat(56));
  console.log('');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('');
  console.error('Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
