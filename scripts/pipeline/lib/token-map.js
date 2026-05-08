/**
 * token-map.js — Vocabulary of valid Tailwind class mappings for every design DNA token.
 *
 * Included in the generate skill's prompt so the AI never hallucinates class names.
 * Export: buildTokenContext(dna) → markdown string
 */

// ---------------------------------------------------------------------------
// Density → padding / gap / spacing
// ---------------------------------------------------------------------------
const DENSITY_MAP = {
  airy: {
    sectionPad: 'py-24 md:py-32',
    innerGap:   'gap-16',
    textSpacing: 'space-y-6',
  },
  balanced: {
    sectionPad: 'py-16 md:py-24',
    innerGap:   'gap-10',
    textSpacing: 'space-y-4',
  },
  dense: {
    sectionPad: 'py-10 md:py-16',
    innerGap:   'gap-6',
    textSpacing: 'space-y-3',
  },
};

// ---------------------------------------------------------------------------
// Radius → border-radius classes
// ---------------------------------------------------------------------------
const RADIUS_MAP = {
  sharp: { btn: 'rounded-none', card: 'rounded-none', input: 'rounded-none' },
  sm:    { btn: 'rounded',      card: 'rounded',      input: 'rounded' },
  md:    { btn: 'rounded-lg',   card: 'rounded-xl',   input: 'rounded-md' },
  lg:    { btn: 'rounded-2xl',  card: 'rounded-2xl',  input: 'rounded-xl' },
  pill:  { btn: 'rounded-full', card: 'rounded-3xl',  input: 'rounded-full' },
};

// ---------------------------------------------------------------------------
// Card treatment → border + shadow combos
// ---------------------------------------------------------------------------
const CARD_MAP = {
  'bordered-flat': 'border border-neutral-200 bg-white shadow-none',
  'soft-shadow':   'border-0 bg-white shadow-md',
  'elevated':      'border-0 bg-white shadow-xl',
  'ghost':         'border border-transparent bg-neutral-50 shadow-none',
};

// ---------------------------------------------------------------------------
// Motion → transition classes
// ---------------------------------------------------------------------------
const MOTION_MAP = {
  none:       '',
  subtle:     'transition-colors duration-200',
  expressive: 'transition-all duration-300 ease-out',
};

// ---------------------------------------------------------------------------
// Heading scale → font-size classes for h1/h2/h3
// ---------------------------------------------------------------------------
const HEADING_SCALE_MAP = {
  dramatic: {
    h1: 'text-5xl md:text-7xl lg:text-8xl font-bold leading-none',
    h2: 'text-3xl md:text-5xl font-bold leading-tight',
    h3: 'text-xl md:text-2xl font-semibold',
  },
  moderate: {
    h1: 'text-4xl md:text-5xl lg:text-6xl font-bold leading-tight',
    h2: 'text-2xl md:text-4xl font-bold leading-snug',
    h3: 'text-xl md:text-2xl font-semibold',
  },
  restrained: {
    h1: 'text-3xl md:text-4xl font-semibold leading-snug',
    h2: 'text-xl md:text-2xl font-semibold leading-snug',
    h3: 'text-base md:text-lg font-semibold',
  },
};

// ---------------------------------------------------------------------------
// Section divider → separator between sections
// ---------------------------------------------------------------------------
const DIVIDER_MAP = {
  none:         '(no divider — sections flow directly)',
  line:         'border-t border-neutral-200',
  space:        'mt-0 (rely on section padding alone)',
  'color-shift': 'alternate section bg between bg-white and bg-neutral-50',
};

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

/**
 * Try to extract a meaningful palette label from dna.colorPalette string
 * or dna.colors object. Returns an object with keys: primary, secondary, etc.
 */
function resolveColors(dna) {
  if (dna.colors && typeof dna.colors === 'object') {
    return dna.colors;
  }
  // colorPalette is a descriptive string like "primary: #2D6E7E, secondary: #F4A261"
  // We don't try to parse hex values — we surface the Tailwind token names instead.
  return null;
}

// ---------------------------------------------------------------------------
// Font resolution
// ---------------------------------------------------------------------------

function resolveFonts(dna) {
  // design phase may have injected typographyScale
  if (dna.typographyScale) {
    const match = dna.typographyScale.match(/^([^(]+)\s*\(display\)\s*\/\s*([^(—]+)\s*\(body\)/);
    if (match) {
      return { heading: match[1].trim(), body: match[2].trim() };
    }
  }
  return { heading: 'font-serif', body: 'font-sans' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a markdown token-context string for inclusion in the generate prompt.
 * @param {object} dna - the design DNA object
 * @returns {string} markdown
 */
export function buildTokenContext(dna) {
  const density    = DENSITY_MAP[dna.density]     || DENSITY_MAP.balanced;
  const radius     = RADIUS_MAP[dna.radius]        || RADIUS_MAP.md;
  const card       = CARD_MAP[dna.cardTreatment]   || CARD_MAP['bordered-flat'];
  const motion     = MOTION_MAP[dna.motion]        || MOTION_MAP.subtle;
  const heading    = HEADING_SCALE_MAP[dna.headingScale] || HEADING_SCALE_MAP.moderate;
  const divider    = DIVIDER_MAP[dna.sectionDivider] || DIVIDER_MAP.space;
  const colors     = resolveColors(dna);
  const fonts      = resolveFonts(dna);

  const colorBlock = colors
    ? Object.entries(colors).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
    : `  - brand-primary: use Tailwind class \`text-brand-primary\` / \`bg-brand-primary\`
  - brand-secondary: use Tailwind class \`text-brand-secondary\` / \`bg-brand-secondary\`
  (actual hex values are in tailwind.config.mjs — use token names only, never hardcode hex)`;

  const motionNote = motion
    ? `\`${motion}\``
    : '(no transitions — motion is set to none)';

  return `## Design Token Classes (use ONLY these classes — no others)

**Section padding:** \`${density.sectionPad}\`
**Inner gap:** \`${density.innerGap}\`
**Text spacing:** \`${density.textSpacing}\`

**Buttons:** \`bg-brand-primary text-white ${radius.btn} px-8 py-3 font-medium hover:opacity-90 ${motion}\`
**Secondary button:** \`border border-brand-primary text-brand-primary ${radius.btn} px-8 py-3 font-medium hover:bg-brand-primary/10 ${motion}\`

**Cards:** \`${card} ${radius.card} p-6\`

**Inputs:** \`border border-neutral-300 ${radius.input} px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary\`

**H1:** \`font-serif ${heading.h1}\`
**H2:** \`font-serif ${heading.h2}\`
**H3:** \`font-serif ${heading.h3}\`
**Body:** \`text-base leading-relaxed text-neutral-700\`
**Small/label:** \`text-sm font-semibold uppercase tracking-widest\`

**Transitions:** ${motionNote}

**Section divider:** ${divider}

**Typography:**
  - Headings: \`${fonts.heading}\` (maps to the project's serif stack)
  - Body: \`${fonts.body}\` (maps to the project's sans stack)

**Colors:**
${colorBlock}

**Neutral palette (always available):**
  - \`text-neutral-900\` (near black)
  - \`text-neutral-700\` (body text)
  - \`text-neutral-500\` (muted)
  - \`bg-neutral-50\` (off-white section background)
  - \`bg-white\` (white)
  - \`border-neutral-200\` (light border)

**Do NOT use:** arbitrary values like \`text-[#2D6E7E]\`, \`p-[42px]\`, \`bg-[--color]\`. Use only the named tokens above.
`.trim();
}
