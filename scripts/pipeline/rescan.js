#!/usr/bin/env node
/**
 * Groundwork Builder — Re-scan (CLI)
 *
 * Thin wrapper around lib/rescan-core.js. The actual scanning/diff/report
 * logic lives there so build-site.js --publish can run it automatically.
 *
 * Usage:
 *   node scripts/pipeline/rescan.js --audit-dir _audits/<slug> --preview-url <url>
 *   node scripts/pipeline/rescan.js --audit-dir _audits/<slug> --preview-url <url> --skip-gbp
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';

dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { resolve, join } from 'node:path';
import { runRescan } from './lib/rescan-core.js';

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

  console.log('');
  console.log('=== Groundwork Builder — Re-scan ===');
  console.log(`  Audit dir:    ${auditDir}`);
  console.log(`  Preview URL:  ${opts.previewUrl}`);
  console.log('');

  const result = await runRescan({
    auditDir,
    previewUrl:  opts.previewUrl,
    skipGbp:     opts.skipGbp,
    placeId:     opts.placeId,
    verbose:     opts.verbose,
  });

  if (!result) {
    console.error(`Could not load ${auditDir}/_data/findings.json — run audit-site.js against the original URL first.`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('='.repeat(56));
  console.log('  RE-SCAN SUMMARY');
  console.log('='.repeat(56));
  console.log('');
  console.log(`  Fixed:           ${result.summary.counts.fixed}`);
  console.log(`  Still issue:     ${result.summary.counts['still-issue']}`);
  console.log(`  Regressed:       ${result.summary.counts.regressed}`);
  console.log(`  Unchanged pass:  ${result.summary.counts.unchanged}`);
  console.log(`  New findings:    ${result.summary.counts.new}`);
  console.log(`  Removed:         ${result.summary.counts.removed}`);
  console.log('');

  if (result.summary.counts.fixed > 0) {
    console.log('  Newly fixed:');
    for (const d of result.diff.filter(d => d.transition === 'fixed').slice(0, 10)) {
      console.log(`    ✓ ${d.id} — ${d.fixed_copy || d.title}`);
    }
    console.log('');
  }
  if (result.summary.counts.regressed > 0) {
    console.log('  Regressed (was passing, now failing):');
    for (const d of result.diff.filter(d => d.transition === 'regressed')) {
      console.log(`    ✗ ${d.id} — ${d.title}`);
    }
    console.log('');
  }

  const dataDir = join(auditDir, '_data');
  console.log(`  Output:`);
  console.log(`    findings-after.json:  ${dataDir}/findings-after.json`);
  console.log(`    findings-diff.json:   ${dataDir}/findings-diff.json`);
  console.log(`    audit-report-after.html:  ${auditDir}/audit-report-after.html`);
  console.log(`  Time: ${elapsed}s`);
  console.log('');
  console.log('='.repeat(56));
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
