/**
 * Headless homepage screenshot — used at the top of the audit summary so
 * the report shows "we actually looked at your site." Reduces the
 * spam/template feel of cold outreach.
 *
 * Uses Playwright (already a repo dep, also used by a11y-audit.js).
 *
 * Export:
 *   captureHomepageScreenshot(url, outputPath) → Promise<string | null>
 *     Returns the absolute path to the saved PNG, or null on failure
 *     (handled gracefully by callers — the rest of the audit proceeds).
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const VIEWPORT = { width: 1280, height: 800 };
const TIMEOUT_MS = 20_000;

export async function captureHomepageScreenshot(url, outputPath) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,  // retina-quality
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Groundwork-Audit/1.0',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    // Give animations/lazy assets a moment to settle.
    await page.waitForTimeout(800);

    await mkdir(dirname(outputPath), { recursive: true });
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,           // hero/above-the-fold view only
    });
    return outputPath;
  } catch (err) {
    // Sites that block headless browsers, timeouts, JS errors — all non-fatal.
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
