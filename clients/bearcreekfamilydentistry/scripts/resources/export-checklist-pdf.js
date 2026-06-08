/**
 * Export docs/resources/dental-online-presence-checklist.html → .pdf
 *
 * Usage: npm run checklist:pdf
 * Requires: playwright (devDependency) + `npx playwright install chromium` once.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = resolve(root, 'docs/resources/dental-online-presence-checklist.html');
const pdfPath = resolve(root, 'docs/resources/dental-online-presence-checklist.pdf');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
  });
  console.log(`Wrote ${pdfPath}`);
} finally {
  await browser.close();
}
