#!/usr/bin/env node
/**
 * Phase 1 smoke: prove D1 CRM is reachable with current .env.
 * Read-only SELECT — no writes.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env'), override: true });

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!accountId) fail('CLOUDFLARE_ACCOUNT_ID missing');
if (!databaseId) fail('CLOUDFLARE_D1_DATABASE_ID missing');
if (!token) fail('CLOUDFLARE_API_TOKEN missing');

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function query(sql, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    fail(`D1 query failed (${res.status}): ${JSON.stringify(body.errors || body)}`);
  }
  return body.result?.[0]?.results ?? [];
}

const tables = await query(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
const names = tables.map((r) => r.name);
console.log('D1 tables:', names.join(', ') || '(none)');

const required = ['accounts', 'audits', 'builds', 'sourced_practices'];
const missing = required.filter((t) => !names.includes(t));
if (missing.length) fail(`missing tables: ${missing.join(', ')}`);

const counts = {};
for (const t of required) {
  const rows = await query(`SELECT COUNT(*) AS n FROM ${t}`);
  counts[t] = rows[0]?.n ?? 0;
}
console.log('Row counts:', counts);

const sample = await query(
  'SELECT slug, lifecycle_stage, practice_name FROM accounts ORDER BY updated_at DESC LIMIT 5',
);
console.log('Recent accounts:', sample);

// Prove d1.js findAccountBySlug works if we have a slug
const { findAccountBySlug, findLatestAuditBySlug } = await import('../lib/d1.js');
const slug = sample[0]?.slug;
if (slug) {
  const acct = await findAccountBySlug(slug);
  const stage = acct?.fields?.lifecycle_stage || acct?.lifecycle_stage || acct?.fields?.lifecycleStage || '?';
  console.log(`findAccountBySlug(${slug}):`, acct ? `ok (lifecycle=${stage})` : 'null');
  const audit = await findLatestAuditBySlug(slug);
  console.log(`findLatestAuditBySlug(${slug}):`, audit ? `ok (id=${typeof audit === 'string' ? audit : (audit.id || '?')})` : 'none');
} else {
  console.log('(no accounts yet — skip findAccountBySlug)');
}

console.log('✓ D1 smoke passed');
