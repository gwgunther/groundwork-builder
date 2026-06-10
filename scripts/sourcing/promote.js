#!/usr/bin/env node
// Promote a sourced practice into the Accounts CRM (Cloudflare D1).
//
// Usage:
//   node scripts/sourcing/promote.js <place_id>
//   node scripts/sourcing/promote.js <place_id> --no-audit
//
// What it does:
//   1. Look up the sourced_practices row by Place ID (D1)
//   2. Upsert an account via scripts/pipeline/lib/d1.js (slug from website URL)
//   3. Update the sourced row's status → 'promoted-to-accounts'
//   4. Unless --no-audit: run audit-site.js on the practice URL (deep audit
//      before outreach — see docs/sourcing/METHODOLOGY.md §6)

import './lib/env.js';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugFromUrl } from '../pipeline/lib/slug.js';
import { upsertAccount } from '../pipeline/lib/d1.js';
import { d1Enabled, findSourcedByPlaceId, setSourcedStatus } from './lib/d1.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);
const skipAudit = argv.includes('--no-audit');
const placeId = argv.find((a) => !a.startsWith('--'));
if (!placeId) {
  console.error('Usage: node scripts/sourcing/promote.js <place_id> [--no-audit]');
  process.exit(2);
}
if (!d1Enabled()) {
  console.error('D1 credentials missing — set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

async function main() {
  // 1. Look up the sourced row
  const sourced = await findSourcedByPlaceId(placeId);
  if (!sourced) {
    console.error(`No row found in sourced_practices with place_id = ${placeId}`);
    process.exit(1);
  }
  const practiceUrl = sourced.website_url || sourced.final_url || '';
  const canonicalSlug = practiceUrl
    ? slugFromUrl(practiceUrl)
    : (sourced.practice_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  console.error(`Found: ${sourced.practice_name} (${sourced.city}, ${sourced.state})`);

  // 2. Upsert into accounts (pipeline d1.js — same row the dashboard reads)
  const accountId = await upsertAccount({
    slug: canonicalSlug,
    practiceName: sourced.practice_name,
    practiceUrl,
    phone: sourced.phone || null,
    city: sourced.city || null,
    state: sourced.state || null,
    source: 'sourcing',
    lifecycleStage: 'Prospect',
  });
  console.error(`Account upserted: ${accountId} (slug: ${canonicalSlug})`);

  // 3. Update sourced row's status
  await setSourcedStatus(placeId, 'promoted-to-accounts');
  console.error('Updated sourced row → status: promoted-to-accounts');

  // 4. Deep audit before outreach (audit-on-promotion)
  if (!skipAudit && practiceUrl) {
    const auditSlug = canonicalSlug || 'audit';
    const auditOut = resolve(REPO_ROOT, '_audits', auditSlug);
    console.error(`\nRunning audit-site.js → ${auditOut}`);
    const code = await new Promise((resolveCode, reject) => {
      const child = spawn(
        process.execPath,
        [
          resolve(REPO_ROOT, 'scripts/pipeline/audit-site.js'),
          '--url', practiceUrl,
          '--output', auditOut,
          '--source', 'manual',
        ],
        { stdio: 'inherit', cwd: REPO_ROOT },
      );
      child.on('error', reject);
      child.on('close', resolveCode);
    });
    if (code !== 0) {
      console.error(`Audit exited with code ${code} — account promoted but not Audited`);
      process.exit(code);
    }
    console.error(`Audit complete — report will be at /audits/${auditSlug}/`);
  } else if (!practiceUrl) {
    console.error('No practice URL on sourced row — skipped audit');
  }

  console.error(`\nDone. Account id: ${accountId}`);
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
