#!/usr/bin/env node
// Sourcing pipeline orchestrator with resume support.
//
// Per-practice steps (each can be skipped via flags or short-circuited by
// the resume checkpoint):
//
//   1. Place gathering            (Google Places Text Search across cities)
//   2. Browser capture            (rendered HTML + desktop + mobile PNGs)
//   3. Chain/DSO detection        (skip everything else if chain — keep row)
//   4. Vendor fingerprinting      (HTML pattern match)
//   5. Deterministic scoring      (Lighthouse + HTML features)
//   6. AI vision scoring          (Claude call with anchors)
//   7. Composite score + tier
//   8. Airtable sync              (batched upsert)
//
// Resume: every per-practice result is persisted to _sourcing/checkpoints/{placeId}.json
// after step 7. On rerun, completed practices are skipped. To force a rerun
// for a single practice, delete its checkpoint file.
//
// Usage:
//   node scripts/sourcing/run.js --msa riverside-sb [--limit 100] [--no-vision] [--no-airtable]
//
// MSAs are defined in scripts/sourcing/config/msas.js. For now, riverside-sb
// is the only configured MSA — add more as we expand.

import './lib/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { textSearch } from './lib/places.js';
import { captureSite, closeBrowser } from './lib/browser.js';
import { detectChain } from './lib/chain-detector.js';
import { detectVendor, extractWpTheme } from './lib/vendor-fingerprints.js';
import { detectMultiLocation } from './lib/multi-location.js';
import { detectMetaAds, detectGoogleAds, extractDomain } from './lib/ad-detect.js';
import {
  runLighthouse,
  detectHtmlFeatures,
  computeDeterministicDesignScore,
  computeBusinessValueScore,
  vendorMultiplier,
  computeOpportunity,
  tierFor,
  quadrantFor,
} from './lib/scoring.js';
import { loadAnchors, scoreSite as scoreVision, visionContribution } from './lib/vision-score.js';
import { ensureTable, upsertPractices, recordToFields } from './lib/airtable.js';

// ──────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const OUT_DIR = path.join(REPO_ROOT, '_sourcing');
const CHECKPOINT_DIR = path.join(OUT_DIR, 'checkpoints');
const SCREENSHOT_DIR = path.join(OUT_DIR, 'screenshots');
const ANCHOR_DIR = path.join(OUT_DIR, 'anchors');

const MSAS = {
  'riverside-sb': {
    label: 'Riverside–San Bernardino–Ontario, CA',
    queries: [
      'dentist in Riverside, CA',
      'dentist in San Bernardino, CA',
      'dentist in Ontario, CA',
      'dentist in Rancho Cucamonga, CA',
      'dentist in Corona, CA',
      'dentist in Moreno Valley, CA',
      'dentist in Fontana, CA',
      'dentist in Murrieta, CA',
      'dentist in Temecula, CA',
      'orthodontist in Riverside, CA',
      'pediatric dentist in Riverside, CA',
    ],
  },
};

const args = parseArgs(process.argv.slice(2));
const MSA_KEY = args.msa || 'riverside-sb';
const LIMIT = args.limit ? parseInt(args.limit, 10) : Infinity;
const SKIP_VISION = !!args['no-vision'];
const SKIP_AIRTABLE = !!args['no-airtable'];
const SKIP_LIGHTHOUSE = !!args['no-lighthouse']; // useful while iterating; PSI is slow
const SKIP_ADS = !!args['no-ads']; // ad-spend detection is scrapy & slowest
const FORCE = !!args.force; // ignore checkpoints
const CONCURRENCY = parseInt(args.concurrency || '4', 10); // per-practice parallelism

// Shared ad-detection browser — separate from the screenshot browser because
// Meta/Google detect bots faster than the screenshot UA. We launch it lazily.
let _adBrowser = null;
async function getAdBrowser() {
  if (_adBrowser && _adBrowser.isConnected()) return _adBrowser;
  _adBrowser = await chromium.launch({ headless: true });
  return _adBrowser;
}
async function closeAdBrowser() {
  if (_adBrowser) await _adBrowser.close().catch(() => {});
  _adBrowser = null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[k] = next; i++; }
      else out[k] = true;
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Checkpoint helpers
// ──────────────────────────────────────────────────────────────────────

async function readCheckpoint(placeId) {
  if (FORCE) return null;
  try {
    const buf = await fs.readFile(path.join(CHECKPOINT_DIR, `${placeId}.json`));
    return JSON.parse(buf.toString('utf8'));
  } catch { return null; }
}
async function writeCheckpoint(placeId, data) {
  await fs.writeFile(
    path.join(CHECKPOINT_DIR, `${placeId}.json`),
    JSON.stringify(data, null, 2),
  );
}

// ──────────────────────────────────────────────────────────────────────
// Per-practice pipeline
// ──────────────────────────────────────────────────────────────────────

async function processPractice(place, ctx) {
  const placeId = place.id;
  const cached = await readCheckpoint(placeId);
  if (cached) return { ...cached, _fromCheckpoint: true };

  const r = {
    placeId,
    practiceName: place.displayName?.text || '',
    address: place.formattedAddress || '',
    websiteUrl: place.websiteUri || '',
    phone: place.nationalPhoneNumber || '',
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    primaryType: place.primaryType || '',
    types: place.types || [],
    businessStatus: place.businessStatus || 'OPERATIONAL',
    source: 'google-places-text-search',
    sourcedAt: ctx.startedAtISO,
    msa: ctx.msaLabel,
  };

  // No website at all → record minimal data, mark excluded.
  if (!r.websiteUrl) {
    r.status = 'excluded-no-website';
    await writeCheckpoint(placeId, r);
    return r;
  }
  if (r.businessStatus === 'CLOSED_PERMANENTLY') {
    r.status = 'excluded-closed';
    await writeCheckpoint(placeId, r);
    return r;
  }

  // 2. Browser capture
  const cap = await captureSite(r.websiteUrl, { skipScreenshots: SKIP_VISION });
  r.httpStatus = cap.status;
  r.finalUrl = cap.finalUrl;

  if (!cap.ok || !cap.html) {
    r.vendor = 'unreachable';
    r.vendorCategory = 'unreachable';
    r.status = 'excluded-unreachable';
    await writeCheckpoint(placeId, r);
    return r;
  }

  // Save screenshots to disk (so they can be attached to Airtable later)
  if (cap.desktopPng) {
    const p = path.join(SCREENSHOT_DIR, `${placeId}-desktop.png`);
    await fs.writeFile(p, cap.desktopPng);
    r.desktopPath = path.relative(REPO_ROOT, p);
  }
  if (cap.mobilePng) {
    const p = path.join(SCREENSHOT_DIR, `${placeId}-mobile.png`);
    await fs.writeFile(p, cap.mobilePng);
    r.mobilePath = path.relative(REPO_ROOT, p);
  }

  // 3. Chain / DSO detection
  const chain = detectChain({
    practiceName: r.practiceName,
    websiteUrl: r.websiteUrl,
    finalUrl: cap.finalUrl,
    html: cap.html,
  });
  r.isChain = chain.isChain;
  r.chainName = chain.chainName;
  if (chain.isChain) {
    r.status = 'excluded-dso';
    // Still run vendor + features so we have data, but skip vision + Lighthouse
    // (expensive operations not worth running on excluded rows).
  }

  // 4. Vendor fingerprinting + WordPress theme extraction
  const vendor = detectVendor({ html: cap.html, finalUrl: cap.finalUrl, headers: cap.headers });
  r.vendor = vendor.vendor;
  r.vendorCategory = vendor.category;
  r.wpTheme = extractWpTheme(cap.html); // null unless WP; useful for post-hoc clustering

  // 5. Deterministic HTML feature detection + multi-location
  r.features = detectHtmlFeatures({ html: cap.html, finalUrl: cap.finalUrl });
  r.multiLocation = detectMultiLocation({ html: cap.html, finalUrl: cap.finalUrl });

  // 5b. Ad-spend detection (skip for excluded rows + when disabled)
  if (!chain.isChain && !SKIP_ADS) {
    const domain = extractDomain(r.finalUrl || r.websiteUrl);
    const adBrowser = await getAdBrowser();
    const [meta, google] = await Promise.all([
      detectMetaAds({ browser: adBrowser, domain }),
      detectGoogleAds({
        browser: adBrowser,
        practiceName: r.practiceName,
        city: r.city || place._city,
        domain,
      }),
    ]);
    r.ads = { meta, google };
  }

  // Lighthouse (skip for excluded rows + when disabled)
  if (!chain.isChain && !SKIP_LIGHTHOUSE) {
    r.lighthouse = await runLighthouse(r.websiteUrl, { apiKey: process.env.GOOGLE_PLACES_API_KEY });
  }

  // 6. Vision scoring (skip for excluded rows + when disabled)
  if (!chain.isChain && !SKIP_VISION && cap.desktopPng && cap.mobilePng) {
    try {
      const anchors = await loadAnchors(ANCHOR_DIR);
      const v = await scoreVision({
        desktopPng: cap.desktopPng,
        mobilePng: cap.mobilePng,
        anchors,
      });
      if (v.ok) r.vision = v;
      else r.visionError = v.error;
    } catch (e) {
      r.visionError = e.message;
    }
  }

  // 7. Composite scores
  const designDeterministic = computeDeterministicDesignScore({
    lighthouse: r.lighthouse,
    features: r.features,
  });
  const designVision = r.vision && !r.vision.unrenderable
    ? visionContribution({
        visualCraft: r.vision.visualCraft,
        clarityHierarchy: r.vision.clarityHierarchy,
        modernity: r.vision.modernity,
      })
    : 0;
  const designScore = Math.min(100, designDeterministic + designVision);

  const businessValue = computeBusinessValueScore({
    rating: r.rating,
    reviewCount: r.reviewCount,
    primaryType: r.primaryType,
    multiLocation: !!r.multiLocation?.multiLocation,
    runningAds: !!(r.ads?.meta?.running || r.ads?.google?.running),
  });

  const vm = vendorMultiplier({ vendorCategory: r.vendorCategory, vendor: r.vendor });
  const opportunity = computeOpportunity({ designScore, businessValue, multiplier: vm });

  // Excluded rows don't get a tier/quadrant — they shouldn't compete in
  // "Prime" views even if their numbers happen to look prime-y.
  const isExcluded = chain.isChain || r.status?.startsWith('excluded-');
  r.scores = {
    design: designScore,
    businessValue,
    vendorMultiplier: vm,
    opportunity,
    tier: isExcluded ? null : tierFor(opportunity),
    quadrant: isExcluded ? null : quadrantFor({ designScore, businessValue }),
  };

  if (!r.status) r.status = 'new';

  await writeCheckpoint(placeId, r);
  return r;
}

// ──────────────────────────────────────────────────────────────────────
// Place gathering
// ──────────────────────────────────────────────────────────────────────

async function gatherPlaces(msa) {
  const seen = new Set();
  const all = [];
  for (const q of msa.queries) {
    if (all.length >= LIMIT) break;
    process.stderr.write(`  places: ${q}\n`);
    const places = await textSearch({
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
      query: q,
      maxPages: 3,
    });
    for (const p of places) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      // Parse address parts (sloppy but works for US format)
      const addr = p.formattedAddress || '';
      const m = addr.match(/(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
      if (m) {
        p._city = m[2].trim();
        p._state = m[3].trim();
        p._zip = m[4].trim();
      }
      // Coordinates if available
      if (p.location) {
        p._lat = p.location.latitude;
        p._lng = p.location.longitude;
      }
      all.push(p);
      if (all.length >= LIMIT) break;
    }
  }
  return all;
}

// ──────────────────────────────────────────────────────────────────────
// Parallel worker pool
// ──────────────────────────────────────────────────────────────────────

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0, done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { error: e.message };
      }
      done++;
      if (done % 5 === 0 || done === items.length) {
        process.stderr.write(`  processed ${done}/${items.length}\n`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ──────────────────────────────────────────────────────────────────────
// Airtable sync
// ──────────────────────────────────────────────────────────────────────

async function syncAirtable(rows) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  const { tableId, created } = await ensureTable({
    apiKey,
    baseId,
    allowCreate: !!args['create-table'],
  });
  if (created) console.error(`  ✅ Created table "Sourced Practices" (${tableId})`);
  else console.error(`  table found: ${tableId}`);

  const records = rows.map((p) => ({
    placeId: p.placeId,
    fields: recordToFields(p),
  }));
  const result = await upsertPractices({
    apiKey, baseId, tableId, records,
    onProgress: (p) => {
      if (p.error) console.error(`    !! ${p.phase}: ${p.error}`);
    },
  });
  console.error(`  airtable: created=${result.created} updated=${result.updated} failed=${result.failed}`);
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  const startedAtISO = new Date(startedAt).toISOString();
  const msa = MSAS[MSA_KEY];
  if (!msa) throw new Error(`Unknown MSA: ${MSA_KEY}. Known: ${Object.keys(MSAS).join(', ')}`);

  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  console.error('━━━ Sourcing pipeline ━━━');
  console.error(`MSA:         ${msa.label}`);
  console.error(`Limit:       ${LIMIT === Infinity ? 'all' : LIMIT}`);
  console.error(`Concurrency: ${CONCURRENCY}`);
  console.error(`Vision:      ${SKIP_VISION ? 'OFF' : 'ON'}`);
  console.error(`Lighthouse:  ${SKIP_LIGHTHOUSE ? 'OFF' : 'ON'}`);
  console.error(`Airtable:    ${SKIP_AIRTABLE ? 'OFF' : 'ON'}`);
  console.error(`Force:       ${FORCE ? 'YES (ignore checkpoints)' : 'no'}`);
  console.error('');

  console.error('Step 1: gather places');
  const places = await gatherPlaces(msa);
  console.error(`  → ${places.length} unique practices\n`);

  console.error('Step 2-7: per-practice pipeline');
  const ctx = { startedAtISO, msaLabel: msa.label };
  const rows = await runPool(places, (p) => processPractice(p, ctx), CONCURRENCY);

  // Flatten place + result for Airtable
  const enriched = rows.filter(Boolean).map((r, i) => {
    const p = places[i];
    return {
      ...r,
      city: r.city || p._city,
      state: r.state || p._state,
      zip: r.zip || p._zip,
      lat: r.lat ?? p._lat,
      lng: r.lng ?? p._lng,
    };
  });

  // Summary
  const byStatus = new Map();
  const byTier = new Map();
  for (const r of enriched) {
    byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
    if (r.scores?.tier) byTier.set(r.scores.tier, (byTier.get(r.scores.tier) || 0) + 1);
  }
  console.error('\n━━━ Summary ━━━');
  console.error('By status:');
  for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${k.padEnd(28)} ${v}`);
  }
  console.error('By tier:');
  for (const [k, v] of [...byTier.entries()].sort()) {
    console.error(`  ${k.padEnd(28)} ${v}`);
  }
  const fromCheckpoint = rows.filter((r) => r._fromCheckpoint).length;
  console.error(`\nFrom checkpoint: ${fromCheckpoint}, freshly processed: ${rows.length - fromCheckpoint}`);

  // Step 8: Airtable
  if (!SKIP_AIRTABLE) {
    console.error('\nStep 8: Airtable sync');
    await syncAirtable(enriched);
  }

  await closeBrowser();
  await closeAdBrowser();
  console.error(`\nDone. ${((Date.now() - startedAt) / 1000).toFixed(1)}s elapsed.`);
}

main().catch(async (e) => {
  console.error('Pipeline failed:', e);
  await closeBrowser();
  await closeAdBrowser();
  process.exit(1);
});
