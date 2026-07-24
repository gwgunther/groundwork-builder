#!/usr/bin/env node
/**
 * migrate-airtable-crm.mjs
 *
 * One-time backfill: Airtable "Audits" + "Builds" tables → D1 audits + builds.
 * The pipeline cut over to D1 (lib/d1.js) as the live writer, so these are
 * historical rows that never came across in the original migrate-to-d1.mjs.
 *
 * Linking: Airtable audit/build slugs diverge from D1 account slugs
 * (e.g. "lbpds" → "pediatric-dental-specialists"), so account_id is resolved
 * via the Airtable Account LINK (record id) → that account's slug → an
 * explicit slug→D1-account map below. source_audit_id is resolved via the
 * Airtable Source Audit link → the audit's airtable_id we just inserted.
 *
 * Idempotent: adds an `airtable_id` column to each table and skips rows whose
 * airtable_id already exists. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env scripts/pipeline/migrate-airtable-crm.mjs --dry-run
 *   node --env-file=.env scripts/pipeline/migrate-airtable-crm.mjs --commit
 *
 * Required env vars:
 *   AIRTABLE_API_KEY, AIRTABLE_BASE_ID,
 *   AIRTABLE_AUDITS_TABLE, AIRTABLE_BUILDS_TABLE, AIRTABLE_ACCOUNTS_TABLE
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN
 */

const DRY_RUN = !process.argv.includes('--commit');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) { console.error(`FATAL: Missing required env var: ${name}`); process.exit(1); }
  return val;
}

const AIRTABLE_KEY   = requireEnv('AIRTABLE_API_KEY');
const AIRTABLE_BASE  = requireEnv('AIRTABLE_BASE_ID');
const T_ACCOUNTS     = requireEnv('AIRTABLE_ACCOUNTS_TABLE');
const T_AUDITS       = requireEnv('AIRTABLE_AUDITS_TABLE');
const T_BUILDS       = requireEnv('AIRTABLE_BUILDS_TABLE');
const CF_ACCOUNT     = requireEnv('CLOUDFLARE_ACCOUNT_ID');
const CF_DB          = requireEnv('CLOUDFLARE_D1_DATABASE_ID');
const CF_TOKEN       = requireEnv('CLOUDFLARE_API_TOKEN');

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB}/query`;

async function d1Query(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`D1: ${JSON.stringify(json.errors)}\nSQL: ${sql.slice(0, 160)}`);
  return json.result?.[0]?.results ?? [];
}

async function fetchAll(table) {
  const records = [];
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } });
    const json = await res.json();
    if (json.error) throw new Error(`Airtable ${table}: ${JSON.stringify(json.error)}`);
    records.push(...(json.records ?? []));
    offset = json.offset;
  } while (offset);
  return records;
}

// Airtable account slug → D1 account id. Built by reading the live data; the
// Airtable and D1 slug spellings differ, so this map is explicit + verified.
const SLUG_TO_D1_ACCOUNT = {
  bearcreekfamilydentistry: '2a20c1a1-113b-4f7a-bcd9-f76791456929',
  springstdentistry:        '5e0616fe-38ec-4a3b-8f7b-5cbc4143bfcb',
  arizonabiltmoredentistry: '453ab665-709c-4154-aa58-883ee582dcf4',
  illinoisdentistrydallas:  '77ab5d85-0e91-49cb-a55e-8bbf98356890',
  illinoisfamilydentistry:  '77ab5d85-0e91-49cb-a55e-8bbf98356890',
  changorthodontics:        'ae41febe-6388-462e-9910-b9ab10f3c2b3',
  lbpds:                    '93ad997a-7e61-4972-9371-f74794c65189',
  butterflybraces:          '3c72e83e-f101-4761-aea4-6fb4ee73d043',
  butterflyorthodontics:    '3c72e83e-f101-4761-aea4-6fb4ee73d043',
  dentiq:                   '8a1843ba-6416-4576-8242-a0593705e8e2',
  dentiqdentistryhouston:   '8a1843ba-6416-4576-8242-a0593705e8e2',
};

async function ensureColumn(table) {
  try {
    await d1Query(`ALTER TABLE ${table} ADD COLUMN airtable_id TEXT`);
    console.log(`  + added ${table}.airtable_id`);
  } catch (err) {
    if (/duplicate column name/i.test(err.message)) {
      console.log(`  = ${table}.airtable_id already present`);
    } else {
      throw err;
    }
  }
}

async function main() {
  console.log('='.repeat(64));
  console.log('Airtable Audits + Builds → D1  ' + (DRY_RUN ? '(DRY RUN)' : '(COMMIT)'));
  console.log('='.repeat(64));

  // Resolve Airtable account record id → its slug
  const acctRecs = await fetchAll(T_ACCOUNTS);
  const acctSlugById = {};
  for (const r of acctRecs) acctSlugById[r.id] = r.fields.Slug ?? null;

  const resolveAccount = (accountLink) => {
    const recId = accountLink?.[0];
    if (!recId) return { id: null, why: 'no account link' };
    const slug = acctSlugById[recId];
    if (!slug) return { id: null, why: `account ${recId} has no slug` };
    const d1Id = SLUG_TO_D1_ACCOUNT[slug];
    if (!d1Id) return { id: null, why: `slug "${slug}" not in map` };
    return { id: d1Id, why: slug };
  };

  if (!DRY_RUN) {
    await ensureColumn('audits');
    await ensureColumn('builds');
  }

  // Existing airtable_ids (skip already-migrated)
  const existingAudits = DRY_RUN ? [] : await d1Query('SELECT airtable_id FROM audits WHERE airtable_id IS NOT NULL');
  const existingBuilds = DRY_RUN ? [] : await d1Query('SELECT airtable_id FROM builds WHERE airtable_id IS NOT NULL');
  const haveAudit = new Set(existingAudits.map(r => r.airtable_id));
  const haveBuild = new Set(existingBuilds.map(r => r.airtable_id));

  // --- Audits ---
  const auditRecs = await fetchAll(T_AUDITS);
  console.log(`\nAudits: ${auditRecs.length} in Airtable`);
  const auditIdByAirtable = {}; // airtable audit recId → new D1 audit uuid
  let aIns = 0, aSkip = 0;
  for (const rec of auditRecs) {
    const f = rec.fields;
    const acct = resolveAccount(f.Account);
    const d1Id = crypto.randomUUID();
    auditIdByAirtable[rec.id] = d1Id;
    const tag = acct.id ? `acct=${acct.why}` : `acct=NULL (${acct.why})`;
    if (haveAudit.has(rec.id)) { console.log(`  skip ${f.Slug} (already migrated)`); aSkip++; continue; }
    console.log(`  ${DRY_RUN ? 'would add' : 'add'} audit ${f.Slug} status=${f.Status} ${tag}`);
    if (!DRY_RUN) {
      await d1Query(
        `INSERT INTO audits (id, account_id, slug, status, website_url, source, contact_email,
           total_checks, passed, critical, warnings, mobile_score, desktop_score,
           gbp_reviews, gbp_rating, audit_report_url, gcs_run_folder, error_detail,
           completed_at, date_added, airtable_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d1Id, acct.id, f.Slug ?? null, f.Status ?? null, f['Website URL'] ?? null,
          f['Submission Method'] ?? null, f['Contact Email'] ?? null,
          f['Total Checks'] ?? null, f.Passed ?? null, f.Critical ?? null, f.Warnings ?? null,
          f['Mobile Score'] ?? null, f['Desktop Score'] ?? null,
          f['GBP Reviews'] ?? null, f['GBP Rating'] ?? null,
          f['Audit Report URL'] ?? null, f['GCS Run Folder'] ?? null, f['Error Detail'] ?? null,
          f['Completed At'] ?? null, f['Date Added'] ?? null, rec.id,
        ],
      );
    }
    aIns++;
  }

  // --- Builds ---
  const buildRecs = await fetchAll(T_BUILDS);
  console.log(`\nBuilds: ${buildRecs.length} in Airtable`);
  let bIns = 0, bSkip = 0;
  for (const rec of buildRecs) {
    const f = rec.fields;
    const acct = resolveAccount(f.Account);
    const srcAuditRec = f['Source Audit']?.[0] ?? null;
    const srcAuditD1 = srcAuditRec ? (auditIdByAirtable[srcAuditRec] ?? null) : null;
    const tag = `acct=${acct.id ? acct.why : 'NULL (' + acct.why + ')'} srcAudit=${srcAuditRec ? (srcAuditD1 ? 'linked' : 'UNRESOLVED') : 'none'}`;
    if (haveBuild.has(rec.id)) { console.log(`  skip ${f['Build Slug']} (already migrated)`); bSkip++; continue; }
    console.log(`  ${DRY_RUN ? 'would add' : 'add'} build ${f['Build Slug']} status=${f.Status} ${tag}`);
    if (!DRY_RUN) {
      await d1Query(
        `INSERT INTO builds (id, account_id, source_audit_id, build_slug, status, website_url,
           request_notes, contact_name, contact_email, contact_phone, contact_role,
           preview_url, pitch_url, github_folder_url, gcs_run_folder,
           mobile_score, desktop_score, fixed_count, still_issue_count, regressed_count,
           rescanned_at, cost_est, error_detail, completed_at, date_added, airtable_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(), acct.id, srcAuditD1, f['Build Slug'] ?? null, f.Status ?? null,
          f['Website URL'] ?? null, f['Request Notes'] ?? null,
          f['Contact Name'] ?? null, f['Contact Email'] ?? null, f['Contact Phone'] ?? null, f['Contact Role'] ?? null,
          f['Preview URL'] ?? null, f['Pitch URL'] ?? null, f['GitHub Folder URL'] ?? null, f['GCS Run Folder'] ?? null,
          f['Mobile Score'] ?? null, f['Desktop Score'] ?? null,
          f['Fixed Count'] ?? null, f['Still Issue Count'] ?? null, f['Regressed Count'] ?? null,
          f['Rescanned At'] ?? null, f['Cost Est ($)'] ?? null, f['Error Detail'] ?? null,
          f['Completed At'] ?? null, f['Date Added'] ?? null, rec.id,
        ],
      );
    }
    bIns++;
  }

  console.log('\n' + '='.repeat(64));
  console.log(`audits: ${aIns} ${DRY_RUN ? 'to add' : 'added'}, ${aSkip} skipped`);
  console.log(`builds: ${bIns} ${DRY_RUN ? 'to add' : 'added'}, ${bSkip} skipped`);
  if (DRY_RUN) console.log('\nDRY RUN — no writes. Re-run with --commit to apply.');
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
