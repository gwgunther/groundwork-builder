/**
 * Phase 4.65: Accessibility audit
 *
 * Walks the built dist/ via a real browser (Playwright + Chromium), injects
 * axe-core (the de facto standard a11y test engine) into each notable page,
 * runs the WCAG 2.1 AA ruleset, and reports any violations.
 *
 * Why a real browser: a11y violations like color contrast, focus visibility,
 * ARIA misuse, and computed-style problems require the rendered DOM. Static
 * HTML checks can't catch them.
 *
 * Cost: zero (no AI calls). Runs locally. ~15–30 seconds for a typical site.
 */

import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const AXE_CORE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

// Pages to audit. Match the subset the SEO audit walks.
const ROUTES_TO_CHECK = [
  '/',
  '/about',
  '/services',
  '/blog',
  '/schedule',
  '/financing',
  '/faq',
  '/gallery',
];

/**
 * @param {string} outputDir
 * @returns {Promise<{ pageCount: number, violationCount: number, byImpact: object, pages: object[], topIssues: object[] }>}
 */
export async function auditA11y(outputDir) {
  const distDir = resolve(outputDir, 'dist');

  // Discover any service-detail and blog-post routes to add to the check list
  const extraRoutes = await discoverDeepRoutes(distDir);
  const routes = [...ROUTES_TO_CHECK, ...extraRoutes].filter(uniqByValue());

  const preview = await startPreview(outputDir);
  if (!preview) {
    return { pageCount: 0, violationCount: 0, byImpact: {}, pages: [], topIssues: [], error: 'Could not start preview server' };
  }

  const pages = [];

  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();

      for (const route of routes) {
        const url = preview.baseUrl + route;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

          // Inject axe-core from CDN if it isn't already on the page
          await page.addScriptTag({ url: AXE_CORE_CDN });

          // Run axe with the WCAG 2.1 AA rule set + best-practice rules
          const result = await page.evaluate(async () => {
            // eslint-disable-next-line no-undef
            const r = await axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
              resultTypes: ['violations'],
            });
            return {
              violations: r.violations.map(v => ({
                id:        v.id,
                impact:    v.impact,
                help:      v.help,
                helpUrl:   v.helpUrl,
                tags:      v.tags,
                nodeCount: (v.nodes || []).length,
                sample:    (v.nodes || []).slice(0, 2).map(n => ({
                  target: n.target?.[0] || '',
                  html:   (n.html || '').slice(0, 200),
                  failureSummary: (n.failureSummary || '').slice(0, 400),
                })),
              })),
            };
          });

          pages.push({
            url:        route,
            violations: result.violations,
            violationCount: result.violations.length,
          });
        } catch (err) {
          // Page load failed (404, etc.). Skip — this would already be caught
          // by the build-integrity validator.
          continue;
        }
      }

      await ctx.close();
    } finally {
      await browser.close();
    }
  } finally {
    if (preview.kill) preview.kill();
  }

  return summarize(pages);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function summarize(pages) {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalViolations = 0;
  const issueByRule = new Map();

  for (const p of pages) {
    for (const v of p.violations || []) {
      const impact = v.impact || 'minor';
      byImpact[impact] = (byImpact[impact] || 0) + v.nodeCount;
      totalViolations += v.nodeCount;
      const cur = issueByRule.get(v.id) || { id: v.id, help: v.help, helpUrl: v.helpUrl, impact: v.impact, occurrences: 0, pages: [] };
      cur.occurrences += v.nodeCount;
      cur.pages.push(p.url);
      issueByRule.set(v.id, cur);
    }
  }

  // Top issues sorted by impact severity then occurrence count
  const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const topIssues = [...issueByRule.values()]
    .sort((a, b) => (severityOrder[a.impact] ?? 9) - (severityOrder[b.impact] ?? 9) || b.occurrences - a.occurrences)
    .slice(0, 12);

  return {
    pageCount:      pages.length,
    violationCount: totalViolations,
    byImpact,
    pages,
    topIssues,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function discoverDeepRoutes(distDir) {
  // Look for subdirectories under services/ and blog/ — each one is a route.
  const out = [];
  for (const sub of ['services', 'blog']) {
    try {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(join(distDir, sub), { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && e.name !== 'index.html') out.push(`/${sub}/${e.name}`);
      }
    } catch { /* dir not present */ }
  }
  return out.slice(0, 8); // cap to keep audit time reasonable
}

function uniqByValue() {
  const seen = new Set();
  return v => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  };
}

async function startPreview(projectDir) {
  // High port to avoid collisions with the operator's running preview
  const port = 4811;
  const proc = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for the server to be ready — astro logs "Local" or similar when up.
  let ready = false;
  proc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes(`localhost:${port}`) || s.includes(`127.0.0.1:${port}`)) ready = true;
  });
  proc.stderr.on('data', () => { /* swallow */ });

  const start = Date.now();
  while (!ready && Date.now() - start < 15000) {
    await new Promise(r => setTimeout(r, 200));
    if (proc.exitCode != null) return null; // process died
  }
  if (!ready) {
    proc.kill();
    return null;
  }
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    kill: () => { try { proc.kill(); } catch {} },
  };
}
