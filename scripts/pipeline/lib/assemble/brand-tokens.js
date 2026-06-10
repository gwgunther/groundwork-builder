/**
 * Step 6 — deterministic brand-dna → build tokens mapper.
 *
 * brand-dna (Step 4) is the single source of truth for the VISUAL system:
 * color roles, type families/scale, corner radius, border + elevation. This
 * module maps that decided identity into the exact vocabulary the injector and
 * Astro components consume — with NO AI and NO fabricated colors (only
 * deterministic tints derived by blending existing brand colors, the same way
 * the injector already derives surfaces).
 *
 * Ownership boundary: brand-dna owns color + type + shape + elevation. The
 * layout director owns ONLY section order + per-section variant + archetype.
 * So radius / cardTreatment / borderTreatment come from HERE, not the director.
 *
 * Output:
 *   {
 *     colors: { primary, secondary, light, accent, dark, muted },  // injector-required 6
 *     roles:  { background, text, border, neutralDark, neutralLight }, // full brand-dna roles
 *     fonts:  { heading, body },
 *     typography: { scale, weights, tracking },
 *     tokens: { radius, cardTreatment, borderTreatment, headingScale, density },
 *     rationale
 *   }
 */
import { hexToRgb, rgbToHex, ensureContrast } from '../contrast.js';

/** Blend hex A toward hex B by t∈[0,1]. Deterministic design math, not fabrication. */
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex({
    r: Math.round(A.r + (B.r - A.r) * t),
    g: Math.round(A.g + (B.g - A.g) * t),
    b: Math.round(A.b + (B.b - A.b) * t),
  });
}

const RADIUS = { sharp: 'sharp', none: 'sharp', sm: 'sm', md: 'md', lg: 'lg', xl: 'lg', pill: 'pill', full: 'pill' };
const ELEVATION_TO_CARD = { flat: 'bordered-flat', 'soft-shadow': 'soft-shadow', layered: 'elevated' };

export function brandDnaToTokens(brandDna) {
  if (!brandDna || !brandDna.color) {
    throw new Error('[brand-tokens] brandDna.color missing — Step 4 (defineBrandDna) must run first.');
  }
  const c = brandDna.color;
  const t = brandDna.typography || {};
  const shape = brandDna.shape || {};
  const elev = brandDna.elevation || {};

  // Required color roles must be real.
  for (const k of ['primary', 'secondary', 'accent', 'neutralDark', 'neutralLight', 'background', 'text', 'border']) {
    if (!c[k]) throw new Error(`[brand-tokens] brandDna.color.${k} missing`);
  }

  // `muted` (mid/caption text) — soften body text, then enforce WCAG AA 4.5:1 on
  // brand.light surfaces where text-neutral-mid is used sitewide.
  const mutedRaw = mix(c.text, c.background, 0.38);
  const muted = ensureContrast(mutedRaw, c.neutralLight, 4.5).hex;

  const radius = RADIUS[shape.cornerRadius] || 'md';
  const cardTreatment = ELEVATION_TO_CARD[elev.system] || 'bordered-flat';
  const borderTreatment = ['hairline', 'standard', 'none'].includes(shape.borderTreatment)
    ? shape.borderTreatment : 'standard';

  return {
    // Injector-required 6 (drop-in for data.brand.colors)
    colors: {
      primary: c.primary,
      secondary: c.secondary,
      light: c.neutralLight,
      accent: c.accent,
      dark: c.neutralDark,
      muted,
    },
    // Full brand-dna roles preserved (the injector uses these for correct
    // surfaces/borders/text instead of reusing `muted` or hardcoding white).
    roles: {
      background: c.background,
      text: c.text,
      border: c.border,
      neutralDark: c.neutralDark,
      neutralLight: c.neutralLight,
    },
    fonts: { heading: t.headingFont, body: t.bodyFont, provider: t.fontProvider || 'google' },
    typography: { scale: t.scale || {}, weights: t.weights || {}, tracking: t.tracking || '' },
    tokens: { radius, cardTreatment, borderTreatment },
    rationale: brandDna.rationale || '',
  };
}

/**
 * Apply mapped brand tokens onto a merged object so the existing injector
 * (injectTailwindConfig/injectGlobalCss) consumes brand-dna with no further
 * change. Returns the same merged for chaining. Non-destructive to currentDesign.
 */
export function applyBrandToMerged(merged, brandDna) {
  const m = brandDnaToTokens(brandDna);
  merged.brand = {
    ...(merged.brand || {}),
    colors: m.colors,
    roles: m.roles,
    fonts: m.fonts,
    typography: m.typography,
  };
  merged._brandTokens = m;
  return merged;
}

export default brandDnaToTokens;
