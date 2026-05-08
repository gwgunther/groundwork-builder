/**
 * Phase 2c: AI Brand Direction
 *
 * Takes the extracted design signals (palette, fonts, mood from existing site)
 * and practice data, then produces a deliberate brand guidelines brief for the
 * NEW site — grounded in Impeccable design principles rather than just general
 * AI intuition.
 *
 * This replaces the "direction-setting" half of ai-design.js. Design Mapping
 * becomes pure extraction; Brand Direction is where creative decisions are made.
 *
 * Input:  design (extraction output), merged (practice data), audit
 * Output: brandBrief — { palette, typography, spatial, motion, voice, rationale }
 *
 * The Creative Director receives brandBrief + IA and synthesizes them into DNA.
 */

import { getFontCandidates } from './google-fonts.js';
import { getPalettesForMood, formatPaletteOptions } from './palette-library.js';
import { getReferences } from './impeccable.js';

// Impeccable reference sections relevant to brand direction
const BRAND_REF_SECTIONS = ['hero', 'cta', 'services', 'doctor-intro'];

/**
 * Run AI brand direction.
 *
 * @param {object} design   - Design Extract phase output (Phase 2c).
 *                            Shape: { existingPalette, existingFonts, mood, brandStrength,
 *                                     brandStrengthRationale, evolutionSignal, rationale }
 *                            Falls back to flat { palette, fonts } for legacy compatibility.
 * @param {object} merged   - Merged practice data (silver + intake).
 *                            Reads: practice, doctor, address, signals/differentiators.
 * @param {object} audit    - Site Audit output (Phase 2b), may be null.
 *                            Reads: positioning.recommended, tone.recommended, differentiators[].
 * @param {object} [opts]
 * @param {boolean} [opts.verbose] - Log prompt length + truncated raw response
 * @returns {object|null}   Brand brief, or null if skipped (no API key or failure).
 *                          Shape: { palette, typography, spatial, motion, voice, mood,
 *                                   rationale, paletteSource, contrastCheck }
 */
export async function runBrandDirection(design, merged, audit, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Load Impeccable references via shared loader (cached, handles missing gracefully)
  let impeccableContext = '';
  try {
    const refs = await getReferences(BRAND_REF_SECTIONS);
    if (refs) impeccableContext = `## Design Principles (Impeccable Reference)\n\n${refs}`;
  } catch { /* non-fatal — brand direction continues without Impeccable context */ }

  // Get recently-used font pairs to enforce diversity across builds
  let usedFontPairs = [];
  try {
    const { sampleLibrary } = await import('./distill-design.js');
    const { extractFontPair } = await import('./google-fonts.js');
    const lib = await sampleLibrary();
    usedFontPairs = [...lib.own, ...lib.inspo].map(fp => extractFontPair(fp)).filter(Boolean);
  } catch { /* non-fatal */ }

  const moodHint   = audit?.tone?.recommended || design?.mood || 'calm';
  const fontCands  = getFontCandidates(moodHint, usedFontPairs);
  const palettes   = getPalettesForMood(moodHint, 6);
  const paletteBlock = formatPaletteOptions(palettes);

  // Brand extraction signals from Phase 2c
  const brandStrength    = design?.brandStrength    || 'unknown';
  const evolutionSignal  = design?.evolutionSignal  || 'rebuild';
  const existingColors   = design?.existingPalette
    ? Object.entries(design.existingPalette).filter(([k, v]) => v && k !== 'raw').map(([k, v]) => `${k}: ${v}`).join(', ')
    : (design?.palette ? Object.values(design.palette).filter(Boolean).join(', ') : '(none detected)');
  const existingFonts = design?.existingFonts
    ? `heading: ${design.existingFonts.heading || '?'}, body: ${design.existingFonts.body || '?'}`
    : (design?.fonts ? `heading: ${design.fonts.heading || '?'}, body: ${design.fonts.body || '?'}` : '(none detected)');
  const brandRationale   = design?.brandStrengthRationale || design?.rationale || '';

  const practice    = merged?.practice?.name  || 'the practice';
  const doctor      = merged?.doctor?.name    || null;
  const city        = merged?.address?.city   || '';
  const state       = merged?.address?.state  || '';
  // X1: silver renamed signals → differentiators. Accept both for back-compat.
  const differentiatorList = merged?.differentiators || merged?.signals || [];
  const differentiatorBullets = differentiatorList
    .map(s => `• ${s.type}: ${s.label || s.description}`)
    .join('\n') || '(none)';
  const positioning = audit?.positioning?.recommended || 'trusted local dental practice';
  const tone        = audit?.tone?.recommended        || 'calm, professional, approachable';
  const auditDifferentiators = (audit?.differentiators || []).map(d => `• ${d}`).join('\n') || '(none)';

  // Derive color temperature signal from positioning/tone
  // This biases palette selection toward warm or cool before archetype is known.
  const positioningLower = (positioning + ' ' + tone).toLowerCase();
  // Audit's tone is now constrained to enum: warm | clinical | editorial | bold | refined.
  // Map editorial/bold/refined/clinical → specialist (cool palette + grotesque type);
  // map warm → family (warm palette + humanist serif).
  const isSpecialistSignal = /\b(clinical|editorial|bold|refined)\b|specialist|ortho|implant|cosmetic|premium|luxury|urban|upscal|expert|precise/.test(positioningLower);
  const isWarmFamilySignal = /\bwarm\b|family|community|general|accessible|friendly|approachable|welcoming|neighborhood|local/.test(positioningLower);
  const colorTempGuidance = isSpecialistSignal
    ? `\n## Color Temperature Guidance\nThis practice's positioning signals a SPECIALIST or PREMIUM brand. Prefer a COOL palette — navy, charcoal, steel blue, slate, muted forest green, or cool gray. Avoid terracotta, warm amber, or earthy reds — those read as a family/community practice and will feel tonally wrong for a specialist.`
    : isWarmFamilySignal
    ? `\n## Color Temperature Guidance\nThis practice's positioning signals a FAMILY or COMMUNITY brand. Prefer a WARM palette — sage, soft terracotta, warm white, earth tones, or muted amber. Avoid cold navy or stark charcoal — those feel too clinical and distant for this type of practice.`
    : '';

  // Brand strategy instruction based on extraction signal
  const strategyInstruction = evolutionSignal === 'evolve'
    ? `The extraction phase assessed this brand as **${brandStrength}** and recommends EVOLVING it.
Preserve what is working. Modernize what isn't. Keep the strongest existing colors as seeds.
Do not wholesale replace if they're distinctive. ${brandRationale}`
    : `The extraction phase assessed this brand as **${brandStrength}** and recommends STARTING FRESH.
The existing brand is too weak, generic, or inconsistent to be worth preserving.
Create a strong, specific brand direction from scratch — grounded in THIS practice's character, not generic dental aesthetics.
${brandRationale}`;

  const prompt = `You are a senior brand designer creating guidelines for a dental practice website redesign.

Your decisions must be grounded in the design principles provided — not generic AI taste.
Produce brand guidelines that feel SPECIFIC to this practice, not interchangeable with any other dental site.

## Practice
- Name: ${practice}
- Doctor: ${doctor || '(not specified)'}
- Location: ${city}${state ? `, ${state}` : ''}
- Positioning: ${positioning}
- Tone: ${tone}

## Practice Differentiators (from audit positioning)
${auditDifferentiators}

## Silver-extracted Differentiators (technology, awards, languages, etc.)
${differentiatorBullets}

## Existing Brand Assessment (from extraction phase)
- Colors found: ${existingColors}
- Fonts found: ${existingFonts}
- Current mood: ${design?.mood || '(unknown)'}
- Brand strength: ${brandStrength}

## Your Strategy
${strategyInstruction}

${colorTempGuidance}

## Curated Palette Options
Select one of these as your foundation. Adapt it using the existing brand colors where appropriate.

${paletteBlock}

## Font Candidates
${fontCands}

Avoid any font pair already used recently by other practices in your library.
Choose a pairing that fits the mood AND stands out — no Inter+Roboto defaults.

Typography personality to match:
${isSpecialistSignal
  ? '- SPECIALIST/BOLD personality → heading font should be a grotesque or display sans (Space Grotesk, Syne, Barlow Condensed, Cabinet Grotesk, Clash Display, Plus Jakarta Sans). Avoid warm serif faces like DM Serif Display or Playfair Display — they read as a family practice and undercut the specialist authority.'
  : isWarmFamilySignal
  ? '- FAMILY/WARM personality → heading font should be a humanist serif (DM Serif Display, Playfair Display, Cormorant Garamond, Libre Baskerville, Lora). Avoid grotesque/display sans — they feel too cold and corporate for a community-focused practice.'
  : '- Choose a font that expresses this practice\'s specific character. Serif for warmth and authority; grotesque/display for modernity and confidence.'}

${impeccableContext}

## Your Task

Produce brand guidelines for this practice's NEW website.
Think like a senior designer who has read the Impeccable principles above.

Apply them concretely:
- WCAG AA contrast at minimum — check your palette choices
- Typography scale with clear hierarchy (not just two font sizes)
- Spatial rhythm that fits the density of a dental site (not too sparse, not cluttered)
- Color application: 60/30/10 rule — which color is dominant, which is structural, which is accent?
- Emotional direction: what should a patient FEEL in the first 3 seconds on this site?

Return ONLY valid JSON:
{
  "palette": {
    "primary":   "#hex — dominant brand color (CTAs, headings, key UI elements)",
    "secondary": "#hex — structural color (borders, secondary headings)",
    "light":     "#hex — near-white background tint for alternating sections",
    "accent":    "#hex — warm highlight (icons, small details, hover states)",
    "dark":      "#hex — the darkest tone in the system, used for body text and dark surfaces (not pure #000000; tint toward the primary hue)",
    "muted":     "#hex — a mid-tone neutral used for supporting/secondary text"
  },
  "typography": {
    "heading": "Google Font name — match the personality guidance above (grotesque for specialist, humanist serif for warm/family)",
    "body":    "Google Font name — highly readable sans-serif for body copy",
    "scale": {
      "h1": "text-4xl md:text-6xl font-bold",
      "h2": "text-3xl md:text-4xl font-semibold",
      "h3": "text-xl md:text-2xl font-semibold",
      "body": "text-base md:text-lg leading-relaxed",
      "small": "text-sm"
    },
    "tracking": "tight for headings, normal for body"
  },
  "spatial": {
    "sectionPadding": "py-16 md:py-24",
    "containerWidth": "max-w-7xl",
    "cardRadius": "rounded-xl or rounded-2xl",
    "density": "airy|balanced|dense"
  },
  "motion": {
    "transitions": "duration-200 ease-out",
    "hoverElevation": "hover:shadow-md or hover:-translate-y-1",
    "pageEntrance": "brief and functional — no animation for its own sake"
  },
  "voice": {
    "headline_style": "Describe the headline approach this brand should take (outcome-led vs feature-led, formal vs conversational, etc.) — describe the approach in your own words; do NOT include any specific copy examples.",
    "cta_language": "Describe the CTA voice this brand should take (active vs passive, specific vs generic, etc.) — describe the approach; do NOT include any specific copy examples.",
    "tone_notes": "1-2 sentences on how copy should read"
  },
  "mood": "2-3 word label (e.g. 'Warm Coastal Trust', 'Modern Clinical Confidence')",
  "rationale": "3-4 sentences explaining the brand direction: what we kept from existing brand, what we evolved, why these specific choices fit this practice and not just any dental site",
  "paletteSource": "which curated palette you selected as foundation and why",
  "contrastCheck": "brief note confirming primary/dark on light passes WCAG AA"
}`;

  if (opts.verbose) {
    console.log('  [brand-direction] Prompt length:', prompt.length, 'chars');
  }

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const start  = Date.now();

    const response = await callAnthropic({
      phase:     'brand',
      model:     'claude-sonnet-4-6',
      maxTokens: 1500,
      messages:  [{ role: 'user', content: prompt }],
    });

    const text   = response.text;
    const parsed = parseJson(text);

    if (!parsed) {
      console.warn('  [brand-direction] Failed to parse response.');
      return null;
    }

    if (opts.verbose) {
      console.log(`  [brand-direction] Mood: ${parsed.mood}, Palette primary: ${parsed.palette?.primary}`);
      console.log(`  [brand-direction] Fonts: ${parsed.typography?.heading} / ${parsed.typography?.body}`);
    }

    // Caller-side WCAG validation. Replaces the model's `contrastCheck`
    // self-attestation with a real calculation. Findings are attached so
    // downstream phases (and the coverage audit) can see what failed.
    let wcag = validateWcag(parsed.palette);

    // Auto-correct failing pairs by darkening the foreground (or lightening
    // the background) until 4.5:1 is met. Cheaper than re-rolling via Claude
    // and deterministic. Logged so the operator can see what was adjusted.
    if (wcag.failures.length > 0) {
      const correction = autoFixPalette(parsed.palette, wcag);
      if (correction.fixed) {
        console.log(`  [brand-direction] WCAG AA had ${wcag.failures.length} failure(s); auto-corrected:`);
        for (const c of correction.adjustments) {
          console.log(`    ✓ ${c.field}: ${c.original} → ${c.corrected} (ratio ${c.beforeRatio.toFixed(2)} → ${c.afterRatio.toFixed(2)} on ${c.against})`);
        }
        parsed.palette = correction.palette;
        wcag = validateWcag(parsed.palette);  // re-validate after correction
      }
      if (wcag.failures.length > 0) {
        console.warn(`  [brand-direction] WCAG AA still has ${wcag.failures.length} failure(s) after auto-fix:`);
        for (const f of wcag.failures) {
          console.warn(`    ✗ ${f.pair}: ${f.ratio.toFixed(2)} (need ${f.threshold}) — ${f.note}`);
        }
      }
    } else if (opts.verbose) {
      console.log(`  [brand-direction] WCAG AA: all required pairs pass (primary/dark on light)`);
    }

    return {
      ...parsed,
      contrastCheck: wcag.summary,
      wcagAudit:     wcag,
      _meta: {
        model:       'claude-sonnet-4-6',
        duration_ms: Date.now() - start,
        tokens:      response.usage,
        impeccableRefsLoaded: !!impeccableContext,
      },
    };
  } catch (err) {
    console.warn(`  [brand-direction] Failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// WCAG AA contrast validator
// ---------------------------------------------------------------------------

/**
 * Validate the brand palette's key contrast pairs against WCAG AA (4.5:1 for
 * body text, 3:1 for large text / non-text UI).
 *
 * Required pairs (the ones the model claims to have validated):
 *   - dark    on light  (body text on alternating-section background)
 *   - primary on light  (CTA buttons / accent text)
 *   - light   on dark   (text on dark surfaces — inverse case)
 *
 * Returns { ok, failures[], summary } so callers can either re-roll or warn.
 */
function validateWcag(palette = {}) {
  const required = [
    { fg: 'dark',    bg: 'light', threshold: 4.5, note: 'body text on alternating-section background' },
    { fg: 'primary', bg: 'light', threshold: 4.5, note: 'CTAs / heading text on light background' },
    { fg: 'light',   bg: 'dark',  threshold: 4.5, note: 'inverse — text on dark surfaces' },
  ];

  const failures = [];
  const checks = [];

  for (const pair of required) {
    const fgHex = palette[pair.fg];
    const bgHex = palette[pair.bg];
    if (!isHex(fgHex) || !isHex(bgHex)) {
      failures.push({ pair: `${pair.fg}/${pair.bg}`, ratio: 0, threshold: pair.threshold, note: `missing hex (fg=${fgHex} bg=${bgHex})` });
      continue;
    }
    const ratio = contrastRatio(fgHex, bgHex);
    const passes = ratio >= pair.threshold;
    checks.push({ pair: `${pair.fg}/${pair.bg}`, ratio: +ratio.toFixed(2), threshold: pair.threshold, passes });
    if (!passes) {
      failures.push({ pair: `${pair.fg}/${pair.bg}`, ratio, threshold: pair.threshold, note: pair.note });
    }
  }

  const summary = failures.length === 0
    ? `WCAG AA: ${checks.length}/${checks.length} required pairs pass`
    : `WCAG AA: ${failures.length}/${checks.length} pairs FAIL — ${failures.map(f => f.pair).join(', ')}`;

  return { ok: failures.length === 0, checks, failures, summary };
}

function isHex(s) {
  return typeof s === 'string' && /^#[0-9a-f]{3,8}$/i.test(s);
}

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h.slice(0, 6), 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Attempt to fix WCAG AA failures by adjusting the offending foreground color
 * (darken if going onto a light bg; lighten if going onto a dark bg) in small
 * lightness steps until the contrast threshold is met. Returns a corrected
 * palette + per-adjustment audit so the operator can see what changed.
 *
 * Conservative — preserves hue + saturation, only nudges lightness. Bails
 * after MAX_STEPS attempts so we don't end up at pure black/white if the
 * palette is genuinely irreparable.
 *
 * @param {object} palette - Original palette (read-only — we return a new one)
 * @param {object} wcag    - validateWcag() result with failures[]
 * @returns {{ fixed: boolean, palette: object, adjustments: Array }}
 */
function autoFixPalette(palette, wcag) {
  const MAX_STEPS = 30;
  const STEP_SIZE = 0.02;  // 2% lightness adjustment per step
  const out = { ...palette };
  const adjustments = [];

  for (const failure of wcag.failures) {
    const [fgKey, bgKey] = failure.pair.split('/');
    const originalFg = out[fgKey];
    const bgHex      = out[bgKey];
    if (!isHex(originalFg) || !isHex(bgHex)) continue;

    const beforeRatio = contrastRatio(originalFg, bgHex);
    const bgIsLight   = relativeLuminance(bgHex) > 0.5;

    let currentFg = originalFg;
    let currentRatio = beforeRatio;
    let steps = 0;

    while (currentRatio < failure.threshold && steps < MAX_STEPS) {
      // Darken FG if bg is light; lighten FG if bg is dark
      currentFg = bgIsLight
        ? adjustLightness(currentFg, -STEP_SIZE)
        : adjustLightness(currentFg, +STEP_SIZE);
      currentRatio = contrastRatio(currentFg, bgHex);
      steps++;
    }

    if (currentRatio >= failure.threshold && currentFg !== originalFg) {
      out[fgKey] = currentFg;
      adjustments.push({
        field:       fgKey,
        original:    originalFg,
        corrected:   currentFg,
        against:     `${bgKey} (${bgHex})`,
        beforeRatio,
        afterRatio:  currentRatio,
        steps,
      });
    }
  }

  return { fixed: adjustments.length > 0, palette: out, adjustments };
}

/** Adjust a hex color's HSL lightness by `delta` (range -1.0 to +1.0). */
function adjustLightness(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(1, l + delta));
  const { r: nr, g: ng, b: nb } = hslToRgb(h, s, newL);
  return rgbToHex(nr, ng, nb);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex(r, g, b) {
  const toHex = (c) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Export for testing
export { validateWcag, contrastRatio, autoFixPalette };

function parseJson(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const f = text.indexOf('{'), l = text.lastIndexOf('}');
  if (f !== -1 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch {} }
  return null;
}
