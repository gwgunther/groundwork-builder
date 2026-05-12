/**
 * Findings Catalog — single source of truth for grader checks.
 *
 * Detector logic lives in scripts/pipeline/lib/ (tech-audit.js, gbp-scanner.js, etc.).
 * This file holds the *metadata* each detector references by id:
 *   - weight:      how much this check contributes to the Growth Score (0.5–2.0)
 *   - fixed_copy:  past-tense headline used when re-scan flips state to 'fixed'
 *   - fix_action:  how the builder resolves this finding
 *
 * Dental-only for now. If we add another vertical later, refactor to per-preset.
 */

/** @typedef {{ kind: 'generator' | 'gbp_api' | 'manual' | 'skill', target: string }} FixAction */
/** @typedef {{ weight: number, fixed_copy: string, fix_action: FixAction }} CatalogEntry */

/** @type {Record<string, CatalogEntry>} */
export const FINDINGS_CATALOG = {
  // ── SEO (existing detectors in tech-audit.js) ───────────────────────────
  'missing-meta': {
    weight: 1.2,
    fixed_copy: 'Added meta descriptions to all pages.',
    fix_action: { kind: 'generator', target: 'meta-descriptions' },
  },
  'missing-title': {
    weight: 1.5,
    fixed_copy: 'Added title tags to all pages.',
    fix_action: { kind: 'generator', target: 'page-titles' },
  },
  'duplicate-titles': {
    weight: 1.0,
    fixed_copy: 'Made every page title unique.',
    fix_action: { kind: 'generator', target: 'page-titles' },
  },
  'missing-h1': {
    weight: 1.2,
    fixed_copy: 'Added an H1 to every page.',
    fix_action: { kind: 'generator', target: 'page-headings' },
  },
  'multiple-h1': {
    weight: 0.8,
    fixed_copy: 'Reduced each page to a single H1.',
    fix_action: { kind: 'generator', target: 'page-headings' },
  },
  'thin-content': {
    weight: 1.3,
    fixed_copy: 'Expanded thin pages with substantive content.',
    fix_action: { kind: 'generator', target: 'content-expand' },
  },
  'missing-schema': {
    weight: 1.0,
    fixed_copy: 'Added LocalBusiness + Dentist JSON-LD to every page.',
    fix_action: { kind: 'generator', target: 'schema-config' },
  },
  'missing-canonical': {
    weight: 0.7,
    fixed_copy: 'Added canonical URLs to every page.',
    fix_action: { kind: 'generator', target: 'canonical-tags' },
  },

  // ── Performance ─────────────────────────────────────────────────────────
  'low-performance': {
    weight: 1.4,
    fixed_copy: 'Mobile performance score is in the green.',
    fix_action: { kind: 'generator', target: 'astro-build' },
  },
  'low-lcp': {
    weight: 1.2,
    fixed_copy: 'Largest Contentful Paint is within threshold.',
    fix_action: { kind: 'generator', target: 'astro-build' },
  },
  'high-cls': {
    weight: 1.0,
    fixed_copy: 'Cumulative Layout Shift is within threshold.',
    fix_action: { kind: 'generator', target: 'astro-build' },
  },

  // ── Accessibility ───────────────────────────────────────────────────────
  'missing-alt': {
    weight: 0.9,
    fixed_copy: 'Added alt text to every image.',
    fix_action: { kind: 'generator', target: 'image-roles' },
  },

  // ── Content / trust ─────────────────────────────────────────────────────
  'no-testimonials': {
    weight: 1.4,
    fixed_copy: 'Added a testimonials section sourced from real reviews.',
    fix_action: { kind: 'generator', target: 'testimonials-section' },
  },
  'no-faq': {
    weight: 1.1,
    fixed_copy: 'Added an FAQ section answering common patient questions.',
    fix_action: { kind: 'generator', target: 'faq-section' },
  },
  'thin-about': {
    weight: 1.1,
    fixed_copy: 'Expanded the About page with doctor bio and practice story.',
    fix_action: { kind: 'generator', target: 'doctor-brief' },
  },

  // ── Mobile ──────────────────────────────────────────────────────────────
  'no-viewport': {
    weight: 1.5,
    fixed_copy: 'Mobile viewport configured correctly.',
    fix_action: { kind: 'generator', target: 'astro-build' },
  },

  // ── GBP (new — detectors land in gbp-scanner.js, next PR) ───────────────
  'gbp-no-title': {
    weight: 1.5,
    fixed_copy: 'Added a business title to the Google Business Profile.',
    fix_action: { kind: 'gbp_api', target: 'title' },
  },
  'gbp-no-description': {
    weight: 1.4,
    fixed_copy: 'Added a keyword-rich description to the Google Business Profile.',
    fix_action: { kind: 'gbp_api', target: 'description' },
  },
  'gbp-description-no-keywords': {
    weight: 1.1,
    fixed_copy: 'Rewrote the GBP description to include service + city keywords.',
    fix_action: { kind: 'gbp_api', target: 'description' },
  },
  'gbp-no-phone': {
    weight: 1.5,
    fixed_copy: 'Added a phone number to the Google Business Profile.',
    fix_action: { kind: 'gbp_api', target: 'phoneNumbers' },
  },
  'gbp-no-hours': {
    weight: 1.4,
    fixed_copy: 'Added complete business hours to the Google Business Profile.',
    fix_action: { kind: 'gbp_api', target: 'regularHours' },
  },
  'gbp-no-website-linked': {
    weight: 1.3,
    fixed_copy: 'Linked the practice website from Google Business Profile.',
    fix_action: { kind: 'gbp_api', target: 'websiteUri' },
  },
  'gbp-low-review-count': {
    weight: 1.2,
    fixed_copy: 'Set up a review request flow to grow Google reviews.',
    fix_action: { kind: 'manual', target: 'review-flow' },
  },
  'gbp-category-mismatch': {
    weight: 0.9,
    fixed_copy: 'Aligned GBP categories with target keywords.',
    fix_action: { kind: 'gbp_api', target: 'categories' },
  },
  'gbp-incomplete-profile': {
    weight: 1.0,
    fixed_copy: 'Completed all essential Google Business Profile fields.',
    fix_action: { kind: 'gbp_api', target: 'profile' },
  },

  // ── Trust / contact on site (detectors land in trust-scanner.js) ────────
  'no-address-on-site': {
    weight: 1.2,
    fixed_copy: 'Added the practice address to the site.',
    fix_action: { kind: 'generator', target: 'contact-block' },
  },
  'no-phone-on-site': {
    weight: 1.5,
    fixed_copy: 'Added a click-to-call phone number to the header.',
    fix_action: { kind: 'generator', target: 'header-phone' },
  },
  'no-hours-on-site': {
    weight: 1.0,
    fixed_copy: 'Surfaced operating hours on the site.',
    fix_action: { kind: 'generator', target: 'hours-block' },
  },
  'no-social-links': {
    weight: 0.7,
    fixed_copy: 'Added social links to the footer.',
    fix_action: { kind: 'generator', target: 'footer-social' },
  },

  // ── Hosting / domain (detectors land in hosting-scanner.js) ─────────────
  'using-third-party-domain': {
    weight: 1.3,
    fixed_copy: 'Migrated to a first-party domain.',
    fix_action: { kind: 'manual', target: 'domain-migration' },
  },
  'fractured-web-presence': {
    weight: 1.0,
    fixed_copy: 'Consolidated web presence to a single primary domain.',
    fix_action: { kind: 'manual', target: 'domain-consolidation' },
  },
  'gbp-website-mismatches-audit-url': {
    weight: 1.3,
    fixed_copy: 'Consolidated GBP website link to match the audited domain.',
    fix_action: { kind: 'gbp_api', target: 'websiteUri' },
  },
};

/**
 * Get catalog entry for a finding id. Returns defaults for unknown ids
 * so detectors emitting new ids don't crash — they just get weight 1.0
 * and no fix_action.
 */
export function getCatalogEntry(id) {
  return FINDINGS_CATALOG[id] || {
    weight: 1.0,
    fixed_copy: null,
    fix_action: null,
  };
}
