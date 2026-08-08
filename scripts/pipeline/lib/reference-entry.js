/**
 * reference-entry.js — build-time consumption of a design-catalog entry.
 *
 * The ownership model (docs/design-catalog/SCHEMA.md):
 *   REFERENCE owns structure + craft: variant map (its own archetype, freed
 *   from ARCHETYPE_LAYOUT), shape/elevation/border/button/label atoms, density,
 *   motion, type CHARACTER (classification → font bucket), heading anatomy.
 *   PRACTICE owns identity: its elevated brand hues (brand-dna colors stay),
 *   its content, its imagery.
 *
 * Three hooks, called from build-site.js when --reference is passed:
 *   loadReferenceEntry(idOrPath)            → validated entry
 *   selectAutoReference({ scraped, … })     → catalog id (appetite soft-match when scraped)
 *   applyReferenceToBrandDna(brandDna, entry, seedKey) → mutated brandDna
 *   applyReferenceToDirector(dna, entry)    → mutated director dna (designTokens)
 * plus entry.audit → runDesignerAgent({ referenceAudit }) (already wired there).
 *
 * `--reference auto` is deferred in build-site until after scrape/merge so
 * contentAppetiteFromScrape can steer the pick. Explicit ids still fail-fast.
 *
 * v1 scope notes:
 *   - color.strategy is applied only as far as the light theme allows — dark
 *     reference themes are a typed gap (needs-dark-support) and refuse to build.
 *   - entry.voice is NOT yet injected into content generation (logged as a
 *     follow-up; content keeps the practice's own register meanwhile).
 */
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRINGS } from './brand/font-pairings.js';
import { clampVariantMap } from './scrape-probe.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..', '..');
const CATALOG_EXAMPLES = join(ROOT, 'docs', 'design-catalog', 'examples');

const CATALOG_RUNS = join(ROOT, 'docs', 'design-catalog', 'runs');

/** Dimensions shared by catalog `selection.appetite` and scrape profiling. */
export const APPETITE_DIMS = ['photography', 'statistics', 'socialProof', 'team', 'copy'];

const NEUTRAL_APPETITE = Object.fromEntries(APPETITE_DIMS.map((d) => [d, 2]));

/**
 * Resolve catalog id/path → absolute JSON path.
 * Order: explicit .json path → examples/<id>.json → runs/<id>/entry.json
 */
async function resolveReferencePath(idOrPath) {
  if (idOrPath.endsWith('.json')) {
    return isAbsolute(idOrPath) ? idOrPath : join(process.cwd(), idOrPath);
  }
  const candidates = [
    join(CATALOG_EXAMPLES, `${idOrPath}.json`),
    join(CATALOG_RUNS, idOrPath, 'entry.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `[reference] no catalog entry for "${idOrPath}" (tried examples/${idOrPath}.json and runs/${idOrPath}/entry.json)`,
  );
}


/** Deterministic hash — same as font-pairings (reproducible picks). */
function hash(str) {
  let h = 0;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function clampStar(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.max(1, Math.min(3, Math.round(v)));
}

function normalizeAppetite(raw) {
  if (!raw || typeof raw !== 'object') return { ...NEUTRAL_APPETITE };
  const out = {};
  for (const d of APPETITE_DIMS) out[d] = clampStar(raw[d] ?? 2);
  return out;
}

/** Content-bearing image roles — logos/badges/unused don't feed photo layouts. */
const PHOTO_ROLES = new Set([
  'hero', 'team', 'headshot', 'headshots', 'office', 'gallery',
  'beforeAfter', 'treatment', 'treatments',
]);

function countUsablePhotos(images) {
  if (!images) return 0;
  if (Array.isArray(images.items) && images.items.length) {
    return images.items.filter((i) => PHOTO_ROLES.has(String(i?.role || ''))).length;
  }
  let n = 0;
  for (const k of ['hero', 'team', 'headshots', 'office', 'gallery', 'beforeAfter', 'treatments']) {
    if (Array.isArray(images[k])) n += images[k].length;
  }
  return n;
}

function reviewQuotes(data) {
  const bags = [
    data?.content?.testimonials,
    data?.content?.reviews,
    data?.reviews?.reviews,
    data?.reviews?.items,
  ];
  let n = 0;
  for (const bag of bags) {
    if (Array.isArray(bag)) n = Math.max(n, bag.filter((r) => r && (r.quote || r.text || r.body)).length);
  }
  return n;
}

function doctorCount(data) {
  if (Array.isArray(data?.doctors) && data.doctors.length) return data.doctors.length;
  const primary = data?.doctor?.name ? 1 : 0;
  const extra = Array.isArray(data?.additionalDoctors) ? data.additionalDoctors.length : 0;
  return primary + extra;
}

function teamPhotoCount(images) {
  if (!images) return 0;
  if (Array.isArray(images.items) && images.items.length) {
    return images.items.filter((i) => ['team', 'headshot', 'headshots'].includes(String(i?.role || ''))).length;
  }
  return (images.team?.length || 0) + (images.headshots?.length || 0);
}

/**
 * Map silver/merged practice data → the same 1–3 appetite matrix as catalog entries.
 * Soft steer for `--reference auto` — never invents content.
 *
 * Signal hygiene:
 *   - photography: content roles only (not logos/badges)
 *   - statistics: numeric practice claims (years, patients) — NOT ratings
 *   - socialProof: quotes + rating/review-count
 *   - copy: scraped about/FAQs/service blurbs — not generatedFAQs
 *
 * @param {object|null|undefined} scraped  PracticeData-shaped (merged or silver)
 * @returns {{ photography:number, statistics:number, socialProof:number, team:number, copy:number }}
 */
export function contentAppetiteFromScrape(scraped) {
  if (!scraped || typeof scraped !== 'object') return { ...NEUTRAL_APPETITE };

  const photos = countUsablePhotos(scraped.images);
  const photography = photos <= 2 ? 1 : photos <= 8 ? 2 : 3;

  const stats = scraped.content?.stats || scraped.stats || {};
  // Ratings belong to socialProof — don't double-count into statistics.
  const statHits = [stats.yearsExperience, stats.happyPatients]
    .filter((v) => v != null && v !== '' && Number(v) !== 0).length;
  const statistics = statHits === 0 ? 1 : statHits === 1 ? 2 : 3;

  const quotes = reviewQuotes(scraped);
  const reviewCount = Number(
    scraped.reviews?.reviewCount
    || scraped.content?.aggregateRating?.count
    || stats.fiveStarReviews
    || 0,
  ) || 0;
  const hasRating = !!(
    scraped.reviews?.rating
    || scraped.content?.aggregateRating?.value
    || stats.googleRating
  );
  let socialProof = 1;
  if (quotes >= 4 || reviewCount >= 20) socialProof = 3;
  else if (quotes >= 1 || reviewCount > 0 || hasRating) socialProof = 2;

  const docs = doctorCount(scraped);
  const teamPhotos = teamPhotoCount(scraped.images);
  const staff = Array.isArray(scraped.staff) ? scraped.staff.length : 0;
  let team = 1;
  if (docs >= 3 || teamPhotos >= 3 || (docs >= 2 && teamPhotos >= 1) || staff >= 3) team = 3;
  else if (docs >= 2 || teamPhotos >= 1 || staff >= 1) team = 2;

  const aboutLen = String(scraped.content?.aboutText || scraped.content?.philosophy || '').length;
  // Prefer scraped FAQs only — generatedFAQs appear later and would inflate copy mid-build.
  const faqs = scraped.content?.faqs?.length || 0;
  const services = scraped.services?.offered?.length || 0;
  const serviceCopy = (scraped.services?.offered || []).filter((s) => String(s?.description || s?.desc || '').length > 40).length;
  let copy = 1;
  if (aboutLen >= 800 || faqs >= 6 || (services >= 6 && serviceCopy >= 4)) copy = 3;
  else if (aboutLen >= 200 || faqs >= 2 || services >= 4) copy = 2;

  return { photography, statistics, socialProof, team, copy };
}

/**
 * Soft fit of scrape appetite → template appetite.
 *
 * Asymmetric on purpose: over-appetite (template wants more than scrape has)
 * hurts honesty more than under-appetite (scrape is richer than the layout needs).
 * Signature dims (template ★★★) are weighted 2× so the template's defining
 * slots dominate near-ties.
 *
 * Returns fit on a variable scale (roughly 5–30 with weights); callers compare
 * relatively. `starved` = any template★★★ vs scrape★.
 */
export function scoreAppetiteFit(scrapeAppetite, templateAppetite) {
  const scrape = normalizeAppetite(scrapeAppetite);
  const template = normalizeAppetite(templateAppetite);
  let fit = 0;
  let starved = false;
  for (const d of APPETITE_DIMS) {
    const t = template[d];
    const s = scrape[d];
    const over = Math.max(0, t - s);   // template hungrier than scrape
    const under = Math.max(0, s - t);  // scrape richer than template needs
    // Over costs 2×; under costs 1×. Exact match → 3.
    const dimScore = Math.max(0, 3 - over * 2 - under);
    const weight = t === 3 ? 2 : 1;
    fit += dimScore * weight;
    if (t === 3 && s === 1) starved = true;
  }
  return { fit, starved, scrape, template };
}

function formatAppetite(ap) {
  const labels = { photography: 'photo', statistics: 'stats', socialProof: 'proof', team: 'team', copy: 'copy' };
  const a = normalizeAppetite(ap);
  return APPETITE_DIMS.map((d) => `${labels[d]}★${a[d]}`).join(' ');
}

/**
 * Pick a catalog reference for `--reference auto`.
 * When `scraped` (or precomputed `appetite`) is provided, prefer entries whose
 * `selection.appetite` soft-matches the scrape profile. Mood is a light tiebreak.
 * Without scrape data, falls back to mood-ordered deterministic hash (legacy).
 *
 * @param {{ mood?: string, seed?: string, scraped?: object, appetite?: object, log?: boolean }} [opts]
 * @returns {Promise<string>} catalog id
 */
export async function selectAutoReference(opts = {}) {
  const envDefault = process.env.GROUNDWORK_DEFAULT_REFERENCE;
  if (envDefault && envDefault !== 'auto') return envDefault;

  // Discover light runs with an appetite matrix. Prefer curated order as a
  // soft priority when fits tie; unknown new runs append alphabetically.
  const CURATED_ORDER = [
    'dentora', 'calmio', 'clearpath', 'wellbe', 'dermato',
    'pilates-lab', 'sun-moon', 'luvia', 'klinik', 'groomify',
  ];
  const available = [];
  if (existsSync(CATALOG_RUNS)) {
    const dirs = readdirSync(CATALOG_RUNS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('aesop') && !d.name.startsWith('.'))
      .map((d) => d.name);
    const ordered = [
      ...CURATED_ORDER.filter((id) => dirs.includes(id)),
      ...dirs.filter((id) => !CURATED_ORDER.includes(id)).sort(),
    ];
    for (const id of ordered) {
      const path = join(CATALOG_RUNS, id, 'entry.json');
      if (!existsSync(path)) continue;
      try {
        const entry = JSON.parse(await readFile(path, 'utf8'));
        if (entry.tokens?.color?.strategy?.theme === 'dark') continue;
        // Require tagged appetite — untagged entries would collapse to neutral ★★
        // and steal balanced-mid scrapes as the catalog grows.
        if (!entry.selection?.appetite) continue;
        available.push({
          id,
          appetite: normalizeAppetite(entry.selection.appetite),
          moods: entry.selection?.moods || [],
        });
      } catch { /* skip corrupt */ }
    }
  }
  if (!available.length) {
    throw new Error('[reference] auto: no light catalog runs with selection.appetite under docs/design-catalog/runs/');
  }

  const mood = String(opts.mood || '').toLowerCase();
  const moodPrefer = {
    warm: ['calmio', 'wellbe', 'sun-moon'],
    clinical: ['dentora', 'clearpath', 'dermato'],
    bold: ['groomify', 'luvia', 'klinik'],
    editorial: ['pilates-lab', 'calmio', 'dentora'],
    refined: ['dermato', 'pilates-lab', 'clearpath'],
  };
  const prefer = new Set(moodPrefer[mood] || []);
  const seed = opts.seed || mood || 'dental';
  const scrapeAppetite = opts.appetite
    ? normalizeAppetite(opts.appetite)
    : (opts.scraped ? contentAppetiteFromScrape(opts.scraped) : null);

  let pool = available;
  if (scrapeAppetite) {
    const scored = available.map((c) => {
      const { fit, starved } = scoreAppetiteFit(scrapeAppetite, c.appetite);
      const moodBoost = prefer.has(c.id) ? 2 : 0;
      return { ...c, fit, starved, moodBoost, total: fit + moodBoost };
    });
    const fed = scored.filter((c) => !c.starved);
    pool = (fed.length ? fed : scored).slice().sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (prefer.has(a.id) !== prefer.has(b.id)) return prefer.has(a.id) ? -1 : 1;
      return (hash(`${seed}:${a.id}`) % 997) - (hash(`${seed}:${b.id}`) % 997);
    });

    const pick = pool[0];
    if (opts.log !== false) {
      const stars = formatAppetite(scrapeAppetite);
      const runner = pool[1];
      const margin = runner ? ` margin +${pick.total - runner.total} vs ${runner.id}` : '';
      console.log(
        `[reference] auto scrape appetite: ${stars} → ${pick.id}` +
        ` (fit ${pick.fit}${pick.moodBoost ? ` +mood ${pick.moodBoost}` : ''}${margin}` +
        `${pick.starved ? ', starved dims allowed' : ''})`,
      );
    }
    return pick.id;
  }

  // No scrape profile — legacy mood order + deterministic seed pick
  const ordered = [
    ...available.filter((c) => prefer.has(c.id)),
    ...available.filter((c) => !prefer.has(c.id)),
  ];
  return ordered[hash(seed) % ordered.length].id;
}

/**
 * Resolve + load a catalog entry by id (`examples/<id>.json` or `runs/<id>/entry.json`)
 * or by explicit path.
 */
export async function loadReferenceEntry(idOrPath) {
  const path = await resolveReferencePath(idOrPath);
  const entry = JSON.parse(await readFile(path, 'utf8'));

  for (const k of ['id', 'tokens', 'layout', 'audit', 'fidelity']) {
    if (!entry[k]) throw new Error(`[reference] entry missing "${k}" (${path})`);
  }
  const v = entry.layout.variants || {};
  const REQUIRED_VARIANTS = ['heroLayout', 'servicesLayout', 'aboutLayout', 'testimonialsLayout', 'ctaLayout', 'faqLayout', 'navVariant', 'footerVariant', 'galleryVariant'];
  const missing = REQUIRED_VARIANTS.filter(k => !v[k]);
  if (missing.length) throw new Error(`[reference] ${entry.id}: layout.variants missing ${missing.join(', ')}`);

  // Renderer-capability gate: a dark-theme entry would silently render wrong
  // (light-theme assumptions in components) — refuse rather than flatten.
  if (entry.tokens?.color?.strategy?.theme === 'dark') {
    throw new Error(`[reference] ${entry.id} requires dark-theme support (fidelity.theme=${entry.fidelity?.theme}) — not yet renderable. Pick a light reference or build dark support first.`);
  }
  return entry;
}

/**
 * Apply the reference's NON-COLOR identity to brandDna (colors remain the
 * practice's own — the reference owns structure, the practice owns identity).
 *  - shape / elevation / border  → drive radius, cardTreatment, borderTreatment
 *  - type classification          → re-pick the font pairing from the ENTRY's
 *    bucket (same per-practice seed → still deterministic + varied)
 */
export function applyReferenceToBrandDna(brandDna, entry, seedKey = '') {
  const t = entry.tokens || {};
  if (t.shape?.cornerRadius)  brandDna.shape = { ...(brandDna.shape || {}), cornerRadius: t.shape.cornerRadius };
  if (t.border?.treatment)    brandDna.shape = { ...(brandDna.shape || {}), ...brandDna.shape, borderTreatment: t.border.treatment };
  if (t.elevation?.system)    brandDna.elevation = { system: t.elevation.system === 'layered' ? 'layered' : t.elevation.system };

  const bucket = t.type?.classification;
  if (bucket && PAIRINGS[bucket]) {
    const options = PAIRINGS[bucket];
    const pair = options[hash(seedKey) % options.length];
    brandDna.typography = {
      ...(brandDna.typography || {}),
      headingFont: pair.heading,
      bodyFont: pair.body,
      fontProvider: pair.provider || 'google',
      _fontBucket: bucket,
      _fontSource: `reference:${entry.id}`,
    };
  }
  brandDna._reference = entry.id;
  return brandDna;
}

/**
 * Override the director's derived designTokens with the entry's explicit
 * variant map + atoms. This is the "each reference is its own archetype" move:
 * the entry replaces the ARCHETYPE_LAYOUT row, freed from the fixed 8.
 * sectionOrder / creativeDirection remain the director's (content-plan owned).
 */
export function applyReferenceToDirector(dna, entry) {
  const { variants: v, remapped } = clampVariantMap(entry.layout.variants || {});
  if (remapped.length) {
    console.warn(
      `[reference] ${entry.id}: remapped ${remapped.length} non-renderable variant(s): ` +
      remapped.map((r) => `${r.key} ${r.from || '(missing)'}→${r.to}`).join(', '),
    );
  }
  const t = entry.tokens || {};
  const RADIUS_MAP = { sharp: 'sharp', sm: 'sharp', md: 'moderate', lg: 'rounded', pill: 'full' };
  const DENSITY = { airy: { sectionSpacing: 'airy', contentDensity: 'default' }, balanced: { sectionSpacing: 'default', contentDensity: 'default' }, dense: { sectionSpacing: 'compact', contentDensity: 'tight' } };

  dna.designTokens = {
    ...(dna.designTokens || {}),
    // Layout — the entry's hand-curated bundle (clamped to on-disk variants)
    heroLayout: v.heroLayout, servicesLayout: v.servicesLayout, aboutLayout: v.aboutLayout,
    testimonialsLayout: v.testimonialsLayout, ctaLayout: v.ctaLayout, faqLayout: v.faqLayout,
    navVariant: v.navVariant, footerVariant: v.footerVariant, galleryVariant: v.galleryVariant,
    // Atoms + rhythm
    ...(t.button?.treatment ? { buttonTreatment: t.button.treatment } : {}),
    ...(t.label?.style ? { labelStyle: t.label.style } : {}),
    ...(t.shape?.cornerRadius ? { cornerRadius: RADIUS_MAP[t.shape.cornerRadius] || 'moderate' } : {}),
    ...(t.density && DENSITY[t.density] ? DENSITY[t.density] : {}),
  };
  dna.archetype = `reference:${entry.id}`;
  dna.referenceComposition = entry.layout.composition || {};
  dna._referenceVariantRemap = remapped;
  return dna;
}

export default {
  loadReferenceEntry,
  selectAutoReference,
  contentAppetiteFromScrape,
  scoreAppetiteFit,
  applyReferenceToBrandDna,
  applyReferenceToDirector,
};
