/**
 * db.js — Supabase/Postgres integration for pipeline runs and design library.
 *
 * Two write paths:
 *   1. `insertRun(stats)`         — one row per pipeline build in `runs`
 *   2. `upsertDesignLibrary(fp)`  — one row per slug in `design_library`
 *   3. `queryDesignLibrary()`     — replaces local _memory/library/index.json
 *
 * Uses DATABASE_URL (pg direct) since the service key REST API can't do upserts
 * on composite keys without extra setup.
 */

import pg from 'pg';

const { Pool } = pg;

let _pool = null;

function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    _pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  }
  return _pool;
}

// ---------------------------------------------------------------------------
// runs table
// ---------------------------------------------------------------------------

/**
 * Insert one row into `runs` at the end of a pipeline build.
 *
 * @param {object} data  — Shape mirrors the `runs` table columns
 * @returns {object|null}
 */
export async function insertRun(data) {
  const pool = getPool();
  if (!pool) return null;

  const {
    client_slug, gcs_prefix, url, practice_name, doctor_name, city, phone,
    archetype, hero_variant, font_heading, font_body,
    palette_primary, palette_mood,
    services_count, signals_count, signals,
    sections_generated, build_success, duration_ms, errors,
  } = data;

  try {
    const res = await pool.query(
      `INSERT INTO runs (
        client_slug, gcs_prefix, url, practice_name, doctor_name, city, phone,
        archetype, hero_variant, font_heading, font_body,
        palette_primary, palette_mood,
        services_count, signals_count, signals,
        sections_generated, build_success, duration_ms, errors
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,
        $14,$15,$16,
        $17,$18,$19,$20
      ) RETURNING id`,
      [
        client_slug, gcs_prefix, url, practice_name, doctor_name, city, phone,
        archetype, hero_variant, font_heading, font_body,
        palette_primary, palette_mood,
        services_count, signals_count, JSON.stringify(signals || []),
        sections_generated || [], build_success, duration_ms,
        errors || [],
      ],
    );
    return res.rows[0];
  } catch (err) {
    console.warn(`[db] insertRun failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// design_library table
// ---------------------------------------------------------------------------

/**
 * Upsert a fingerprint into `design_library`.
 * Called by distill-design.js after local save.
 */
export async function upsertDesignLibrary(fp) {
  const pool = getPool();
  if (!pool) return null;

  try {
    await pool.query(
      `INSERT INTO design_library (
        slug, tag, source, captured_date, archetype, mood, font_pair, adjectives, fingerprint
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (slug) DO UPDATE SET
        tag           = EXCLUDED.tag,
        source        = EXCLUDED.source,
        captured_date = EXCLUDED.captured_date,
        archetype     = EXCLUDED.archetype,
        mood          = EXCLUDED.mood,
        font_pair     = EXCLUDED.font_pair,
        adjectives    = EXCLUDED.adjectives,
        fingerprint   = EXCLUDED.fingerprint`,
      [
        fp.slug,
        fp.tag,
        fp.source,
        fp.captured,
        fp.layout?.archetype || null,
        fp.palette?.mood || null,
        fp.fontPair || null,
        fp.adjectives || [],
        JSON.stringify(fp),
      ],
    );
    return true;
  } catch (err) {
    console.warn(`[db] upsertDesignLibrary failed: ${err.message}`);
    return null;
  }
}

/**
 * Load the design library index from Supabase.
 * Returns { entries: [...] } matching the shape of _memory/library/index.json.
 */
export async function queryDesignLibrary() {
  const pool = getPool();
  if (!pool) return null;

  try {
    const res = await pool.query(
      `SELECT slug, tag, source, captured_date, archetype, mood, font_pair, adjectives
       FROM design_library ORDER BY captured_date DESC`,
    );
    const entries = res.rows.map(r => ({
      slug:       r.slug,
      tag:        r.tag,
      source:     r.source,
      captured:   r.captured_date,
      archetype:  r.archetype,
      mood:       r.mood,
      fontPair:   r.font_pair,
      adjectives: Array.isArray(r.adjectives) ? r.adjectives : [],
    }));
    return { entries };
  } catch (err) {
    console.warn(`[db] queryDesignLibrary failed: ${err.message}`);
    return null;
  }
}

/**
 * Load a single fingerprint JSON from design_library.
 */
export async function loadDesignFingerprint(slug) {
  const pool = getPool();
  if (!pool) return null;

  try {
    const res = await pool.query(
      `SELECT fingerprint FROM design_library WHERE slug = $1`,
      [slug],
    );
    if (!res.rows[0]) return null;
    const fp = res.rows[0].fingerprint;
    return typeof fp === 'string' ? JSON.parse(fp) : fp;
  } catch (err) {
    console.warn(`[db] loadDesignFingerprint(${slug}) failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// images table
// ---------------------------------------------------------------------------

/**
 * Fetch existing image analyses for a site slug + list of URLs.
 * Returns array of rows (only (url, slug) pairs that exist in the table).
 */
export async function queryImageAnalyses(slug, urls) {
  const pool = getPool();
  if (!pool || !urls?.length) return null;

  try {
    const res = await pool.query(
      `SELECT url, subject, authentic, quality, description, tags
       FROM images WHERE slug = $1 AND url = ANY($2)`,
      [slug, urls],
    );
    return res.rows;
  } catch (err) {
    console.warn(`[db] queryImageAnalyses failed: ${err.message}`);
    return null;
  }
}

/**
 * Upsert image analysis rows for a site slug.
 * Safe to call with duplicates — ON CONFLICT updates all fields.
 */
export async function upsertImageAnalyses(slug, analyses) {
  const pool = getPool();
  if (!pool || !analyses?.length) return null;

  try {
    for (const a of analyses) {
      await pool.query(
        `INSERT INTO images (url, slug, subject, authentic, quality, description, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (url, slug) DO UPDATE SET
           subject     = EXCLUDED.subject,
           authentic   = EXCLUDED.authentic,
           quality     = EXCLUDED.quality,
           description = EXCLUDED.description,
           tags        = EXCLUDED.tags,
           analyzed_at = now()`,
        [a.url, slug, a.subject, a.authentic, a.quality, a.description, a.tags || []],
      );
    }
    return true;
  } catch (err) {
    console.warn(`[db] upsertImageAnalyses failed: ${err.message}`);
    return null;
  }
}

/** Graceful shutdown — call at process exit if needed */
export async function closeDb() {
  if (_pool) { await _pool.end(); _pool = null; }
}
