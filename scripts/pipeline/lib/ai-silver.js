/**
 * Silver Transform — AI-Powered Bronze → PracticeData
 *
 * Architecture (parallel per-page):
 *   1. filterUsefulPages()  — programmatic noise filter (no AI)
 *   2. extractPagePartial() — run silver extraction on each page in parallel
 *                             (concurrency-limited to avoid rate limits)
 *   3. mergePartials()      — combine all partial outputs into one silver JSON
 *   4. normalizeAiOutput()  — final shape normalization (existing logic)
 *
 * Why this shape: previous design bundled up to 8 pages into one prompt and
 * dropped pages 9+ entirely. That broke silver's catch-all promise — content
 * from team/technology/services pages beyond the top 8 was invisible to every
 * downstream phase. The per-page approach gives every page its own focused
 * extraction and merges results, so a 30-page site contributes content from
 * all 30 pages (after noise filtering) instead of just 8.
 */

import { renderSkillPrompt } from './skill-loader.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat as fsStat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL   = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

// ---------------------------------------------------------------------------
// Per-page extraction cache — content-hash keyed
// ---------------------------------------------------------------------------
//
// Caches extractPagePartial output by hash of (page-content-fingerprint, prompt-version,
// model). Re-running silver on the same site only re-extracts pages whose content
// changed. Saves ~$0.05 + one Claude call per cache hit during dev iteration.
//
// Cache location: ~/.cache/groundwork-builder/silver-pages/<hash>.json
// Honors GROUNDWORK_NO_CACHE=1 to disable. Bumping CACHE_VERSION invalidates all.

const CACHE_VERSION = 'silver-v1';
const CACHE_DIR = pathResolve(homedir(), '.cache', 'groundwork-builder', 'silver-pages');

let _cacheAvailable = null;
async function ensureCacheDir() {
  if (_cacheAvailable !== null) return _cacheAvailable;
  if (process.env.GROUNDWORK_NO_CACHE === '1') {
    _cacheAvailable = false;
    return false;
  }
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    _cacheAvailable = true;
  } catch {
    _cacheAvailable = false;
  }
  return _cacheAvailable;
}

/**
 * Stable content fingerprint for a page. Hashes the fields the prompt
 * actually uses — body text, headings, paragraphs, structured-data — so
 * pages with the same extractable content hash to the same key even when
 * unrelated metadata (lastFetched timestamps, image counts) differs.
 */
function pageContentFingerprint(page) {
  return JSON.stringify({
    path: page.path,
    title: page.title || null,
    metaDesc: page.metaDescription || null,
    headings: (page.headings || []).map(h => ({ level: h.level, text: h.text })),
    paragraphs: page.paragraphs || [],
    bodyText: page.bodyText || '',
    images: (page.images || []).map(i => ({ src: i.src, alt: i.alt })),
    structuredData: page.structuredData || [],
    heroTexts: page.heroTexts || [],
  });
}

function cacheKey(page) {
  const fp = pageContentFingerprint(page);
  return createHash('sha256')
    .update(`${CACHE_VERSION}|${MODEL}|${fp}`)
    .digest('hex')
    .slice(0, 24);
}

async function readCache(key) {
  if (!(await ensureCacheDir())) return null;
  const path = pathResolve(CACHE_DIR, `${key}.json`);
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(key, value) {
  if (!(await ensureCacheDir())) return;
  const path = pathResolve(CACHE_DIR, `${key}.json`);
  try {
    await writeFile(path, JSON.stringify(value), 'utf-8');
  } catch { /* cache write failure is non-fatal */ }
}

// Concurrency cap for parallel per-page extraction. 5 keeps us comfortably
// under per-minute rate limits while still being ~5× faster than sequential.
const DEFAULT_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Page filtering — programmatic noise removal (no AI)
// ---------------------------------------------------------------------------

/**
 * Filter bronze pages down to those worth extracting from.
 * Drops obvious noise: short pages, legal/utility pages, duplicates.
 * No cap — silver should see every page that might contain real content.
 *
 * @param {Array} pages - bronze.pages array
 * @returns {Array} useful pages (subset of input)
 */
function filterUsefulPages(pages) {
  // URL patterns we never want to extract from — pure noise
  const NOISE_PATTERNS = [
    /\/privacy/i,
    /\/terms/i,
    /\/legal/i,
    /\/cookies?-?policy/i,
    /\/accessibility-statement/i,
    /\/sitemap/i,
    /\/404/i,
    /\/thank-?you/i,
    /\/thanks\b/i,
    /\/confirmation/i,
    /\/search/i,
    /\/tag\//i,
    /\/category\//i,
    /\/author\//i,
    /\/feed\b/i,
    /\.xml$/i,
    /\.json$/i,
  ];

  const seen = new Set();
  const useful = [];

  for (const page of pages) {
    if (!page || !page.path) continue;
    if (seen.has(page.path)) continue;  // dedupe by path
    seen.add(page.path);

    if (NOISE_PATTERNS.some(re => re.test(page.path))) continue;

    // Word count threshold — pages under 100 words rarely have extractable content.
    // Homepage gets a free pass even if it's short (sometimes is on minimal sites).
    const isHomepage = page.path === '/' || page.path === '';
    if (!isHomepage && (page.wordCount || 0) < 100) continue;

    useful.push(page);
  }

  // Safety cap — if a site has truly 50+ content pages we cap at 30 to bound cost.
  // Priority order ensures we never drop critical pages (doctor bios, about, contact)
  // in favor of long-but-generic service pages. Within a priority tier, rank by
  // word count descending.
  if (useful.length > 30) {
    const priorityScore = (path) => {
      if (path === '/' || path === '') return 0;                        // homepage
      if (/\/(meet[-_]?dr|dr[-_]|doctor)/i.test(path))         return 1; // individual doctor bio
      if (/\/(meet[-_]our[-_]?team|providers|staff|team)\b/i.test(path)) return 1; // team pages
      if (/\/(about|our[-_]?practice|why[-_])/i.test(path))     return 2; // about
      if (/\/(contact|location|directions|hours)/i.test(path))  return 2; // contact
      if (/\/(testimonials|reviews)/i.test(path))               return 3; // social proof
      if (/\/(services?|treatments?|procedures?)\b/i.test(path)) return 3; // services landing
      if (/\/(faq|insurance|financing|payment)/i.test(path))    return 4; // patient info
      return 5;                                                          // everything else
    };
    useful.sort((a, b) => {
      const pa = priorityScore(a.path);
      const pb = priorityScore(b.path);
      if (pa !== pb) return pa - pb;
      return (b.wordCount || 0) - (a.wordCount || 0);
    });
    return useful.slice(0, 30);
  }

  return useful;
}

// ---------------------------------------------------------------------------
// Per-page formatting (unchanged from prior design)
// ---------------------------------------------------------------------------

function formatPage(page) {
  const lines = [`## ${page.path}  (${page.title})`];

  if (page.metaDescription) lines.push(`Meta: ${page.metaDescription}`);

  if (page.heroTexts?.length) {
    lines.push(`Hero text: ${page.heroTexts.join(' | ')}`);
  }

  // People-rich pages get more headroom — multi-doctor practices have
  // 2nd/3rd doctor bios that fall off the end of a 1500-char body cap.
  const isPeoplePage = /\/(about|team|staff|doctor|dr[-_]|providers|our[-_]?team|meet)/i.test(page.path);
  const headingCap   = isPeoplePage ? 40 : 20;
  const paragraphCap = isPeoplePage ? 20 : 8;
  const paragraphLen = isPeoplePage ? 400 : 200;
  const bodyLen      = isPeoplePage ? 6000 : 1500;

  if (page.headings?.length) {
    lines.push('Headings:');
    for (const h of page.headings.slice(0, headingCap)) {
      lines.push(`  H${h.level}: ${h.text}`);
    }
  }

  if (page.paragraphs?.length) {
    lines.push('Paragraphs:');
    for (const p of page.paragraphs.slice(0, paragraphCap)) {
      lines.push(`  - ${p.slice(0, paragraphLen)}`);
    }
  }

  if (page.images?.length) {
    lines.push('Images (src | alt):');
    for (const img of page.images.slice(0, 15)) {
      lines.push(`  ${img.src} | ${img.alt}`);
    }
  }

  // Promote ALL Person/Dentist structured data — most reliable multi-doctor signal.
  const personSchemas = (page.structuredData || []).filter(sd => {
    const t = sd['@type'];
    if (!t) return false;
    const types = Array.isArray(t) ? t : [t];
    return types.some(x => /Person|Dentist|Physician|Orthodontist|MedicalProfessional/i.test(x));
  });
  const otherSchemas = (page.structuredData || []).filter(sd => !personSchemas.includes(sd));

  if (personSchemas.length > 0) {
    lines.push(`Person/Dentist JSON-LD entries (${personSchemas.length} found — extract ALL of these as doctors):`);
    for (const item of personSchemas.slice(0, 8)) {
      lines.push('  ' + JSON.stringify(item).slice(0, 1000));
    }
  }
  if (otherSchemas.length > 0) {
    lines.push('Other JSON-LD:');
    for (const item of otherSchemas.slice(0, 3)) {
      lines.push('  ' + JSON.stringify(item).slice(0, 400));
    }
  }

  if (page.bodyText) {
    lines.push(`Body text: ${page.bodyText.slice(0, bodyLen)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Per-page prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a single-page extraction prompt via the skill loader.
 * Skill: skills/extraction/silver.md — same schema/rules, framed as
 * "this is ONE page; extract only what's here, null for everything else."
 */
async function buildPerPagePrompt(page, bronze) {
  return renderSkillPrompt('extraction/silver', {
    bronzeBaseUrl: bronze.baseUrl,
    pagePath:      page.path,
    pageBlock:     formatPage(page),
  });
}

// ---------------------------------------------------------------------------
// Claude API call (single page)
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Claude API error ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }

  const data  = await res.json();
  const text  = data.content?.[0]?.text || '';

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Silver extraction: failed to parse Claude JSON response: ${err.message}\nFirst 500 chars: ${clean.slice(0, 500)}`);
  }
}

/**
 * Extract a partial silver JSON from a single page, with cache + retry/backoff.
 * Returns null on terminal failure (so merge can skip this page rather than
 * fail the whole pipeline).
 *
 * Cache: keyed by sha256 of page content fingerprint + prompt version + model.
 * Set GROUNDWORK_NO_CACHE=1 to disable. Hits skip the Claude call entirely.
 */
async function extractPagePartial(page, bronze, opts = {}) {
  const key = cacheKey(page);

  // Cache lookup
  if (!opts.noCache) {
    const cached = await readCache(key);
    if (cached) {
      // Tag for stats reporting
      cached.__cached = true;
      return cached;
    }
  }

  const prompt = await buildPerPagePrompt(page, bronze);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await callClaude(prompt);
      // Write-through to cache (best-effort; failures are non-fatal)
      writeCache(key, result).catch(() => {});
      return result;
    } catch (err) {
      const is429     = err.status === 429 || /rate_limit/i.test(err.message);
      const isNetwork = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(err.message);
      const retryable = is429 || isNetwork;
      if (retryable && attempt < 3) {
        const waitMs = is429 ? attempt * 20000 : attempt * 5000;
        const reason = is429 ? 'Rate limited' : 'Network error';
        console.warn(`[ai-silver] ${reason} on ${page.path} (${err.message.slice(0, 80)}). Waiting ${waitMs / 1000}s before retry ${attempt + 1}/3...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.warn(`[ai-silver] Page ${page.path} extraction failed: ${err.message.slice(0, 200)}`);
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Concurrency limiter — process tasks in parallel with a max-concurrent cap
// ---------------------------------------------------------------------------

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function pull() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => pull());
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Merge — combine partial per-page outputs into a single silver JSON
// ---------------------------------------------------------------------------

/**
 * Combine N partial silver JSONs (one per page) into a single source of truth.
 * Strategy:
 *   - Scalars: first non-null wins, with priority pages (homepage, about) processed first
 *   - Doctors: dedupe by normalized name; merge fields (longest bio, prefer non-null photoUrl)
 *   - Services: dedupe by slugified name
 *   - Content arrays (testimonials/faqs/insurance/specials): union, dedupe
 *   - additionalContent: union, cap 30, dedupe by content hash
 *   - Differentiators: dedupe by normalized label
 *   - Images: union by URL per category
 *
 * @param {Array<{page, partial}>} entries - { page, partial } pairs (partial may be null on extraction failure)
 * @returns {object} merged raw object in the shape the AI used to return for the bundled call
 */
function mergePartials(entries) {
  // Order entries by extraction priority. Scalar fields take from the FIRST
  // non-null match in this order, so the homepage's name/phone wins over a
  // service-page footer's potentially-truncated copy.
  const priorityScore = (path) => {
    if (path === '/' || path === '') return 0;
    if (/\/about\b/.test(path)) return 1;
    if (/\/contact\b/.test(path)) return 2;
    if (/\/(team|staff|doctors?|providers|meet)\b/.test(path)) return 3;
    if (/\/dr[-_]/.test(path)) return 3;
    if (/\/services\b/.test(path)) return 4;
    return 5;
  };

  const ordered = [...entries]
    .filter(e => e.partial)  // drop failed extractions
    .sort((a, b) => priorityScore(a.page.path) - priorityScore(b.page.path));

  // Helper: pick first non-null/non-empty across ordered partials
  const pickFirst = (path) => {
    for (const { partial } of ordered) {
      const val = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), partial);
      if (val != null && val !== '' && !(Array.isArray(val) && val.length === 0)) return val;
    }
    return null;
  };

  // Helper: union arrays from a path across all partials, dedupe via keyFn
  const unionBy = (path, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const { partial } of ordered) {
      const arr = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), partial);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item) continue;
        const key = keyFn(item);
        if (key == null || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  };

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/^dr\.?\s+/i, '').replace(/[^a-z0-9]+/g, '');

  // ─── practice ──────────────────────────────────────────────────────────
  const practice = {
    name:               pickFirst('practice.name'),
    phone:              pickFirst('practice.phone'),
    email:              pickFirst('practice.email'),
    domain:             pickFirst('practice.domain'),
    googleReviewLink:   pickFirst('practice.googleReviewLink'),
    googleProfileLink:  pickFirst('practice.googleProfileLink'),
    sameAs: unionBy('practice.sameAs', s => String(s).toLowerCase()),
  };

  // ─── address / hours ───────────────────────────────────────────────────
  const address = {
    street: pickFirst('address.street'),
    city:   pickFirst('address.city'),
    state:  pickFirst('address.state'),
    zip:    pickFirst('address.zip'),
  };
  const hours = pickFirst('hours');

  // ─── doctors ───────────────────────────────────────────────────────────
  // Dedupe by normalized last+first name. When the same doctor appears on
  // multiple pages, merge: prefer longest bio, prefer non-null photoUrl,
  // union specialties.
  const doctorMap = new Map();
  for (const { partial } of ordered) {
    // accept new doctors[] shape OR legacy doctor + additionalDoctors
    const arr = Array.isArray(partial.doctors)
      ? partial.doctors
      : [
          ...(partial.doctor ? [partial.doctor] : []),
          ...(Array.isArray(partial.additionalDoctors) ? partial.additionalDoctors : []),
        ];
    for (const d of arr) {
      if (!d || !d.name) continue;
      const key = norm(d.name);
      if (!key) continue;
      const existing = doctorMap.get(key);
      if (!existing) {
        doctorMap.set(key, { ...d });
      } else {
        // Merge — prefer longer bio, fill nulls, union specialties
        if ((d.bio || '').length > (existing.bio || '').length) existing.bio = d.bio;
        if (!existing.credentials && d.credentials) existing.credentials = d.credentials;
        if (!existing.education   && d.education)   existing.education   = d.education;
        if (!existing.photoUrl    && d.photoUrl)    existing.photoUrl    = d.photoUrl;
        if (!existing.firstName   && d.firstName)   existing.firstName   = d.firstName;
        if (!existing.lastName    && d.lastName)    existing.lastName    = d.lastName;
        const allSpec = new Set([...(existing.specialties || []), ...(d.specialties || [])]);
        existing.specialties = [...allSpec];
      }
    }
  }
  const doctors = [...doctorMap.values()];

  // ─── services ──────────────────────────────────────────────────────────
  // Two-pass dedup:
  //   1. exact slug match (fast, catches "/services/cerec" + "/services/cerec/")
  //   2. fuzzy collapse (catches "Zoom Whitening" + "Teeth Whitening" — same
  //      offering with different naming) while keeping genuinely distinct pairs
  //      separate ("Adult Orthodontics" vs "Children's Orthodontics").
  const exactDeduped = unionBy('services.offered', s => slugify(s.name || s));
  const services = { offered: fuzzyDedupServices(exactDeduped) };

  // ─── brand ─────────────────────────────────────────────────────────────
  const brand = { logoUrl: pickFirst('brand.logoUrl') };

  // ─── content ───────────────────────────────────────────────────────────
  const content = {
    heroTagline:     pickFirst('content.heroTagline'),
    heroSubheadline: pickFirst('content.heroSubheadline'),
    aboutText:       pickFirst('content.aboutText'),
    testimonials:    unionBy('content.testimonials', t => (t.text || '').slice(0, 80).toLowerCase()),
    faqs:            unionBy('content.faqs', f => (f.question || '').slice(0, 80).toLowerCase()),
    insurance:       unionBy('content.insurance', i => String(i).toLowerCase()),
    specials:        unionBy('content.specials', s => (s.title || '').toLowerCase()),
    stats: {
      yearsExperience: pickFirst('content.stats.yearsExperience'),
      googleRating:    pickFirst('content.stats.googleRating'),
      fiveStarReviews: pickFirst('content.stats.fiveStarReviews'),
    },
  };

  // ─── additionalContent ─────────────────────────────────────────────────
  // Union, dedupe by content hash (first 80 chars normalized), cap 30.
  const acSeen = new Set();
  const additionalContent = [];
  for (const { partial } of ordered) {
    const arr = Array.isArray(partial.additionalContent) ? partial.additionalContent : [];
    for (const item of arr) {
      if (!item || !item.content) continue;
      const key = String(item.content).trim().slice(0, 80).toLowerCase();
      if (acSeen.has(key)) continue;
      acSeen.add(key);
      additionalContent.push(item);
      if (additionalContent.length >= 30) break;
    }
    if (additionalContent.length >= 30) break;
  }

  // ─── differentiators ───────────────────────────────────────────────────
  const differentiators = unionBy('differentiators', d => `${d.type}::${(d.label || '').toLowerCase().trim()}`);

  // ─── images ────────────────────────────────────────────────────────────
  const images = {
    logo:        pickFirst('images.logo'),
    hero:        unionBy('images.hero',        u => String(u)),
    team:        unionBy('images.team',        u => String(u)),
    office:      unionBy('images.office',      u => String(u)),
    gallery:     unionBy('images.gallery',     u => String(u)),
    beforeAfter: unionBy('images.beforeAfter', u => String(u)),
  };

  return {
    practice,
    address,
    hours,
    doctors,
    services,
    brand,
    content,
    additionalContent,
    differentiators,
    images,
  };
}

// ---------------------------------------------------------------------------
// Post-process: normalize the merged output into the merger's expected shape
// (Unchanged from previous design — same Practice schema downstream consumers expect.)
// ---------------------------------------------------------------------------

function normalizeAiOutput(raw, bronzeBaseUrl) {
  const practice = raw.practice || {};
  const address  = raw.address  || {};
  const hours    = raw.hours    || null;
  const services = raw.services || {};
  const brand    = raw.brand    || {};
  const content  = raw.content  || {};
  const images   = raw.images   || {};
  const migration = raw.migration || {};
  const differentiators = Array.isArray(raw.differentiators)
    ? raw.differentiators.filter(s => s.type && s.label && (s.confidence || 0) >= 0.7)
    : Array.isArray(raw.signals)
      ? raw.signals.filter(s => s.type && s.label && (s.confidence || 0) >= 0.7)
      : [];

  const normalizeDoctor = (d) => ({
    name:        d?.name        || null,
    firstName:   d?.firstName   || null,
    lastName:    d?.lastName    || null,
    credentials: d?.credentials || null,
    bio:         d?.bio         || null,
    education:   d?.education   || null,
    specialties: d?.specialties || [],
    photoPath:   d?.photoUrl    || d?.photoPath || null,
  });

  // Accept either the new merged doctors[] OR legacy doctor + additionalDoctors
  const rawDoctors = Array.isArray(raw.doctors) && raw.doctors.length
    ? raw.doctors
    : [
        ...(raw.doctor ? [raw.doctor] : []),
        ...(Array.isArray(raw.additionalDoctors) ? raw.additionalDoctors : []),
      ];
  const doctors = rawDoctors.map(normalizeDoctor).filter(d => d.name);

  const rawAdditional = Array.isArray(raw.additionalContent)
    ? raw.additionalContent
    : (Array.isArray(content.additionalContent) ? content.additionalContent : []);
  const additionalContent = rawAdditional
    .filter(item => item && typeof item.content === 'string' && item.content.trim().length > 30)
    .slice(0, 30)
    .map(item => ({
      type:    String(item.type    || 'other').slice(0, 60),
      title:   item.title ? String(item.title).slice(0, 200) : null,
      content: String(item.content).slice(0, 2200),
      source:  item.source ? String(item.source).slice(0, 200) : null,
    }));

  return {
    practice: {
      name:               practice.name    || null,
      domain:             practice.domain  || new URL(bronzeBaseUrl).hostname,
      phone:              practice.phone   || null,
      email:              practice.email   || null,
      googleReviewLink:   /google\.(com|[a-z]{2,3})\/|g\.page\//i.test(practice.googleReviewLink || '')  ? practice.googleReviewLink  : null,
      googleProfileLink:  /google\.(com|[a-z]{2,3})\/|g\.page\//i.test(practice.googleProfileLink || '') ? practice.googleProfileLink : null,
      priceRange:         '$$',
      medicalSpecialty:   null,
      sameAs:             practice.sameAs  || [],
    },
    doctors,
    get doctor() { return doctors[0] || null; },
    get additionalDoctors() { return doctors.slice(1); },
    address: {
      street:  address.street  || null,
      city:    address.city    || null,
      state:   address.state   || null,
      zip:     address.zip     || null,
      country: 'US',
      full:    [address.street, address.city,
                [address.state, address.zip].filter(Boolean).join(' ')]
               .filter(Boolean).join(', ') || null,
    },
    hours: hours || null,
    services: {
      offered: (services.offered || []).map(s => ({
        name:       s.name     || s,
        slug:       slugify(s.name || s),
        category:   s.category || 'general',
        source:     'scrape',
        confidence: 0.85,
      })),
    },
    brand: {
      colors:   null,
      fonts:    null,
      logoPath: brand.logoUrl || images.logo || null,
    },
    content: {
      heroTagline:     content.heroTagline     || null,
      heroHeadline:    content.heroTagline     || null,
      heroSubheadline: content.heroSubheadline || null,
      ctaText:         null,
      ctaSecondaryText:null,
      valueProp:       null,
      aboutText:       content.aboutText       || null,
      aboutHeadline:   null,
      philosophy:      null,
      closingCTA:      null,
      testimonials:    content.testimonials    || [],
      faqs:            content.faqs            || [],
      generatedFAQs:   [],
      stats: {
        yearsExperience: content.stats?.yearsExperience  || null,
        happyPatients:   null,
        googleRating:    content.stats?.googleRating     || null,
        fiveStarReviews: content.stats?.fiveStarReviews  || null,
      },
      insurance: content.insurance || [],
      generated: null,
    },
    additionalContent,
    images: {
      logo:        images.logo       || null,
      hero:        images.hero       || [],
      team:        images.team       || [],
      office:      images.office     || [],
      gallery:     images.gallery    || [],
      beforeAfter: images.beforeAfter|| [],
    },
    migration: {
      oldUrls:     migration.oldUrls || [],
      redirectMap: [],
    },
    meta: {
      oldSiteUrl:     bronzeBaseUrl,
      scrapedAt:      new Date().toISOString(),
      intakeSource:   'ai-silver',
      clientId:       null,
      confidenceFlags: [],
    },
    differentiators,
    get signals() { return differentiators; },
    pageInventory: null,
  };
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Fuzzy service deduplication
// ---------------------------------------------------------------------------

/**
 * Collapse near-duplicate services that survived exact-slug dedup.
 *
 * Algorithm: token-set Jaccard similarity over the service name, where a
 * pair with similarity ≥ 0.7 collapses into the more-descriptive entry
 * (longer name wins). "Always-keep-distinct" patterns (audience modifiers
 * like adult/children/teen, prefix+suffix qualifiers) override the merge.
 *
 * Examples that collapse:
 *   "Zoom Whitening" + "Teeth Whitening"           → "Zoom Whitening"   (Jaccard 0.5 with "whitening" stem — dialed up by length)
 *   "Dental Crowns"  + "Crowns"                    → "Dental Crowns"
 *   "Digital X-rays" + "X-Rays"                    → "Digital X-rays"
 *
 * Examples that stay distinct:
 *   "Adult Orthodontics" + "Children's Orthodontics"  → both kept (audience modifier)
 *   "Invisalign" + "Invisalign Teen"                  → both kept (audience modifier)
 *   "First Dental Visit" + "Dental Exams"             → both kept (low Jaccard)
 *
 * @param {Array} services - already exact-slug-deduped offered[]
 * @returns {Array} fuzzy-deduped offered[]
 */
function fuzzyDedupServices(services) {
  if (!Array.isArray(services) || services.length < 2) return services || [];

  // Audience/qualifier modifiers — when EITHER service has one of these and the
  // other doesn't, force-keep distinct. Prevents collapsing pediatric vs adult
  // orthodontics, teen vs adult invisalign, emergency vs scheduled care.
  const DISTINCT_MODIFIERS = /\b(adult|adults?|child|children|childrens?|kid|kids|pediatric|teen|teens|teenager|teenagers|senior|seniors|infant|infants|baby|babies|youth|emergency|cosmetic|surgical|sedation|implant|implants?)\b/i;

  // Stop-words — strip when computing token sets so "the" / "of" / "and" don't
  // dominate. Domain-generic words like "dental"/"dentistry" also down-weighted
  // so "Dental Crowns" vs "Dental Bridges" don't falsely collapse on "dental".
  const STOP = new Set(['the', 'of', 'and', 'or', 'a', 'an', 'in', 'for', 'with', 'to', 'on', 'dental', 'dentistry', 'dentist', 'tooth', 'teeth', 'oral', 'mouth', 'service', 'services', 'treatment', 'treatments']);

  const tokenize = (s) => new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(t => t && t.length >= 3 && !STOP.has(t))
  );

  const jaccard = (setA, setB) => {
    if (setA.size === 0 && setB.size === 0) return 0;
    let inter = 0;
    for (const x of setA) if (setB.has(x)) inter++;
    return inter / (setA.size + setB.size - inter);
  };

  // Containment: is the smaller token set fully contained in the larger one?
  // Catches cases where one name is a qualified version of the other:
  //   "X-Rays" ⊂ "Digital X-Rays"
  //   "Whitening" ⊂ "Zoom Whitening"
  // The shorter name has every token in the longer one (after stop-word strip).
  const isContained = (setA, setB) => {
    const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    if (small.size === 0) return false;        // don't collapse on empty token sets
    for (const x of small) if (!large.has(x)) return false;
    return true;
  };

  // Walk pairs; when a pair collapses, the kept entry absorbs the other's slug
  // memory and is_kept[i] flag gets cleared on the loser.
  const items = services.map(s => ({
    svc: s,
    tokens: tokenize(s.name || s),
    name: s.name || s,
    kept: true,
  }));

  for (let i = 0; i < items.length; i++) {
    if (!items[i].kept) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (!items[j].kept) continue;
      const a = items[i], b = items[j];

      // Audience-modifier guard: if exactly one side has an audience modifier
      // that the other doesn't have, they're DIFFERENT services for different
      // audiences. Keep both.
      const aMod = a.name.match(DISTINCT_MODIFIERS)?.[1]?.toLowerCase();
      const bMod = b.name.match(DISTINCT_MODIFIERS)?.[1]?.toLowerCase();
      if ((aMod && !bMod) || (!aMod && bMod) || (aMod && bMod && aMod !== bMod)) {
        continue;
      }

      const sim = jaccard(a.tokens, b.tokens);
      const contained = isContained(a.tokens, b.tokens);
      if (sim >= 0.7 || contained) {
        // Collapse — keep the more-descriptive (longer name; ties go to alphabetical first)
        const winner = a.name.length >= b.name.length ? a : b;
        const loser  = winner === a ? b : a;
        loser.kept = false;
      }
    }
  }

  return items.filter(it => it.kept).map(it => it.svc);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transform raw BronzeData into a partial PracticeData object using Claude.
 *
 * Architecture: filter useful pages → run silver extraction on each in parallel
 * (concurrency-capped) → merge per-page partials → normalize → attach inventory.
 *
 * Falls back to an empty object (not an error) if API key is absent.
 *
 * @param {import('./scraper.js').BronzeData} bronze
 * @param {object} [opts]
 * @param {number} [opts.concurrency=5] - Max parallel Claude calls
 * @returns {Promise<object>} Partial PracticeData matching schema.js shape
 */
export async function extractSilver(bronze, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[ai-silver] ANTHROPIC_API_KEY not set — returning empty silver (intake-only mode).');
    return {};
  }

  const concurrency = opts.concurrency || DEFAULT_CONCURRENCY;
  const usefulPages = filterUsefulPages(bronze.pages || []);

  if (usefulPages.length === 0) {
    console.log('[ai-silver] No useful pages after filter — returning empty silver.');
    return {};
  }

  console.log(`[ai-silver] Extracting from ${usefulPages.length} pages (filtered from ${bronze.pages?.length || 0}) with concurrency=${concurrency}...`);
  const startTime = Date.now();

  // Run parallel per-page extraction
  const partials = await runWithConcurrency(usefulPages, concurrency, async (page) => {
    const partial = await extractPagePartial(page, bronze, { noCache: opts.noCache });
    return { page, partial };
  });

  // Strip __cached flag, tally hits for reporting
  let cacheHits = 0;
  for (const p of partials) {
    if (p.partial?.__cached) { cacheHits++; delete p.partial.__cached; }
  }
  const succeeded = partials.filter(p => p.partial).length;
  const failed    = partials.length - succeeded;
  const cacheStr  = cacheHits > 0 ? ` (${cacheHits} cache hit${cacheHits === 1 ? '' : 's'})` : '';
  console.log(`[ai-silver] Per-page extraction complete: ${succeeded} succeeded, ${failed} failed${cacheStr} (${((Date.now() - startTime) / 1000).toFixed(1)}s).`);

  if (succeeded === 0) {
    console.warn('[ai-silver] All per-page extractions failed — returning empty silver.');
    return {};
  }

  // Merge partials into single source of truth
  const merged = mergePartials(partials);

  // Final normalization (same shape downstream consumers expect)
  const silver = normalizeAiOutput(merged, bronze.baseUrl);

  // Caller-side doctor-name validator. Compares silver's doctors[] against
  // every Person/Dentist JSON-LD entry across all bronze pages. If JSON-LD
  // names a doctor that didn't make it into silver, that's a hard regression
  // (the AI silently dropped a clinician). Findings attach to silver.meta so
  // they're visible to coverage-audit and the report.
  const doctorAudit = validateDoctorsAgainstJsonLd(silver.doctors, bronze.pages || []);
  if (doctorAudit.missing.length > 0) {
    console.warn(`  [ai-silver] WARNING: ${doctorAudit.missing.length} doctor(s) named in JSON-LD missing from silver.doctors[]:`);
    for (const name of doctorAudit.missing) console.warn(`    ✗ ${name}`);
  }
  silver.meta = silver.meta || {};
  silver.meta.doctorAudit = doctorAudit;

  // Pass through bronze's raw scrape signals that downstream visual phases
  // need (Design Extract, Brand Direction). Silver's "no visual data" rule
  // means the AI doesn't EXTRACT colors here — but propagating the raw CSS
  // hex list through is fine and unblocks deterministic extraction
  // downstream. This is a namespace specifically for raw bronze passthrough,
  // separate from `silver.brand` (which stays minimal).
  silver.bronzeAssets = {
    cssColors:      bronze.siteAssets?.cssColors      || [],
    externalCssUrl: bronze.siteAssets?.externalCssUrl || null,
  };

  // Attach page inventory for downstream AI steps (ai-content, ai-audit)
  // Note: inventory uses ALL bronze pages, not just the filtered subset, so
  // downstream phases can still see the full crawl shape.
  silver.pageInventory = (bronze.pages || []).map(p => ({
    url:       p.url,
    path:      p.path,
    title:     p.title,
    metaDesc:  p.metaDescription,
    h1:        p.headings?.find(h => h.level === 1)?.text || null,
    h2s:       (p.headings || []).filter(h => h.level === 2).map(h => h.text),
    h3s:       (p.headings || []).filter(h => h.level === 3).map(h => h.text),
    paragraphs:(p.paragraphs || []).slice(0, 5),
    wordCount: p.wordCount,
    bodyText:  (p.bodyText || '').slice(0, 2000),
  }));

  console.log(`[ai-silver] Silver extraction complete.`);
  console.log(`  Practice:        ${silver.practice.name}`);
  console.log(`  Doctors:         ${silver.doctors?.length || 0}${silver.doctors?.length ? ' (' + silver.doctors.map(d => d.name).join(', ') + ')' : ''}`);
  console.log(`  Phone:           ${silver.practice.phone}`);
  console.log(`  Address:         ${silver.address.full}`);
  console.log(`  Hours:           ${silver.hours?.raw || silver.hours?.display?.[0]?.day || 'null'}`);
  console.log(`  Services:        ${silver.services.offered.length}`);
  console.log(`  Images:          hero=${silver.images.hero.length} team=${silver.images.team.length} gallery=${silver.images.gallery.length}`);
  console.log(`  Differentiators: ${silver.differentiators?.length || 0} (${(silver.differentiators || []).map(s => s.type).join(', ') || 'none'})`);
  console.log(`  Additional content blocks: ${silver.additionalContent?.length || 0}`);

  return silver;
}

// ---------------------------------------------------------------------------
// Caller-side doctor validator
// ---------------------------------------------------------------------------

/**
 * Walk every Person/Dentist/Orthodontist JSON-LD entry across bronze pages
 * and collect the unique doctor names. Compare against silver.doctors[].
 * Names appearing in JSON-LD but missing from silver = hard regression
 * (AI silently dropped a clinician).
 *
 * @returns {{ jsonLdNames: string[], silverNames: string[], missing: string[], extraInSilver: string[] }}
 */
function validateDoctorsAgainstJsonLd(silverDoctors, bronzePages) {
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/^dr\.?\s+/i, '')
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const jsonLdSet = new Map(); // normalized name → original
  for (const page of bronzePages) {
    const sds = page?.structuredData || [];
    for (const sd of sds) {
      const t = sd['@type'];
      if (!t) continue;
      const types = Array.isArray(t) ? t : [t];
      const isPerson = types.some(x => /Person|Dentist|Physician|Orthodontist|MedicalProfessional/i.test(x));
      if (!isPerson) continue;
      const name = sd.name || sd.givenName || null;
      if (!name) continue;
      const key = norm(name);
      if (key && !jsonLdSet.has(key)) jsonLdSet.set(key, String(name).trim());
    }
  }

  const silverSet = new Map();
  for (const d of silverDoctors || []) {
    if (!d?.name) continue;
    const key = norm(d.name);
    if (key && !silverSet.has(key)) silverSet.set(key, d.name);
  }

  const missing = [];
  for (const [key, original] of jsonLdSet) {
    if (!silverSet.has(key)) missing.push(original);
  }
  // "extra in silver" — names silver has that JSON-LD doesn't. Often legitimate
  // (silver pulled from page text when JSON-LD was sparse), so this is a NOTE
  // not a failure.
  const extraInSilver = [];
  for (const [key, original] of silverSet) {
    if (!jsonLdSet.has(key)) extraInSilver.push(original);
  }

  return {
    jsonLdNames:   [...jsonLdSet.values()],
    silverNames:   [...silverSet.values()],
    missing,
    extraInSilver,
  };
}

// Export internals for testing/inspection
export { filterUsefulPages, mergePartials, buildPerPagePrompt, validateDoctorsAgainstJsonLd, fuzzyDedupServices };
