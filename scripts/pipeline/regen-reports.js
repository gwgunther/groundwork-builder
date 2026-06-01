#!/usr/bin/env node
/**
 * Re-render audit-report.html + audit-summary.html from the JSON in
 * <audit-dir>/_data/. No re-scrape, no Claude calls, no PageSpeed —
 * just runs the report generator against existing data.
 *
 * Useful when you change the report template and want to see what
 * it looks like on real data without burning $1 + 2 minutes.
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
import { generateAuditReports } from './lib/audit-report-generator.js';

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
  const pagespeed = await readJsonOrNull(join(dataDir, 'pagespeed.json'));
  const aiAudit   = await readJsonOrNull(join(dataDir, 'ai-audit.json'));
  const techAudit = await readJsonOrNull(join(dataDir, 'tech-audit.json'));
  const trust     = await readJsonOrNull(join(dataDir, 'trust-scan.json'));
  const hosting   = await readJsonOrNull(join(dataDir, 'hosting-scan.json'));
  const gbp       = await readJsonOrNull(join(dataDir, 'gbp-scan.json'));
  const conv      = await readJsonOrNull(join(dataDir, 'conversion-scan.json'));
  const findings  = await readJsonOrNull(join(dataDir, 'findings.json'));

  // Merge all scanner findings into one techAudit-shaped object for the
  // report (same shape audit-site.js passes in on a live run).
  const allFindings = findings?.findings || [
    ...(techAudit?.findings  || []),
    ...(trust?.findings      || []),
    ...(hosting?.findings    || []),
    ...(gbp?.findings        || []),
    ...(conv?.findings       || []),
  ];
  const combinedTechAudit = {
    findings: allFindings,
    summary: {
      critical: allFindings.filter(f => f.severity === 'critical').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      passed:   allFindings.filter(f => f.severity === 'passed').length,
    },
  };
  const findingsSummary = findings?.summary || null;

  // Pull URL + practice name from silver
  const url = silver?.practice?.url || (silver?.practice?.domain ? `https://${silver.practice.domain}` : '');
  const practiceName = silver?.practice?.name || 'Site Audit';

  // Detect a previously-captured homepage screenshot. Newer audits save it
  // at audit-dir root; older ones may have it in _data/. Check both.
  let screenshotFile = null;
  try {
    await access(join(auditDir, 'homepage.png'));
    screenshotFile = 'homepage.png';
  } catch {
    try {
      await access(join(dataDir, 'homepage.png'));
      screenshotFile = '_data/homepage.png';
    } catch { /* none — report omits it */ }
  }

  console.log(`[Regen] Re-rendering reports for ${practiceName} (${allFindings.length} findings)...`);

  const { fullPath, summaryPath } = await generateAuditReports(auditDir, {
    url,
    practiceName,
    pagespeed,
    techAudit: combinedTechAudit,
    aiAudit,
    scraped: silver,
    findingsSummary,
    gbpMeta: gbp?.meta || null,
    screenshotFile,
  });
  console.log(`[Regen] ✓ Written:`);
  console.log(`    ${fullPath}`);
  console.log(`    ${summaryPath}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
