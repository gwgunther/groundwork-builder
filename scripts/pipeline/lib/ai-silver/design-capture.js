/**
 * Design capture — the raw visual observation input for the design pass.
 *
 * Loads the homepage in a real browser and extracts:
 *   - a viewport screenshot (above-the-fold — the design language lives here)
 *   - a mid-page screenshot (to see a content section / cards / footer style)
 *   - exact COMPUTED design tokens (button bg, heading/body fonts, radius, etc.)
 *
 * Screenshots feed the vision model; tokens give precise values vision only
 * approximates. Falls back to a pre-captured screenshot file if the browser
 * can't run (e.g. headless CI without Playwright browsers installed).
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Lazy import so environments without playwright still load the module.
async function getChromium() {
  try { const pw = await import('playwright'); return pw.chromium; }
  catch { return null; }
}

/**
 * @param {string} url
 * @param {object} [opts] { fallbackScreenshotPath, outDir }
 *   outDir — if given, screenshots are written there as files and `path` is
 *            included on each entry (so bronze can cache them).
 * @returns {Promise<{ screenshots: {label,data,mediaType,path?}[], tokens: object|null }>}
 */
export async function captureDesign(url, opts = {}) {
  const chromium = await getChromium();
  if (!chromium) {
    return fallback(opts);
  }

  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1500);

    // Above-the-fold (hero / nav — the brand's first impression)
    const top = await page.screenshot({ type: 'jpeg', quality: 70 });

    // Computed design tokens from real rendered elements
    const tokens = await page.evaluate(extractComputedTokens).catch(() => null);

    // Mid-page: scroll to ~1.5 viewports and grab a content section
    await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 1.6))).catch(() => {});
    await page.waitForTimeout(600);
    const mid = await page.screenshot({ type: 'jpeg', quality: 70 });

    await browser.close();

    const shots = [
      { label: 'above-the-fold', data: top.toString('base64'), mediaType: 'image/jpeg' },
      { label: 'content-section', data: mid.toString('base64'), mediaType: 'image/jpeg' },
    ];

    if (opts.outDir) {
      await mkdir(opts.outDir, { recursive: true });
      for (const s of shots) {
        const p = join(opts.outDir, `design-${s.label}.jpg`);
        await writeFile(p, Buffer.from(s.data, 'base64'));
        s.path = p;
      }
    }

    return { screenshots: shots, tokens };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return fallback(opts, err.message);
  }
}

/**
 * Load cached design screenshots (paths) back into base64 for the model.
 * Returns the same shape as captureDesign's `screenshots`.
 */
export async function loadCachedScreenshots(screenshots = []) {
  const out = [];
  for (const s of screenshots) {
    if (!s?.path || !existsSync(s.path)) continue;
    const buf = await readFile(s.path);
    out.push({ label: s.label, data: buf.toString('base64'), mediaType: s.mediaType || 'image/jpeg', path: s.path });
  }
  return out;
}

async function fallback(opts, reason) {
  if (opts.fallbackScreenshotPath && existsSync(opts.fallbackScreenshotPath)) {
    const buf = await readFile(opts.fallbackScreenshotPath);
    const mediaType = opts.fallbackScreenshotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { screenshots: [{ label: 'page', data: buf.toString('base64'), mediaType }], tokens: null, fallback: reason || 'no-browser' };
  }
  return { screenshots: [], tokens: null, fallback: reason || 'no-browser-no-fallback' };
}

/**
 * Runs in the browser. Reads computed styles off representative elements to
 * produce exact design tokens. Pure DOM — no external deps.
 */
function extractComputedTokens() {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const pick = (sel) => document.querySelector(sel);
  const freq = {};
  const bump = (k, v) => { if (!v) return; const key = `${k}::${v}`; freq[key] = (freq[key] || 0) + 1; };

  // Sample fonts/colors across many elements to find the dominant ones
  const sample = Array.from(document.querySelectorAll('body *')).slice(0, 1200);
  let bodyFont = null, headingFont = null;
  const colorCount = {}, bgCount = {};
  for (const el of sample) {
    const s = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (/^h[1-3]$/.test(tag) && !headingFont) headingFont = s.fontFamily;
    if (tag === 'p' && !bodyFont) bodyFont = s.fontFamily;
    const col = s.color; if (col) colorCount[col] = (colorCount[col] || 0) + 1;
    const bg = s.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bgCount[bg] = (bgCount[bg] || 0) + 1;
  }
  const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  // Primary button / CTA
  const btn = pick('a.button, .btn, button, [class*="cta"], [class*="button"], a[class*="btn"]');
  const btnCS = cs(btn);

  // Body + heading
  const body = cs(document.body);
  const h1 = cs(pick('h1'));
  const link = cs(pick('a'));
  const nav = cs(pick('nav, header'));

  return {
    bodyFontFamily: body?.fontFamily || bodyFont || null,
    headingFontFamily: (h1?.fontFamily) || headingFont || null,
    baseFontSizePx: body ? parseFloat(body.fontSize) : null,
    bodyTextColor: body?.color || null,
    pageBg: body?.backgroundColor || null,
    headerBg: nav?.backgroundColor || null,
    linkColor: link?.color || null,
    button: btnCS ? {
      bg: btnCS.backgroundColor,
      color: btnCS.color,
      borderRadius: btnCS.borderRadius,
      paddingY: btnCS.paddingTop,
      fontWeight: btnCS.fontWeight,
      textTransform: btnCS.textTransform,
    } : null,
    dominantTextColors: topN(colorCount, 4),
    dominantBackgrounds: topN(bgCount, 5),
    h1SizePx: h1 ? parseFloat(h1.fontSize) : null,
    h1Weight: h1?.fontWeight || null,
  };
}
