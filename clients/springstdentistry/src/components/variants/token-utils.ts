/**
 * token-utils.ts
 *
 * Resolves designToken enum values → concrete Tailwind classes.
 * Imported by every variant component in their frontmatter.
 *
 * Usage:
 *   import { resolveTokens } from '../token-utils';
 *   const t = resolveTokens(tokens);
 *   // t.btnPrimary, t.radiusClass, t.eyebrowClass, t.spacingClass
 */

import type { DesignTokens } from '../../config/design-dna';

export interface ResolvedTokens {
  /** Tailwind classes for the corner radius (e.g. 'rounded-lg') */
  radiusClass: string;
  /** Full Tailwind class string for a primary CTA button */
  btnPrimary: string;
  /** Full Tailwind class string for a secondary/ghost button */
  btnSecondary: string;
  /** Classes for a section eyebrow / label */
  eyebrowClass: string;
  /** Vertical padding classes for a section wrapper */
  spacingClass: string;
  /** Max-width container class */
  containerClass: string;
}

export function resolveTokens(tokens: Partial<DesignTokens> = {}): ResolvedTokens {
  const radiusClass = {
    sharp:    'rounded-none',
    moderate: 'rounded-lg',
    rounded:  'rounded-2xl',
    full:     'rounded-full',
  }[tokens.cornerRadius ?? 'moderate'] ?? 'rounded-lg';

  const btnBase = `inline-flex items-center justify-center px-6 py-3 ${radiusClass} font-semibold text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2`;

  const btnPrimary = {
    filled:     `${btnBase} bg-brand-primary text-white hover:opacity-90 active:opacity-80`,
    outline:    `${btnBase} border-2 border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white`,
    'soft-fill': `${btnBase} bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20`,
  }[tokens.buttonTreatment ?? 'filled'] ?? `${btnBase} bg-brand-primary text-white hover:opacity-90`;

  const btnSecondary = `${btnBase} border border-white/30 text-white hover:bg-white/10`;

  const eyebrowClass = tokens.labelStyle === 'badge'
    ? `inline-block px-3 py-1 text-xs font-bold uppercase tracking-widest bg-brand-primary/10 text-brand-primary ${radiusClass} mb-4`
    : `block text-sm font-semibold uppercase tracking-widest text-brand-primary mb-3`;

  const spacingClass = {
    compact: 'py-16 md:py-20',
    default: 'py-20 md:py-28',
    airy:    'py-24 md:py-36',
  }[tokens.sectionSpacing ?? 'default'] ?? 'py-20 md:py-28';

  const containerClass = {
    narrow:   'max-w-5xl mx-auto px-6',
    standard: 'max-w-7xl mx-auto px-6',
    full:     'max-w-full mx-auto px-6 md:px-12',
  }[tokens.layoutWidth ?? 'standard'] ?? 'max-w-7xl mx-auto px-6';

  return { radiusClass, btnPrimary, btnSecondary, eyebrowClass, spacingClass, containerClass };
}
