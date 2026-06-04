/**
 * Step 6 — Assemble Layout (orchestrator).
 *
 * Reconciles the three CLEAN inputs into one render-ready layout decision:
 *   • content-plan  (Step 5) — authoritative for WHICH sections/pages exist
 *   • brand-dna     (Step 4) — authoritative for the VISUAL SYSTEM (color, type,
 *                              radius, card/elevation, border)
 *   • images.items[] (Step 1/2) — bound to pages via the deterministic guardrail
 *
 * Ownership boundary (the whole point of the reconciliation):
 *   - brand-dna  → color, fonts, radius, cardTreatment, borderTreatment   (NOT the director's call)
 *   - content-plan → the set of sections that may appear                  (NOT re-guessed from raw silver)
 *   - director   → ONLY section ORDER + per-section VARIANT + archetype   (intelligent execution / diversity)
 *
 * The director (runCreativeDirector) is reused as the intelligent layout engine;
 * we feed it clean inputs and then post-process its output to enforce the
 * boundary above. Nothing here fabricates content or overrides brand decisions.
 */
import { runCreativeDirector } from '../ai-director.js';
import { bindImages } from './bind-images.js';
import { brandDnaToTokens, applyBrandToMerged } from './brand-tokens.js';

const CORE = ['hero', 'services', 'cta'];

// content-plan section type → director section key (null = not a standalone layout section)
const SECTION_MAP = {
  hero: 'hero',
  intro: null,                 // folds into hero/about copy
  'services-overview': 'services',
  'doctor-intro': 'doctor-intro',
  providers: 'doctor-intro',
  testimonials: 'reviews',
  stats: 'stat-bar',
  cta: 'cta',
};

export function activeProviders(merged) {
  const docs = merged.doctors || (merged.doctor ? [merged.doctor] : []);
  return docs.filter((d) => !/retir|departing|leaving|emeritus/i.test(d.statusNote || ''));
}

/** Sections that content-plan's HOME page supports, plus image-driven gallery. */
export function availableSections(contentPlan, binding) {
  const home = (contentPlan.pages || []).find((p) => p.role === 'home');
  const set = new Set();
  for (const s of home?.sections || []) {
    const k = SECTION_MAP[s.type];
    if (k) set.add(k);
  }
  if ((binding?.globals?.gallery?.length || 0) >= 4) set.add('gallery');
  return set;
}

/** Map brand-dna into the director's `brandBrief` shape (soft creative anchor). */
function brandDnaToBrief(brandDna, tokens, merged) {
  const c = brandDna.color || {};
  const radiusToCardRadius = { sharp: 'rounded-none', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-xl', pill: 'rounded-full' };
  const density = ['airy', 'balanced', 'dense'].includes(merged?.currentDesign?.spacingDensity)
    ? merged.currentDesign.spacingDensity : 'balanced';
  return {
    mood: (Array.isArray(merged?.currentDesign?.mood) ? merged.currentDesign.mood.join(', ') : '') || (brandDna.rationale || '').slice(0, 120),
    palette: { primary: c.primary, secondary: c.secondary, accent: c.accent },
    typography: { heading: brandDna.typography?.headingFont, body: brandDna.typography?.bodyFont },
    spatial: { density, cardRadius: radiusToCardRadius[tokens.tokens.radius] || 'rounded-md' },
    motion: { transitions: 'subtle' },
    voice: {},
    rationale: brandDna.rationale || '',
    _density: density,
  };
}

export async function assembleLayout({ merged, contentPlan, brandDna, opts = {}, audit = null }) {
  if (!brandDna) throw new Error('[assemble-layout] brandDna required (Step 4 must run first)');
  if (!contentPlan) throw new Error('[assemble-layout] contentPlan required (Step 5 must run first)');

  const tokens = brandDnaToTokens(brandDna);
  const binding = bindImages(contentPlan, merged.images, { activeProviders: activeProviders(merged) });

  // Intelligent layout: section order + variants + archetype (diverse via exploration).
  const brief = brandDnaToBrief(brandDna, tokens, merged);
  const design = { mood: brief.mood, rationale: brandDna.rationale };
  const { dna, _meta } = await runCreativeDirector(merged, design, opts, brief, audit);

  // ---- Enforce ownership boundary: brand-dna owns the visual system ----------
  dna.radius = tokens.tokens.radius;
  dna.cardTreatment = tokens.tokens.cardTreatment;
  dna.borderTreatment = tokens.tokens.borderTreatment;
  dna.density = brief._density;   // spatial density is brand/observed, not the director's

  // ---- Content-plan is authoritative for WHICH sections appear ---------------
  const avail = availableSections(contentPlan, binding);
  // Keep the director's ORDER, but only for sections content-plan supports
  // (plus the always-on core); then append any supported section it dropped so
  // we never silently lose content the plan placed.
  const ordered = (dna.sectionOrder || []).filter((s) => avail.has(s) || CORE.includes(s));
  for (const s of avail) if (!ordered.includes(s)) ordered.push(s);
  for (const s of CORE) if (!ordered.includes(s)) ordered.push(s);
  dna.sectionOrder = ordered;
  dna._contentPlanSections = [...avail];

  // ---- Apply brand to merged so the injector consumes brand-dna --------------
  applyBrandToMerged(merged, brandDna);

  return { dna, brand: merged.brand, brandTokens: tokens, binding, contentPlan, meta: _meta };
}

export default assembleLayout;
