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

import { textSearch, geocodePlace } from './lib/places.js';
import { captureSite, closeBrowser } from './lib/browser.js';
import { detectChain } from './lib/chain-detector.js';
import { detectVendor, extractWpTheme } from './lib/vendor-fingerprints.js';
import { detectMultiLocation } from './lib/multi-location.js';
import { extractEmails, findContactUrl } from './lib/email-extract.js';
import { uploadScreenshot, gcsConfigured } from './lib/screenshots-gcs.js';
import { uploadHtml, uploadCheckpoint } from './lib/html-gcs.js';
import {
  runLighthouse,
  runLlmsTxtAudit,
  detectHtmlFeatures,
  lighthouseBands,
  computeChecklist,
  weaknessTier,
  businessTier,
  tierFor,
  quadrantFor,
  classifyExemplar,
  classifyResearchTier,
  computeMetroThresholds,
} from './lib/scoring.js';
// NOTE: vision is intentionally NOT used in sourcing. Selection (prospects +
// exemplars) is fully objective. Vision happens later: at audit-on-promotion,
// and in the exemplar pattern-extraction pass. Screenshots are still captured
// here so those later passes have them.
import { ensureTable, upsertPractices, recordToFields } from './lib/airtable.js';
import { getMetro, listMetros, QUERY_TERMS } from './config/metros.js';

// ──────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const OUT_DIR = path.join(REPO_ROOT, '_sourcing');
const CHECKPOINT_DIR = path.join(OUT_DIR, 'checkpoints');
const SCREENSHOT_DIR = path.join(OUT_DIR, 'screenshots');
const ANCHOR_DIR = path.join(OUT_DIR, 'anchors');

// Metros come from the registry in config/metros.js (the 100 largest US MSAs).
// Selected via --metro <key>; run --list-metros to see all keys.

// Rubric version — bump when scoring weights or detectors change materially.
// Stamped on every row so we can tell which rubric produced a given score
// and re-audit stale rows after a change.
const RUBRIC_VERSION = '2026.06.07-v4';

// Vision is NOT used in sourcing. Selection (prospects AND exemplars) is fully
// objective — see computeWebsiteQualityScore + classifyExemplar in scoring.js.
// Vision happens later, where it's irreplaceable: at audit-on-promotion (vet a
// prospect before outreach) and in the exemplar pattern-extraction pass.

const args = parseArgs(process.argv.slice(2));
const METRO_KEY = args.metro || args.msa || null; // --metro is canonical; --msa kept as alias
const LIST_METROS = !!args['list-metros'];
// Default cap per metro = 200 most-prominent practices (Google ranks Text
// Search by prominence, which correlates with business value). Override with
// --limit (e.g. --limit 50 for a smoke test, --limit 1000 to go deep).
const LIMIT = args.limit ? parseInt(args.limit, 10) : 200;
const SKIP_SCREENSHOTS = !!args['no-screenshots']; // screenshots captured by default (for review + later passes)
const SKIP_AIRTABLE = !!args['no-airtable'];
const SKIP_LIGHTHOUSE = !!args['no-lighthouse']; // useful while iterating; PSI is slow
const SKIP_SCREENSHOT_UPLOAD = !!args['no-upload']; // skip GCS upload of screenshots + html
const SYNC_ONLY = !!args['sync-only'];           // re-read checkpoints, (upload + ) sync to Airtable; no scraping
const RESCORE = !!args['rescore'];               // recompute scores from cached checkpoints (no re-crawl), then sync
const TABLE_NAME_OVERRIDE = args.table || null;  // write to a named table instead of the default 'Sourced Practices'
const FORCE = !!args.force;                      // ignore checkpoints
const CONCURRENCY = parseInt(args.concurrency || '4', 10); // per-practice parallelism

// NOTE: ad-spend detection was removed. There is no reliable PUBLIC way to
// determine whether an arbitrary practice is running Meta ads at scale (the
// Ad Library API token only exposes ads you have access to), and the Google
// SERP scrape was both fragile and the source of a browser-process leak.
// The Airtable columns (Running Google/Meta Ads) are kept dormant in case a
// clean data source appears later.

// Parse "Street, City, ST 92506, USA" → {city, state, zip}. Tolerant of the
// trailing ", USA" and missing parts. Used both at crawl time and in rescore
// backfill (the address string is always present even when parts weren't stored).
function parseAddressParts(addr = '') {
  const m = addr.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/);
  if (!m) return { city: '', state: '', zip: '' };
  return { city: m[1].trim(), state: m[2].trim(), zip: m[3].trim() };
}

// Canonical Google Maps / Business Profile link from a Place ID.
function gbpUrl(placeId) {
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : '';
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
  // Offsite backup to GCS — best-effort, non-blocking. Local file is the
  // source of truth; this protects against disk loss. Skipped when uploads
  // are disabled (--no-upload) or GCS isn't configured.
  if (!SKIP_SCREENSHOT_UPLOAD) {
    uploadCheckpoint({ placeId, record: data }).catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────
// Per-practice pipeline
// ──────────────────────────────────────────────────────────────────────

async function processPractice(place, ctx) {
  const placeId = place.id;
  const cached = await readCheckpoint(placeId);
  if (cached) return { ...cached, _fromCheckpoint: true };

  const addrParts = parseAddressParts(place.formattedAddress || '');
  const r = {
    placeId,
    practiceName: place.displayName?.text || '',
    address: place.formattedAddress || '',
    city: addrParts.city,
    state: addrParts.state,
    zip: addrParts.zip,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    gbpUrl: place.googleMapsUri || gbpUrl(placeId),
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
  const cap = await captureSite(r.websiteUrl, { skipScreenshots: SKIP_SCREENSHOTS });
  r.httpStatus = cap.status;
  r.finalUrl = cap.finalUrl;

  if (!cap.ok || !cap.html) {
    r.vendor = 'unreachable';
    r.vendorCategory = 'unreachable';
    r.status = 'excluded-unreachable';
    await writeCheckpoint(placeId, r);
    return r;
  }

  // Save screenshots to disk + upload to GCS (signed URL for Airtable attach).
  if (cap.desktopPng) {
    const p = path.join(SCREENSHOT_DIR, `${placeId}-desktop.png`);
    await fs.writeFile(p, cap.desktopPng);
    r.desktopPath = path.relative(REPO_ROOT, p);
    if (!SKIP_SCREENSHOT_UPLOAD) {
      r.desktopUrl = await uploadScreenshot({ placeId, kind: 'desktop', png: cap.desktopPng });
    }
  }
  if (cap.mobilePng) {
    const p = path.join(SCREENSHOT_DIR, `${placeId}-mobile.png`);
    await fs.writeFile(p, cap.mobilePng);
    r.mobilePath = path.relative(REPO_ROOT, p);
    if (!SKIP_SCREENSHOT_UPLOAD) {
      r.mobileUrl = await uploadScreenshot({ placeId, kind: 'mobile', png: cap.mobilePng });
    }
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

  // 5b. Email extraction. Try the homepage first; if empty, do ONE bounded
  // fetch of a contact page (emails frequently live only there).
  let emailRes = extractEmails({ html: cap.html, siteUrl: cap.finalUrl });
  if (!emailRes.best) {
    const contactUrl = findContactUrl({ html: cap.html, baseUrl: cap.finalUrl });
    if (contactUrl && contactUrl !== cap.finalUrl) {
      const contactCap = await captureSite(contactUrl, { skipScreenshots: true });
      if (contactCap.ok && contactCap.html) {
        const fromContact = extractEmails({ html: contactCap.html, siteUrl: cap.finalUrl });
        if (fromContact.best) emailRes = fromContact;
      }
    }
  }
  r.email = emailRes.best;
  r.emailsAll = emailRes.all;

  // 5c. Persist rendered HTML to GCS (gzipped) so we can re-score the whole
  // corpus against future detectors without re-crawling. Near-zero cost.
  if (!SKIP_SCREENSHOT_UPLOAD) {
    const up = await uploadHtml({ placeId, html: cap.html });
    if (up) r.htmlGcsPath = up.gcsPath;
  }

  // Lighthouse + llms.txt (skip for excluded rows + when disabled)
  if (!chain.isChain && !SKIP_LIGHTHOUSE) {
    const [lighthouse, llms] = await Promise.all([
      runLighthouse(r.websiteUrl, { apiKey: process.env.GOOGLE_PLACES_API_KEY }),
      runLlmsTxtAudit(r.websiteUrl),
    ]);
    r.lighthouse = lighthouse;
    r.llms = llms;
  }

  // 6. Per-row OBJECTIVE scoring (no vision). The percentile-dependent parts
  //    (business tier, exemplar review/rating gates, final tier/quadrant) are
  //    computed in finalizeScores() once the whole metro is in — see below.
  r.bands = lighthouseBands(r.lighthouse);
  const checklist = computeChecklist({
    lighthouse: r.lighthouse, features: r.features, vendorCategory: r.vendorCategory, llms: r.llms,
  });
  r.checklist = {
    qualityScore: checklist.qualityScore,   // 0–12 passed
    weaknessScore: checklist.weaknessScore, // 0–12 failed
    total: checklist.total,
    missing: checklist.failed,              // = the outreach pitch
  };

  if (!r.status) r.status = 'new';

  // Stamp the audit metadata — lets us identify stale rows + which rubric
  // produced the scores when weights/detectors change later.
  r.rubricVersion = RUBRIC_VERSION;
  r.lastAuditedAt = ctx.startedAtISO;

  await writeCheckpoint(placeId, r);
  return r;
}

// ──────────────────────────────────────────────────────────────────────
// Place gathering
// ──────────────────────────────────────────────────────────────────────

// Geocode the metro center once, then run each QUERY_TERM geo-biased to that
// circle — pulling the most-prominent practices metro-wide (suburbs included),
// deduped by Place ID, capped at LIMIT.
async function gatherPlaces(metro) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  process.stderr.write(`  geocoding "${metro.geocodeQuery}"…\n`);
  const center = await geocodePlace({ apiKey, query: metro.geocodeQuery });
  if (!center) throw new Error(`Could not geocode metro center: ${metro.geocodeQuery}`);
  const locationBias = { ...center, radiusMeters: metro.radiusMeters };
  process.stderr.write(`  center ${center.latitude.toFixed(3)},${center.longitude.toFixed(3)} · radius ${metro.radiusMeters / 1000}km\n`);

  const seen = new Set();
  const all = [];
  for (const term of QUERY_TERMS) {
    if (all.length >= LIMIT) break;
    process.stderr.write(`  places: "${term}" within radius\n`);
    let places = [];
    try {
      places = await textSearch({ apiKey, query: term, maxPages: 3, locationBias });
    } catch (e) {
      process.stderr.write(`    !! query failed (${term}): ${e.message}\n`);
      continue;
    }
    for (const p of places) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const addr = p.formattedAddress || '';
      const m = addr.match(/(.*),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
      if (m) { p._city = m[2].trim(); p._state = m[3].trim(); p._zip = m[4].trim(); }
      if (p.location) { p._lat = p.location.latitude; p._lng = p.location.longitude; }
      all.push(p);
      if (all.length >= LIMIT) break;
    }
  }
  return all;
}

// ──────────────────────────────────────────────────────────────────────
// Finalize scoring — runs over the WHOLE batch (after per-row work) so we can
// compute per-metro percentile thresholds, then assign business tier, weakness
// tier, tier/quadrant (gates), and the exemplar decision. Mutates rows in place.
// ──────────────────────────────────────────────────────────────────────

function finalizeScores(rows) {
  // Group by metro (msa label) so percentiles are per-market.
  const byMetro = new Map();
  for (const r of rows) {
    const key = r.msa || 'unknown';
    if (!byMetro.has(key)) byMetro.set(key, []);
    byMetro.get(key).push(r);
  }

  for (const [, group] of byMetro) {
    // Thresholds from the ACTIVE (non-excluded) practices in this metro.
    const active = group.filter((r) => !r.status?.startsWith('excluded'));
    const thresholds = computeMetroThresholds(active);

    for (const r of group) {
      const isExcluded = r.isChain || r.status?.startsWith('excluded-');
      const bizTier = businessTier(r.reviewCount, thresholds.reviews);
      const weakTier = weaknessTier(r.checklist?.weaknessScore ?? r.checklist?.total ?? 0);

      const ex = classifyExemplar({
        lighthouse: r.lighthouse, vendorCategory: r.vendorCategory, isChain: r.isChain,
        reviewCount: r.reviewCount, rating: r.rating,
      });
      const research = classifyResearchTier({
        lighthouse: r.lighthouse, vendorCategory: r.vendorCategory, isChain: r.isChain,
        reviewCount: r.reviewCount, rating: r.rating,
        qualityScore: r.checklist?.qualityScore,
      });
      r.isExemplar = !isExcluded && ex.isExemplar;
      r.exemplarFailedOn = ex.failedOn;
      r.researchTier = !isExcluded ? research.researchTier : null;
      r.isResearchPool = !isExcluded && research.isResearchPool;
      r.researchFailedOn = research.failedOn;

      r.scores = {
        qualityScore: r.checklist?.qualityScore ?? null,   // 0–11 (count, uniform)
        weaknessScore: r.checklist?.weaknessScore ?? null, // 0–11
        bizTier,
        weakTier,
        tier: isExcluded ? null : tierFor({ bizTier, weakTier }),
        quadrant: isExcluded ? null : quadrantFor({ bizTier, weakTier }),
      };
    }
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────────
// Parallel worker pool
// ──────────────────────────────────────────────────────────────────────

// Hard ceiling per practice. Worst legit case ≈ Lighthouse 60s + vision ~15s +
// captures ~20s + contact fetch ~25s + uploads ~10s ≈ 130s. 200s gives margin.
// A single hung network call (GCS save / API with no internal timeout) must
// NOT be able to stall the whole run — at 5k scale that's fatal. On timeout we
// record an error for that item and move on; the orphaned promise is reaped at
// process exit.
const PER_PRACTICE_TIMEOUT_MS = 200_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms).unref()),
  ]);
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0, done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await withTimeout(worker(items[i], i), PER_PRACTICE_TIMEOUT_MS, items[i]?.id || `item ${i}`);
      } catch (e) {
        results[i] = { error: e.message };
        process.stderr.write(`  !! item ${i} failed: ${e.message}\n`);
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

  const { tableId, created, addedFields } = await ensureTable({
    apiKey,
    baseId,
    allowCreate: !!args['create-table'],
    tableName: TABLE_NAME_OVERRIDE || undefined,
  });
  const label = TABLE_NAME_OVERRIDE || 'Sourced Practices';
  if (created) console.error(`  ✅ Created table "${label}" (${tableId})`);
  else console.error(`  table found: ${tableId}${addedFields?.length ? ` (+${addedFields.length} fields)` : ''}`);

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

  // --list-metros: print the registry and exit (no metro/scrape needed).
  if (LIST_METROS) {
    const metros = listMetros();
    console.error(`${metros.length} metros (largest first):\n`);
    metros.forEach((m, i) =>
      console.error(`  ${String(i + 1).padStart(3)}. ${m.key.padEnd(34)} ${m.label}  (${(m.pop / 1e6).toFixed(1)}M)`));
    console.error('\nRun one:  node scripts/sourcing/run.js --metro <key>');
    return;
  }

  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  // ── Sync-only mode: re-read existing checkpoints, backfill screenshot
  //    uploads from disk, and upsert to Airtable. No scraping, no scoring. ──
  if (SYNC_ONLY) {
    console.error('━━━ Sync-only: checkpoints → Airtable ━━━');
    const files = await fs.readdir(CHECKPOINT_DIR);
    const rows = [];
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      const r = JSON.parse(await fs.readFile(path.join(CHECKPOINT_DIR, f), 'utf8'));
      // Backfill GCS screenshot URLs if missing but a local PNG exists.
      if (!SKIP_SCREENSHOT_UPLOAD && gcsConfigured()) {
        for (const kind of ['desktop', 'mobile']) {
          const urlKey = kind === 'desktop' ? 'desktopUrl' : 'mobileUrl';
          if (r[urlKey]) continue;
          const pngPath = path.join(SCREENSHOT_DIR, `${r.placeId}-${kind}.png`);
          try {
            const png = await fs.readFile(pngPath);
            r[urlKey] = await uploadScreenshot({ placeId: r.placeId, kind, png });
          } catch { /* no local png — skip */ }
        }
        await writeCheckpoint(r.placeId, r); // persist the URLs back
      }
      rows.push(r);
    }
    console.error(`  ${rows.length} checkpoints loaded`);
    if (!SKIP_AIRTABLE) await syncAirtable(rows);
    console.error('Sync-only done.');
    return;
  }

  // ── Rescore mode: recompute scores from cached checkpoints (Lighthouse +
  //    vision + features are all stored) with the CURRENT rubric. No crawl. ──
  if (RESCORE) {
    console.error(`━━━ Rescore from checkpoints (rubric ${RUBRIC_VERSION}) ━━━`);
    const files = (await fs.readdir(CHECKPOINT_DIR)).filter((x) => x.endsWith('.json'));
    const rows = [];
    for (const f of files) {
      const r = JSON.parse(await fs.readFile(path.join(CHECKPOINT_DIR, f), 'utf8'));
      // Backfill location fields that older checkpoints lack (free — no API):
      if (!r.city && r.address) {
        const ap = parseAddressParts(r.address);
        r.city = ap.city; r.state = ap.state; r.zip = ap.zip;
      }
      if (!r.gbpUrl) r.gbpUrl = gbpUrl(r.placeId);
      // Per-row objective recompute (checklist + bands) from cached inputs.
      r.bands = lighthouseBands(r.lighthouse);
      const checklist = computeChecklist({
        lighthouse: r.lighthouse, features: r.features, vendorCategory: r.vendorCategory, llms: r.llms,
      });
      r.checklist = {
        qualityScore: checklist.qualityScore, weaknessScore: checklist.weaknessScore,
        total: checklist.total, missing: checklist.failed,
      };
      r.rubricVersion = RUBRIC_VERSION;
      r.lastAuditedAt = startedAtISO;
      rows.push(r);
    }
    // Per-metro percentile finalization (tiers + exemplar gates), then persist.
    finalizeScores(rows);
    for (const r of rows) await writeCheckpoint(r.placeId, r);
    console.error(`  rescored ${rows.length} rows`);
    const active = rows.filter((r) => !r.status?.startsWith('excluded'));
    const byTier = {};
    active.forEach((r) => { byTier[r.scores.tier] = (byTier[r.scores.tier] || 0) + 1; });
    console.error('  tier spread (active):', JSON.stringify(byTier));
    if (!SKIP_AIRTABLE) await syncAirtable(rows);
    console.error('Rescore done.');
    return;
  }

  // Resolve the metro from the registry (required for an actual sourcing run).
  const metro = getMetro(METRO_KEY);
  if (!metro) {
    throw new Error(
      METRO_KEY
        ? `Unknown metro: "${METRO_KEY}". Run --list-metros to see valid keys.`
        : 'No metro specified. Pass --metro <key> (see --list-metros).',
    );
  }

  console.error('━━━ Sourcing pipeline ━━━');
  console.error(`Metro:       ${metro.label}  [${metro.key}]`);
  console.error(`Limit:       ${LIMIT === Infinity ? 'all' : LIMIT}`);
  console.error(`Concurrency: ${CONCURRENCY}`);
  console.error(`Screenshots: ${SKIP_SCREENSHOTS ? 'OFF' : 'ON'}  (vision deferred to audit/extraction)`);
  console.error(`Lighthouse:  ${SKIP_LIGHTHOUSE ? 'OFF' : 'ON'}`);
  console.error(`Airtable:    ${SKIP_AIRTABLE ? 'OFF' : 'ON'}`);
  console.error(`Force:       ${FORCE ? 'YES (ignore checkpoints)' : 'no'}`);
  console.error('');

  console.error('Step 1: gather places');
  const places = await gatherPlaces(metro);
  console.error(`  → ${places.length} unique practices\n`);

  console.error('Step 2-7: per-practice pipeline');
  const ctx = { startedAtISO, msaLabel: metro.label };
  const rows = await runPool(places, (p) => processPractice(p, ctx), CONCURRENCY);

  // Flatten place + result for Airtable. Map over rows BY ORIGINAL INDEX (so
  // places[i] stays aligned), then drop items that have no usable record —
  // i.e. timed-out / errored workers (runPool returns {error} for those, with
  // no placeId). Those practices simply aren't in this run's output; since no
  // checkpoint was written for them, a later resume run will retry them.
  const enriched = rows
    .map((r, i) => {
      if (!r || !r.placeId) return null;
      const p = places[i] || {};
      return {
        ...r,
        city: r.city || p._city,
        state: r.state || p._state,
        zip: r.zip || p._zip,
        lat: r.lat ?? p._lat,
        lng: r.lng ?? p._lng,
      };
    })
    .filter(Boolean);
  const droppedCount = rows.length - enriched.length;
  if (droppedCount) console.error(`  (dropped ${droppedCount} timed-out/errored items — re-run to retry)`);

  // Finalize scoring across the whole metro (per-metro percentiles → tiers +
  // exemplar gates), then persist the finalized scores back to each checkpoint.
  finalizeScores(enriched);
  for (const r of enriched) await writeCheckpoint(r.placeId, r);

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
    console.error(`  ${String(k || 'unknown').padEnd(28)} ${v}`);
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
  console.error(`\nDone. ${((Date.now() - startedAt) / 1000).toFixed(1)}s elapsed.`);
  process.exit(0); // force-exit: a timed-out item may leave an orphaned socket open
}

main().catch(async (e) => {
  console.error('Pipeline failed:', e);
  await closeBrowser();
  process.exit(1);
});
