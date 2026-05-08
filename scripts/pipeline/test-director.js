#!/usr/bin/env node
/**
 * Test harness for the refactored ai-director.js (density now stamped from
 * brand brief, not picked by the model).
 *
 * Approach:
 *   1. Load cached silver (from prior silver test)
 *   2. Run upstream chain (audit → design → brand) once, cache outputs
 *   3. Run director with the real brand brief, capture dna.density
 *   4. Run director again with brief.spatial.density forced to a DIFFERENT value
 *   5. Verify dna.density tracks the brief in both runs
 *
 * Usage:
 *   node scripts/pipeline/test-director.js --silver /tmp/silver-test/silver.json
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';
dotenvConfig({ path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSiteAudit } from './lib/ai-audit.js';
import { runDesignMapping } from './lib/ai-design.js';
import { runBrandDirection } from './lib/ai-brand-direction.js';
import { runCreativeDirector } from './lib/ai-director.js';
import { loadPreset } from './lib/preset-loader.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { silver: null, outDir: '/tmp/silver-test' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--silver') opts.silver = args[++i];
    else if (args[i] === '--out') opts.outDir = args[++i];
  }
  if (!opts.silver) {
    console.error('Usage: test-director.js --silver <path-to-silver.json>');
    process.exit(1);
  }
  return opts;
}

/**
 * Run a pipeline phase with caching. If the cached file exists, load it.
 * Otherwise run the phase, save the result, and return it.
 */
async function cachedPhase(name, cachePath, runner) {
  if (existsSync(cachePath)) {
    console.log(`[cache] Loading ${name} from ${cachePath}`);
    return JSON.parse(await readFile(cachePath, 'utf-8'));
  }
  console.log(`[run]   ${name}...`);
  const t0 = Date.now();
  const result = await runner();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (result == null) {
    console.error(`[run]   ${name} returned null. Cannot proceed.`);
    process.exit(1);
  }
  await writeFile(cachePath, JSON.stringify(result, null, 2));
  console.log(`[run]   ${name} complete (${elapsed}s) → ${cachePath}`);
  return result;
}

async function main() {
  const opts = parseArgs();
  await mkdir(opts.outDir, { recursive: true });

  // ── Load silver ──────────────────────────────────────────────────────────
  console.log(`[test] Loading silver from ${opts.silver}...`);
  const silver = JSON.parse(await readFile(opts.silver, 'utf-8'));
  // Reconstruct back-compat fields stripped by JSON serialization
  silver.doctor            = silver.doctors?.[0]      || null;
  silver.additionalDoctors = silver.doctors?.slice(1) || [];

  const preset = await loadPreset('dental');

  // ── Upstream chain (cached) ──────────────────────────────────────────────
  const auditPath = resolve(opts.outDir, 'audit.json');
  const designPath = resolve(opts.outDir, 'design.json');
  const brandPath  = resolve(opts.outDir, 'brand.json');

  const audit  = await cachedPhase('audit',  auditPath,  () => runSiteAudit(silver, silver, preset));
  const design = await cachedPhase('design', designPath, () => runDesignMapping(silver, silver, audit));
  const brand  = await cachedPhase('brand',  brandPath,  () => runBrandDirection(design, silver, audit));

  console.log(`\n[test] Upstream chain ready.`);
  console.log(`       Audit positioning:    ${audit?.positioning?.recommended?.slice(0, 60) || '(missing)'}`);
  console.log(`       Audit tone:           ${audit?.tone?.recommended?.slice(0, 60) || '(missing)'}`);
  console.log(`       Design mood:          ${design?.mood || '(missing)'}`);
  console.log(`       Brand mood:           ${brand?.mood || '(missing)'}`);
  console.log(`       Brand spatial.density: ${brand?.spatial?.density || '(missing)'}`);
  console.log(`       Brand palette primary: ${brand?.palette?.primary || '(missing)'}`);

  if (!brand?.spatial?.density) {
    console.error('[test] Brand brief has no spatial.density — cannot test density-stamping. Aborting.');
    process.exit(1);
  }

  // ── Run 1: real brand brief ──────────────────────────────────────────────
  console.log(`\n══════════════ DIRECTOR RUN 1 (brief.density = ${brand.spatial.density}) ══════════════`);
  const t1 = Date.now();
  const director1 = await runCreativeDirector(silver, design, { verbose: false }, brand, audit);
  const elapsed1 = ((Date.now() - t1) / 1000).toFixed(1);
  console.log(`Run 1 complete (${elapsed1}s)`);
  console.log(`  archetype:   ${director1?.dna?.archetype}`);
  console.log(`  heroVariant: ${director1?.dna?.heroVariant}`);
  console.log(`  density:     ${director1?.dna?.density}`);
  console.log(`  motion:      ${director1?.dna?.motion}`);
  console.log(`  radius:      ${director1?.dna?.radius}`);

  const dna1Density = director1?.dna?.density;

  // ── Run 2: forced different density ──────────────────────────────────────
  // Pick a density different from the brief's choice. The invariant we want to
  // verify: regardless of what the model picks, dna.density === brief.density.
  const flipDensity = (current) => {
    if (current === 'airy')     return 'dense';
    if (current === 'dense')    return 'airy';
    return 'airy';  // current is 'balanced' or unknown — flip to airy
  };

  const forcedDensity = flipDensity(brand.spatial.density);
  const mutatedBrief = {
    ...brand,
    spatial: { ...brand.spatial, density: forcedDensity },
  };

  console.log(`\n══════════════ DIRECTOR RUN 2 (brief.density forced to ${forcedDensity}) ══════════════`);
  const t2 = Date.now();
  const director2 = await runCreativeDirector(silver, design, { verbose: false }, mutatedBrief, audit);
  const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);
  console.log(`Run 2 complete (${elapsed2}s)`);
  console.log(`  archetype:   ${director2?.dna?.archetype}`);
  console.log(`  heroVariant: ${director2?.dna?.heroVariant}`);
  console.log(`  density:     ${director2?.dna?.density}`);
  console.log(`  motion:      ${director2?.dna?.motion}`);
  console.log(`  radius:      ${director2?.dna?.radius}`);

  const dna2Density = director2?.dna?.density;

  // ── Verdict ──────────────────────────────────────────────────────────────
  console.log(`\n══════════════ VERDICT ══════════════`);
  const pass1 = dna1Density === brand.spatial.density;
  const pass2 = dna2Density === forcedDensity;

  console.log(`Run 1: brief=${brand.spatial.density}, dna=${dna1Density}  →  ${pass1 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Run 2: brief=${forcedDensity}, dna=${dna2Density}  →  ${pass2 ? '✓ PASS' : '✗ FAIL'}`);

  if (pass1 && pass2) {
    console.log(`\n✓ Density-stamping invariant holds. Director's DNA always tracks the brand brief.`);
  } else {
    console.log(`\n✗ Density-stamping FAILED. dna.density did not follow brand brief.`);
    process.exit(1);
  }

  // Save run outputs for inspection
  await writeFile(resolve(opts.outDir, 'director-run1.json'), JSON.stringify(director1, null, 2));
  await writeFile(resolve(opts.outDir, 'director-run2.json'), JSON.stringify(director2, null, 2));
  console.log(`\nRun outputs saved to ${opts.outDir}/director-run{1,2}.json`);
}

main().catch(err => {
  console.error('\n[test] FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
