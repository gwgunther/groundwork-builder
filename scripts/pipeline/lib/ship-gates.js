/**
 * Ship gates — hard requirements before a build can be marked Pitched / handed off.
 *
 * Gates:
 *   1. Mobile PageSpeed performance ≥ 90 (measured on live preview)
 *   2. axe-core: 0 critical + 0 serious violations (measured on built dist/)
 *   3. Lighthouse accessibility ≥ 90 on live preview (PageSpeed API)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MOBILE_PERF_MIN = 90;
export const LIGHTHOUSE_A11Y_MIN = 90;

/**
 * @param {object} args
 * @param {number|null} args.mobilePerformance     — Lighthouse perf, mobile
 * @param {number|null} args.lighthouseAccessibility — Lighthouse a11y, mobile
 * @param {object|null} args.a11yReport            — output of auditA11y()
 * @returns {{ passed: boolean, failures: object[] }}
 */
export function evaluateShipGates({ mobilePerformance, lighthouseAccessibility, a11yReport } = {}) {
  const failures = [];

  if (mobilePerformance == null) {
    failures.push({
      id: 'pagespeed-mobile-missing',
      category: 'Performance',
      field: 'Mobile PageSpeed',
      hint: `Mobile performance score was not measured. Re-run publish after the preview is live. Guarantee requires ≥ ${MOBILE_PERF_MIN}.`,
    });
  } else if (mobilePerformance < MOBILE_PERF_MIN) {
    failures.push({
      id: 'pagespeed-mobile-low',
      category: 'Performance',
      field: 'Mobile PageSpeed',
      hint: `Mobile performance is ${mobilePerformance}/100 (need ≥ ${MOBILE_PERF_MIN}). Optimize images, fonts, and LCP before handoff.`,
    });
  }

  const byImpact = a11yReport?.byImpact || {};
  const critical = byImpact.critical || 0;
  const serious  = byImpact.serious  || 0;
  if (!a11yReport || a11yReport.pageCount === 0) {
    failures.push({
      id: 'a11y-audit-missing',
      category: 'Accessibility',
      field: 'axe-core audit',
      hint: 'Accessibility audit did not run or produced no results. Re-run build with a successful dist/ before handoff.',
    });
  } else if (critical > 0 || serious > 0) {
    failures.push({
      id: 'a11y-axe-violations',
      category: 'Accessibility',
      field: 'axe-core violations',
      hint: `${critical} critical and ${serious} serious WCAG violation(s). Fix all critical and serious issues before handoff (see _pipeline/11b-a11y-audit.json).`,
    });
  }

  if (lighthouseAccessibility == null) {
    failures.push({
      id: 'lighthouse-a11y-missing',
      category: 'Accessibility',
      field: 'Lighthouse accessibility',
      hint: `Lighthouse accessibility score was not measured on the live preview. Guarantee requires ≥ ${LIGHTHOUSE_A11Y_MIN}.`,
    });
  } else if (lighthouseAccessibility < LIGHTHOUSE_A11Y_MIN) {
    failures.push({
      id: 'lighthouse-a11y-low',
      category: 'Accessibility',
      field: 'Lighthouse accessibility',
      hint: `Lighthouse accessibility is ${lighthouseAccessibility}/100 (need ≥ ${LIGHTHOUSE_A11Y_MIN}). Address contrast, labels, and ARIA before handoff.`,
    });
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Load axe audit artifact written by build-site.js phase 4.65.
 */
export async function loadA11yArtifact(pipelineDir) {
  try {
    const raw = JSON.parse(await readFile(resolve(pipelineDir, '11b-a11y-audit.json'), 'utf-8'));
    return raw.output || raw;
  } catch {
    return null;
  }
}

/**
 * Persist gate evaluation + merge failures into the operator missing report.
 */
export async function recordShipGateResult(outputDir, gateResult, extra = {}) {
  const pipelineDir = resolve(outputDir, '_pipeline');
  const artifact = {
    step: '12-ship-gates',
    timestamp: new Date().toISOString(),
    passed: gateResult.passed,
    failures: gateResult.failures,
    scores: extra.scores || null,
  };
  await writeFile(resolve(pipelineDir, '12-ship-gates.json'), JSON.stringify(artifact, null, 2), 'utf-8');

  if (!gateResult.failures.length) return;

  await mergeGateFailuresIntoMissing(outputDir, gateResult.failures);
}

/**
 * Append ship-gate failures to _pipeline/missing.json and regenerate missing.html.
 */
export async function mergeGateFailuresIntoMissing(outputDir, failures) {
  const pipelineDir = resolve(outputDir, '_pipeline');
  const missingPath = resolve(pipelineDir, 'missing.json');

  let missing;
  try {
    missing = JSON.parse(await readFile(missingPath, 'utf-8'));
  } catch {
    missing = {
      generatedAt: new Date().toISOString(),
      summary: { critical: 0, important: 0, optional: 0, placeholders: 0, generationIssues: 0, buildIntegrity: 0, coverageGaps: 0, unusedImages: 0, seoIssues: 0, a11yIssues: 0 },
      critical: [], important: [], optional: [], placeholders: [], generationIssues: [], buildIntegrity: [], coverageGaps: [], unusedImages: [], seoIssues: [], a11yIssues: [],
    };
  }

  const existing = new Set((missing.critical || []).map(i => `${i.category}:${i.field}`));
  for (const f of failures) {
    const key = `${f.category}:${f.field}`;
    if (existing.has(key)) continue;
    missing.critical.push({ category: f.category, field: f.field, hint: f.hint });
    existing.add(key);
  }

  missing.generatedAt = new Date().toISOString();
  missing.summary.critical = missing.critical.length;
  await writeFile(missingPath, JSON.stringify(missing, null, 2), 'utf-8');

  let merged = {};
  try {
    const raw = JSON.parse(await readFile(resolve(pipelineDir, '06-merge.json'), 'utf-8'));
    merged = raw.output || raw;
  } catch { /* optional */ }

  const { buildMissingHtml } = await import('./missing-page.js');
  const html = buildMissingHtml(missing, merged);
  await writeFile(resolve(pipelineDir, 'missing.html'), html, 'utf-8');
}
