/**
 * Dental service hub definitions — which hub pages to keep/remove
 * and their display descriptions for the services index page.
 */

/**
 * Hub categories — general-dentistry is always kept.
 * Used by the merger to determine which hub pages the practice qualifies for.
 */
export const SERVICE_HUBS = [
  {
    slug: 'general-dentistry',
    label: 'General Dentistry',
    desc: 'Cleanings, exams & preventive care',
    categories: ['general'],
    alwaysKeep: true,
  },
  {
    slug: 'cosmetic-dentistry',
    label: 'Cosmetic Dentistry',
    desc: 'Veneers, whitening & smile makeovers',
    categories: ['cosmetic'],
    alwaysKeep: false,
  },
  {
    slug: 'dental-implants',
    label: 'Dental Implants',
    desc: 'Permanent tooth replacement',
    categories: ['restorative'],
    matchSlugs: ['dental-implants', 'all-on-4-dental-implants'],
    alwaysKeep: false,
  },
  {
    slug: 'restorative-dentistry',
    label: 'Restorative Dentistry',
    desc: 'Crowns, bridges & dentures',
    categories: ['restorative'],
    excludeSlugs: ['dental-implants', 'all-on-4-dental-implants'],
    alwaysKeep: false,
  },
];

/**
 * Display descriptions for the services index page.
 * Keyed by hub slug.
 */
export const SERVICE_DESCRIPTIONS = {
  'general-dentistry': { name: 'General Dentistry', desc: 'Cleanings, exams, fillings, and preventive care.' },
  'cosmetic-dentistry': { name: 'Cosmetic Dentistry', desc: 'Veneers, whitening, bonding, and smile design.' },
  'dental-implants': { name: 'Dental Implants', desc: 'Permanent tooth replacement with implants.' },
  'restorative-dentistry': { name: 'Restorative Dentistry', desc: 'Crowns, bridges, dentures, and more.' },
};
