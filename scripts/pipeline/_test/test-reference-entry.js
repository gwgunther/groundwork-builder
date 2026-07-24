#!/usr/bin/env node
/**
 * Offline tests for design-catalog --reference resolution.
 */
import { loadReferenceEntry } from '../lib/reference-entry.js';

let passed = 0;
let failed = 0;
function assert(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((err) => { failed++; console.error(`  ✗ ${name}: ${err.message}`); });
}

await assert('runs/<id>/entry.json via bare id', async () => {
  const e = await loadReferenceEntry('dentora');
  if (e.id !== 'dentora') throw new Error(`id=${e.id}`);
  if (!e.layout?.variants?.heroLayout) throw new Error('missing heroLayout');
});

await assert('examples/<id>.json via bare id', async () => {
  const e = await loadReferenceEntry('groomify-boutique-warm');
  if (!e.id) throw new Error('no id');
  if (!e.layout?.variants) throw new Error('no variants');
});

await assert('unknown id fails loudly', async () => {
  let threw = false;
  try { await loadReferenceEntry('no-such-catalog-entry-zzz'); }
  catch { threw = true; }
  if (!threw) throw new Error('expected throw');
});

await assert('dark theme entry refuses', async () => {
  let threw = false;
  try { await loadReferenceEntry('aurelia-dark-luxe'); }
  catch (e) {
    threw = /dark-theme|dark/.test(e.message);
    if (!threw) throw e;
  }
  if (!threw) throw new Error('expected dark-theme refusal');
});

console.log(`\n[test-reference-entry] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
