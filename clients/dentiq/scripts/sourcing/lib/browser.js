// Shared Playwright session used for both screenshots and rendered-HTML
// fingerprinting. One browser instance per pipeline run; contexts per page
// to keep cookies/state isolated between practices.
//
// Why one shared session: launching Chromium costs ~200ms; doing it 5k times
// is 17 minutes of pure overhead. Reusing the browser cuts per-practice
// fixed cost to ~50ms.

import { chromium } from 'playwright';

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 }; // iPhone 14 logical px

const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const NAV_TIMEOUT_MS = 25_000;
const SETTLE_WAIT_MS = 1500; // post-load wait for JS to render lazy content

// Anthropic's vision API rejects images whose longest edge exceeds 8000px.
// Long dental homepages routinely produce 10k-15k px full-page captures, so
// we clip the capture height. 7600px keeps us safely under the limit while
// still capturing the hero + several content sections (more than enough for
// design judgment; the API downscales the long edge to ~1568px anyway).
const MAX_CAPTURE_HEIGHT = 7600;

// Capture a full-page screenshot, clipped to MAX_CAPTURE_HEIGHT if the page
// is taller. Returns a PNG Buffer.
async function captureClipped(page, viewportWidth) {
  const fullHeight = await page.evaluate(
    () => document.documentElement.scrollHeight || document.body.scrollHeight,
  );
  if (fullHeight <= MAX_CAPTURE_HEIGHT) {
    return page.screenshot({ fullPage: true, type: 'png' });
  }
  return page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: viewportWidth, height: MAX_CAPTURE_HEIGHT },
  });
}

let _browser = null;

async function ensureBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

/**
 * Capture rendered HTML + desktop screenshot + mobile screenshot from one URL.
 *
 * Returns { ok, status, finalUrl, html, desktopPng, mobilePng, error? }.
 * desktopPng and mobilePng are Buffer PNGs (full page).
 *
 * Failures are returned as { ok: false, error }, never thrown — callers
 * use the per-practice success flag to decide whether to continue scoring.
 */
export async function captureSite(url, { skipScreenshots = false } = {}) {
  const browser = await ensureBrowser();
  const result = {
    ok: false,
    status: 0,
    finalUrl: url,
    html: '',
    desktopPng: null,
    mobilePng: null,
    error: null,
  };

  // ── Desktop pass: rendered HTML + screenshot ──
  let desktopCtx;
  try {
    desktopCtx = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      userAgent: UA_DESKTOP,
      // ignoreHTTPSErrors: some dental sites still have stale certs
      ignoreHTTPSErrors: true,
    });
    const page = await desktopCtx.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    result.status = response?.status() ?? 0;
    result.finalUrl = page.url();

    // Give JS-rendered content a moment to populate (footer attributions,
    // booking widgets, etc. often arrive after DOMContentLoaded).
    await page.waitForTimeout(SETTLE_WAIT_MS);

    result.html = await page.content();

    if (!skipScreenshots) {
      result.desktopPng = await captureClipped(page, DESKTOP_VIEWPORT.width);
    }
    result.ok = result.status >= 200 && result.status < 400;
  } catch (e) {
    result.error = e.message;
  } finally {
    await desktopCtx?.close().catch(() => {});
  }

  if (skipScreenshots || !result.ok) return result;

  // ── Mobile pass: separate context (different UA + viewport) ──
  let mobileCtx;
  try {
    mobileCtx = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      userAgent: UA_MOBILE,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    const page = await mobileCtx.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(SETTLE_WAIT_MS);
    result.mobilePng = await captureClipped(page, MOBILE_VIEWPORT.width);
  } catch (e) {
    // Mobile failure is non-fatal — we still have desktop. Note the error.
    result.error = (result.error ? result.error + ' | ' : '') + 'mobile: ' + e.message;
  } finally {
    await mobileCtx?.close().catch(() => {});
  }

  return result;
}
