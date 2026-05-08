/**
 * derive-design-tokens.js
 *
 * Deterministic: maps Creative Director DNA + brand mood → designTokens.
 * No AI calls. Every output value is from an enum — no free-form text.
 *
 * Called at the end of runCreativeDirector() after normalizeDna().
 *
 * LAYOUT DERIVATION STRATEGY:
 * The archetype is the primary signal for layout tokens. Different archetypes
 * MUST produce different layout combinations — this is the main mechanism for
 * visual differentiation between sites. Mood / density / radius drive the
 * style tokens (corners, buttons, spacing) but NOT the structural layout.
 */

// ---------------------------------------------------------------------------
// Archetype → layout token map (primary differentiation driver)
// ---------------------------------------------------------------------------
// Two layout families:
//   "editorial"  → split hero, alternating-rows services, pull-quotes reviews
//   "classic"    → centered hero, card-grid services, card-row reviews
//
// The director is guided to pick archetypes that match practice personality
// (community/family → classic, specialist/bold → editorial). This mapping
// ensures different personality types always produce visually distinct sites.

// ---------------------------------------------------------------------------
// Archetype → full token map
// Each row defines layout structure + chrome variants + visual personality.
// This is the primary differentiation engine — different archetypes MUST
// produce different visual outputs. Two sites with different archetypes
// should be unrecognizable as coming from the same generator.
//
// Chrome variants (nav/footer/gallery) are deterministic here so the AI
// director cannot accidentally make two sites look identical by picking the
// same chrome independently.
//
// Color family + type personality are advisory signals fed into the brand
// direction phase and director prompt. They bias the palette/font selection
// without hard-overriding the AI's creative choices.
// ---------------------------------------------------------------------------
// Each archetype gets a UNIQUE combination across all 8 dimensions.
// 8 archetypes × 8 dimensions × 5+ variants per dimension = thousands of
// possible combinations, but each archetype locks one — so two sites with
// different archetypes are visually unrecognizable as same-source.
const ARCHETYPE_LAYOUT = {
  // ── Editorial / bold family (5 archetypes) ──────────────────────────────
  'editorial-asymmetric': {
    heroLayout:         'split',
    servicesLayout:     'alternating-rows',
    testimonialsLayout: 'pull-quotes',
    aboutLayout:        'full-width-card',
    ctaLayout:          'split-image',
    faqLayout:          'simple-stack',
    navVariant:         'centered-logo',
    footerVariant:      'minimal-dark',
    galleryVariant:     'editorial-2col',
    typePersonality:    'grotesque',
    colorFamily:        'cool',
  },
  'magazine-split': {
    heroLayout:         'split-offset',
    servicesLayout:     'two-col-feature',
    testimonialsLayout: 'single-featured',
    aboutLayout:        'editorial-full',
    ctaLayout:          'floating-card',
    faqLayout:          'two-column',
    navVariant:         'split-logo',
    footerVariant:      'editorial-split',
    galleryVariant:     'editorial-2col',
    typePersonality:    'grotesque',
    colorFamily:        'cool',
  },
  'poster-hero': {
    heroLayout:         'poster',
    servicesLayout:     'numbered-list',
    testimonialsLayout: 'pull-quotes',
    aboutLayout:        'split-photo',
    ctaLayout:          'centered-banner',
    faqLayout:          'simple-stack',
    navVariant:         'transparent-overlay',
    footerVariant:      'minimal-dark',
    galleryVariant:     'full-bleed-row',
    typePersonality:    'display-serif',
    colorFamily:        'cool',
  },
  'bold-serif-driven': {
    heroLayout:         'split',
    servicesLayout:     'alternating-rows',
    testimonialsLayout: 'list-testimonials',
    aboutLayout:        'full-width-card',
    ctaLayout:          'split-image',
    faqLayout:          'split-by-category',
    navVariant:         'left-logo',
    footerVariant:      'editorial-split',
    galleryVariant:     'filmstrip',
    typePersonality:    'display-serif',
    colorFamily:        'cool',
  },
  'minimal-brutalist': {
    heroLayout:         'text-only',
    servicesLayout:     'numbered-list',
    testimonialsLayout: 'single-featured',
    aboutLayout:        'minimal-text',
    ctaLayout:          'inline-minimal',
    faqLayout:          'two-column',
    navVariant:         'split-logo',
    footerVariant:      'minimal-dark',
    galleryVariant:     'editorial-2col',
    typePersonality:    'grotesque',
    colorFamily:        'neutral',
  },
  // ── Classic / warm family (3 archetypes) ────────────────────────────────
  'centered-classic': {
    heroLayout:         'centered',
    servicesLayout:     'card-grid',
    testimonialsLayout: 'card-row',
    aboutLayout:        'split-photo',
    ctaLayout:          'centered-banner',
    faqLayout:          'accordion-expandable',
    navVariant:         'left-logo',
    footerVariant:      'classic-4col',
    galleryVariant:     'masonry-3col',
    typePersonality:    'humanist-serif',
    colorFamily:        'warm',
  },
  'warm-editorial': {
    heroLayout:         'centered',
    servicesLayout:     'accordion',
    testimonialsLayout: 'list-testimonials',
    aboutLayout:        'two-col-brief',
    ctaLayout:          'two-button',
    faqLayout:          'split-by-category',
    navVariant:         'top-bar',
    footerVariant:      'editorial-split',
    galleryVariant:     'masonry-3col',
    typePersonality:    'humanist-serif',
    colorFamily:        'warm',
  },
  'card-heavy': {
    heroLayout:         'centered',
    servicesLayout:     'card-grid',
    testimonialsLayout: 'grid-mosaic',
    aboutLayout:        'split-photo',
    ctaLayout:          'two-button',
    faqLayout:          'cards-grid',
    navVariant:         'left-logo',
    footerVariant:      'bold-cta-footer',
    galleryVariant:     'featured-grid',
    typePersonality:    'humanist-serif',
    colorFamily:        'warm',
  },
};

// Fallback when archetype isn't in the map — derive from hero variant
const SPLIT_HERO_VARIANTS = new Set(['split-image', 'full-bleed', 'poster', 'asymmetric-left', 'asymmetric-right']);

function layoutFromDna(dna) {
  // Primary: use archetype if known
  if (dna.archetype && ARCHETYPE_LAYOUT[dna.archetype]) {
    return ARCHETYPE_LAYOUT[dna.archetype];
  }
  // Fallback: derive from individual variant picks (used when archetype isn't in the map)
  const heroLayout         = SPLIT_HERO_VARIANTS.has(dna.heroVariant) ? 'split' : 'centered';
  const servicesLayout     = dna.servicesVariant === 'editorial-list' ? 'alternating-rows' : 'card-grid';
  const aboutLayout        = dna.doctorVariant   === 'editorial-full' ? 'full-width-card'  : 'split-photo';
  const testimonialsLayout = (dna.archetype === 'card-heavy' || dna.density === 'dense') ? 'card-row' : 'pull-quotes';
  const ctaLayout          = dna.ctaVariant      === 'split-card'     ? 'split-image'      : 'centered-banner';
  // Default chrome to editorial family when archetype is unknown
  return {
    heroLayout, servicesLayout, aboutLayout, testimonialsLayout, ctaLayout,
    faqLayout: 'accordion-expandable',
    navVariant: 'left-logo', footerVariant: 'editorial-split', galleryVariant: 'masonry-3col',
    typePersonality: 'humanist-serif', colorFamily: 'neutral',
  };
}

// ---------------------------------------------------------------------------
// Style token mapping — brand mood → button + label style
// ---------------------------------------------------------------------------

const MOOD_PROFILES = [
  {
    keywords: ['warm', 'friendly', 'approachable', 'coastal', 'family', 'welcoming', 'cozy', 'inviting'],
    tokens: { buttonTreatment: 'filled', labelStyle: 'badge' },
  },
  {
    keywords: ['modern', 'clean', 'minimal', 'swiss', 'editorial', 'brutalist', 'stark', 'crisp'],
    tokens: { buttonTreatment: 'outline', labelStyle: 'inline' },
  },
  {
    keywords: ['premium', 'confident', 'bold', 'luxury', 'refined', 'upscale', 'elegant', 'authority'],
    tokens: { buttonTreatment: 'filled', labelStyle: 'badge' },
  },
  {
    keywords: ['clinical', 'specialist', 'precise', 'scientific', 'advanced', 'technical', 'expert'],
    tokens: { buttonTreatment: 'soft-fill', labelStyle: 'inline' },
  },
];

function moodToStyleTokens(mood = '') {
  const lower = mood.toLowerCase();
  for (const profile of MOOD_PROFILES) {
    if (profile.keywords.some(kw => lower.includes(kw))) {
      return profile.tokens;
    }
  }
  return { buttonTreatment: 'filled', labelStyle: 'inline' };
}

// ---------------------------------------------------------------------------
// Radius / density mappings
// ---------------------------------------------------------------------------

const RADIUS_MAP = {
  sharp: 'sharp',
  sm:    'sharp',
  md:    'moderate',
  lg:    'rounded',
  pill:  'full',
};

const DENSITY_MAP = {
  airy:     { sectionSpacing: 'airy',    contentDensity: 'default' },
  balanced: { sectionSpacing: 'default', contentDensity: 'default' },
  dense:    { sectionSpacing: 'compact', contentDensity: 'tight'   },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object} dna          - normalized director DNA (from normalizeDna)
 * @param {object} brandBrief   - brand direction output (.mood, .spatial.density)
 * @returns {object} designTokens
 */
export function deriveDesignTokens(dna, brandBrief = null) {
  const mood    = brandBrief?.mood || dna.writingTone || '';
  const density = brandBrief?.spatial?.density || dna.density || 'balanced';

  const layout                     = layoutFromDna(dna);
  const styleTokens                = moodToStyleTokens(mood);
  const { sectionSpacing, contentDensity } = DENSITY_MAP[density] ?? DENSITY_MAP.balanced;
  const cornerRadius               = RADIUS_MAP[dna.radius] ?? 'moderate';

  return {
    cornerRadius,
    buttonTreatment:    styleTokens.buttonTreatment,
    labelStyle:         styleTokens.labelStyle,
    sectionSpacing,
    contentDensity,
    layoutWidth:        'standard',
    heroLayout:         layout.heroLayout,
    servicesLayout:     layout.servicesLayout,
    aboutLayout:        layout.aboutLayout,
    testimonialsLayout: layout.testimonialsLayout,
    ctaLayout:          layout.ctaLayout,
    faqLayout:          layout.faqLayout,
    // Chrome variants — deterministic, overrides AI director pick
    navVariant:         layout.navVariant,
    footerVariant:      layout.footerVariant,
    galleryVariant:     layout.galleryVariant,
    // Visual personality signals (used by brand-direction + director prompt)
    typePersonality:    layout.typePersonality,
    colorFamily:        layout.colorFamily,
  };
}
