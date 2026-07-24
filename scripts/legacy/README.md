# Legacy CRM / migration scripts

Airtable was replaced by Cloudflare D1 in June 2026. These files are **one-shot / historical**.

| File | Purpose |
|------|---------|
| `airtable-pipeline.js` | Old CRM client (`scripts/pipeline/lib/airtable.js`) |
| `airtable-sourcing.js` | Old sourcing sync |
| `migrate-airtable-*.mjs` | Airtable → D1 backfills (already run) |
| `migrate-to-d1.mjs` | Local `_memory/` → D1 seed |
| `migrate-supabase-export.js` | Historical Supabase export |
| `migrate-canonical-slugs.mjs` | Slug normalization |

**Live CRM:** `scripts/pipeline/lib/d1.js` + `scripts/sourcing/lib/d1.js`.

Do not add new imports from this folder. Re-run a migrator only if recovering an old environment.
