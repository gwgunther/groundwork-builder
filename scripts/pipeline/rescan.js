#!/usr/bin/env node
/**
 * Groundwork Builder — Re-scan
 *
 * Re-runs the grader's scanners against a "preview" URL (typically the built
 * Groundwork site) and diffs the result against the original audit's
 * findings.json. The output is the before/after artifact that powers the pitch.
 *
 * Usage:
 *   node scripts/pipeline/rescan.js --audit-dir _audits/<slug> --preview-url <url>
 *   node scripts/pipeline/rescan.js --audit-dir _audits/<slug> --preview-url <url> --skip-gbp
 *
 * Output (written into <audit-dir>/_data/):
 *   findings-after.json     — re-run findings (after state)
 *   findings-diff.json      — per-id diff with before/after + transition
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';

dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { resolve, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { scrape }                 from './lib/scraper.js';
import { runTechAudit }           from './lib/tech-audit.js';
import { runTrustScan }           from './lib/trust-scanner.js';
import { runHostingScan }         from './lib/hosting-scanner.js';
import { runGbpScan }             from './lib/gbp-scanner.js';
import { diffFindings, summarizeDiff } from './lib/findings-diff.js';
import { generateAuditReports } from './lib/audit-report-generator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    auditDir:    null,
    previewUrl:  null,
    skipGbp:     false,
    placeId:     null,
    verbose:     false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--audit-dir':    opts.auditDir   = args[++i]; break;
      case '--preview-url':  opts.previewUrl = args[++i]; break;
      case '--place-id':     opts.placeId    = args[++i]; break;
      case '--skip-gbp':     opts.skipGbp    = true;      break;
      case '--verbose':      opts.verbose    = true;      break;
      case '--help':         printHelp(); process.exit(0);
      default:
        if (args[i].startsWith('--')) console.warn(`Unknown flag: ${args[i]}`);
    }
  }
  if (!opts.auditDir || !opts.previewUrl) {
    console.error('Error: --audit-dir and --preview-url are required.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }
  return opts;
}

function printHelp() {
  console.log(`
Groundwork Builder — Re-scan

Usage:
  node scripts/pipeline/rescan.js [options]

Options:
  --audit-dir <path>     Audit directory from a prior audit-site.js run (required)
  --preview-url <url>    Built/preview URL to re-scan (required)
  --place-id <id>        Reuse this GBP placeId in the re-scan
  --skip-gbp             Skip GBP scan in the re-scan
  --verbose              Detailed output
  --help                 Show this help
`.trim());
}

async function main() {
  const opts = parseArgs();
  const start = Date.now();

  const auditDir = resolve(opts.auditDir);
  const dataDir  = join(auditDir, '_data');

  console.log('');
  console.log('=== Groundwork Builder — Re-scan ===');
  console.log(`  Audit dir:    ${auditDir}`);
  console.log(`  Preview URL:  ${opts.previewUrl}`);
  console.log('');

  // ── Load original findings ─────────────────────────────────────────────
  let beforeData = null;
  try {
    beforeData = JSON.parse(await readFile(join(dataDir, 'findings.json'), 'utf-8'));
  } catch (err) {
    console.error(`Could not load ${dataDir}/findings.json: ${err.message}`);
    console.error('Run audit-site.js against the original URL first.');
    process.exit(1);
  }
  const beforeFindings = beforeData?.findings || [];
  console.log(`[Before] ${beforeFindings.length} findings loaded.`);
  console.log('');

  // ── Scrape preview ─────────────────────────────────────────────────────
  console.log('[1/4] Crawling preview URL...');
  let bronze = null;
  try {
    bronze = await scrape(opts.previewUrl, { verbose: opts.verbose });
    console.log(`  Crawled ${bronze.pageCount} pages.`);
  } catch (err) {
    console.error(`  Crawl failed: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // ── Re-run scanners (no AI / no PageSpeed — those are slow and not the diff signal) ──
  console.log('[2/4] Running tech audit on preview...');
  const techAudit = runTechAudit(bronze, null);
  console.log(`  ${techAudit.summary.critical} critical · ${techAudit.summary.warnings} warnings · ${techAudit.summary.passed} passed`);

  console.log('[2/4] Running trust scan on preview...');
  const trustScan = runTrustScan(bronze);
  console.log(`  ${trustScan.summary.critical} critical · ${trustScan.summary.warnings} warnings · ${trustScan.summary.passed} passed`);

  console.log('[2/4] Running hosting scan on preview...');
  const hostingScan = await runHostingScan(bronze);
  console.log(`  ${hostingScan.summary.critical} critical · ${hostingScan.summary.warnings} warnings · ${hostingScan.summary.passed} passed`);

  // ── GBP: re-use the original placeId (the GBP itself didn't change unless we wrote to it)
  let gbpScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  if (opts.skipGbp) {
    console.log('[3/4] Skipping GBP scan (--skip-gbp).');
  } else if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[3/4] Skipping GBP scan (GOOGLE_PLACES_API_KEY not set).');
  } else {
    console.log('[3/4] Re-running GBP scan...');
    try {
      // Prefer the explicit flag, fall back to the original audit's recorded placeId.
      let placeId = opts.placeId;
      if (!placeId) {
        try {
          const originalGbp = JSON.parse(await readFile(join(dataDir, 'gbp-scan.json'), 'utf-8'));
          placeId = originalGbp?.meta?.placeId || null;
        } catch { /* no prior gbp data */ }
      }
      if (placeId) {
        gbpScan = await runGbpScan({ placeId });
        console.log(`  ${gbpScan.summary.critical} critical · ${gbpScan.summary.warnings} warnings · ${gbpScan.summary.passed} passed`);
      } else {
        console.log('  No placeId available — skipping GBP re-scan.');
      }
    } catch (err) {
      console.warn(`  GBP scan failed (non-fatal): ${err.message}`);
    }
  }
  console.log('');

  // ── Combine + diff ─────────────────────────────────────────────────────
  console.log('[4/4] Computing diff...');
  const afterFindings = [
    ...techAudit.findings,
    ...trustScan.findings,
    ...hostingScan.findings,
    ...gbpScan.findings,
  ];
  const diff = diffFindings(beforeFindings, afterFindings);
  const summary = summarizeDiff(diff);

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, 'findings-after.json'),
    JSON.stringify({ findings: afterFindings, growthScore: summary.afterScore }, null, 2),
    'utf-8',
  );
  await writeFile(
    join(dataDir, 'findings-diff.json'),
    JSON.stringify({ summary, diff }, null, 2),
    'utf-8',
  );

  // ── Diff report (before → after) ───────────────────────────────────────
  // Pull practice name from the original audit's saved silver if available.
  let practiceName = 'Site Audit';
  try {
    const silver = JSON.parse(await readFile(join(dataDir, 'silver.json'), 'utf-8'));
    practiceName = silver?.practice?.name || practiceName;
  } catch { /* optional */ }

  await generateAuditReports(auditDir, {
    url: opts.previewUrl,
    practiceName,
    techAudit: {
      findings: afterFindings,
      summary: {
        critical: afterFindings.filter(f => f.severity === 'critical').length,
        warnings: afterFindings.filter(f => f.severity === 'warning').length,
        passed:   afterFindings.filter(f => f.severity === 'passed').length,
      },
    },
    gbpMeta: gbpScan.meta || null,
    diff: { summary, diff },
  });
  console.log('');

  // ── Summary ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('='.repeat(56));
  console.log('  RE-SCAN SUMMARY');
  console.log('='.repeat(56));
  console.log('');
  console.log(`  Growth Score:    ${summary.beforeScore ?? '—'} → ${summary.afterScore ?? '—'}`
    + (summary.delta != null ? `   (${summary.delta >= 0 ? '+' : ''}${summary.delta})` : ''));
  console.log('');
  console.log(`  Fixed:           ${summary.counts.fixed}`);
  console.log(`  Still issue:     ${summary.counts['still-issue']}`);
  console.log(`  Regressed:       ${summary.counts.regressed}`);
  console.log(`  Unchanged pass:  ${summary.counts.unchanged}`);
  console.log(`  New findings:    ${summary.counts.new}`);
  console.log(`  Removed:         ${summary.counts.removed}`);
  console.log('');

  if (summary.counts.fixed > 0) {
    console.log('  Newly fixed:');
    for (const d of diff.filter(d => d.transition === 'fixed').slice(0, 10)) {
      console.log(`    ✓ ${d.id} — ${d.fixed_copy || d.title}`);
    }
    console.log('');
  }
  if (summary.counts.regressed > 0) {
    console.log('  Regressed (was passing, now failing):');
    for (const d of diff.filter(d => d.transition === 'regressed')) {
      console.log(`    ✗ ${d.id} — ${d.title}`);
    }
    console.log('');
  }

  console.log(`  Output:`);
  console.log(`    findings-after.json:  ${dataDir}/findings-after.json`);
  console.log(`    findings-diff.json:   ${dataDir}/findings-diff.json`);
  console.log(`  Time: ${elapsed}s`);
  console.log('');
  console.log('='.repeat(56));
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
