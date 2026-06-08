#!/usr/bin/env node
// Vendor-detection spike: validates the core thesis before we build the
// rest of the sourcing pipeline.
//
// Pulls ~100 dental practices from Google Places across the Riverside–
// San Bernardino–Ontario MSA, fetches each homepage, runs the vendor
// fingerprint detector, and reports the distribution of platforms.
//
// Thesis test: if dental-mill % is healthy (≥25%), prime-quadrant prospects
// exist and the rest of the pipeline is worth building. If it's tiny (<10%),
// the strategy needs a rethink before we commit more engineering.
//
// Output:
//   _sourcing/spike-{timestamp}.json  — full per-practice data
//   _sourcing/spike-{timestamp}.csv   — flat table for eyeballing
//   stdout                            — summary table
//
// Run: node scripts/sourcing/spike/vendor-detect.js

import '../lib/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { textSearch } from '../lib/places.js';
import { fetchHtml } from '../lib/fetch-html.js';
import { detectVendor } from '../lib/vendor-fingerprints.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(REPO_ROOT, '_sourcing');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY missing from env');
  process.exit(1);
}

// MSA cities, ordered to maximize geographic spread within a 100-record budget.
const QUERIES = [
  'dentist in Riverside, CA',
  'dentist in San Bernardino, CA',
  'dentist in Ontario, CA',
  'dentist in Rancho Cucamonga, CA',
  'dentist in Corona, CA',
  'dentist in Moreno Valley, CA',
];

const TARGET_COUNT = 100;
const FETCH_CONCURRENCY = 8;

async function gatherPlaces() {
  const seen = new Set(); // dedupe by place id
  const collected = [];
  for (const q of QUERIES) {
    process.stderr.write(`  places: ${q}\n`);
    const places = await textSearch({ apiKey: API_KEY, query: q, maxPages: 3 });
    for (const p of places) {
      if (seen.has(p.id)) continue;
      if (!p.websiteUri) continue; // no site = can't fingerprint
      seen.add(p.id);
      collected.push(p);
      if (collected.length >= TARGET_COUNT) return collected;
    }
  }
  return collected;
}

async function runConcurrent(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarize(rows) {
  const byVendor = new Map();
  const byCategory = new Map();
  for (const r of rows) {
    byVendor.set(r.vendor, (byVendor.get(r.vendor) || 0) + 1);
    byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
  }
  const sortDesc = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      name: k,
      count: v,
      pct: ((v / rows.length) * 100).toFixed(1) + '%',
    }));
  return { byVendor: sortDesc(byVendor), byCategory: sortDesc(byCategory) };
}

function toCsv(rows) {
  const cols = [
    'practice',
    'city',
    'rating',
    'reviews',
    'website',
    'finalUrl',
    'httpStatus',
    'vendor',
    'category',
    'confidence',
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  return lines.join('\n');
}

async function main() {
  const startedAt = Date.now();
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.error('Step 1/2: Gathering places from Google Places…');
  const places = await gatherPlaces();
  console.error(`  → got ${places.length} unique practices with websites\n`);

  console.error(`Step 2/2: Fetching homepages + fingerprinting (concurrency=${FETCH_CONCURRENCY})…`);
  let done = 0;
  const rows = await runConcurrent(
    places,
    async (p) => {
      const r = await fetchHtml(p.websiteUri);
      const v = detectVendor({
        html: r.html || '',
        finalUrl: r.finalUrl,
        headers: r.headers,
      });
      done++;
      if (done % 10 === 0) process.stderr.write(`  ${done}/${places.length}\n`);
      return {
        placeId: p.id,
        practice: p.displayName?.text || '',
        address: p.formattedAddress || '',
        city: (p.formattedAddress || '').split(',').slice(-3, -2)[0]?.trim() || '',
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        website: p.websiteUri || '',
        finalUrl: r.finalUrl || '',
        httpStatus: r.status,
        htmlLen: r.html?.length ?? 0,
        vendor: v.vendor,
        category: v.category,
        confidence: v.confidence,
        matched: v.matched,
      };
    },
    FETCH_CONCURRENCY,
  );

  const summary = summarize(rows);
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUT_DIR, `spike-${stamp}.json`);
  const csvPath = path.join(OUT_DIR, `spike-${stamp}.csv`);
  await fs.writeFile(jsonPath, JSON.stringify({ summary, rows }, null, 2));
  await fs.writeFile(csvPath, toCsv(rows));

  console.error('\n=== Category breakdown ===');
  for (const c of summary.byCategory) console.error(`  ${c.name.padEnd(18)} ${String(c.count).padStart(3)}  ${c.pct}`);

  console.error('\n=== Vendor breakdown ===');
  for (const v of summary.byVendor) console.error(`  ${v.name.padEnd(22)} ${String(v.count).padStart(3)}  ${v.pct}`);

  const millCount = rows.filter((r) => r.category === 'dental-mill').length;
  const millPct = ((millCount / rows.length) * 100).toFixed(1);
  console.error('\n=== Thesis check ===');
  console.error(`  Dental-mill share: ${millCount}/${rows.length} (${millPct}%)`);
  if (millCount / rows.length >= 0.25) {
    console.error('  ✅ Healthy mill density — prime quadrant exists, proceed with full pipeline.');
  } else if (millCount / rows.length >= 0.10) {
    console.error('  ⚠️  Moderate — proceed but expect a smaller prime pool than hoped.');
  } else {
    console.error('  ❌ Low mill density — rethink: maybe DIY-builder + WordPress-generic are the real target.');
  }

  const unreachable = rows.filter((r) => r.vendor === 'unreachable').length;
  const unknown = rows.filter((r) => r.vendor === 'unknown').length;
  console.error(`  Unreachable: ${unreachable}   Unknown (no fingerprint match): ${unknown}`);
  console.error(`\nWrote: ${path.relative(REPO_ROOT, jsonPath)}`);
  console.error(`       ${path.relative(REPO_ROOT, csvPath)}`);
  console.error(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error('Spike failed:', e);
  process.exit(1);
});
