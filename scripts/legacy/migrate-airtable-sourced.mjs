#!/usr/bin/env node
/**
 * migrate-airtable-sourced.mjs
 *
 * One-time migration: Airtable "Sourced Practices" → D1 sourced_practices.
 * Safe to re-run (INSERT OR REPLACE keyed on Place ID).
 *
 * Usage:
 *   node --env-file=.env scripts/pipeline/migrate-airtable-sourced.mjs
 *
 * Required env vars:
 *   AIRTABLE_API_KEY, AIRTABLE_BASE_ID
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN
 */

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`FATAL: Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const AIRTABLE_KEY  = requireEnv('AIRTABLE_API_KEY');
const AIRTABLE_BASE = requireEnv('AIRTABLE_BASE_ID');
const CF_ACCOUNT    = requireEnv('CLOUDFLARE_ACCOUNT_ID');
const CF_DB         = requireEnv('CLOUDFLARE_D1_DATABASE_ID');
const CF_TOKEN      = requireEnv('CLOUDFLARE_API_TOKEN');

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB}/query`;

async function d1Query(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`D1: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Fetch all Airtable records (paginated)
// ---------------------------------------------------------------------------

async function fetchAllAirtable() {
  const records = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/Sourced%20Practices`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } });
    const json = await res.json();
    if (json.error) throw new Error(`Airtable: ${JSON.stringify(json.error)}`);
    records.push(...(json.records ?? []));
    offset = json.offset;
    process.stdout.write(`\r  fetched ${records.length} records...`);
  } while (offset);
  console.log();
  return records;
}

// ---------------------------------------------------------------------------
// Map Airtable fields → D1 columns
// ---------------------------------------------------------------------------

const COLUMNS = [
  'place_id', 'practice_name', 'address', 'city', 'state', 'zip', 'msa_market',
  'website_url', 'final_url', 'gbp_url', 'phone', 'email', 'primary_type',
  'rating', 'review_count', 'business_status', 'status', 'tier', 'business_tier',
  'quadrant', 'weakness_score', 'weakness_tier', 'quality_score',
  'vendor', 'vendor_category',
  'lighthouse_performance', 'lighthouse_accessibility', 'lighthouse_seo', 'lighthouse_best_practices',
  'sourced_at', 'last_audited_at', 'raw',
];

function mapRecord(rec) {
  const f = rec.fields ?? {};
  return [
    f['Place ID'] ?? rec.id,
    f['Practice Name'] ?? null,
    f['Address'] ?? null,
    f['City'] ?? null,
    f['State'] ?? null,
    f['Zip'] ?? null,
    f['MSA / Market'] ?? null,
    f['Website URL'] ?? null,
    f['Final URL'] ?? null,
    f['Google Maps / GBP'] ?? null,
    f['Phone'] ?? null,
    f['Email'] ?? null,
    f['Primary Type'] ?? null,
    f['Rating'] ?? null,
    f['Review Count'] ?? null,
    f['Business Status'] ?? null,
    f['Status'] ?? null,
    f['Tier'] ?? null,
    f['Business Tier'] ?? null,
    f['Quadrant'] ?? null,
    f['Weakness Score'] ?? null,
    f['Weakness Tier'] ?? null,
    f['Quality Score'] ?? null,
    f['Vendor'] ?? null,
    f['Vendor Category'] ?? null,
    f['Lighthouse Performance'] ?? null,
    f['Lighthouse Accessibility'] ?? null,
    f['Lighthouse SEO'] ?? null,
    f['Lighthouse Best Practices'] ?? null,
    f['Sourced At'] ?? null,
    f['Last Audited At'] ?? null,
    JSON.stringify(f),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('='.repeat(60));
console.log('Airtable "Sourced Practices" → D1 sourced_practices');
console.log('='.repeat(60));

const records = await fetchAllAirtable();
console.log(`  total: ${records.length} records`);

const placeholders = `(${COLUMNS.map(() => '?').join(', ')})`;
const BATCH = 3; // D1 HTTP API allows max 100 bound params (32 cols × 3 = 96)

let inserted = 0, errored = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH);
  const sql = `INSERT OR REPLACE INTO sourced_practices (${COLUMNS.join(', ')}) VALUES ${batch.map(() => placeholders).join(', ')}`;
  const params = batch.flatMap(mapRecord);
  try {
    await d1Query(sql, params);
    inserted += batch.length;
    process.stdout.write(`\r  inserted ${inserted}/${records.length}...`);
  } catch (err) {
    errored += batch.length;
    console.error(`\n  ERROR batch at ${i}: ${err.message}`);
  }
}
console.log();

console.log('='.repeat(60));
console.log(`Done. inserted/replaced: ${inserted}, errored: ${errored}`);
