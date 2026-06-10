/**
 * import-design-library.js
 *
 * Idempotently imports curated inspo + anti fingerprints from
 * design-library-catalog.json into _memory/library/.
 *
 * Safety rules:
 *   - Never deletes existing index entries
 *   - Never overwrites tag=own entries
 *   - Only overwrites inspo/anti when --force or entry is catalog-managed
 *   - Validates all fingerprints before writing anything
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCatalog,
  validateCatalog,
  entryToFingerprint,
} from './design-library-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const LIBRARY_DIR = join(PROJECT_ROOT, '_memory', 'library');
const INDEX_FILE = join(LIBRARY_DIR, 'index.json');

/**
 * @param {object} opts
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.force=false] - overwrite existing inspo/anti files
 * @param {string[]} [opts.only] - slug filter
 * @param {string} [opts.captured] - date stamp override (YYYY-MM-DD)
 */
export async function importDesignLibrary(opts = {}) {
  const { dryRun = false, force = false, only = null, captured = null } = opts;

  const validation = await validateCatalog();
  if (!validation.valid) {
    throw new Error(
      `Catalog validation failed:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`,
    );
  }

  const catalog = await loadCatalog();
  let entries = catalog.entries;

  if (only?.length) {
    const want = new Set(only);
    entries = entries.filter(e => want.has(e.slug));
    const missing = [...want].filter(s => !entries.some(e => e.slug === s));
    if (missing.length) {
      throw new Error(`Unknown catalog slugs: ${missing.join(', ')}`);
    }
  }

  const index = await readIndex();
  const existingBySlug = new Map(index.entries.map(e => [e.slug, e]));

  const plan = { write: [], skip: [], blocked: [] };

  for (const entry of entries) {
    const existing = existingBySlug.get(entry.slug);

    if (existing?.tag === 'own' && !force) {
      plan.blocked.push({ slug: entry.slug, reason: 'existing own-build (use --force to override)' });
      continue;
    }

    if (existing && !force && existing.tag === entry.tag) {
      // Already imported — skip unless forced
      const fpPath = join(LIBRARY_DIR, `${entry.slug}.json`);
      try {
        await readFile(fpPath, 'utf8');
        plan.skip.push({ slug: entry.slug, reason: 'already exists (use --force to overwrite)' });
        continue;
      } catch { /* file missing — re-import */ }
    }

    plan.write.push(entry);
  }

  if (dryRun) {
    return {
      dryRun: true,
      plan,
      totals: {
        wouldWrite: plan.write.length,
        skipped: plan.skip.length,
        blocked: plan.blocked.length,
      },
    };
  }

  if (!plan.write.length) {
    return { dryRun: false, plan, totals: { written: 0, skipped: plan.skip.length, blocked: plan.blocked.length } };
  }

  await mkdir(LIBRARY_DIR, { recursive: true });

  for (const entry of plan.write) {
    const fp = entryToFingerprint(entry, captured);
    const fpPath = join(LIBRARY_DIR, `${entry.slug}.json`);
    await writeFile(fpPath, JSON.stringify(fp, null, 2));

    const indexEntry = {
      slug: fp.slug,
      tag: fp.tag,
      source: fp.source,
      captured: fp.captured,
      archetype: fp.layout?.archetype || null,
      mood: fp.palette?.mood || null,
      fontPair: fp.fontPair || null,
      adjectives: fp.adjectives || [],
      dentalMoods: fp.dentalMoods || [],
    };

    const idx = index.entries.findIndex(e => e.slug === fp.slug);
    if (idx >= 0) index.entries[idx] = indexEntry;
    else index.entries.push(indexEntry);
  }

  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));

  return {
    dryRun: false,
    plan,
    totals: {
      written: plan.write.length,
      skipped: plan.skip.length,
      blocked: plan.blocked.length,
    },
  };
}

async function readIndex() {
  try {
    const txt = await readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(txt);
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch {
    return { entries: [] };
  }
}
