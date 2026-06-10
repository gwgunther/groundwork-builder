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
// complementary, highly-readable body. Two providers (the injector builds the
// matching CSS URL per pairing):
//   - google    (default when `provider` is absent) — fonts.googleapis.com
//   - fontshare — api.fontshare.com (ITF Free Font License: free commercial
//     use + web embedding + self-hosting; cannot be resold/redistributed
//     standalone). Fontshare faces are the premium-indie tier — they resist
//     the AI slop-convergence pool AND substitute proprietary reference faces
//     far better (Switzer is a Suisse Intl homage; General Sans/Satoshi are
//     the canonical anti-Inter grotesques).
// A pairing is SINGLE-provider (heading+body from the same service) so one
// <link> serves both. Multiple per bucket → seeded variety.
export const PAIRINGS = {
  // Warm, literary, humanist serif headings.
  'editorial-serif': [
    { heading: 'Fraunces', body: 'Source Sans 3' },
    { heading: 'Newsreader', body: 'Public Sans' },
    { heading: 'Spectral', body: 'Work Sans' },
    { heading: 'Source Serif 4', body: 'Karla' },
    { heading: 'Sentient', body: 'Supreme', provider: 'fontshare' },
    { heading: 'Erode', body: 'Synonym', provider: 'fontshare' },
  ],
  // Elegant, high-contrast display serif — cosmetic / premium register.
  'display-serif': [
    { heading: 'Cormorant Garamond', body: 'Mulish' },
    { heading: 'Playfair Display', body: 'Figtree' },
    { heading: 'Marcellus', body: 'Karla' },
    { heading: 'DM Serif Display', body: 'Libre Franklin' },
    { heading: 'Zodiak', body: 'Supreme', provider: 'fontshare' },
    { heading: 'Boska', body: 'Synonym', provider: 'fontshare' },
  ],
  // Confident, modern grotesque sans headings.
  'modern-grotesque': [
    { heading: 'Bricolage Grotesque', body: 'IBM Plex Sans' },
    { heading: 'Space Grotesk', body: 'Libre Franklin' },
    { heading: 'Schibsted Grotesk', body: 'Albert Sans' },
    { heading: 'Hanken Grotesk', body: 'Mulish' },
    { heading: 'Switzer', body: 'Synonym', provider: 'fontshare' },   // Suisse Intl homage
    { heading: 'General Sans', body: 'Supreme', provider: 'fontshare' },
    { heading: 'Cabinet Grotesk', body: 'Satoshi', provider: 'fontshare' },
  ],
  // Friendly, approachable geometric/humanist sans — pediatric / community.
  'geometric-clean': [
    { heading: 'Sora', body: 'Figtree' },
    { heading: 'Manrope', body: 'Mulish' },
    { heading: 'Epilogue', body: 'Public Sans' },
    { heading: 'Albert Sans', body: 'Work Sans' },
    { heading: 'Satoshi', body: 'Synonym', provider: 'fontshare' },
    { heading: 'Chillax', body: 'Supreme', provider: 'fontshare' },
  ],
  // Classic, established, warm-professional — traditional trust register.
  'humanist-trust': [
    { heading: 'Lora', body: 'Source Sans 3' },
    { heading: 'Bitter', body: 'Karla' },
    { heading: 'Source Serif 4', body: 'Work Sans' },
    { heading: 'Spectral', body: 'Mulish' },
    { heading: 'Gambetta', body: 'Supreme', provider: 'fontshare' },
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
  const cd = currentDesign || {};
  const t = cd.typography || {};
  const mood = (Array.isArray(cd.mood) ? cd.mood.join(' ') : '').toLowerCase();
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
 * Returns { headingFont, bodyFont, bucket, provider }.
 */
export function pickFontPairing(currentDesign = {}, seedKey = '') {
  const bucket = classifyTypeBucket(currentDesign);
  const options = PAIRINGS[bucket] || PAIRINGS['humanist-trust'];
  const pair = options[hash(seedKey) % options.length];
  return { headingFont: pair.heading, bodyFont: pair.body, bucket, provider: pair.provider || 'google' };
}

export default pickFontPairing;
