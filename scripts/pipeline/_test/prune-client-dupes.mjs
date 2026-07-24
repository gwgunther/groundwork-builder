#!/usr/bin/env node
/**
 * Report (and optionally archive) duplicate client output dirs.
 *
 * Pairs kebab-case vs concatenated slugs, e.g.:
 *   bear-creek-family-dentistry  vs  bearcreekfamilydentistry
 *
 * Default: dry-run report.
 *   node scripts/pipeline/_test/prune-client-dupes.mjs
 *   node scripts/pipeline/_test/prune-client-dupes.mjs --apply
 *
 * --apply moves the *non-canonical* dir to clients/_archive/<name>-<timestamp>
 * Canonical = the slug that matches D1 accounts.slug when available, else the
 * longer kebab-case name, else the dir with newer mtime.
 */
import { readdirSync, statSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenvConfig({ path: join(root, '.env'), override: true });

const apply = process.argv.includes('--apply');
const clientsDir = join(root, 'clients');

function norm(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function listDirs() {
  return readdirSync(clientsDir).filter((n) => {
    if (n.startsWith('_') || n.startsWith('.')) return false;
    try { return statSync(join(clientsDir, n)).isDirectory(); } catch { return false; }
  });
}

async function d1Slugs() {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !databaseId || !token) return new Set();
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT slug FROM accounts' }),
    });
    const body = await res.json();
    const rows = body.result?.[0]?.results || [];
    return new Set(rows.map((r) => r.slug));
  } catch {
    return new Set();
  }
}

function sizeOf(dir) {
  // shallow: just count entries as a cheap proxy
  try { return readdirSync(dir).length; } catch { return 0; }
}

function mtimeOf(dir) {
  try { return statSync(dir).mtimeMs; } catch { return 0; }
}

const dirs = listDirs();
const byNorm = new Map();
for (const d of dirs) {
  const key = norm(d);
  if (!byNorm.has(key)) byNorm.set(key, []);
  byNorm.get(key).push(d);
}

const groups = [...byNorm.entries()].filter(([, list]) => list.length > 1);
const crmSlugs = await d1Slugs();

console.log(`Client dirs: ${dirs.length}`);
console.log(`Duplicate groups (normalized name): ${groups.length}`);
if (!groups.length) {
  console.log('No duplicate slug pairs found.');
  process.exit(0);
}

const archiveRoot = join(clientsDir, '_archive');
let moved = 0;

for (const [key, list] of groups.sort((a, b) => a[0].localeCompare(b[0]))) {
  // Prefer CRM slug match, then kebab (contains '-'), then newer mtime
  const ranked = [...list].sort((a, b) => {
    const aCrm = crmSlugs.has(a) ? 1 : 0;
    const bCrm = crmSlugs.has(b) ? 1 : 0;
    if (aCrm !== bCrm) return bCrm - aCrm;
    const aKebab = a.includes('-') ? 1 : 0;
    const bKebab = b.includes('-') ? 1 : 0;
    if (aKebab !== bKebab) return bKebab - aKebab;
    return mtimeOf(join(clientsDir, b)) - mtimeOf(join(clientsDir, a));
  });
  const keep = ranked[0];
  const drop = ranked.slice(1);
  console.log(`\n[${key}] keep: ${keep}${crmSlugs.has(keep) ? ' (D1)' : ''}`);
  for (const d of drop) {
    const from = join(clientsDir, d);
    console.log(`  drop: ${d}  (entries≈${sizeOf(from)}, mtime=${new Date(mtimeOf(from)).toISOString().slice(0, 10)})`);
    if (apply) {
      mkdirSync(archiveRoot, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dest = join(archiveRoot, `${d}-${stamp}`);
      renameSync(from, dest);
      console.log(`  → archived ${dest}`);
      moved++;
    }
  }
}

if (!apply) {
  console.log(`\nDry-run only. Re-run with --apply to move drop dirs → clients/_archive/`);
} else {
  console.log(`\nArchived ${moved} duplicate dir(s).`);
}
