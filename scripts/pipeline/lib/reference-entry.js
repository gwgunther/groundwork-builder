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
 *   applyReferenceToBrandDna(brandDna, entry, seedKey) → mutated brandDna
 *   applyReferenceToDirector(dna, entry)    → mutated director dna (designTokens)
 * plus entry.audit → runDesignerAgent({ referenceAudit }) (already wired there).
 *
 * v1 scope notes:
 *   - color.strategy is applied only as far as the light theme allows — dark
 *     reference themes are a typed gap (needs-dark-support) and refuse to build.
 *   - entry.voice is NOT yet injected into content generation (logged as a
 *     follow-up; content keeps the practice's own register meanwhile).
 */
import { readFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRINGS } from './brand/font-pairings.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..', '..');
const CATALOG_EXAMPLES = join(ROOT, 'docs', 'design-catalog', 'examples');

/** Deterministic hash — same as font-pairings (reproducible picks). */
function hash(str) {
  let h = 0;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Resolve + load a catalog entry by id (docs/design-catalog/examples/<id>.json)
 * or by explicit path. Validates the fields the builder consumes; throws loudly
 * — a half-applied reference is worse than none.
 */
export async function loadReferenceEntry(idOrPath) {
  const path = idOrPath.endsWith('.json')
    ? (isAbsolute(idOrPath) ? idOrPath : join(process.cwd(), idOrPath))
    : join(CATALOG_EXAMPLES, `${idOrPath}.json`);
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
  const v = entry.layout.variants;
  const t = entry.tokens || {};
  const RADIUS_MAP = { sharp: 'sharp', sm: 'sharp', md: 'moderate', lg: 'rounded', pill: 'full' };
  const DENSITY = { airy: { sectionSpacing: 'airy', contentDensity: 'default' }, balanced: { sectionSpacing: 'default', contentDensity: 'default' }, dense: { sectionSpacing: 'compact', contentDensity: 'tight' } };

  dna.designTokens = {
    ...(dna.designTokens || {}),
    // Layout — the entry's hand-curated bundle
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
  return dna;
}

export default { loadReferenceEntry, applyReferenceToBrandDna, applyReferenceToDirector };
