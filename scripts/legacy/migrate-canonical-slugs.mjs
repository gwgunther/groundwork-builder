#!/usr/bin/env node
/**
 * migrate-canonical-slugs.mjs
 *
 * Normalizes every practice slug across D1 to the canonical URL-host form
 * produced by lib/slug.js slugFromUrl() — the form the live audit/build
 * pipeline writes. Before this, accounts/runs/practices carried stale
 * name-based slugs (e.g. "bear-creek-family-dentistry") that would NOT match
 * a future audit's slug ("bearcreekfamilydentistry"), silently creating
 * duplicate accounts.
 *
 * Also merges the two duplicate practices that collapse to one canonical slug
 * (latest design capture wins), and dedupes the design-library rows.
 *
 * audits.account_id / builds.account_id are UUID FKs (unaffected by slug
 * renames); their slug columns are already canonical. Only accounts, runs,
 * and practices need rewriting here.
 *
 * Snapshots accounts/practices/runs to a timestamped backup before writing.
 *
 * Usage:
 *   node --env-file=.env scripts/pipeline/migrate-canonical-slugs.mjs --dry-run
 *   node --env-file=.env scripts/pipeline/migrate-canonical-slugs.mjs --commit
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DRY_RUN = !process.argv.includes('--commit');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function requireEnv(n) { const v = process.env[n]; if (!v) { console.error(`FATAL: missing ${n}`); process.exit(1); } return v; }
const CF_ACCOUNT = requireEnv('CLOUDFLARE_ACCOUNT_ID');
const CF_DB      = requireEnv('CLOUDFLARE_D1_DATABASE_ID');
const CF_TOKEN   = requireEnv('CLOUDFLARE_API_TOKEN');
const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB}/query`;

async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`D1: ${JSON.stringify(json.errors)}\nSQL: ${sql.slice(0, 160)}`);
  return json.result?.[0] ?? { results: [] };
}
const rows = async (sql, p = []) => (await d1(sql, p)).results ?? [];

// --- canonical mapping (current slug -> canonical URL-host slug) ---
const SLUG_MAP = {
  'arizona-biltmore-dentistry':       'arizonabiltmoredentistry',
  'bear-creek-family-dentistry':      'bearcreekfamilydentistry',
  'butterfly-orthodontics':           'butterflybraces',
  'chang-orthodontics':               'changorthodontics',
  'dentiq-dentistry':                 'dentiq',
  'illinois-family-dentistry':        'illinoisdentistrydallas',
  'magic-fox-orthodontics':           'magicfoxsmiles',
  'pediatric-dental-specialists':     'lbpds',
  'russell-ek-chang-dds-ms-facd-inc': 'changorthodontics',
  'spring-st-dentistry':              'springstdentistry',
};
// Accounts to delete (merged into an existing canonical account; verified 0 audits/builds)
const ACCOUNT_DELETE = ['spring-st-dentistry', 'russell-ek-chang-dds-ms-facd-inc'];
// Accounts to rename in place (current -> canonical), none collide with a surviving account
const ACCOUNT_RENAME = {
  'arizona-biltmore-dentistry':   'arizonabiltmoredentistry',
  'bear-creek-family-dentistry':  'bearcreekfamilydentistry',
  'butterfly-orthodontics':       'butterflybraces',
  'chang-orthodontics':           'changorthodontics',
  'dentiq-dentistry':             'dentiq',
  'illinois-family-dentistry':    'illinoisdentistrydallas',
  'magic-fox-orthodontics':       'magicfoxsmiles',
  'pediatric-dental-specialists': 'lbpds',
};
// Practices: dedup losers to delete (older capture), and the lone rename.
const PRACTICE_DELETE = ['chang-orthodontics', 'russell-ek-chang-dds-ms-facd-inc', 'spring-st-dentistry'];
const PRACTICE_RENAME = { 'magic-fox-orthodontics': 'magicfoxsmiles' };

async function snapshot() {
  const dir = resolve(ROOT, '_memory/backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const data = {
    when: new Date().toISOString(),
    accounts: await rows('SELECT * FROM accounts'),
    practices: await rows('SELECT * FROM practices'),
    runs: await rows('SELECT * FROM runs'),
    audits: await rows('SELECT id, account_id, slug FROM audits'),
    builds: await rows('SELECT id, account_id, source_audit_id, build_slug FROM builds'),
  };
  const file = resolve(dir, `d1-pre-canonical-${stamp}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  snapshot written: ${file}`);
  return data;
}

async function main() {
  console.log('='.repeat(64));
  console.log('Canonical slug normalization  ' + (DRY_RUN ? '(DRY RUN)' : '(COMMIT)'));
  console.log('='.repeat(64));

  // Safety: confirm the to-be-deleted accounts truly have no audits/builds.
  for (const slug of ACCOUNT_DELETE) {
    const acct = (await rows('SELECT id FROM accounts WHERE slug=?', [slug]))[0];
    if (!acct) { console.log(`  note: account "${slug}" not present (already merged?)`); continue; }
    const a = (await rows('SELECT COUNT(*) n FROM audits WHERE account_id=?', [acct.id]))[0].n;
    const b = (await rows('SELECT COUNT(*) n FROM builds WHERE account_id=?', [acct.id]))[0].n;
    console.log(`  check ${slug}: audits=${a} builds=${b}`);
    if (a || b) { console.error(`  ABORT: "${slug}" still has audits/builds — would orphan via SET NULL`); process.exit(1); }
  }

  if (DRY_RUN) {
    console.log('\nWould DELETE accounts:', ACCOUNT_DELETE.join(', '));
    console.log('Would RENAME accounts:'); Object.entries(ACCOUNT_RENAME).forEach(([o, n]) => console.log(`   ${o} -> ${n}`));
    console.log('Would UPDATE runs.client_slug per SLUG_MAP (', Object.keys(SLUG_MAP).length, 'mappings )');
    console.log('Would DELETE practices (dedup losers):', PRACTICE_DELETE.join(', '));
    console.log('Would RENAME practices:'); Object.entries(PRACTICE_RENAME).forEach(([o, n]) => console.log(`   ${o} -> ${n}`));
    console.log('\nDRY RUN — no writes. Re-run with --commit.');
    return;
  }

  await snapshot();

  // 1. Accounts — delete merged stale rows, then rename survivors.
  for (const slug of ACCOUNT_DELETE) {
    const r = await d1('DELETE FROM accounts WHERE slug=?', [slug]);
    console.log(`  account delete ${slug}: ${r.meta?.changes ?? 0}`);
  }
  for (const [oldS, newS] of Object.entries(ACCOUNT_RENAME)) {
    const r = await d1('UPDATE accounts SET slug=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE slug=?', [newS, oldS]);
    console.log(`  account rename ${oldS} -> ${newS}: ${r.meta?.changes ?? 0}`);
  }

  // 2. Runs — rewrite client_slug to canonical.
  for (const [oldS, newS] of Object.entries(SLUG_MAP)) {
    const r = await d1('UPDATE runs SET client_slug=? WHERE client_slug=?', [newS, oldS]);
    if ((r.meta?.changes ?? 0) > 0) console.log(`  runs ${oldS} -> ${newS}: ${r.meta.changes}`);
  }

  // 3. Practices — delete dedup losers, then rename the lone non-canonical.
  for (const slug of PRACTICE_DELETE) {
    const r = await d1('DELETE FROM practices WHERE slug=?', [slug]);
    console.log(`  practice delete ${slug}: ${r.meta?.changes ?? 0}`);
  }
  for (const [oldS, newS] of Object.entries(PRACTICE_RENAME)) {
    const r = await d1('UPDATE practices SET slug=? WHERE slug=?', [newS, oldS]);
    console.log(`  practice rename ${oldS} -> ${newS}: ${r.meta?.changes ?? 0}`);
  }

  // --- Verification ---
  console.log('\n--- verify ---');
  const counts = (await rows('SELECT (SELECT COUNT(*) FROM accounts) a,(SELECT COUNT(*) FROM practices) p,(SELECT COUNT(*) FROM runs) r,(SELECT COUNT(*) FROM audits) au,(SELECT COUNT(*) FROM builds) b'))[0];
  console.log('counts:', JSON.stringify(counts));
  const orphA = (await rows('SELECT COUNT(*) n FROM audits x LEFT JOIN accounts a ON x.account_id=a.id WHERE x.account_id IS NOT NULL AND a.id IS NULL'))[0].n;
  const orphB = (await rows('SELECT COUNT(*) n FROM builds x LEFT JOIN accounts a ON x.account_id=a.id WHERE x.account_id IS NOT NULL AND a.id IS NULL'))[0].n;
  const orphSA = (await rows('SELECT COUNT(*) n FROM builds x LEFT JOIN audits au ON x.source_audit_id=au.id WHERE x.source_audit_id IS NOT NULL AND au.id IS NULL'))[0].n;
  console.log(`orphan FKs (want 0): audit->acct=${orphA} build->acct=${orphB} build->srcAudit=${orphSA}`);
  // Every audit/build slug should now equal its account's slug.
  const mismatch = await rows(`SELECT 'audit' kind, x.slug aslug, a.slug acct FROM audits x JOIN accounts a ON x.account_id=a.id WHERE x.slug<>a.slug
                               UNION ALL SELECT 'build', x.build_slug, a.slug FROM builds x JOIN accounts a ON x.account_id=a.id WHERE x.build_slug<>a.slug`);
  console.log(`slug<>account mismatches (want 0): ${mismatch.length}`);
  mismatch.forEach(m => console.log(`   ${m.kind}: ${m.aslug} vs acct ${m.acct}`));
  const finalAccts = await rows('SELECT slug FROM accounts ORDER BY slug');
  console.log('accounts:', finalAccts.map(r => r.slug).join(', '));
  const finalPr = await rows('SELECT slug FROM practices ORDER BY slug');
  console.log('practices:', finalPr.map(r => r.slug).join(', '));
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
