#!/usr/bin/env node
/**
 * Submit a preview request (same path as the audit one-pager form).
 *
 * Usage:
 *   node scripts/pipeline/request-preview.js \
 *     --slug springstdentistry \
 *     --name "Dr. Smith" \
 *     --email dr@example.com \
 *     --message "Interested in preview"
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { submitAuditPreviewRequest } from './lib/audit-preview-request.js';

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { slug: null, name: null, email: null, phone: null, message: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--slug') o.slug = a[++i];
    else if (a[i] === '--name') o.name = a[++i];
    else if (a[i] === '--email') o.email = a[++i];
    else if (a[i] === '--phone') o.phone = a[++i];
    else if (a[i] === '--message') o.message = a[++i];
  }
  if (!o.slug || !o.name || !o.email) {
    console.error('Required: --slug --name --email');
    process.exit(1);
  }
  return o;
}

async function main() {
  const args = parseArgs();
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const auditDir = resolve(repoRoot, '_audits', args.slug);
  let auditDirOpt;
  try {
    await access(auditDir);
    auditDirOpt = auditDir;
  } catch { /* optional */ }

  const silverPath = resolve(auditDir, '_data', 'silver.json');
  let practiceName;
  let practiceUrl;
  try {
    const silver = JSON.parse(await import('node:fs/promises').then(m => m.readFile(silverPath, 'utf-8')));
    practiceName = silver?.practice?.name;
    practiceUrl = silver?.practice?.url || (silver?.practice?.domain ? `https://${silver.practice.domain}` : undefined);
  } catch { /* optional */ }

  const result = await submitAuditPreviewRequest({
    ...args,
    practiceName,
    practiceUrl,
  }, { auditDir: auditDirOpt });

  if (!result.ok) {
    console.error('Failed:', result.errors?.join('; '));
    process.exit(1);
  }
  console.log(result.message);
  console.log('Build trigger:', result.buildTrigger);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
