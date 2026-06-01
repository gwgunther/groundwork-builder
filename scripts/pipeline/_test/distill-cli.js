#!/usr/bin/env node
/**
 * CLI wrapper for distill-design.
 *
 * Usage:
 *   node scripts/pipeline/distill-cli.js --url https://example.com --slug foo --tag inspo
 *   node scripts/pipeline/distill-cli.js --repo ./some/astro/project --slug bar --tag own
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });

import { distillDesign } from './lib/distill-design.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { source: null, slug: null, tag: 'inspo', note: '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--url' || a === '--repo') o.source = args[++i];
    else if (a === '--slug') o.slug = args[++i];
    else if (a === '--tag') o.tag = args[++i];
    else if (a === '--note') o.note = args[++i];
  }
  if (!o.source || !o.slug) {
    console.error('Usage: distill-cli.js (--url X | --repo PATH) --slug Y [--tag own|inspo|anti] [--note "..."]');
    process.exit(1);
  }
  return o;
}

(async () => {
  const opts = parseArgs();
  console.log(`[distill] ${opts.tag.toUpperCase()}  ${opts.slug}  ←  ${opts.source}`);
  const { fingerprint, path } = await distillDesign(opts);
  console.log(`[distill] palette mood: ${fingerprint.palette?.mood || '—'}`);
  console.log(`[distill] archetype:    ${fingerprint.layout?.archetype || '—'}`);
  console.log(`[distill] adjectives:   ${(fingerprint.adjectives || []).join(', ')}`);
  console.log(`[distill] written to:   ${path}`);
})().catch(err => { console.error(err); process.exit(1); });
