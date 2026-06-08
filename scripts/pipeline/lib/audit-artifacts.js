/**
 * Load audit _data/ artifacts and refresh baseline outputs (audit-data.json,
 * audit-summary.html, build-spec.html, audit-report.html) from the original
 * pre-build findings — not the post-rescan preview scan.
 */

import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assembleAuditData } from './audit-data-assembler.js';
import { generateAuditReports } from './audit-report-generator.js';

async function readJsonOrNull(path) {
  try { return JSON.parse(await readFile(path, 'utf-8')); }
  catch { return null; }
}

/**
 * @param {string} auditDir
 * @returns {Promise<object|null>}
 */
export async function loadAuditContext(auditDir) {
  const root = resolve(auditDir);
  const dataDir = join(root, '_data');

  const silver = await readJsonOrNull(join(dataDir, 'silver.json'));
  const bronze = await readJsonOrNull(join(dataDir, 'bronze-pages.json'));
  const pagespeed = await readJsonOrNull(join(dataDir, 'pagespeed.json'));
  const aiAudit = await readJsonOrNull(join(dataDir, 'ai-audit.json'));
  const findings = await readJsonOrNull(join(dataDir, 'findings.json'));
  const gbp = await readJsonOrNull(join(dataDir, 'gbp-scan.json'));
  const vendor = await readJsonOrNull(join(dataDir, 'vendor.json'));
  const agenticScan = await readJsonOrNull(join(dataDir, 'agentic-scan.json'));

  if (!findings?.findings?.length) return null;

  const allFindings = findings.findings;
  const url = silver?.practice?.url
    || (silver?.practice?.domain ? `https://${silver.practice.domain}` : '');
  const practiceName = silver?.practice?.name || 'Site Audit';
  const slug = root.split('/').pop();

  let screenshotFile = null;
  try {
    await access(join(root, 'homepage.png'));
    screenshotFile = 'homepage.png';
  } catch {
    try {
      await access(join(dataDir, 'homepage.png'));
      screenshotFile = '_data/homepage.png';
    } catch { /* none */ }
  }

  return {
    auditDir: root,
    dataDir,
    slug,
    url,
    practiceName,
    bronze,
    pagespeed,
    aiAudit,
    scraped: silver,
    findings: allFindings,
    findingsSummary: findings.summary || null,
    gbpMeta: gbp?.meta || null,
    vendor,
    agenticBrowsing: agenticScan?.meta || null,
    screenshotFile,
    techAudit: {
      findings: allFindings,
      summary: {
        critical: allFindings.filter(f => f.severity === 'critical').length,
        warnings: allFindings.filter(f => f.severity === 'warning').length,
        passed: allFindings.filter(f => f.severity === 'passed').length,
      },
    },
  };
}

/**
 * Re-assemble audit-data.json and re-render baseline HTML from original findings.
 *
 * @param {string} auditDir
 * @param {object} [opts]
 * @param {string} [opts.leadApiUrl]
 */
export async function refreshBaselineAuditArtifacts(auditDir, opts = {}) {
  const ctx = await loadAuditContext(auditDir);
  if (!ctx) {
    console.warn('[audit-artifacts] No findings.json — skipping baseline refresh');
    return null;
  }

  const auditData = assembleAuditData({
    url: ctx.url,
    slug: ctx.slug,
    bronze: ctx.bronze,
    pagespeed: ctx.pagespeed,
    findings: ctx.findings,
    scraped: ctx.scraped,
    aiAudit: ctx.aiAudit,
    findingsSummary: ctx.findingsSummary,
    vendor: ctx.vendor,
    agenticBrowsing: ctx.agenticBrowsing,
  });

  return generateAuditReports(ctx.auditDir, {
    url: ctx.url,
    slug: ctx.slug,
    practiceName: ctx.practiceName,
    pagespeed: ctx.pagespeed,
    techAudit: ctx.techAudit,
    aiAudit: ctx.aiAudit,
    scraped: ctx.scraped,
    findingsSummary: ctx.findingsSummary,
    gbpMeta: ctx.gbpMeta,
    screenshotFile: ctx.screenshotFile,
    bronze: ctx.bronze,
    vendor: ctx.vendor,
    agenticBrowsing: ctx.agenticBrowsing,
    auditData,
    dataDir: ctx.dataDir,
    leadApiUrl: opts.leadApiUrl,
  });
}
