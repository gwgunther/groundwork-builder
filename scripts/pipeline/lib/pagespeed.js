/**
 * PageSpeed Insights — runs Google Lighthouse via the PageSpeed Insights API v5.
 *
 * Export:
 *   runPageSpeed(url) → { mobile, desktop } | { mobile: null, desktop: null }
 *
 * Each strategy result:
 *   { performance, seo, accessibility, bestPractices,   // 0–100
 *     metrics: { fcp, lcp, tbt, cls, si, tti },         // ms or unitless
 *     audits: { ... }                                    // raw lighthouse audits
 *   }
 */

const API_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * Fetch a single PageSpeed strategy result.
 * Returns null on any error (non-throwing).
 *
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 * @param {string|null} apiKey
 * @returns {Promise<object|null>}
 */
async function fetchStrategy(url, strategy, apiKey) {
  console.log(`[PageSpeed] fetching ${strategy}...`);

  // Must request each category explicitly — API only returns performance by default
  const params = new URLSearchParams({ url, strategy });
  params.append('category', 'performance');
  params.append('category', 'seo');
  params.append('category', 'accessibility');
  params.append('category', 'best-practices');
  if (apiKey) params.set('key', apiKey);

  const endpoint = `${API_BASE}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let res;
    try {
      res = await fetch(endpoint, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[PageSpeed] ${strategy} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const json = await res.json();
    const lhr = json.lighthouseResult;
    if (!lhr) {
      console.warn(`[PageSpeed] ${strategy}: no lighthouseResult in response`);
      return null;
    }

    // Category scores (0–100)
    const cats = lhr.categories || {};
    const performance    = cats.performance   ? Math.round(cats.performance.score   * 100) : null;
    const seo            = cats.seo           ? Math.round(cats.seo.score           * 100) : null;
    const accessibility  = cats.accessibility ? Math.round(cats.accessibility.score * 100) : null;
    const bestPractices  = cats['best-practices'] ? Math.round(cats['best-practices'].score * 100) : null;

    // Key metrics (numericValue = raw ms or unitless)
    const aud = lhr.audits || {};
    const metrics = {
      fcp: aud['first-contentful-paint']?.numericValue ?? null,
      lcp: aud['largest-contentful-paint']?.numericValue ?? null,
      tbt: aud['total-blocking-time']?.numericValue ?? null,
      cls: aud['cumulative-layout-shift']?.numericValue ?? null,
      si:  aud['speed-index']?.numericValue ?? null,
      tti: aud['interactive']?.numericValue ?? null,
    };

    console.log(`[PageSpeed] ${strategy} done — perf: ${performance}, seo: ${seo}, lcp: ${metrics.lcp != null ? Math.round(metrics.lcp) + 'ms' : '—'}`);

    return {
      performance,
      seo,
      accessibility,
      bestPractices,
      metrics,
      audits: aud,
    };
  } catch (err) {
    console.warn(`[PageSpeed] ${strategy} failed: ${err.message}`);
    return null;
  }
}

/**
 * Run PageSpeed Insights for both mobile and desktop in parallel.
 *
 * @param {string} url - Full URL to audit (e.g. "https://example.com")
 * @returns {Promise<{ mobile: object|null, desktop: object|null }>}
 */
export async function runPageSpeed(url) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || null;

  const [mobile, desktop] = await Promise.all([
    fetchStrategy(url, 'mobile', apiKey),
    fetchStrategy(url, 'desktop', apiKey),
  ]);

  return { mobile, desktop };
}

/**
 * Extract top opportunity reasons from a PageSpeed result.
 * Returns up to `max` plain-English strings explaining what's costing points.
 *
 * These are "opportunities" and "diagnostics" from Lighthouse — the actual
 * things slowing the page down, not just the score.
 *
 * @param {object} psResult  - one strategy result (e.g. result.mobile)
 * @param {number} max       - max items to return (default 3)
 * @returns {string[]}
 */
export function extractScoreReasons(psResult, max = 3) {
  if (!psResult?.audits) return [];

  const audits = psResult.audits;

  // Opportunity audits that actively cost performance points
  const opportunities = [
    'render-blocking-resources',
    'uses-optimized-images',
    'uses-responsive-images',
    'uses-webp-images',
    'offscreen-images',
    'unused-javascript',
    'unused-css-rules',
    'uses-text-compression',
    'uses-long-cache-ttl',
    'third-party-summary',
    'largest-contentful-paint-element',
    'total-blocking-time',
  ];

  const reasons = [];

  for (const key of opportunities) {
    const audit = audits[key];
    if (!audit) continue;
    // Only include if it's actually failing (score < 0.9 or score is null)
    if (audit.score != null && audit.score >= 0.9) continue;
    // Get human-readable label + savings if available
    const label = audit.title || key;
    const display = audit.displayValue || '';
    reasons.push(display ? `${label} (${display})` : label);
    if (reasons.length >= max) break;
  }

  return reasons;
}
