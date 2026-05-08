/**
 * ai-molecules.js — Brand Molecule Library (Atomic Design Stage 2)
 *
 * Takes the locked DNA tokens from Stage 1 (ai-director + ai-design) and
 * produces concrete HTML/Tailwind component snippets that EVERY section
 * generator receives verbatim.
 *
 * This is a pure deterministic function — no API call. Creativity happened
 * in Stage 1. Here we crystallize tokens into reusable building blocks so
 * that all six generated sections share identical button shapes, card styles,
 * heading sizes, and spacing — producing a visually cohesive site.
 */

// ---------------------------------------------------------------------------
// Token maps (mirrors token-map.js intentionally — single source of truth
// for what each DNA value means in concrete Tailwind classes)
// ---------------------------------------------------------------------------

const RADIUS_BTN = {
  sharp: 'rounded-none',
  sm:    'rounded',
  md:    'rounded-lg',
  lg:    'rounded-2xl',
  pill:  'rounded-full',
};

const RADIUS_CARD = {
  sharp: 'rounded-none',
  sm:    'rounded',
  md:    'rounded-xl',
  lg:    'rounded-2xl',
  pill:  'rounded-3xl',
};

const PADDING_BTN = {
  airy:    'px-8 py-4',
  balanced:'px-6 py-3',
  dense:   'px-5 py-2.5',
};

const CARD_STYLE = {
  'bordered-flat': 'border border-neutral-200 bg-white shadow-none',
  'soft-shadow':   'bg-white shadow-md',
  'elevated':      'bg-white shadow-xl',
  'ghost':         'bg-neutral-50',
};

const MOTION = {
  none:       '',
  subtle:     'transition-all duration-200',
  expressive: 'transition-all duration-300 ease-out',
};

const SECTION_PAD = {
  airy:    'py-24 md:py-32',
  balanced:'py-16 md:py-24',
  dense:   'py-10 md:py-16',
};

const HEADING = {
  dramatic: {
    h1: 'text-5xl md:text-7xl font-bold leading-none tracking-tight',
    h2: 'text-3xl md:text-5xl font-bold leading-tight tracking-tight',
    h3: 'text-xl md:text-2xl font-semibold leading-snug',
  },
  moderate: {
    h1: 'text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight',
    h2: 'text-2xl md:text-4xl font-bold leading-snug tracking-tight',
    h3: 'text-xl md:text-2xl font-semibold leading-snug',
  },
  restrained: {
    h1: 'text-3xl md:text-4xl font-semibold leading-snug',
    h2: 'text-xl md:text-2xl font-semibold leading-snug',
    h3: 'text-base md:text-lg font-semibold',
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the molecule library from design DNA.
 * Returns a plain object with token strings and a prompt-ready description.
 *
 * @param {object} dna - Design DNA from ai-director
 * @returns {object} molecules
 */
export function buildMolecules(dna) {
  const btnRadius  = RADIUS_BTN[dna.radius]         || RADIUS_BTN.md;
  const cardRadius = RADIUS_CARD[dna.radius]         || RADIUS_CARD.md;
  const btnPad     = PADDING_BTN[dna.density]        || PADDING_BTN.balanced;
  const cardStyle  = CARD_STYLE[dna.cardTreatment]   || CARD_STYLE['bordered-flat'];
  const motion     = MOTION[dna.motion]              || MOTION.subtle;
  const sectionPad = SECTION_PAD[dna.density]        || SECTION_PAD.balanced;
  const headings   = HEADING[dna.headingScale]       || HEADING.moderate;

  // Concrete class strings — these are what goes in class="" attributes
  const tokens = {
    primaryBtn:   `inline-block bg-brand-primary text-white font-semibold ${btnPad} ${btnRadius} ${motion} text-center hover:opacity-90`,
    ghostBtn:     `inline-block border border-brand-primary text-brand-primary font-semibold ${btnPad} ${btnRadius} ${motion} text-center hover:bg-brand-primary hover:text-white`,
    card:         `${cardRadius} ${cardStyle} p-6`,
    sectionPad,
    h1:           `font-serif ${headings.h1}`,
    h2:           `font-serif ${headings.h2}`,
    h3:           `font-serif ${headings.h3}`,
    eyebrow:      'text-sm font-semibold uppercase tracking-widest text-brand-primary',
    body:         'text-base leading-relaxed text-neutral-700',
    link:         `text-brand-primary font-medium underline-offset-2 hover:underline ${motion}`,
  };

  return {
    tokens,
    prompt: buildMoleculePrompt(tokens, dna),
  };
}

// ---------------------------------------------------------------------------
// Prompt string
// ---------------------------------------------------------------------------

function buildMoleculePrompt(tokens, dna) {
  return `## Molecule Library — USE THESE EXACT CLASSES
Every section in this build shares the same component language.
Do NOT invent alternative button shapes, card styles, or heading sizes.
Copy these class strings exactly — they encode the design DNA.

**Primary button** (Book Appointment, main CTAs):
\`class="${tokens.primaryBtn}"\`

**Ghost/secondary button** (View Services, secondary actions):
\`class="${tokens.ghostBtn}"\`

**Card container** (service cards, feature blocks):
\`class="${tokens.card}"\`

**Section wrapper** (every section's outer element):
\`class="w-full ${tokens.sectionPad}"\`

**H1 — hero headline:**
\`class="${tokens.h1} text-neutral-dark"\`

**H2 — section heading:**
\`class="${tokens.h2} text-neutral-dark"\`

**H3 — card/sub heading:**
\`class="${tokens.h3} text-neutral-dark"\`

**Eyebrow label** (small uppercase text above headings):
\`class="${tokens.eyebrow}"\`

**Body text:**
\`class="${tokens.body}"\`

**Inline link:**
\`class="${tokens.link}"\`

Design DNA summary: archetype=${dna.archetype}, radius=${dna.radius}, density=${dna.density}, cardTreatment=${dna.cardTreatment}, motion=${dna.motion || 'subtle'}.
Do NOT use arbitrary Tailwind values like \`text-[#2D6E7E]\`, \`p-[42px]\`, or \`rounded-[8px]\`.
Use \`brand-primary\` and \`brand-secondary\` token names — never hardcode hex values.`;
}
