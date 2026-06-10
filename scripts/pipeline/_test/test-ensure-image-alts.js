#!/usr/bin/env node
import { fallbackAltForItem, ensureImageAlts, enrichSidecarAlts } from '../lib/ensure-image-alts.js';

let passed = 0;
let failed = 0;

function assert(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

const ctx = { practiceName: 'Smile Studio', city: 'Phoenix' };

assert('hero fallback alt', () => {
  const alt = fallbackAltForItem({ role: 'hero', alt: '' }, ctx);
  if (!alt.includes('Smile Studio')) throw new Error(alt);
});

assert('preserves existing alt', () => {
  const alt = fallbackAltForItem({ role: 'hero', alt: 'Custom hero' }, ctx);
  if (alt !== 'Custom hero') throw new Error('overwrote existing');
});

assert('headshot uses personName', () => {
  const alt = fallbackAltForItem({ role: 'headshot', personName: 'Dr. Jane Doe', alt: '' }, ctx);
  if (!alt.includes('Dr. Jane Doe')) throw new Error(alt);
});

assert('ensureImageAlts fills items', () => {
  const images = {
    items: [
      { src: '/a.jpg', role: 'gallery', alt: '' },
      { src: '/b.jpg', role: 'hero', alt: 'Keep me' },
    ],
  };
  const { filled } = ensureImageAlts(images, ctx);
  if (filled !== 1) throw new Error(`expected 1 filled, got ${filled}`);
  if (!images.items[0].alt) throw new Error('gallery alt missing');
  if (images.items[1].alt !== 'Keep me') throw new Error('mutated existing');
});

assert('enrichSidecarAlts fills missing', () => {
  const sidecar = {
    'gallery/foo.jpg': { sourceUrl: 'https://x.com/foo.jpg', category: 'gallery', alt: '' },
  };
  const { filled } = enrichSidecarAlts(sidecar, ctx);
  if (filled !== 1) throw new Error(`expected 1, got ${filled}`);
  if (!sidecar['gallery/foo.jpg'].alt) throw new Error('no alt written');
});

console.log(`\n[test-ensure-image-alts] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
