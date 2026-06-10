/**
 * Preview rescan helpers — fair before/after diffs on temporary preview URLs.
 */

import { enrichFinding } from './findings.js';
import { getCatalogEntry } from '../findings-catalog.js';

const AGENTIC_RESOLVED = {
  'no-llms-txt': (meta) => meta?.llmsTxtStatus === 'good',
  'llms-txt-poor': (meta) => meta?.llmsTxtStatus === 'good',
  'agent-accessibility-tree-poor': (meta) => meta?.audits?.['agent-accessibility-tree']?.score === 1,
};

const PREVIEW_LIMITED_IDS = new Set([
  'gbp-website-mismatches-audit-url',
]);

/**
 * @param {string} url
 */
export function isGroundworkPreviewUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('.groundworkdental.com');
  } catch {
    return false;
  }
}

/**
 * @param {object|null} silver
 * @param {string} [fallbackUrl]
 */
export function productionDomainLabel(silver, fallbackUrl = '') {
  const d = silver?.practice?.domain?.trim();
  if (d) return d.replace(/^www\./i, '');
  try {
    if (fallbackUrl) return new URL(fallbackUrl).hostname.replace(/^www\./i, '');
  } catch { /* ignore */ }
  return 'your practice domain';
}

/**
 * Inject passed findings when agentic scan improved but no warning is emitted.
 *
 * @param {object[]} afterFindings - mutated in place
 * @param {object|null} agenticMeta
 * @param {object[]} beforeFindings
 */
export function reconcileAgenticAfterFindings(afterFindings, agenticMeta, beforeFindings) {
  if (!agenticMeta?.ok && agenticMeta?.llmsTxtStatus !== 'good') return;

  for (const [id, isResolved] of Object.entries(AGENTIC_RESOLVED)) {
    const before = beforeFindings.find(f => f.id === id);
    if (!before || before.state !== 'issue') continue;
    if (afterFindings.some(f => f.id === id)) continue;
    if (!isResolved(agenticMeta)) continue;

    const entry = getCatalogEntry(id);
    afterFindings.push(enrichFinding({
      id,
      category: 'agentic',
      severity: 'passed',
      title: before.title || id,
      detail: id.includes('llms')
        ? 'llms.txt follows agent-readiness best practices on the rebuilt preview.'
        : 'Accessibility tree passes Lighthouse agentic checks on the rebuilt preview.',
      benefit: before.benefit || '',
      affectedPages: [],
      count: 0,
      fixed_copy: entry.fixed_copy,
    }));
  }
}

/**
 * @param {object} mismatchFinding - from buildGbpWebsiteMismatchFinding
 * @param {string} previewUrl
 * @param {string} productionDomain
 */
export function softenGbpMismatchForPreview(mismatchFinding, previewUrl, productionDomain) {
  if (!mismatchFinding || !isGroundworkPreviewUrl(previewUrl)) return mismatchFinding;

  const previewHost = new URL(previewUrl).hostname;
  const prod = productionDomain || 'your practice domain';

  return {
    ...mismatchFinding,
    severity: 'passed',
    state: 'not_applicable',
    count: 0,
    detail: `Preview is on ${previewHost}; Google Business Profile still links to ${prod}. Expected until go-live.`,
    preview_note: `Google Business Profile still points at ${prod}. The preview URL is temporary. This check passes once DNS connects ${prod} to the rebuilt site and GBP is updated to match.`,
    resolves_on_go_live: true,
    preview_limited: true,
  };
}

/**
 * Post-process diff rows for preview context.
 *
 * @param {object[]} diffs
 * @param {{ previewUrl: string, productionDomain: string }} ctx
 */
export function annotateDiffForPreview(diffs, ctx) {
  const { previewUrl, productionDomain } = ctx;
  const isPreview = isGroundworkPreviewUrl(previewUrl);
  const prod = productionDomain || 'your practice domain';

  return diffs.map(d => {
    if (d.transition === 'removed' && AGENTIC_RESOLVED[d.id]) {
      return {
        ...d,
        transition: 'fixed',
        after: {
          state: 'fixed',
          severity: 'passed',
          detail: 'Resolved on rebuilt preview (agentic scan).',
          count: 0,
          affectedPages: [],
        },
      };
    }

    if (!isPreview || !PREVIEW_LIMITED_IDS.has(d.id)) return d;

    const previewHost = new URL(previewUrl).hostname;
    const note = d.preview_note || (
      `Google Business Profile still points at ${prod}, but this scan ran on the temporary preview (${previewHost}). `
      + `This is expected before go-live. Once ${prod} is connected to the rebuilt site, update the GBP website link to match.`
    );

    if (d.transition === 'regressed' || d.transition === 'still-issue' || d.transition === 'not-measured') {
      return {
        ...d,
        transition: 'preview-limited',
        preview_note: note,
        resolves_on_go_live: true,
        after: {
          ...d.after,
          detail: d.after?.detail || `Deferred until ${prod} is live.`,
        },
      };
    }

    return d;
  });
}

export function previewScanCallout(productionDomain) {
  const prod = productionDomain || 'your practice domain';
  return `This after report scans a <strong>temporary preview URL</strong>, not the practice's live domain. `
    + `Checks marked <em>Preview / go-live</em> are expected to differ until <strong>${prod}</strong> is connected via DNS. `
    + 'Performance metrics run on the preview when <code>GOOGLE_PAGESPEED_API_KEY</code> is set.';
}
