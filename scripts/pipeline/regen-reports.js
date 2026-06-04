#!/usr/bin/env node
/**
 * Re-render audit reports from _data/*.json — no re-scrape or API calls.
 *
 * Writes:
 *   audit-data.json      — source of truth
 *   audit-summary.html   — client sales one-pager
 *   audit-report.html    — full tabbed report
 *   build-spec.html      — internal JSON view
 *
 * Usage:
 *   node scripts/pipeline/regen-reports.js --audit-dir _audits/springstdentistry
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';

dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { refreshBaselineAuditArtifacts } from './lib/audit-artifacts.js';

function parseArgs() {
  const a = process.argv.slice(2);
  const opts = { auditDir: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--audit-dir') opts.auditDir = a[++i];
    else if (a[i] === '--help') {
      console.log('Usage: regen-reports.js --audit-dir <path-to-_audits/slug>');
      process.exit(0);
    }
  }
  if (!opts.auditDir) {
    console.error('Error: --audit-dir is required');
    process.exit(1);
  }
  return opts;
}

async function readJsonOrNull(path) {
  try { return JSON.parse(await readFile(path, 'utf-8')); }
  catch { return null; }
}

async function main() {
  const opts     = parseArgs();
  const auditDir = resolve(opts.auditDir);
  const dataDir  = join(auditDir, '_data');

  console.log(`[Regen] Loading from ${dataDir}...`);

  const silver    = await readJsonOrNull(join(dataDir, 'silver.json'));
  const bronze    = await readJsonOrNull(join(dataDir, 'bronze-pages.json'));
  const pagespeed = await readJsonOrNull(join(dataDir, 'pagespeed.json'));
  const aiAudit   = await readJsonOrNull(join(dataDir, 'ai-audit.json'));
  const findings  = await readJsonOrNull(join(dataDir, 'findings.json'));
  const gbp       = await readJsonOrNull(join(dataDir, 'gbp-scan.json'));

  const allFindings = findings?.findings || [];
  const combinedTechAudit = {
    findings: allFindings,
    summary: {
      critical: allFindings.filter(f => f.severity === 'critical').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      passed:   allFindings.filter(f => f.severity === 'passed').length,
    },
  };
  const findingsSummary = findings?.summary || null;

  const url = silver?.practice?.url
    || (silver?.practice?.domain ? `https://${silver.practice.domain}` : '');
  const practiceName = silver?.practice?.name || 'Site Audit';

  let screenshotFile = null;
  try {
    await access(join(auditDir, 'homepage.png'));
    screenshotFile = 'homepage.png';
  } catch {
    try {
      await access(join(dataDir, 'homepage.png'));
      screenshotFile = '_data/homepage.png';
    } catch { /* none */ }
  }

  console.log(`[Regen] Re-rendering for ${practiceName} (${allFindings.length} findings)...`);

  const paths = await refreshBaselineAuditArtifacts(auditDir);

  console.log('[Regen] ✓ Written:');
  console.log(`    ${paths.auditDataPath}`);
  console.log(`    ${paths.summaryPath}`);
  console.log(`    ${paths.fullPath}`);
  console.log(`    ${paths.buildSpecPath}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
