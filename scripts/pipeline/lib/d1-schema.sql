-- Groundwork Builder — Cloudflare D1 Schema
-- SQLite-compatible; apply via: wrangler d1 execute <DB> --file=scripts/pipeline/lib/d1-schema.sql

-- ---------------------------------------------------------------------------
-- accounts: one row per practice (CRM identity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,          -- e.g. "springstdentistry"
  practice_name TEXT,
  url         TEXT,
  city        TEXT,
  phone       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_slug ON accounts (slug);

-- ---------------------------------------------------------------------------
-- audits: one row per audit run, FK → accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audits (
  id          TEXT    PRIMARY KEY,              -- e.g. "audit-<timestamp>"
  account_id  INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  slug        TEXT    NOT NULL,                 -- denormalized for fast lookups
  url         TEXT,
  audit_type  TEXT,                             -- "agentic", "tech", "sales", etc.
  score       REAL,
  findings    TEXT,                             -- JSON array of finding objects
  raw         TEXT,                             -- full JSON blob
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audits_slug       ON audits (slug);
CREATE INDEX IF NOT EXISTS idx_audits_account_id ON audits (account_id);

-- ---------------------------------------------------------------------------
-- builds: one row per generated site, FK → accounts + audits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builds (
  id          TEXT    PRIMARY KEY,              -- e.g. "build-<timestamp>"
  account_id  INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  audit_id    TEXT    REFERENCES audits (id)   ON DELETE SET NULL,
  build_slug  TEXT    NOT NULL,                 -- matches client_slug / slug
  gcs_prefix  TEXT,
  url         TEXT,
  deploy_url  TEXT,
  success     INTEGER NOT NULL DEFAULT 0,       -- 0 | 1
  duration_ms INTEGER,
  errors      TEXT,                             -- JSON array
  meta        TEXT,                             -- arbitrary JSON
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_builds_build_slug  ON builds (build_slug);
CREATE INDEX IF NOT EXISTS idx_builds_account_id  ON builds (account_id);

-- ---------------------------------------------------------------------------
-- runs: mirrors _memory/runs.jsonl (full build pipeline output)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
  id                 TEXT PRIMARY KEY,           -- e.g. "run-1781115244565"
  created_at         TEXT NOT NULL,
  client_slug        TEXT NOT NULL,
  gcs_prefix         TEXT,
  url                TEXT,
  practice_name      TEXT,
  doctor_name        TEXT,
  city               TEXT,
  phone              TEXT,
  archetype          TEXT,
  hero_variant       TEXT,
  font_heading       TEXT,
  font_body          TEXT,
  palette_primary    TEXT,
  palette_mood       TEXT,
  services_count     INTEGER,
  signals_count      INTEGER,
  signals            TEXT,                       -- JSON array
  sections_generated TEXT,                       -- JSON array
  build_success      INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  duration_ms        INTEGER,
  errors             TEXT,                       -- JSON array
  -- extra fields present on some records
  supabase_id        TEXT,
  migrated_from      TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_client_slug ON runs (client_slug);
CREATE INDEX IF NOT EXISTS idx_runs_created_at  ON runs (created_at);

-- ---------------------------------------------------------------------------
-- practices: denormalized view of latest design library data
-- One row per slug; upserted whenever a library JSON is ingested.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practices (
  slug            TEXT PRIMARY KEY,
  palette_primary TEXT,
  palette_mood    TEXT,
  font_heading    TEXT,
  font_body       TEXT,
  archetype       TEXT,
  adjectives      TEXT,                          -- JSON array
  tag             TEXT,
  captured        TEXT,
  note            TEXT,
  -- extra fields from library JSON
  palette_secondary TEXT,
  palette_accent    TEXT,
  palette_background TEXT,
  hero_variant      TEXT,
  cards             TEXT,
  motion            TEXT,
  radius            TEXT,
  font_pair         TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
