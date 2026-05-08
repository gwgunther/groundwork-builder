/**
 * Design DNA — populated by the Creative Director phase at build time.
 * The pipeline overwrites this file in the generated project.
 *
 * This default shape is what the starter renders when the pipeline hasn't
 * run yet (i.e. during local development of the template itself).
 */

export interface DesignDNA {
  archetype: string;
  heroVariant: 'centered' | 'asymmetric-left' | 'asymmetric-right' | 'split-image' | 'full-bleed' | 'poster';
  servicesVariant: 'cards-3up' | 'editorial-list' | 'accordion';
  navVariant: 'centered-logo' | 'left-logo' | 'split-logo';
  footerVariant: 'minimal-dark' | 'editorial-split' | 'classic-4col' | 'compact-centered';
  ctaVariant: 'full-width-dark' | 'split-card' | 'inline-minimal';
  doctorVariant: 'portrait-left' | 'portrait-right' | 'editorial-full';
  galleryVariant: 'masonry-3col' | 'editorial-2col';
  sectionOrder: string[];   // e.g. ['hero','doctor-intro','services','cta']
  cardTreatment: 'bordered-flat' | 'soft-shadow' | 'elevated' | 'ghost';
  density: 'airy' | 'balanced' | 'dense';
  motion: 'none' | 'subtle' | 'expressive';
  radius: 'sharp' | 'sm' | 'md' | 'lg' | 'pill';
  headingScale: 'dramatic' | 'moderate' | 'restrained';
  sectionDivider: 'none' | 'line' | 'space' | 'color-shift';
  heroTextPosition: 'bottom-left' | 'center' | 'right';
  borrowedFrom?: string | null;
  borrowedTrait?: string | null;
  divergenceRationale?: string;
  creativeDirection?: string;
  // typeui-style design system fields — populated by Creative Director
  typographyScale?: string;
  colorPalette?: string;
  spacingScale?: string;
  writingTone?: string;
  brandSummary?: string;
  doRules?: string[];
  dontRules?: string[];
}

export const designDNA: DesignDNA = {
  archetype: 'editorial-asymmetric',
  heroVariant: 'asymmetric-left',
  servicesVariant: 'cards-3up',
  navVariant: 'left-logo',
  footerVariant: 'classic-4col',
  ctaVariant: 'full-width-dark',
  doctorVariant: 'portrait-left',
  galleryVariant: 'masonry-3col',
  sectionOrder: ['hero', 'services', 'cta'],
  cardTreatment: 'bordered-flat',
  density: 'balanced',
  motion: 'subtle',
  radius: 'md',
  headingScale: 'moderate',
  sectionDivider: 'space',
  heroTextPosition: 'center',
  typographyScale: '',
  colorPalette: '',
  spacingScale: '',
  writingTone: '',
  brandSummary: '',
  doRules: [],
  dontRules: [],
};

export interface ImageRoles {
  hero: string | null;
  doctorPortrait: string | null;
  team: string[];
  interior: string[];
  gallery: string[];
  beforeAfter: string[];
}

/**
 * Helper — prefix a role path with /images/, or return null.
 */
export function imagePath(role: string | null | undefined): string | null {
  if (!role) return null;
  return `/images/${role.replace(/^\/+/, '')}`;
}
