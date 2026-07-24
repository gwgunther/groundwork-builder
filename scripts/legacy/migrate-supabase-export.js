#!/usr/bin/env node
/**
 * One-shot export: Supabase Postgres caches → local _memory/.
 *
 * Pulls historical rows from runs, design_library, and images tables.
 * Safe to re-run — skips runs already in runs.jsonl; merges image caches.
 *
 * Requires DATABASE_URL in .env (legacy Supabase pooler URL).
 *
 * Usage:
 *   node scripts/pipeline/migrate-supabase-export.js
 *   node scripts/pipeline/migrate-supabase-export.js --dry-run
 */

import 'dotenv/config';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEMORY_DIR  = join(ROOT, '_memory');
const RUNS_FILE   = join(MEMORY_DIR, 'runs.jsonl');
const LIBRARY_DIR = join(MEMORY_DIR, 'library');
const INDEX_FILE  = join(LIBRARY_DIR, 'index.json');
const IMAGES_DIR  = join(MEMORY_DIR, 'images');

const dryRun = process.argv.includes('--dry-run');

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (legacy Supabase pooler connection string).');
    console.error('Uncomment it in .env or pass inline for this one-shot export.');
    process.exit(1);
  }
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

async function loadExistingRunIds() {
  if (!existsSync(RUNS_FILE)) return new Set();
  const text = await readFile(RUNS_FILE, 'utf-8');
  const ids = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.id) ids.add(String(row.id));
      if (row.supabase_id) ids.add(String(row.supabase_id));
    } catch { /* skip malformed */ }
  }
  return ids;
}

async function exportRuns(pool) {
  const res = await pool.query(
    `SELECT * FROM runs ORDER BY created_at ASC NULLS LAST, id ASC`,
  );
  const existing = await loadExistingRunIds();
  let added = 0;
  let skipped = 0;

  for (const row of res.rows) {
    const supabaseId = String(row.id);
    if (existing.has(supabaseId)) {
      skipped++;
      continue;
    }
    const entry = {
      id: `run-${row.id}`,
      supabase_id: row.id,
      created_at: row.created_at || new Date().toISOString(),
      client_slug: row.client_slug,
      gcs_prefix: row.gcs_prefix,
      url: row.url,
      practice_name: row.practice_name,
      doctor_name: row.doctor_name,
      city: row.city,
      phone: row.phone,
      archetype: row.archetype,
      hero_variant: row.hero_variant,
      font_heading: row.font_heading,
      font_body: row.font_body,
      palette_primary: row.palette_primary,
      palette_mood: row.palette_mood,
      services_count: row.services_count,
      signals_count: row.signals_count,
      signals: row.signals,
      sections_generated: row.sections_generated,
      build_success: row.build_success,
      duration_ms: row.duration_ms,
      errors: row.errors,
      migrated_from: 'supabase',
    };
    if (!dryRun) {
      await mkdir(MEMORY_DIR, { recursive: true });
      await appendFile(RUNS_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    }
    added++;
  }

  console.log(`runs: ${res.rows.length} in Supabase → ${added} exported, ${skipped} already local`);
  return { total: res.rows.length, added, skipped };
}

async function exportDesignLibrary(pool) {
  const res = await pool.query(`SELECT * FROM design_library ORDER BY slug`);
  let index = { entries: [] };
  if (existsSync(INDEX_FILE)) {
    index = JSON.parse(await readFile(INDEX_FILE, 'utf-8'));
  }

  let upserted = 0;
  for (const row of res.rows) {
    const fp = typeof row.fingerprint === 'string'
      ? JSON.parse(row.fingerprint)
      : row.fingerprint;
    if (!fp?.slug) continue;

    const entry = {
      slug: row.slug,
      tag: row.tag,
      source: row.source,
      captured: row.captured_date,
      archetype: row.archetype,
      mood: row.mood,
      fontPair: row.font_pair,
      adjectives: Array.isArray(row.adjectives) ? row.adjectives : [],
    };

    if (!dryRun) {
      await mkdir(LIBRARY_DIR, { recursive: true });
      await writeFile(join(LIBRARY_DIR, `${fp.slug}.json`), JSON.stringify(fp, null, 2), 'utf-8');
      const idx = index.entries.findIndex(e => e.slug === fp.slug);
      if (idx >= 0) index.entries[idx] = entry;
      else index.entries.push(entry);
    }
    upserted++;
  }

  if (!dryRun && upserted) {
    await writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  }

  console.log(`design_library: ${upserted} fingerprints exported`);
  return upserted;
}

async function exportImages(pool) {
  const res = await pool.query(
    `SELECT url, slug, subject, authentic, quality, description, tags, analyzed_at
     FROM images ORDER BY slug, url`,
  );

  const bySlug = {};
  for (const row of res.rows) {
    if (!row.slug || !row.url) continue;
    if (!bySlug[row.slug]) bySlug[row.slug] = {};
    bySlug[row.slug][row.url] = {
      subject: row.subject,
      authentic: row.authentic,
      quality: row.quality,
      description: row.description,
      tags: row.tags || [],
      analyzed_at: row.analyzed_at || new Date().toISOString(),
    };
  }

  let files = 0;
  let rows = 0;
  for (const [slug, incoming] of Object.entries(bySlug)) {
    const path = join(IMAGES_DIR, `${slug}.json`);
    let cache = {};
    if (existsSync(path)) {
      cache = JSON.parse(await readFile(path, 'utf-8'));
    }
    for (const [url, row] of Object.entries(incoming)) {
      if (!cache[url]) rows++;
      cache[url] = row;
    }
    if (!dryRun) {
      await mkdir(IMAGES_DIR, { recursive: true });
      await writeFile(path, JSON.stringify(cache, null, 2), 'utf-8');
    }
    files++;
  }

  console.log(`images: ${res.rows.length} rows → ${files} slug files (${rows} new URLs merged)`);
  return { rows: res.rows.length, files, newUrls: rows };
}

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== Supabase → _memory export ===');
  const pool = getPool();

  try {
    await exportRuns(pool);
    await exportDesignLibrary(pool);
    await exportImages(pool);
    console.log('\nDone. Pipeline now reads from _memory/ only — safe to remove DATABASE_URL from .env.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
