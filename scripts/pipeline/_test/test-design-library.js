#!/usr/bin/env node
/**
 * Structural tests for the design library catalog + import pipeline.
 * No API calls. Run: node scripts/pipeline/_test/test-design-library.js
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCatalog,
  normalizeDentalMood,
  selectInspoEntries,
  entryToFingerprint,
  clearCatalogCache,
} from '../lib/design-library-catalog.js';
import { importDesignLibrary } from '../lib/import-design-library.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = resolve(__dirname, '../../../_memory/library/index.json');

let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

async function main() {
  console.log('[test-design-library]');

  clearCatalogCache();
  const { valid, errors } = await validateCatalog();
  assert('catalog validates', () => {
    if (!valid) throw new Error(errors.join('; '));
  });

  const { loadCatalog } = await import('../lib/design-library-catalog.js');
  const catalog = await loadCatalog();

  assert('has 16 inspo entries', () => {
    const n = catalog.entries.filter(e => e.tag === 'inspo').length;
    if (n !== 16) throw new Error(`expected 16, got ${n}`);
  });

  assert('has 5 anti entries', () => {
    const n = catalog.entries.filter(e => e.tag === 'anti').length;
    if (n !== 5) throw new Error(`expected 5, got ${n}`);
  });

  assert('normalizeDentalMood maps premium', () => {
    if (normalizeDentalMood('Modern Premium Luxury') !== 'modern-premium') {
      throw new Error('premium mood not mapped');
    }
  });

  assert('normalizeDentalMood maps clinical', () => {
    if (normalizeDentalMood('Clean Clinical Trust') !== 'clean-clinical') {
      throw new Error('clinical mood not mapped');
    }
  });

  assert('selectInspoEntries prefers mood match', () => {
    const inspos = catalog.entries.filter(e => e.tag === 'inspo');
    const picked = selectInspoEntries(inspos, 'warm neighborhood family', 4);
    const moodMatched = picked.filter(e => e.dentalMoods?.includes('warm-neighborhood'));
    if (moodMatched.length < 2) {
      throw new Error(
        `expected ≥2 warm-neighborhood inspo, got ${moodMatched.length} in [${picked.map(e => e.slug).join(', ')}]`,
      );
    }
  });

  assert('entryToFingerprint includes note', () => {
    const anti = catalog.entries.find(e => e.slug === 'anti-purple-gradient');
    const fp = entryToFingerprint(anti);
    if (!fp.note?.includes('anti-pattern')) throw new Error('anti note missing');
  });

  const dryRun = await importDesignLibrary({ dryRun: true });
  assert('dry-run is valid', () => {
    const total = dryRun.totals.wouldWrite + dryRun.totals.skipped;
    if (total < 21) {
      throw new Error(`expected 21 catalog entries accounted for, got write=${dryRun.totals.wouldWrite} skip=${dryRun.totals.skipped}`);
    }
  });

  // Verify existing own entries would not be blocked
  assert('dry-run does not block own entries', () => {
    const blockedOwn = dryRun.plan.blocked.filter(b => b.slug.includes('dentistry') || b.slug.includes('ortho'));
    if (blockedOwn.length) throw new Error(`own entries blocked: ${blockedOwn.map(b => b.slug).join(', ')}`);
  });

  console.log(`\n[test-design-library] ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
