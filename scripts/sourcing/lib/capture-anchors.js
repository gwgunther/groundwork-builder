#!/usr/bin/env node
// One-time script: captures desktop screenshots for the 3 vision-scoring
// anchor sites and caches them to _sourcing/anchors/.
//
// Re-run this only when:
//   - Anchor sites change (edit ANCHOR_SITES in vision-prompt.js)
//   - You want fresh captures (sites get redesigned over time)
//
// The cached PNGs are read by vision-score.js on every site evaluation —
// they are NOT re-fetched per practice.
//
// Run: node scripts/sourcing/lib/capture-anchors.js

import './env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANCHOR_SITES } from './vision-prompt.js';
import { captureSite, closeBrowser } from './browser.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../../..');
const ANCHOR_DIR = path.join(REPO_ROOT, '_sourcing', 'anchors');

async function main() {
  await fs.mkdir(ANCHOR_DIR, { recursive: true });
  console.error(`Capturing ${Object.keys(ANCHOR_SITES).length} anchor sites…`);
  console.error(`Output: ${path.relative(REPO_ROOT, ANCHOR_DIR)}/\n`);

  for (const [scoreKey, anchor] of Object.entries(ANCHOR_SITES)) {
    process.stderr.write(`  ${scoreKey} → ${anchor.url}\n`);
    process.stderr.write(`    ${anchor.why}\n`);

    const r = await captureSite(anchor.url);
    if (!r.ok || !r.desktopPng) {
      console.error(`    ❌ FAILED (${r.error || 'no screenshot'})`);
      continue;
    }
    const outFile = path.join(ANCHOR_DIR, `${scoreKey}.png`);
    await fs.writeFile(outFile, r.desktopPng);
    console.error(`    ✅ wrote ${path.relative(REPO_ROOT, outFile)} (${r.desktopPng.length.toLocaleString()} bytes)`);
  }

  await closeBrowser();
  console.error('\nDone. Anchors are cached and ready for vision scoring.');
  console.error('TIP: open the PNGs and confirm each clearly exemplifies its score level.');
  console.error('If any feels borderline, edit ANCHOR_SITES in scripts/sourcing/lib/vision-prompt.js and re-run.');
}

main().catch(async (e) => {
  console.error('capture-anchors failed:', e);
  await closeBrowser();
  process.exit(1);
});
