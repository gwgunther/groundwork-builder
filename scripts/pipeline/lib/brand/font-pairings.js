/**
 * Curated, seeded font pairing — the convergence-proof replacement for the
 * LLM font pick (which collapsed to one font every time: Nunito Sans, then
 * Libre Franklin — see DOWNSTREAM_IMPACT). The LLM never picks a raw font off a
 * list (that always anchors to its priors). Instead:
 *
 *   1. classify the practice's TYPE CHARACTER from the OBSERVED currentDesign
 *      (grounded in reality → elevated-not-reinvented),
 *   2. deterministically SEED a pick within that character's curated, vetted,
 *      pre-PAIRED set (per-practice hash → reproducible + varied across practices).
 *
 * fontjoy's *concept* (contrast + harmony, body legible) guided the curation;
 * its stale 2018 vectors are not used. All faces are current Google Fonts,
 * heading distinctive, body readable and complementary (not echoing the heading).
 */

// Curated pairings by type-character bucket. Each: distinctive heading + a
// complementary, highly-readable body. All Google Fonts (the injector builds a
// Google Fonts URL from these names). Multiple per bucket → seeded variety.
export const PAIRINGS = {
  // Warm, literary, humanist serif headings.
  'editorial-serif': [
    { heading: 'Fraunces', body: 'Source Sans 3' },
    { heading: 'Newsreader', body: 'Public Sans' },
    { heading: 'Spectral', body: 'Work Sans' },
    { heading: 'Source Serif 4', body: 'Karla' },
  ],
  // Elegant, high-contrast display serif — cosmetic / premium register.
  'display-serif': [
    { heading: 'Cormorant Garamond', body: 'Mulish' },
    { heading: 'Playfair Display', body: 'Figtree' },
    { heading: 'Marcellus', body: 'Karla' },
    { heading: 'DM Serif Display', body: 'Libre Franklin' },
  ],
  // Confident, modern grotesque sans headings.
  'modern-grotesque': [
    { heading: 'Bricolage Grotesque', body: 'IBM Plex Sans' },
    { heading: 'Space Grotesk', body: 'Libre Franklin' },
    { heading: 'Schibsted Grotesk', body: 'Albert Sans' },
    { heading: 'Hanken Grotesk', body: 'Mulish' },
  ],
  // Friendly, approachable geometric/humanist sans — pediatric / community.
  'geometric-clean': [
    { heading: 'Sora', body: 'Figtree' },
    { heading: 'Manrope', body: 'Mulish' },
    { heading: 'Epilogue', body: 'Public Sans' },
    { heading: 'Albert Sans', body: 'Work Sans' },
  ],
  // Classic, established, warm-professional — traditional trust register.
  'humanist-trust': [
    { heading: 'Lora', body: 'Source Sans 3' },
    { heading: 'Bitter', body: 'Karla' },
    { heading: 'Source Serif 4', body: 'Work Sans' },
    { heading: 'Spectral', body: 'Mulish' },
  ],
};

const SERIF_BUCKETS = ['editorial-serif', 'display-serif', 'humanist-trust'];
const SANS_BUCKETS = ['modern-grotesque', 'geometric-clean'];

/** Deterministic 32-bit hash (reproducible across runs — no Math.random). */
function hash(str) {
  let h = 0;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Classify the practice's type-character bucket from the OBSERVED currentDesign,
 * so the elevated fonts stay true to the practice's existing character.
 */
export function classifyTypeBucket(currentDesign = {}) {
  const t = currentDesign.typography || {};
  const mood = (Array.isArray(currentDesign.mood) ? currentDesign.mood.join(' ') : '').toLowerCase();
  const headStr = `${t.headingFont || ''} ${t.headingStyle || ''}`.toLowerCase();
  const isSerif = /serif|garamond|times|georgia|playfair|caslon|cormorant|baskerville/.test(headStr)
    && !/sans/.test(headStr);

  if (isSerif) {
    if (/eleg|luxur|sophist|fashion|cosmet|upscale|refined|glam/.test(mood)) return 'display-serif';
    if (/warm|editorial|literary|boutique|artisan|craft/.test(mood)) return 'editorial-serif';
    return 'humanist-trust';
  }
  // sans-leaning
  if (/modern|bold|confident|sleek|tech|minimal|contemporary/.test(mood)) return 'modern-grotesque';
  return 'geometric-clean';
}

/**
 * Pick a vetted pairing for this practice: observed character → bucket, then a
 * per-practice seed selects within the bucket (deterministic + varied).
 * Returns { headingFont, bodyFont, bucket }.
 */
export function pickFontPairing(currentDesign = {}, seedKey = '') {
  const bucket = classifyTypeBucket(currentDesign);
  const options = PAIRINGS[bucket] || PAIRINGS['humanist-trust'];
  const pair = options[hash(seedKey) % options.length];
  return { headingFont: pair.heading, bodyFont: pair.body, bucket };
}

export default pickFontPairing;
