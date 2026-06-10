/**
 * design-library-catalog.js
 *
 * Curated inspo + anti fingerprints for the Creative Director library.
 * Source of truth: scripts/pipeline/config/design-library-catalog.json
 *
 * Import writes to _memory/library/ via import-design-library.js.
 * Runtime selection via sampleLibrary() in distill-design.js.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = resolve(__dirname, '../config/design-library-catalog.json');

const VALID_TAGS = new Set(['inspo', 'anti']);
const VALID_ARCHETYPES = new Set([
  'editorial-asymmetric', 'centered-classic', 'magazine-split', 'minimal-brutalist',
  'warm-editorial', 'card-heavy', 'poster-hero', 'other',
]);
const VALID_HERO = new Set([
  'centered', 'asymmetric-left', 'asymmetric-right', 'split-image',
  'full-bleed', 'poster', 'text-only',
]);
const VALID_DENSITY = new Set(['airy', 'balanced', 'dense']);
const VALID_CARDS = new Set(['bordered-flat', 'soft-shadow', 'elevated', 'ghost', 'none']);
const VALID_MOTION = new Set(['none', 'subtle', 'expressive']);
const VALID_RADIUS = new Set(['sharp', 'sm', 'md', 'lg', 'pill', 'mixed']);

let _catalogCache = null;

/**
 * @returns {Promise<{ version: string, dentalMoods: object, entries: object[] }>}
 */
export async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const raw = await readFile(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog.entries)) {
    throw new Error('design-library-catalog: entries must be an array');
  }
  _catalogCache = catalog;
  return catalog;
}

/** Clear in-memory cache (for tests). */
export function clearCatalogCache() {
  _catalogCache = null;
}

/**
 * Validate a fingerprint object against the library schema.
 * @returns {string[]} list of error messages (empty = valid)
 */
export function validateFingerprint(fp, slug = '(unknown)') {
  const errors = [];

  if (!fp || typeof fp !== 'object') return [`${slug}: fingerprint must be an object`];

  const hex = (v, field) => {
    if (typeof v !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(v)) {
      errors.push(`${slug}: palette.${field} must be a hex color`);
    }
  };

  if (!fp.palette || typeof fp.palette !== 'object') {
    errors.push(`${slug}: palette required`);
  } else {
    hex(fp.palette.primary, 'primary');
    hex(fp.palette.secondary, 'secondary');
    hex(fp.palette.accent, 'accent');
    hex(fp.palette.background, 'background');
    if (typeof fp.palette.mood !== 'string' || !fp.palette.mood.trim()) {
      errors.push(`${slug}: palette.mood required`);
    }
  }

  if (!fp.type?.display || !fp.type?.body) errors.push(`${slug}: type.display and type.body required`);
  if (!fp.layout?.archetype || !VALID_ARCHETYPES.has(fp.layout.archetype)) {
    errors.push(`${slug}: layout.archetype invalid (${fp.layout?.archetype})`);
  }
  if (!fp.layout?.density || !VALID_DENSITY.has(fp.layout.density)) {
    errors.push(`${slug}: layout.density invalid`);
  }
  if (!fp.hero?.variant || !VALID_HERO.has(fp.hero.variant)) {
    errors.push(`${slug}: hero.variant invalid (${fp.hero?.variant})`);
  }
  if (!Array.isArray(fp.sections) || fp.sections.length === 0) {
    errors.push(`${slug}: sections must be a non-empty array`);
  }
  if (!fp.cards || !VALID_CARDS.has(fp.cards)) errors.push(`${slug}: cards invalid`);
  if (!fp.motion || !VALID_MOTION.has(fp.motion)) errors.push(`${slug}: motion invalid`);
  if (!fp.radius || !VALID_RADIUS.has(fp.radius)) errors.push(`${slug}: radius invalid`);
  if (typeof fp.fontPair !== 'string' || !fp.fontPair.includes('/')) {
    errors.push(`${slug}: fontPair must be "Display/Body"`);
  }
  if (!Array.isArray(fp.adjectives) || fp.adjectives.length < 3) {
    errors.push(`${slug}: adjectives must have at least 3 items`);
  }

  return errors;
}

/**
 * Validate every catalog entry.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export async function validateCatalog() {
  const catalog = await loadCatalog();
  const errors = [];
  const slugs = new Set();

  for (const entry of catalog.entries) {
    if (!entry.slug) { errors.push('entry missing slug'); continue; }
    if (slugs.has(entry.slug)) errors.push(`duplicate slug: ${entry.slug}`);
    slugs.add(entry.slug);

    if (!VALID_TAGS.has(entry.tag)) {
      errors.push(`${entry.slug}: tag must be inspo|anti`);
    }
    if (!entry.fingerprint) {
      errors.push(`${entry.slug}: fingerprint required`);
      continue;
    }
    errors.push(...validateFingerprint(entry.fingerprint, entry.slug));

    if (entry.tag === 'inspo') {
      if (!Array.isArray(entry.dentalMoods) || entry.dentalMoods.length === 0) {
        errors.push(`${entry.slug}: inspo entries need dentalMoods[]`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Map a free-form mood string (brand brief, extraction, etc.) to a canonical
 * dental mood key used in the catalog.
 *
 * @param {string} mood
 * @returns {'warm-neighborhood'|'modern-premium'|'clean-clinical'|'soft-gentle'}
 */
export function normalizeDentalMood(mood = '') {
  const m = String(mood).toLowerCase();

  if (/soft|gentle|pediatric|calm|low.anxiety|muted|soothing/.test(m)) {
    return 'soft-gentle';
  }
  if (/premium|luxury|cosmetic|sleek|bold|confident|upscale|refined|glam/.test(m)) {
    return 'modern-premium';
  }
  if (/clinical|clean|precise|navy|teal|trustworthy|professional|no.nonsense/.test(m)) {
    if (/warm|family|neighbor|approach/.test(m)) return 'warm-neighborhood';
    return 'clean-clinical';
  }
  if (/warm|neighbor|community|family|approach|personal|friendly|hospitable/.test(m)) {
    return 'warm-neighborhood';
  }

  return 'warm-neighborhood';
}

/**
 * Score how well a catalog entry matches a normalized dental mood.
 * @param {object} entry
 * @param {string} dentalMood
 * @returns {number}
 */
function moodMatchScore(entry, dentalMood) {
  if (!dentalMood || !Array.isArray(entry.dentalMoods)) return 0;
  return entry.dentalMoods.includes(dentalMood) ? 1 : 0;
}

/**
 * Select inspo catalog entries for runtime library sampling.
 * Balances mood-relevance with cross-pollination diversity.
 *
 * @param {object[]} inspoEntries - catalog entries with tag=inspo
 * @param {string} [moodHint] - free-form mood from brand brief / design phase
 * @param {number} [limit=4]
 * @returns {object[]}
 */
export function selectInspoEntries(inspoEntries, moodHint = '', limit = 4) {
  if (!inspoEntries.length) return [];
  const dentalMood = normalizeDentalMood(moodHint);
  const matched = inspoEntries.filter(e => moodMatchScore(e, dentalMood) > 0);
  const unmatched = inspoEntries.filter(e => moodMatchScore(e, dentalMood) === 0);

  const moodSlots = Math.min(Math.ceil(limit / 2), matched.length);
  const crossSlots = Math.min(limit - moodSlots, unmatched.length);

  // Stable shuffle seeded by mood so same practice mood gets consistent inspo set
  const seed = hashString(dentalMood + moodHint);
  const pick = (pool, n) => shuffleStable(pool, seed).slice(0, n);

  const selected = [
    ...pick(matched, moodSlots),
    ...pick(unmatched, crossSlots),
  ];

  // Fill remaining slots from whatever is left
  if (selected.length < limit) {
    const used = new Set(selected.map(e => e.slug));
    const rest = shuffleStable(
      inspoEntries.filter(e => !used.has(e.slug)),
      seed + 1,
    );
    for (const e of rest) {
      if (selected.length >= limit) break;
      selected.push(e);
    }
  }

  return selected.slice(0, limit);
}

/**
 * Build a runtime fingerprint object from a catalog entry (ready for library/).
 * @param {object} entry
 * @param {string} [captured] - ISO date override
 */
export function entryToFingerprint(entry, captured = null) {
  const today = captured || new Date().toISOString().slice(0, 10);
  const note = entry.tag === 'anti'
    ? `anti-pattern: ${(entry.avoidPatterns || []).join('; ')}`
    : `inspo from ${entry.reference || entry.source}`;

  return {
    ...entry.fingerprint,
    slug: entry.slug,
    tag: entry.tag,
    source: entry.source,
    captured: today,
    note,
    dentalMoods: entry.dentalMoods || [],
    borrowableTraits: entry.borrowableTraits || [],
    avoidPatterns: entry.avoidPatterns || [],
  };
}

function hashString(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function shuffleStable(arr, seed) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
