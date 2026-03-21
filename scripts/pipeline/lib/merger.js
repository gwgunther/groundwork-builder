/**
 * Merge scraped data + intake data into a single PracticeData object.
 *
 * Rules:
 *   - Intake data wins all conflicts (client explicitly provided it).
 *   - Services are merged (union of both sources, deduplicated by slug).
 *   - Missing required fields get sensible defaults + confidenceFlags entries.
 *   - Generates a redirect map: old URL paths -> new page paths.
 *   - Determines which service hub pages to keep (4 hubs).
 */

import { createEmptyPracticeData, DEFAULT_HOURS, DEFAULT_COLORS } from './schema.js';
import { slugify, formatPhone } from './utils.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge scraped data and intake data into a complete PracticeData object.
 *
 * @param {object} scrapeData - Data extracted by the scraper (may be partial).
 * @param {object} intakeData - Normalised intake data (from loadIntake).
 * @param {object} [preset]   - Loaded vertical preset (from preset-loader).
 * @returns {object} Complete PracticeData
 */
export function mergeData(scrapeData, intakeData, preset = null) {
  // Normalize null/undefined to empty objects
  scrapeData = scrapeData || {};
  intakeData = intakeData || {};
  const data = createEmptyPracticeData();
  const flags = [];

  // ---- Practice info (intake wins) ----------------------------------------
  data.practice.name =
    intakeData.practice?.name ||
    scrapeData.practice?.name ||
    null;
  if (!data.practice.name) flags.push('practice.name: missing');

  data.practice.domain =
    intakeData.practice?.domain ||
    scrapeData.practice?.domain ||
    null;

  data.practice.phone =
    intakeData.practice?.phone ||
    scrapeData.practice?.phone ||
    null;
  if (!data.practice.phone) flags.push('practice.phone: missing');

  data.practice.phoneDigits = data.practice.phone
    ? data.practice.phone.replace(/\D/g, '')
    : null;

  data.practice.email =
    intakeData.practice?.email ||
    scrapeData.practice?.email ||
    null;
  if (!data.practice.email) flags.push('practice.email: missing');

  data.practice.googleReviewLink =
    intakeData.practice?.googleReviewLink ||
    scrapeData.practice?.googleReviewLink ||
    null;
  data.practice.googleProfileLink =
    intakeData.practice?.googleProfileLink ||
    scrapeData.practice?.googleProfileLink ||
    null;
  data.practice.priceRange =
    intakeData.practice?.priceRange ||
    scrapeData.practice?.priceRange ||
    '$$';
  data.practice.medicalSpecialty =
    intakeData.practice?.medicalSpecialty ||
    scrapeData.practice?.medicalSpecialty ||
    null;
  data.practice.sameAs =
    intakeData.practice?.sameAs ||
    scrapeData.practice?.sameAs ||
    [];

  // ---- Doctor info (intake wins) ------------------------------------------
  const intakeDoc = intakeData.doctor || {};
  const scrapeDoc = scrapeData.doctor || {};

  data.doctor.firstName = intakeDoc.firstName || scrapeDoc.firstName || null;
  data.doctor.lastName = intakeDoc.lastName || scrapeDoc.lastName || null;
  data.doctor.name =
    data.doctor.firstName && data.doctor.lastName
      ? `Dr. ${data.doctor.firstName} ${data.doctor.lastName}`
      : scrapeDoc.name || null;
  if (!data.doctor.name) flags.push('doctor.name: missing');

  data.doctor.credentials = intakeDoc.credentials || scrapeDoc.credentials || null;
  if (!data.doctor.credentials) flags.push('doctor.credentials: missing — defaulting to DDS');
  data.doctor.credentials = data.doctor.credentials || 'DDS';

  data.doctor.bio = intakeDoc.bio || scrapeDoc.bio || null;
  data.doctor.education = intakeDoc.education || scrapeDoc.education || null;
  data.doctor.specialties = intakeDoc.specialties || scrapeDoc.specialties || [];
  data.doctor.photoPath = intakeDoc.photoPath || scrapeDoc.photoPath || null;

  // ---- Additional doctors -------------------------------------------------
  data.additionalDoctors =
    intakeData.additionalDoctors ||
    scrapeData.additionalDoctors ||
    [];

  // ---- Address (intake wins) ----------------------------------------------
  const intakeAddr = intakeData.address || {};
  const scrapeAddr = scrapeData.address || {};

  data.address.street = intakeAddr.street || scrapeAddr.street || null;
  data.address.city = intakeAddr.city || scrapeAddr.city || null;
  data.address.state = intakeAddr.state || scrapeAddr.state || null;
  data.address.zip = intakeAddr.zip || scrapeAddr.zip || null;
  data.address.country = intakeAddr.country || scrapeAddr.country || 'US';
  if (!data.address.city) flags.push('address.city: missing');
  if (!data.address.state) flags.push('address.state: missing');

  data.address.full = [
    data.address.street,
    data.address.city,
    [data.address.state, data.address.zip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  // ---- Hours (intake wins, else scrape, else defaults) --------------------
  if (intakeData.hours) {
    data.hours = intakeData.hours;
  } else if (scrapeData.hours) {
    data.hours = scrapeData.hours;
  } else {
    data.hours = { ...DEFAULT_HOURS };
    flags.push('hours: using defaults (Mon-Fri 9-5)');
  }

  // ---- Services (union + dedup) -------------------------------------------
  const scrapeServices = scrapeData.services?.offered || [];
  const intakeServices = intakeData.services?.offered || [];

  const allServices = [
    ...intakeServices,
    ...scrapeServices.map(s => ({
      ...s,
      // Normalize shape if scraper only gave strings
      name: typeof s === 'string' ? s : s.name,
      slug: typeof s === 'string' ? slugify(s) : s.slug || slugify(s.name),
      source: s.source || 'scrape',
      confidence: s.confidence ?? 0.7,
    })),
  ];

  data.services.offered = deduplicateServices(allServices);
  data.services.hubs = determineServiceHubs(
    data.services.offered,
    preset?.hubs?.definitions || [],
    preset?.taxonomy?.services || [],
  );

  if (data.services.offered.length === 0) {
    flags.push('services: none detected — keeping general-dentistry hub only');
  }

  // ---- Brand (intake wins, else scrape, else defaults) --------------------
  const intakeBrand = intakeData.brand || {};
  const scrapeBrand = scrapeData.brand || {};

  data.brand.colors = intakeBrand.colors || scrapeBrand.colors || { ...DEFAULT_COLORS };
  if (!intakeBrand.colors && !scrapeBrand.colors) {
    flags.push('brand.colors: using defaults');
  }

  data.brand.fonts = intakeBrand.fonts || scrapeBrand.fonts || {
    heading: 'Playfair Display',
    body: 'DM Sans',
  };
  data.brand.logoPath = intakeBrand.logoPath || scrapeBrand.logoPath || null;

  // ---- Content (merge arrays, intake wins scalars) ------------------------
  const intakeContent = intakeData.content || {};
  const scrapeContent = scrapeData.content || {};

  data.content.heroTagline = intakeContent.heroTagline || scrapeContent.heroTagline || null;
  data.content.aboutText = intakeContent.aboutText || scrapeContent.aboutText || null;
  data.content.philosophy = intakeContent.philosophy || scrapeContent.philosophy || null;

  data.content.testimonials = [
    ...(intakeContent.testimonials || []),
    ...(scrapeContent.testimonials || []),
  ];
  data.content.faqs = [
    ...(intakeContent.faqs || []),
    ...(scrapeContent.faqs || []),
  ];
  data.content.insurance = [
    ...new Set([
      ...(intakeContent.insurance || []),
      ...(scrapeContent.insurance || []),
    ]),
  ];

  const intakeStats = intakeContent.stats || {};
  const scrapeStats = scrapeContent.stats || {};
  data.content.stats.yearsExperience = intakeStats.yearsExperience || scrapeStats.yearsExperience || null;
  data.content.stats.happyPatients = intakeStats.happyPatients || scrapeStats.happyPatients || null;
  data.content.stats.googleRating = intakeStats.googleRating || scrapeStats.googleRating || null;
  data.content.stats.fiveStarReviews = intakeStats.fiveStarReviews || scrapeStats.fiveStarReviews || null;

  // ---- Images (merge arrays, intake wins) ---------------------------------
  const intakeImages = intakeData.images || {};
  const scrapeImages = scrapeData.images || {};

  data.images.logo = intakeImages.logo || scrapeImages.logo || null;
  data.images.team = [...(intakeImages.team || []), ...(scrapeImages.team || [])];
  data.images.office = [...(intakeImages.office || []), ...(scrapeImages.office || [])];
  data.images.gallery = [...(intakeImages.gallery || []), ...(scrapeImages.gallery || [])];

  // ---- Migration (redirect map) -------------------------------------------
  const oldUrls = scrapeData.migration?.oldUrls || [];
  data.migration.oldUrls = oldUrls;
  data.migration.redirectMap = generateRedirectMap(
    oldUrls,
    data.services.hubs,
    preset?.redirectRules || [],
  );

  // ---- Meta ---------------------------------------------------------------
  data.meta.oldSiteUrl = scrapeData.meta?.oldSiteUrl || null;
  data.meta.scrapedAt = scrapeData.meta?.scrapedAt || null;
  data.meta.intakeSource = intakeData.meta?.intakeSource || null;
  data.meta.clientId = intakeData.meta?.clientId || scrapeData.meta?.clientId || null;
  data.meta.confidenceFlags = flags;

  return data;
}

// ---------------------------------------------------------------------------
// Service hub detection
// ---------------------------------------------------------------------------

/**
 * Determine which service hub pages to keep based on detected services.
 *
 * @param {Array} services       - Array of service objects with { slug, category }.
 * @param {Array} hubDefinitions - Hub definitions from preset.
 * @param {Array} taxonomyServices - Full service taxonomy from preset.
 * @returns {Array} Array of hub objects { slug, label, desc }.
 */
export function determineServiceHubs(services, hubDefinitions = [], taxonomyServices = []) {
  const activeHubs = [];

  for (const hub of hubDefinitions) {
    // Always keep general-dentistry
    if (hub.alwaysKeep) {
      activeHubs.push({ slug: hub.slug, label: hub.label, desc: hub.desc });
      continue;
    }

    // Check if any service matches this hub
    const hasMatch = services.some(svc => {
      // If the hub defines specific matchSlugs, use those
      if (hub.matchSlugs) {
        return hub.matchSlugs.includes(svc.slug);
      }

      // Exclude certain slugs if specified (e.g. restorative excludes implant slugs)
      if (hub.excludeSlugs && hub.excludeSlugs.includes(svc.slug)) {
        return false;
      }

      // Match by taxonomy category
      const taxonomyEntry = taxonomyServices.find(t => t.slug === svc.slug);
      if (taxonomyEntry && hub.categories.includes(taxonomyEntry.category)) {
        return true;
      }

      // Fallback: match if the service slug starts with the hub slug
      return svc.slug === hub.slug || svc.slug.startsWith(hub.slug + '-');
    });

    if (hasMatch) {
      activeHubs.push({ slug: hub.slug, label: hub.label, desc: hub.desc });
    }
  }

  return activeHubs;
}

// ---------------------------------------------------------------------------
// Redirect map generation
// ---------------------------------------------------------------------------

/**
 * Generate a redirect map from old URL paths to new page paths.
 *
 * @param {string[]} oldUrls       - Array of old URL paths (e.g. ['/our-team/', '/teeth-whitening/']).
 * @param {Array}    serviceHubs    - Active hub objects from determineServiceHubs.
 * @param {Array}    redirectRules  - Redirect rules from preset.
 * @returns {Array} Array of { from, to } redirect entries.
 */
export function generateRedirectMap(oldUrls, serviceHubs, redirectRules = []) {
  if (!oldUrls || oldUrls.length === 0) return [];

  const activeHubSlugs = new Set(serviceHubs.map(h => h.slug));
  const redirects = [];
  const seen = new Set();

  for (const rawUrl of oldUrls) {
    // Normalise: strip protocol/host, keep path only
    let path;
    try {
      const parsed = new URL(rawUrl, 'https://placeholder.local');
      path = parsed.pathname;
    } catch {
      path = rawUrl;
    }

    // Strip trailing slash for matching (keep leading /)
    path = path.replace(/\/+$/, '') || '/';

    // Skip homepage and already-mapped paths
    if (path === '/' || seen.has(path)) continue;
    seen.add(path);

    let target = null;

    // Walk through redirect rules in priority order
    for (const rule of redirectRules) {
      if (rule.pattern.test(path)) {
        target = rule.target;

        // Validate: if the target is a service hub page, only redirect
        // if we actually have that hub active
        if (target.startsWith('/services/')) {
          const hubSlug = target.replace('/services/', '');
          if (!activeHubSlugs.has(hubSlug)) {
            // Fallback to generic /services
            target = '/services';
          }
        }
        break;
      }
    }

    // Default fallback: redirect to homepage
    if (!target) {
      target = '/';
    }

    // Only add if the redirect actually changes the path
    if (path !== target) {
      redirects.push({ from: path, to: target });
    }
  }

  return redirects;
}

// ---------------------------------------------------------------------------
// Service deduplication
// ---------------------------------------------------------------------------

/**
 * Deduplicate services by slug. When duplicates exist, keep the entry with
 * the highest confidence. If confidence is equal, prefer 'intake' source.
 *
 * @param {Array} services - Array of service objects.
 * @returns {Array} Deduplicated array sorted alphabetically by name.
 */
export function deduplicateServices(services) {
  const bySlug = new Map();

  for (const svc of services) {
    const slug = svc.slug || slugify(svc.name);
    const existing = bySlug.get(slug);

    if (!existing) {
      bySlug.set(slug, { ...svc, slug });
      continue;
    }

    // Keep the one with higher confidence
    const newConf = svc.confidence ?? 0;
    const oldConf = existing.confidence ?? 0;

    if (newConf > oldConf || (newConf === oldConf && svc.source === 'intake')) {
      bySlug.set(slug, { ...svc, slug });
    }
  }

  return [...bySlug.values()].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  );
}
