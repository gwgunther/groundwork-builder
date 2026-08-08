#!/usr/bin/env node
/**
 * Offline tests for design-catalog --reference resolution + appetite auto-pick.
 */
import {
  loadReferenceEntry,
  selectAutoReference,
  contentAppetiteFromScrape,
  scoreAppetiteFit,
} from '../lib/reference-entry.js';

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

await assert('contentAppetiteFromScrape: photo-rich / stats-poor', async () => {
  const ap = contentAppetiteFromScrape({
    images: { items: Array.from({ length: 12 }, (_, i) => ({ src: `p${i}.jpg`, role: 'gallery' })) },
    content: { stats: {}, aboutText: 'Short.', faqs: [], testimonials: [] },
    doctors: [{ name: 'Dr A' }],
    services: { offered: [{ name: 'Cleaning' }] },
  });
  if (ap.photography !== 3) throw new Error(`photo=${ap.photography}`);
  if (ap.statistics !== 1) throw new Error(`stats=${ap.statistics}`);
});

await assert('contentAppetiteFromScrape: stats + proof rich', async () => {
  const ap = contentAppetiteFromScrape({
    images: { items: [{ src: 'a.jpg', role: 'hero' }] },
    content: {
      stats: { yearsExperience: 20, happyPatients: 5000, googleRating: 4.9 },
      testimonials: [
        { quote: 'a' }, { quote: 'b' }, { quote: 'c' }, { quote: 'd' },
      ],
      aboutText: 'x'.repeat(900),
      faqs: Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: 'a' })),
    },
    doctors: [{ name: 'Dr A' }, { name: 'Dr B' }, { name: 'Dr C' }],
    services: { offered: [] },
  });
  if (ap.statistics < 2) throw new Error(`stats=${ap.statistics}`);
  if (ap.socialProof !== 3) throw new Error(`proof=${ap.socialProof}`);
  if (ap.copy !== 3) throw new Error(`copy=${ap.copy}`);
  if (ap.team !== 3) throw new Error(`team=${ap.team}`);
});

await assert('scoreAppetiteFit prefers matching stars', async () => {
  const scrape = { photography: 3, statistics: 1, socialProof: 1, team: 2, copy: 1 };
  const photoLed = scoreAppetiteFit(scrape, { photography: 3, statistics: 1, socialProof: 1, team: 2, copy: 1 });
  const statsLed = scoreAppetiteFit(scrape, { photography: 2, statistics: 3, socialProof: 2, team: 2, copy: 2 });
  if (photoLed.fit <= statsLed.fit) throw new Error(`photoLed ${photoLed.fit} <= statsLed ${statsLed.fit}`);
  if (statsLed.starved !== true) throw new Error('expected stats starvation (tmpl★★★ vs scrape★)');
});

await assert('scoreAppetiteFit: over-appetite costs more than under-appetite', async () => {
  // Same weight class (no ★★★) so asymmetry isn't confounded by signature 2×.
  const base = { photography: 2, statistics: 2, socialProof: 2, team: 2, copy: 2 };
  const overMid = scoreAppetiteFit(
    { ...base, photography: 1 },
    { ...base, photography: 2 }, // template wants +1 more than scrape
  );
  const underMid = scoreAppetiteFit(
    { ...base, photography: 2 },
    { ...base, photography: 1 }, // template wants −1 less than scrape
  );
  if (overMid.fit >= underMid.fit) {
    throw new Error(`overMid ${overMid.fit} should score worse than underMid ${underMid.fit}`);
  }
});

await assert('contentAppetiteFromScrape: ratings do not inflate statistics', async () => {
  const ap = contentAppetiteFromScrape({
    images: { items: [] },
    content: { stats: { googleRating: 4.9, fiveStarReviews: 120 }, faqs: [], testimonials: [] },
    reviews: { rating: 4.9, reviewCount: 120, reviews: [] },
    doctors: [],
    services: { offered: [] },
  });
  if (ap.statistics !== 1) throw new Error(`stats should be 1 without years/patients, got ${ap.statistics}`);
  if (ap.socialProof !== 3) throw new Error(`proof should be 3 from reviewCount, got ${ap.socialProof}`);
});

await assert('selectAutoReference photo-rich prefers photo-led templates', async () => {
  const id = await selectAutoReference({
    log: false,
    seed: 'appetite-photo-test',
    appetite: { photography: 3, statistics: 1, socialProof: 1, team: 2, copy: 1 },
  });
  const photoLed = new Set(['calmio', 'dentora', 'wellbe', 'sun-moon']);
  if (!photoLed.has(id)) throw new Error(`expected photo-led, got ${id}`);
});

await assert('selectAutoReference stats-rich prefers luvia-ish', async () => {
  const id = await selectAutoReference({
    log: false,
    seed: 'appetite-stats-test',
    appetite: { photography: 1, statistics: 3, socialProof: 2, team: 2, copy: 2 },
  });
  // luvia is ★★★ stats; photo★★★ templates starve on photography=1
  if (id !== 'luvia' && id !== 'klinik' && id !== 'clearpath' && id !== 'dermato') {
    throw new Error(`expected stats-capable pick, got ${id}`);
  }
});

await assert('selectAutoReference without scrape still returns loadable id', async () => {
  const id = await selectAutoReference({ log: false, seed: 'legacy-seed' });
  const entry = await loadReferenceEntry(id);
  if (!entry.layout?.variants?.heroLayout) throw new Error('bad entry');
});

console.log(`\n[test-reference-entry] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
