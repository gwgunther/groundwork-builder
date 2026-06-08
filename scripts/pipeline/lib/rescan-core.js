/**
 * Rescan — re-run the grader's scanners against a built/deployed preview
 * and diff the results against the original audit's findings.
 *
 * Used by:
 *   scripts/pipeline/rescan.js   — standalone CLI
 *   scripts/pipeline/lib/publish.js — runs automatically after a successful
 *                                     --publish so the Build row gets diff
 *                                     counts + audit-report-after.html
 *                                     without a separate CLI invocation.
 *
 * What it does (in order):
 *   1. Load original findings.json from <auditDir>/_data/
 *   2. Scrape the preview URL (bronze)
 *   3. Re-run tech / trust / hosting / GBP / conversion scanners
 *   4. Diff after-findings vs. before-findings
 *   5. Write findings-after.json + findings-diff.json
 *   6. Render audit-report-after.html (before/after pairs)
 *   7. Return { summary, before, after, diff }
 *
 * Returns null if the original audit's findings.json is missing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { refreshBaselineAuditArtifacts } from './audit-artifacts.js';

import { scrape }                       from './scraper.js';
import { runTechAudit }                 from './tech-audit.js';
import { runTrustScan }                 from './trust-scanner.js';
import { runHostingScan }               from './hosting-scanner.js';
import { runGbpScan }                   from './gbp-scanner.js';
import { runConversionScan }            from './conversion-scanner.js';
import { runAgenticScan }               from './agentic-scanner.js';
import { diffFindings, summarizeDiff }  from './findings-diff.js';
import { generateAuditReports }         from './audit-report-generator.js';
import { enrichFinding }                from './findings.js';

// Helpers for the GBP-vs-audit-URL cross-source check.
function getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ''; }
}
function eTldPlusOne(hostname) {
  const h = hostname.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const twoPart = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i;
  const last2 = parts.slice(-2).join('.');
  return twoPart.test(last2) ? parts.slice(-3).join('.') : last2;
}
function buildGbpWebsiteMismatchFinding(previewUrl, gbpScan) {
  const websiteUri = gbpScan?.meta?.websiteUri;
  if (!websiteUri) return null;
  const auditRoot = eTldPlusOne(getHostname(previewUrl));
  const gbpRoot   = eTldPlusOne(getHostname(websiteUri));
  if (!auditRoot || !gbpRoot) return null;
  const mismatch = auditRoot !== gbpRoot;
  return enrichFinding({
    id: 'gbp-website-mismatches-audit-url',
    category: 'gbp',
    severity: mismatch ? 'warning' : 'passed',
    title: 'GBP website link matches audited domain',
    detail: mismatch
      ? `GBP links to ${gbpRoot} but the audited site is ${auditRoot}.`
      : `GBP website link (${gbpRoot}) matches the audited domain.`,
    benefit: 'When the GBP points to a different domain than the practice\'s main site, the listing\'s authority bleeds out to a domain you may not even control.',
    affectedPages: [],
    count: mismatch ? 1 : 0,
  });
}

/**
 * @param {object} args
 * @param {string} args.auditDir     - path to the audit's output dir (e.g. _audits/<slug>)
 * @param {string} args.previewUrl   - the built/deployed URL to re-scan
 * @param {boolean} [args.skipGbp]   - skip GBP scan
 * @param {string} [args.placeId]    - override GBP placeId; falls back to the
 *                                    one recorded in the original audit's data
 * @param {boolean} [args.verbose]
 *
 * @returns {Promise<{summary, diff, after, beforeCount, afterCount} | null>}
 */
export async function runRescan({ auditDir, previewUrl, skipGbp = false, placeId = null, verbose = false } = {}) {
  if (!auditDir || !previewUrl) {
    throw new Error('runRescan: auditDir and previewUrl are required');
  }

  const dataDir = join(auditDir, '_data');

  // 1. Load original findings
  let beforeData;
  try {
    beforeData = JSON.parse(await readFile(join(dataDir, 'findings.json'), 'utf-8'));
  } catch {
    return null;  // no prior audit, nothing to diff against
  }
  const beforeFindings = beforeData?.findings || [];

  // 2. Refresh baseline audit artifacts from original findings (keeps
  // audit-data.json + sales one-pager in sync with latest templates).
  try {
    await refreshBaselineAuditArtifacts(auditDir);
    console.log('[Rescan] Refreshed baseline audit-data.json + audit-summary.html');
  } catch (err) {
    console.warn(`[Rescan] Baseline artifact refresh failed (non-fatal): ${err.message}`);
  }

  // 3. Scrape preview
  const bronze = await scrape(previewUrl, { verbose });

  const bronzePagesAfter = {
    pageCount: bronze?.pageCount ?? 0,
    pages: (bronze?.pages || []).map(p => ({
      url: p.url,
      path: p.path,
      title: p.title,
      metaDescription: p.metaDescription,
      wordCount: p.wordCount,
      canonicalUrl: p.canonicalUrl,
      images: (p.images || []).map(img => ({ alt: img.alt })),
      headings: p.headings,
    })),
  };
  await writeFile(
    join(dataDir, 'bronze-pages-after.json'),
    JSON.stringify(bronzePagesAfter, null, 2),
    'utf-8',
  );

  // 4. Run scanners
  const techAudit  = runTechAudit(bronze, null);
  const trustScan  = runTrustScan(bronze);
  const hostingScan = await runHostingScan(bronze);

  // GBP: reuse placeId from the original audit
  let gbpScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  if (!skipGbp && process.env.GOOGLE_PLACES_API_KEY) {
    let pid = placeId;
    if (!pid) {
      try {
        const originalGbp = JSON.parse(await readFile(join(dataDir, 'gbp-scan.json'), 'utf-8'));
        pid = originalGbp?.meta?.placeId || null;
      } catch { /* no prior gbp data */ }
    }
    if (pid) {
      try { gbpScan = await runGbpScan({ placeId: pid }); }
      catch { /* non-fatal */ }
    }
  }

  // Cross-source check
  const mismatch = buildGbpWebsiteMismatchFinding(previewUrl, gbpScan);
  if (mismatch) gbpScan.findings.push(mismatch);

  // Conversion scan (re-fetches preview URL)
  let conversionScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  try { conversionScan = await runConversionScan(bronze); }
  catch { /* non-fatal */ }

  // Agentic browsing (Lighthouse CLI + llms.txt) on the rebuilt preview
  let agenticScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  try {
    agenticScan = await runAgenticScan(previewUrl);
    await writeFile(
      join(dataDir, 'agentic-scan-after.json'),
      JSON.stringify(agenticScan, null, 2),
      'utf-8',
    );
    if (verbose) console.log(`[Rescan] Agentic: llms.txt ${agenticScan.meta?.llmsTxtStatus || '—'}`);
  } catch (err) {
    console.warn(`[Rescan] Agentic scan failed (non-fatal): ${err.message}`);
  }

  // 5. Combine + diff
  const afterFindings = [
    ...techAudit.findings,
    ...trustScan.findings,
    ...hostingScan.findings,
    ...gbpScan.findings,
    ...conversionScan.findings,
    ...agenticScan.findings,
  ];
  const diff = diffFindings(beforeFindings, afterFindings);
  const summary = summarizeDiff(diff);

  // 6. Write JSON artifacts
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, 'findings-after.json'),
    JSON.stringify({ findings: afterFindings }, null, 2),
    'utf-8',
  );
  await writeFile(
    join(dataDir, 'findings-diff.json'),
    JSON.stringify({ summary, diff }, null, 2),
    'utf-8',
  );

  // 7. Render before/after report HTML (does not replace sales one-pager)
  let practiceName = 'Site Audit';
  let pagespeed = null;
  let silver = null;
  let aiAudit = null;
  let bronzeBefore = null;
  try {
    silver = JSON.parse(await readFile(join(dataDir, 'silver.json'), 'utf-8'));
    practiceName = silver?.practice?.name || practiceName;
  } catch { /* optional */ }
  try {
    pagespeed = JSON.parse(await readFile(join(dataDir, 'pagespeed.json'), 'utf-8'));
  } catch { /* optional */ }
  try {
    aiAudit = JSON.parse(await readFile(join(dataDir, 'ai-audit.json'), 'utf-8'));
  } catch { /* optional */ }
  try {
    bronzeBefore = JSON.parse(await readFile(join(dataDir, 'bronze-pages.json'), 'utf-8'));
  } catch { /* optional */ }

  await generateAuditReports(auditDir, {
    url: previewUrl,
    practiceName,
    pagespeed,
    aiAudit,
    scraped: silver,
    bronze: bronzeBefore,
    dataDir,
    techAudit: {
      findings: afterFindings,
      summary: {
        critical: afterFindings.filter(f => f.severity === 'critical').length,
        warnings: afterFindings.filter(f => f.severity === 'warning').length,
        passed:   afterFindings.filter(f => f.severity === 'passed').length,
      },
    },
    gbpMeta: gbpScan.meta || null,
    agenticBrowsing: agenticScan.meta || null,
    diff: { summary, diff },
    outputFilename: 'audit-report-after',
  });

  return {
    summary,
    diff,
    after: afterFindings,
    beforeCount: beforeFindings.length,
    afterCount: afterFindings.length,
  };
}
