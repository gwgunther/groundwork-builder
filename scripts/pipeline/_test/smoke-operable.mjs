#!/usr/bin/env node
/**
 * Phase 1 operable-path smoke (no full scrape/build — those are hours + $$$).
 * Proves the joints still connect:
 *   1) D1 CRM read
 *   2) --reference catalog entry loads
 *   3) ops Worker bundle parses / wrangler config valid
 *   4) build-site --help + --reference fail-fast on bad id
 *   5) promote CLI help
 *   6) existing client + audit dirs present for a known slug
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenvConfig({ path: join(root, '.env'), override: true });

let failed = 0;
function ok(msg) { console.log(`  ✓ ${msg}`); }
function bad(msg) { console.error(`  ✗ ${msg}`); failed++; }

console.log('\n1) D1 smoke');
{
  const r = spawnSync(process.execPath, ['--env-file=.env', 'scripts/pipeline/_test/smoke-d1.mjs'], {
    cwd: root, stdio: 'inherit',
  });
  if (r.status === 0) ok('D1 reachable');
  else bad('D1 smoke failed');
}

console.log('\n2) Design catalog --reference load');
{
  const { loadReferenceEntry } = await import('../lib/reference-entry.js');
  try {
    const entry = await loadReferenceEntry('dentora');
    if (!entry?.id || !entry?.layout?.variants) throw new Error('missing id/variants');
    ok(`dentora id → runs/ (${Object.keys(entry.layout.variants).length} variants)`);
    // examples/ id still works
    const ex = await loadReferenceEntry('groomify-boutique-warm');
    ok(`groomify-boutique-warm id → examples/ (${ex.id})`);
  } catch (e) {
    bad(`reference load: ${e.message}`);
  }
}

console.log('\n3) build-site CLI + bad reference fail-fast');
{
  const help = spawnSync(process.execPath, ['scripts/pipeline/build-site.js', '--help'], { cwd: root, encoding: 'utf8' });
  if (help.status === 0 && help.stdout.includes('--slug') && help.stdout.includes('--reference')) ok('build-site --help');
  else bad('build-site --help missing --slug/--reference');

  const badRef = spawnSync(
    process.execPath,
    ['scripts/pipeline/build-site.js', '--url', 'https://example.com', '--reference', 'definitely-not-a-catalog-id-xyz', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );
  // Should exit non-zero before scrape
  if (badRef.status !== 0) ok(`bad --reference fails fast (exit ${badRef.status})`);
  else bad('bad --reference did not fail');
}

console.log('\n4) promote CLI');
{
  const r = spawnSync(process.execPath, ['scripts/sourcing/promote.js'], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (out.includes('Usage:') && out.includes('place_id')) ok('promote.js usage');
  else bad('promote.js usage missing');
}

console.log('\n5) ops-dashboard worker present + wrangler config');
{
  const worker = join(root, 'workers/ops-dashboard/src/index.js');
  const wrangler = join(root, 'workers/ops-dashboard/wrangler.toml');
  if (!existsSync(worker)) bad('ops-dashboard src/index.js missing');
  else ok('ops-dashboard Worker source present');
  if (!existsSync(wrangler)) bad('ops-dashboard wrangler.toml missing');
  else ok('ops-dashboard wrangler.toml present');

  // Syntax-check worker
  const chk = spawnSync(process.execPath, ['--check', worker], { cwd: root, encoding: 'utf8' });
  if (chk.status === 0) ok('ops-dashboard index.js parses');
  else bad(`ops-dashboard parse: ${chk.stderr}`);
}

console.log('\n6) Known client + audit artifacts on disk');
{
  const slug = 'springstdentistry';
  const client = join(root, 'clients', slug);
  const audit = join(root, '_audits', slug);
  if (existsSync(client)) ok(`clients/${slug} present`);
  else bad(`clients/${slug} missing`);
  if (existsSync(audit)) ok(`_audits/${slug} present`);
  else {
    // try alternate
    const alts = ['chang-orthodontics', 'lbpds', 'changorthodontics'];
    const hit = alts.find((s) => existsSync(join(root, '_audits', s)));
    if (hit) ok(`_audits/${hit} present (fallback)`);
    else bad('no known _audits/<slug> found');
  }
}

console.log('\n7) d1.js round-trip helpers (read)');
{
  try {
    const { findAccountBySlug } = await import('../lib/d1.js');
    const candidates = ['springstdentistry', 'chang-orthodontics', 'changorthodontics', 'lbpds'];
    let found = null;
    for (const s of candidates) {
      const row = await findAccountBySlug(s);
      if (row) { found = { slug: s, row }; break; }
    }
    if (found) {
      const st = found.row.fields?.lifecycle_stage || found.row.lifecycle_stage || 'n/a';
      ok(`findAccountBySlug(${found.slug}) → lifecycle=${st}`);
    } else {
      console.log('  ~ no candidate account in D1 (CRM empty is OK for fresh env)');
    }
  } catch (e) {
    bad(`d1.js helpers: ${e.message}`);
  }
}


console.log('\n8) Hosted surfaces (Access / Pages)');
{
  async function probe(url) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      return res.status;
    } catch (e) {
      return `ERR:${e.message}`;
    }
  }
  const ops = await probe('https://ops.groundworkdental.com/');
  // Locked-down Access typically returns 302 (login) or 403 for anonymous clients.
  if (ops === 302 || ops === 403 || ops === 401) ok(`ops.groundworkdental.com → ${ops} (Access protecting)`);
  else if (typeof ops === 'number' && ops >= 200 && ops < 400) ok(`ops.groundworkdental.com → ${ops}`);
  else bad(`ops.groundworkdental.com unexpected: ${ops}`);

  const catalog = await probe('https://catalog.groundworkdental.com/');
  if (typeof catalog === 'number' && catalog >= 200 && catalog < 500) ok(`catalog.groundworkdental.com → ${catalog}`);
  else bad(`catalog.groundworkdental.com unexpected: ${catalog}`);
}


console.log('\n9) Phase 2 — reference auto + grade engine');
{
  try {
    const { selectAutoReference, loadReferenceEntry } = await import('../lib/reference-entry.js');
    const id = await selectAutoReference({ seed: 'smoke' });
    const entry = await loadReferenceEntry(id);
    ok(`--reference auto → ${entry.id}`);
  } catch (e) {
    bad(`reference auto: ${e.message}`);
  }
  try {
    const { computeGrowthScore, enrichFindings } = await import('../lib/findings.js');
    const { score } = computeGrowthScore(enrichFindings([
      { id: 'missing-title', severity: 'passed' },
      { id: 'missing-meta', severity: 'critical' },
    ]));
    if (typeof score !== 'number') throw new Error('no score');
    ok(`computeGrowthScore works (${score})`);
  } catch (e) {
    bad(`growth score: ${e.message}`);
  }
  const worker = join(root, 'workers/grade-my-site/src/index.js');
  if (existsSync(worker)) ok('grade-my-site Worker present');
  else bad('grade-my-site Worker missing');
}


console.log('\n10) Phase 3 — harden');
{
  // clients/ must not be tracked
  const tracked = spawnSync('git', ['ls-files', 'clients'], { cwd: root, encoding: 'utf8' });
  const n = (tracked.stdout || '').trim().split('\n').filter(Boolean).length;
  if (n === 0) ok('clients/ untracked (0 git files)');
  else bad(`clients/ still has ${n} tracked files`);

  // legacy airtable shim throws
  const air = spawnSync(process.execPath, ['-e', "import('./scripts/pipeline/lib/airtable.js')"], { cwd: root, encoding: 'utf8' });
  if (air.status !== 0 && /Retired|airtable/i.test((air.stderr || '') + (air.stdout || ''))) ok('airtable.js shim refuses import');
  else bad('airtable shim did not refuse');

  if (existsSync(join(root, 'scripts/legacy/README.md'))) ok('scripts/legacy/ quarantine present');
  else bad('scripts/legacy missing');
  if (existsSync(join(root, 'scripts/pipeline/lib/_legacy/README.md'))) ok('lib/_legacy/ quarantine present');
  else bad('lib/_legacy missing');

  // prune is idempotent (no remaining dup groups or only report)
  const prune = spawnSync(process.execPath, ['scripts/pipeline/_test/prune-client-dupes.mjs'], { cwd: root, encoding: 'utf8' });
  if (prune.status === 0 && /Duplicate groups.*: 0|No duplicate/i.test(prune.stdout || '')) ok('client dupe groups cleared');
  else if (prune.status === 0) ok('prune:clients runs (may still report non-exact dupes)');
  else bad(`prune failed: ${prune.stderr}`);
}

if (failed) {
  console.error(`\nOperable smoke FAILED (${failed})`);
  process.exit(1);
}
console.log('\n✓ Operable-path smoke passed');
