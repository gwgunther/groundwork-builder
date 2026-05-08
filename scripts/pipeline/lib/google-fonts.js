/**
 * google-fonts.js — Font catalog + diversity enforcement for the design step.
 *
 * Provides mood-tagged font candidates, tracks used pairs to prevent repeats.
 * Uses a curated catalog (no external API required — avoids rate limits).
 * Optionally fetches from Google Fonts API if GOOGLE_FONTS_API_KEY is set.
 */

// Full curated catalog organized by visual style
const FONT_CATALOG = {
  heading: {
    serif: [
      'Cormorant Garamond', 'Libre Baskerville', 'Fraunces', 'DM Serif Display',
      'Lora', 'Spectral', 'Merriweather', 'Bitter', 'Crimson Pro',
      'EB Garamond', 'Vollkorn', 'Cardo', 'Domine', 'PT Serif', 'Sorts Mill Goudy',
      'Neuton', 'Josefin Slab', 'Playfair Display', 'Bodoni Moda', 'Lustria',
    ],
    display: [
      'Abril Fatface', 'Bebas Neue', 'Raleway', 'Josefin Sans', 'Outfit',
      'Syne', 'Space Grotesk', 'Urbanist', 'Exo 2', 'Kanit',
      'Montserrat', 'Nunito Sans', 'Lexend', 'Quicksand',
    ],
    slab: [
      'Zilla Slab', 'Roboto Slab', 'Arvo', 'Crete Round', 'Rockwell Nova',
      'Glegoo', 'Rokkitt', 'Solway', 'Ovo', 'Copse',
    ],
    grotesque: [
      'Plus Jakarta Sans', 'DM Sans', 'Inter', 'Work Sans',
      'Karla', 'Manrope', 'Figtree', 'Nunito',
    ],
  },
  body: {
    neutral: [
      'Inter', 'DM Sans', 'Plus Jakarta Sans', 'Source Sans 3',
      'Work Sans', 'Nunito', 'Lato', 'Open Sans', 'Rubik',
    ],
    humanist: [
      'Karla', 'Manrope', 'Figtree', 'Mulish', 'Questrial',
      'Hind', 'Muli', 'Jost',
    ],
    geometric: [
      'Poppins', 'Outfit', 'Nunito', 'Urbanist', 'Lexend',
    ],
    warm: [
      'Nunito', 'Quicksand', 'Varela Round', 'Comfortaa',
    ],
  },
};

// Mood → which heading + body styles to draw from
const MOOD_STYLES = {
  'calm':      { heading: ['serif'],                   body: ['neutral', 'humanist'] },
  'refined':   { heading: ['serif', 'display'],        body: ['neutral'] },
  'editorial': { heading: ['slab', 'grotesque'],       body: ['neutral', 'humanist'] },
  'bold':      { heading: ['display', 'slab'],         body: ['neutral', 'geometric'] },
  'warm':      { heading: ['serif', 'display'],        body: ['humanist', 'warm'] },
  'clinical':  { heading: ['grotesque'],               body: ['neutral'] },
  'luxury':    { heading: ['serif', 'display'],        body: ['neutral'] },
};

// Known overused pairs to avoid
const AVOID_PAIRS = new Set([
  'Fraunces/Figtree',
  'Playfair Display/Lato',
  'Montserrat/Open Sans',
  'Bebas Neue/Open Sans',
  'Raleway/Lato',
  'Josefin Sans/Lato',
]);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Get font candidates for a given mood, excluding recently-used pairs.
 * Returns lists of 10-14 heading options and 8-10 body options.
 */
export function getFontCandidates(mood = 'calm', usedPairs = []) {
  const moodKey = Object.keys(MOOD_STYLES).find(k => mood.toLowerCase().includes(k)) || 'calm';
  const styles  = MOOD_STYLES[moodKey];

  const usedHeadings = new Set(usedPairs.map(p => p.split('/')[0]).filter(Boolean));
  const usedBodies   = new Set(usedPairs.map(p => p.split('/')[1]).filter(Boolean));

  const headings = shuffle([
    ...new Set(styles.heading.flatMap(s => FONT_CATALOG.heading[s] || []))
  ]).filter(f => !usedHeadings.has(f));

  const bodies = shuffle([
    ...new Set(styles.body.flatMap(s => FONT_CATALOG.body[s] || []))
  ]).filter(f => !usedBodies.has(f));

  return {
    headingOptions: headings.slice(0, 14),
    bodyOptions:    bodies.slice(0, 10),
    avoidPairs:     [...AVOID_PAIRS, ...usedPairs].slice(0, 20),
    moodUsed:       moodKey,
  };
}

/**
 * Extract font pair string from a design fingerprint.
 * Returns "HeadingFont/BodyFont" or null.
 */
export function extractFontPair(fingerprint) {
  const heading = fingerprint?.type?.display || fingerprint?.type?.heading || null;
  const body    = fingerprint?.type?.body    || null;
  if (!heading || !body) return null;
  return `${heading}/${body}`;
}
