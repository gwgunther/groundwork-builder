#!/usr/bin/env node
import { computeGrowthScore, enrichFindings } from '../lib/findings.js';
import { selectAutoReference, loadReferenceEntry } from '../lib/reference-entry.js';

let passed = 0, failed = 0;
function assert(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}
async function assertAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

assert('computeGrowthScore all fixed → 100', () => {
  const findings = enrichFindings([
    { id: 'missing-title', severity: 'passed', weight: 1.5 },
    { id: 'missing-meta', severity: 'passed', weight: 1.2 },
  ]);
  const { score } = computeGrowthScore(findings);
  if (score !== 100) throw new Error(`score=${score}`);
});

assert('computeGrowthScore all issues → 0', () => {
  const findings = enrichFindings([
    { id: 'missing-title', severity: 'critical', weight: 1.5 },
    { id: 'missing-meta', severity: 'warning', weight: 1.2 },
  ]);
  const { score, summary } = computeGrowthScore(findings);
  if (score !== 0) throw new Error(`score=${score}`);
  if (summary.issues !== 2) throw new Error(`issues=${summary.issues}`);
});

assert('computeGrowthScore mixed is weighted', () => {
  const findings = enrichFindings([
    { id: 'missing-title', severity: 'passed', weight: 1 },
    { id: 'missing-meta', severity: 'critical', weight: 1 },
  ]);
  const { score } = computeGrowthScore(findings);
  if (score !== 50) throw new Error(`score=${score}`);
});

await assertAsync('selectAutoReference returns loadable id', async () => {
  const id = await selectAutoReference({ seed: 'phase2-verify' });
  if (!id) throw new Error('empty');
  const entry = await loadReferenceEntry(id);
  if (!entry.layout?.variants?.heroLayout) throw new Error('bad entry');
});

await assertAsync('selectAutoReference mood clinical prefers dentora-ish', async () => {
  const id = await selectAutoReference({ mood: 'clinical', seed: 'x' });
  const allowed = new Set(['dentora', 'clearpath', 'dermato', 'calmio', 'wellbe', 'pilates-lab', 'sun-moon', 'luvia', 'klinik', 'groomify']);
  if (!allowed.has(id)) throw new Error(`unexpected ${id}`);
});

console.log(`\n[test-grade-homepage] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
