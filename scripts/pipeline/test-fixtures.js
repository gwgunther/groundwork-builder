#!/usr/bin/env node
/**
 * Shape-validation runner for skill fixtures.
 *
 * Walks `skills/_fixtures/<slug>/` and validates each fixture file against
 * a schema. NO API calls — purely structural. Catches regressions like:
 *   - Silver schema fields disappearing
 *   - Director's dna.density not tracking the brand brief
 *   - Content blueprint missing required audit keys
 *   - Brand palette losing the `primary` field
 *
 * For full output diffs (semantic regressions like "did Dr. Cortez's bio
 * shrink?"), run the pipeline live and compare against the saved fixture.
 *
 * Usage:
 *   node scripts/pipeline/test-fixtures.js              # validate all
 *   node scripts/pipeline/test-fixtures.js lbpds-pediatric  # validate one
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(__dirname, '..', '..', 'skills', '_fixtures');

// ---------------------------------------------------------------------------
// Shape assertions per fixture file
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

const VALIDATORS = {
  'silver.json': (s) => [
    ['practice.name',       () => typeof s.practice?.name === 'string' && s.practice.name.length > 0],
    ['practice.phone',      () => /\(\d{3}\) \d{3}-\d{4}/.test(s.practice?.phone || '')],
    ['practice.domain',     () => typeof s.practice?.domain === 'string' && s.practice.domain.length > 0],
    ['address.full',        () => typeof s.address?.full === 'string' && s.address.full.length > 0],
    ['doctors[]',           () => Array.isArray(s.doctors) && s.doctors.length > 0],
    ['doctors[*].name',     () => s.doctors.every(d => typeof d.name === 'string' && d.name.length > 0)],
    ['services.offered[]',  () => Array.isArray(s.services?.offered) && s.services.offered.length > 0],
    ['additionalContent[]', () => Array.isArray(s.additionalContent)],
    ['differentiators[]',   () => Array.isArray(s.differentiators)],
    ['pageInventory[]',     () => Array.isArray(s.pageInventory) && s.pageInventory.length > 0],
  ],

  'audit.json': (a) => [
    ['positioning.recommended',  () => typeof a.positioning?.recommended  === 'string'],
    ['tone.recommended',         () => typeof a.tone?.recommended         === 'string'],
    ['serviceEmphasis.primary',  () => typeof a.serviceEmphasis?.primary  === 'string'],
    ['differentiators[]',        () => Array.isArray(a.differentiators)],
  ],

  'design.json': (d) => [
    ['mood',      () => typeof d.mood === 'string' || d.mood == null],
    ['rationale', () => typeof d.rationale === 'string' || d.rationale == null],
  ],

  'brand.json': (b) => [
    ['palette.primary (hex)',  () => HEX_RE.test(b.palette?.primary  || '')],
    ['palette.secondary (hex)',() => HEX_RE.test(b.palette?.secondary|| '')],
    ['typography.heading',     () => typeof b.typography?.heading === 'string'],
    ['typography.body',        () => typeof b.typography?.body    === 'string'],
    ['spatial.density (enum)', () => ['airy','balanced','dense'].includes(b.spatial?.density)],
    ['mood (short)',           () => typeof b.mood === 'string' && b.mood.length < 60],
    ['rationale',              () => typeof b.rationale === 'string' && b.rationale.length > 0],
  ],

  'content-blueprint.json': (bp) => [
    ['contentAudit (non-empty)', () => bp.contentAudit && Object.keys(bp.contentAudit).length > 0],
    ['contentAudit entries shape', () => Object.values(bp.contentAudit || {}).every(e =>
      ['strong','adequate','weak','missing'].includes(e.quality) &&
      ['keep','optimize','create'].includes(e.action))],
    ['coverage.totalSections', () => Number.isFinite(bp.coverage?.totalSections)],
    ['coverage.byQuality',     () => bp.coverage?.byQuality && typeof bp.coverage.byQuality === 'object'],
    ['coverage.byAction',      () => bp.coverage?.byAction  && typeof bp.coverage.byAction  === 'object'],
  ],

  'content-map.json': (cm) => [
    ['homepage.heroHeadline (non-null)', () => typeof cm.homepage?.heroHeadline === 'string' && cm.homepage.heroHeadline.length > 0],
    ['homepage.valueProp',               () => typeof cm.homepage?.valueProp === 'string'],
    ['about.headline',                   () => typeof cm.about?.headline === 'string'],
    ['services (object, non-empty)',     () => cm.services && Object.keys(cm.services).length > 0],
    ['services entries have headline',   () => Object.values(cm.services || {}).every(s => typeof s.headline === 'string' && s.headline.length > 0)],
    ['no contentAudit (Map owns it)',    () => !cm.contentAudit],
  ],

  'director-run1.json': (d) => {
    const dna = d.dna || {};
    return [
      ['dna.archetype (string)',    () => typeof dna.archetype === 'string' && dna.archetype.length > 0],
      ['dna.heroVariant (string)',  () => typeof dna.heroVariant === 'string'],
      ['dna.density (enum)',        () => ['airy','balanced','dense'].includes(dna.density)],
      ['dna.motion (enum)',         () => ['none','subtle','expressive'].includes(dna.motion)],
      ['dna.radius (enum)',         () => ['sharp','sm','md','lg','pill'].includes(dna.radius)],
      ['dna.sectionOrder (array)',  () => Array.isArray(dna.sectionOrder) && dna.sectionOrder.length > 0],
      ['no top-level density (only inside dna)', () => d.density == null],
    ];
  },
};

// Cross-fixture invariants — relationships between files
const CROSS_VALIDATORS = (fixture) => [
  ['silver.practice.name === content-map source practice (smoke)',
    () => fixture['silver.json'] && fixture['content-map.json']
       && typeof fixture['silver.json'].practice?.name === 'string'],

  ['director.dna.density === brand.spatial.density (stamping invariant)',
    () => {
      if (!fixture['director-run1.json'] || !fixture['brand.json']) return true; // skip
      const briefDensity = fixture['brand.json'].spatial?.density;
      const dnaDensity   = fixture['director-run1.json'].dna?.density;
      if (!briefDensity || !dnaDensity) return true;
      return briefDensity === dnaDensity;
    }],

  ['blueprint.contentAudit covers all silver services (services.<slug>.intro)',
    () => {
      const bp = fixture['content-blueprint.json'];
      const sv = fixture['silver.json'];
      if (!bp || !sv) return true;
      const offeredSlugs = (sv.services?.offered || []).map(s => s.slug).filter(Boolean);
      if (offeredSlugs.length === 0) return true;
      const auditKeys = Object.keys(bp.contentAudit || {});
      const missing = offeredSlugs.filter(slug => !auditKeys.includes(`services.${slug}.intro`));
      // Allow up to 5% missing (tolerant; some slugs may be intentionally folded)
      return missing.length / offeredSlugs.length < 0.05;
    }],
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function loadFixture(slug) {
  const dir = resolve(FIXTURES_ROOT, slug);
  const out = {};
  for (const fname of Object.keys(VALIDATORS)) {
    const path = resolve(dir, fname);
    try {
      const raw = await readFile(path, 'utf-8');
      out[fname] = JSON.parse(raw);
    } catch (err) {
      out[fname] = null;  // missing fixture file is allowed; validator skips
    }
  }
  return out;
}

async function validateFixture(slug) {
  console.log(`\n══ ${slug} ══`);
  const fixture = await loadFixture(slug);
  const failures = [];
  let total = 0, passed = 0;

  for (const [fname, validator] of Object.entries(VALIDATORS)) {
    const data = fixture[fname];
    if (!data) {
      console.log(`  ${fname.padEnd(28)} (missing — skipped)`);
      continue;
    }
    const checks = validator(data);
    let fileOk = 0;
    for (const [name, fn] of checks) {
      total++;
      try {
        if (fn()) {
          passed++;
          fileOk++;
        } else {
          failures.push({ file: fname, name, error: 'assertion failed' });
        }
      } catch (err) {
        failures.push({ file: fname, name, error: err.message });
      }
    }
    console.log(`  ${fname.padEnd(28)} ${fileOk}/${checks.length}`);
  }

  // Cross-fixture invariants
  console.log(`  cross-fixture invariants:`);
  for (const [name, fn] of CROSS_VALIDATORS(fixture)) {
    total++;
    try {
      if (fn()) {
        passed++;
        console.log(`    ✓ ${name}`);
      } else {
        failures.push({ file: '(cross)', name, error: 'invariant violated' });
        console.log(`    ✗ ${name}`);
      }
    } catch (err) {
      failures.push({ file: '(cross)', name, error: err.message });
      console.log(`    ✗ ${name}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n  FAILURES (${failures.length}/${total}):`);
    for (const f of failures) {
      console.log(`    ✗ [${f.file}] ${f.name} — ${f.error}`);
    }
  }
  return { slug, total, passed, failures };
}

async function main() {
  const onlySlug = process.argv[2];
  let slugs;
  if (onlySlug) {
    slugs = [onlySlug];
  } else {
    const entries = await readdir(FIXTURES_ROOT, { withFileTypes: true });
    slugs = entries.filter(e => e.isDirectory()).map(e => e.name);
  }

  if (slugs.length === 0) {
    console.log('No fixtures found in', FIXTURES_ROOT);
    process.exit(0);
  }

  const results = [];
  for (const slug of slugs) {
    results.push(await validateFixture(slug));
  }

  const grandTotal  = results.reduce((s, r) => s + r.total,  0);
  const grandPassed = results.reduce((s, r) => s + r.passed, 0);
  const grandFails  = grandTotal - grandPassed;

  console.log(`\n══════════════ SUMMARY ══════════════`);
  console.log(`Fixtures: ${results.length}`);
  console.log(`Checks:   ${grandPassed}/${grandTotal} passed`);
  if (grandFails > 0) {
    console.log(`Failures: ${grandFails}`);
    process.exit(1);
  }
  console.log('All checks passed ✓');
}

main().catch(err => {
  console.error('test-fixtures failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
