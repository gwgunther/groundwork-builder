#!/usr/bin/env node
/**
 * migrate-to-d1.mjs
 *
 * Reads all existing local data and bulk-inserts into Cloudflare D1.
 *
 * Sources:
 *   _memory/runs.jsonl            → runs table  (INSERT OR IGNORE by id)
 *   _memory/library/<slug>.json   → design_profiles table (INSERT OR REPLACE)
 *   runs.jsonl (unique slugs)     → accounts table (INSERT OR IGNORE by slug)
 *
 * Usage:
 *   node scripts/pipeline/migrate-to-d1.mjs
 *   node scripts/pipeline/migrate-to-d1.mjs --dry-run
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');

// Fail loudly if env vars are missing
function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`\nFATAL: Missing required env var: ${name}`);
    console.error('Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN before running.\n');
    process.exit(1);
  }
  return val;
}

const ACCOUNT_ID  = DRY_RUN ? 'dry-run' : requireEnv('CLOUDFLARE_ACCOUNT_ID');
const DATABASE_ID = DRY_RUN ? 'dry-run' : requireEnv('CLOUDFLARE_D1_DATABASE_ID');
const API_TOKEN   = DRY_RUN ? 'dry-run' : requireEnv('CLOUDFLARE_API_TOKEN');

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

// ---------------------------------------------------------------------------
// D1 HTTP helpers
// ---------------------------------------------------------------------------

async function d1Query(sql, params = []) {
  if (DRY_RUN) {
    // Just show the first 120 chars of the SQL so output stays readable
    console.log(`  [dry-run] ${sql.slice(0, 120).replace(/\s+/g, ' ')}  params[${params.length}]`);
    return { success: true };
  }

  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    const errMsg = json.errors?.map(e => e.message).join(', ') || res.statusText;
    throw new Error(`D1 query failed: ${errMsg}\nSQL: ${sql.slice(0, 200)}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

function jstr(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function bool(val) {
  return val ? 1 : 0;
}

// ---------------------------------------------------------------------------
// 1. Migrate runs.jsonl → runs table
// ---------------------------------------------------------------------------

async function migrateRuns() {
  const path = resolve(ROOT, '_memory/runs.jsonl');
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  console.log(`\nMigrating ${lines.length} runs...`);

  let inserted = 0;
  let skipped = 0;

  for (const line of lines) {
    let run;
    try {
      run = JSON.parse(line);
    } catch {
      console.warn(`  WARN: could not parse run line, skipping`);
      skipped++;
      continue;
    }

    const sql = `
      INSERT OR IGNORE INTO runs (
        id, created_at, client_slug, gcs_prefix, url,
        practice_name, doctor_name, city, phone,
        archetype, hero_variant, font_heading, font_body,
        palette_primary, palette_mood,
        services_count, signals_count,
        signals, sections_generated,
        build_success, duration_ms, errors,
        supabase_id, migrated_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `.trim();

    const params = [
      run.id ?? null,
      run.created_at ?? null,
      run.client_slug ?? null,
      run.gcs_prefix ?? null,
      run.url ?? null,
      run.practice_name ?? null,
      run.doctor_name ?? null,
      run.city ?? null,
      run.phone ?? null,
      run.archetype ?? null,
      run.hero_variant ?? null,
      run.font_heading ?? null,
      run.font_body ?? null,
      run.palette_primary ?? null,
      run.palette_mood ?? null,
      run.services_count ?? null,
      run.signals_count ?? null,
      jstr(run.signals ?? []),
      jstr(run.sections_generated ?? []),
      bool(run.build_success),
      run.duration_ms ?? null,
      jstr(run.errors ?? []),
      run.supabase_id ?? null,
      run.migrated_from ?? null,
    ];

    try {
      await d1Query(sql, params);
      inserted++;
    } catch (err) {
      console.error(`  ERROR inserting run ${run.id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  runs: ${inserted} inserted, ${skipped} skipped/errored`);
  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// 2. Migrate library JSON files → design_profiles table
// ---------------------------------------------------------------------------

const LIBRARY_SKIP_PREFIXES = ['index', 'inspo-', 'anti-'];

function shouldSkipLibraryFile(filename) {
  return LIBRARY_SKIP_PREFIXES.some(prefix => filename.startsWith(prefix));
}

async function migratePractices() {
  const libDir = resolve(ROOT, '_memory/library');
  const files = readdirSync(libDir)
    .filter(f => f.endsWith('.json') && !shouldSkipLibraryFile(f));

  console.log(`\nMigrating ${files.length} practices...`);

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    let entry;
    try {
      entry = JSON.parse(readFileSync(resolve(libDir, file), 'utf8'));
    } catch {
      console.warn(`  WARN: could not parse ${file}, skipping`);
      skipped++;
      continue;
    }

    // slug from the JSON itself or fall back to filename without .json
    const slug = entry.slug || basename(file, '.json');

    const sql = `
      INSERT OR REPLACE INTO design_profiles (
        slug, palette_primary, palette_mood,
        font_heading, font_body, archetype,
        adjectives, tag, captured, note,
        palette_secondary, palette_accent, palette_background,
        hero_variant, cards, motion, radius, font_pair,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `.trim();

    const params = [
      slug,
      entry.palette?.primary ?? null,
      entry.palette?.mood ?? null,
      entry.type?.display ?? null,
      entry.type?.body ?? null,
      entry.layout?.archetype ?? null,
      jstr(entry.adjectives ?? []),
      entry.tag ?? null,
      entry.captured ?? null,
      entry.note ?? null,
      entry.palette?.secondary ?? null,
      entry.palette?.accent ?? null,
      entry.palette?.background ?? null,
      entry.hero?.variant ?? null,
      entry.cards ?? null,
      entry.motion ?? null,
      entry.radius ?? null,
      entry.fontPair ?? null,
    ];

    try {
      await d1Query(sql, params);
      inserted++;
    } catch (err) {
      console.error(`  ERROR inserting practice ${slug}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  practices: ${inserted} inserted/replaced, ${skipped} skipped/errored`);
  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// 3. Upsert accounts from runs (unique slugs)
// ---------------------------------------------------------------------------

async function migrateAccounts() {
  const path = resolve(ROOT, '_memory/runs.jsonl');
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  // Collect latest metadata per slug (last run wins for mutable fields)
  const bySlug = new Map();
  for (const line of lines) {
    try {
      const run = JSON.parse(line);
      if (!run.client_slug) continue;
      const existing = bySlug.get(run.client_slug);
      // keep the more recent record (created_at descending)
      if (!existing || (run.created_at ?? '') > (existing.created_at ?? '')) {
        bySlug.set(run.client_slug, run);
      }
    } catch {
      // ignore parse errors — already reported in migrateRuns
    }
  }

  const accounts = [...bySlug.values()];
  console.log(`\nMigrating ${accounts.length} accounts (unique slugs from runs)...`);

  let inserted = 0;
  let skipped = 0;

  for (const run of accounts) {
    const sql = `
      INSERT OR IGNORE INTO accounts (id, slug, practice_name, practice_url, city, phone, lifecycle_stage)
      VALUES (?, ?, ?, ?, ?, ?, 'Prospect')
    `.trim();

    const params = [
      crypto.randomUUID(),
      run.client_slug,
      run.practice_name ?? null,
      run.url ?? null,
      run.city ?? null,
      run.phone ?? null,
    ];

    try {
      await d1Query(sql, params);
      inserted++;
    } catch (err) {
      console.error(`  ERROR inserting account ${run.client_slug}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  accounts: ${inserted} inserted, ${skipped} skipped/errored`);
  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log('Groundwork Builder — D1 migration');
  if (DRY_RUN) console.log('MODE: DRY RUN (no writes)');
  console.log('='.repeat(60));

  const results = {
    runs:      await migrateRuns(),
    practices: await migratePractices(),
    accounts:  await migrateAccounts(),
  };

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  runs       inserted: ${results.runs.inserted}  skipped/errored: ${results.runs.skipped}`);
  console.log(`  practices  inserted: ${results.practices.inserted}  skipped/errored: ${results.practices.skipped}`);
  console.log(`  accounts   inserted: ${results.accounts.inserted}  skipped/errored: ${results.accounts.skipped}`);
  console.log('');

  const anyErrors =
    results.runs.skipped + results.practices.skipped + results.accounts.skipped > 0;

  if (anyErrors) {
    console.warn('Migration completed with some errors. Review output above.');
    process.exit(1);
  } else {
    console.log('Migration complete.');
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
