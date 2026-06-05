/**
 * Local file store — pipeline caches and run history under _memory/.
 * CRM lives in Airtable; this replaces hosted Postgres/Supabase.
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MEMORY_DIR  = join(ROOT, '_memory');
const RUNS_FILE   = join(MEMORY_DIR, 'runs.jsonl');
const LIBRARY_DIR = join(MEMORY_DIR, 'library');
const INDEX_FILE  = join(LIBRARY_DIR, 'index.json');
const IMAGES_DIR  = join(MEMORY_DIR, 'images');

async function ensureDirs() {
  await mkdir(MEMORY_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// runs — append-only JSONL
// ---------------------------------------------------------------------------

export async function insertRun(data) {
  try {
    await ensureDirs();
    const row = { id: `run-${Date.now()}`, created_at: new Date().toISOString(), ...data };
    await appendFile(RUNS_FILE, JSON.stringify(row) + '\n', 'utf-8');
    return row;
  } catch (err) {
    console.warn(`[local-store] insertRun failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// design_library — mirrors _memory/library/
// ---------------------------------------------------------------------------

export async function upsertDesignLibrary(fp) {
  try {
    await mkdir(LIBRARY_DIR, { recursive: true });
    await writeFile(join(LIBRARY_DIR, `${fp.slug}.json`), JSON.stringify(fp, null, 2), 'utf-8');

    let index = { entries: [] };
    if (existsSync(INDEX_FILE)) {
      index = JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
    }
    const entry = {
      slug: fp.slug,
      tag: fp.tag,
      source: fp.source,
      captured: fp.captured,
      archetype: fp.layout?.archetype || null,
      mood: fp.palette?.mood || null,
      fontPair: fp.fontPair || null,
      adjectives: fp.adjectives || [],
    };
    const idx = index.entries.findIndex(e => e.slug === fp.slug);
    if (idx >= 0) index.entries[idx] = entry;
    else index.entries.push(entry);
    await writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[local-store] upsertDesignLibrary failed: ${err.message}`);
    return null;
  }
}

export async function queryDesignLibrary() {
  try {
    if (!existsSync(INDEX_FILE)) return { entries: [] };
    return JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
  } catch (err) {
    console.warn(`[local-store] queryDesignLibrary failed: ${err.message}`);
    return null;
  }
}

export async function loadDesignFingerprint(slug) {
  try {
    const path = join(LIBRARY_DIR, `${slug}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    console.warn(`[local-store] loadDesignFingerprint(${slug}) failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// images — per-slug JSON cache
// ---------------------------------------------------------------------------

function imagesPath(slug) {
  return join(IMAGES_DIR, `${slug}.json`);
}

export async function queryImageAnalyses(slug, urls) {
  if (!slug || !urls?.length) return null;
  try {
    const path = imagesPath(slug);
    if (!existsSync(path)) return [];
    const cache = JSON.parse(await readFile(path, 'utf-8'));
    const urlSet = new Set(urls);
    return Object.entries(cache)
      .filter(([url]) => urlSet.has(url))
      .map(([url, row]) => ({ url, ...row }));
  } catch (err) {
    console.warn(`[local-store] queryImageAnalyses failed: ${err.message}`);
    return null;
  }
}

export async function upsertImageAnalyses(slug, analyses) {
  if (!slug || !analyses?.length) return null;
  try {
    await ensureDirs();
    const path = imagesPath(slug);
    let cache = {};
    if (existsSync(path)) {
      cache = JSON.parse(await readFile(path, 'utf-8'));
    }
    for (const a of analyses) {
      if (!a.url) continue;
      cache[a.url] = {
        subject: a.subject,
        authentic: a.authentic,
        quality: a.quality,
        description: a.description,
        tags: a.tags || [],
        analyzed_at: new Date().toISOString(),
      };
    }
    await writeFile(path, JSON.stringify(cache, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`[local-store] upsertImageAnalyses failed: ${err.message}`);
    return null;
  }
}

export async function closeDb() {
  /* no-op — local files need no pool teardown */
}
