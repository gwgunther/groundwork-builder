/**
 * GBP Scanner — read-only scan of a Google Business Profile via Places API (v1).
 *
 * Uses GOOGLE_PLACES_API_KEY. No OAuth, no per-customer credentials.
 * Public data only — the same fields any user sees on Google Maps.
 *
 * Export:
 *   runGbpScan({ placeId?, businessName?, near? }) → Promise<{ findings, summary, meta }>
 *   findPlaceId(query, near?) → Promise<{ placeId, displayName, formattedAddress } | null>
 */

import { enrichFindings } from './findings.js';

const PLACES_BASE = 'https://places.googleapis.com/v1';

// Field mask: only request what we score on.
const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'types',
  'primaryType',
  'primaryTypeDisplayName',
  'userRatingCount',
  'rating',
  'editorialSummary',
  'businessStatus',
  'googleMapsUri',
].join(',');

// What "dental" looks like in Google Places category strings.
// Anything matching counts as "category aligned".
const DENTAL_CATEGORY_RE = /\b(dentist|dental|orthodontist|endodontist|periodontist|oral_surgeon|prosthodontist)\b/i;

// Keywords we expect a dental practice description to mention.
const DENTAL_KEYWORD_RE = /\b(dental|dentist|teeth|tooth|smile|orthodont|cosmetic|implant|hygiene|cleaning|crown|veneer|whitening|family|pediatric)\b/i;

// Minimum review count threshold below which we flag low-review-count.
const LOW_REVIEW_THRESHOLD = 20;

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set in .env');
  }
  return key;
}

/**
 * Resolve a business name (and optional location bias) to a placeId via
 * Places Text Search. Returns null on no match.
 */
export async function findPlaceId(query, near = null) {
  if (!query?.trim()) return null;
  const apiKey = getApiKey();

  const body = { textQuery: query };
  if (near?.lat != null && near?.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: near.lat, longitude: near.lng },
        radius: near.radiusMeters || 25000,
      },
    };
  }

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Places searchText failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const data = await res.json();
  const first = data?.places?.[0];
  if (!first?.id) return null;
  return {
    placeId: first.id,
    displayName: first.displayName?.text || '',
    formattedAddress: first.formattedAddress || '',
  };
}

/** Fetch full place details for a placeId. */
async function fetchPlaceDetails(placeId) {
  const apiKey = getApiKey();
  const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });
  if (!res.ok) {
    throw new Error(`Places GET failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

function buildFinding({ id, title, detail, benefit, present, severityWhenMissing = 'warning' }) {
  return {
    id,
    category: 'gbp',
    severity: present ? 'passed' : severityWhenMissing,
    title,
    detail,
    benefit,
    affectedPages: [],
    count: present ? 0 : 1,
  };
}

/**
 * Run the GBP scan.
 *
 * @param {object} opts
 * @param {string} [opts.placeId]      - Skip lookup and fetch directly.
 * @param {string} [opts.businessName] - Used for text search if placeId not given.
 * @param {{lat:number,lng:number,radiusMeters?:number}} [opts.near] - Bias for text search.
 *
 * @returns {Promise<{ findings: object[], summary: object, meta: object }>}
 */
export async function runGbpScan(opts = {}) {
  let { placeId, businessName, near } = opts;

  // Resolve placeId if needed.
  let lookup = null;
  if (!placeId) {
    if (!businessName) {
      throw new Error('runGbpScan requires placeId or businessName');
    }
    lookup = await findPlaceId(businessName, near);
    if (!lookup) {
      return {
        findings: [],
        summary: { critical: 0, warnings: 0, passed: 0 },
        meta: { found: false, query: businessName },
      };
    }
    placeId = lookup.placeId;
  }

  const place = await fetchPlaceDetails(placeId);

  // ── Extract signal ────────────────────────────────────────────────────────
  const displayName = place.displayName?.text || '';
  const description = place.editorialSummary?.text || '';
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
  const website = place.websiteUri || '';
  const hours = place.regularOpeningHours?.weekdayDescriptions || [];
  const types = place.types || [];
  const primaryType = place.primaryType || '';
  const userRatingCount = place.userRatingCount ?? 0;

  const hasTitle = !!displayName.trim();
  const hasDescription = !!description.trim();
  const descriptionHasKeywords = hasDescription && DENTAL_KEYWORD_RE.test(description);
  const hasPhone = !!phone.trim();
  const hasHours = hours.length >= 5; // need most weekdays
  const hasWebsite = !!website.trim();
  const enoughReviews = userRatingCount >= LOW_REVIEW_THRESHOLD;
  const categoryAligned =
    DENTAL_CATEGORY_RE.test(primaryType) ||
    types.some(t => DENTAL_CATEGORY_RE.test(t));

  // ── Build findings ────────────────────────────────────────────────────────
  const raw = [];

  raw.push(buildFinding({
    id: 'gbp-no-title',
    title: 'GBP business title',
    detail: hasTitle ? `Title: "${displayName}"` : 'Google Business Profile has no business title.',
    benefit: 'The GBP title is the headline of your local search listing — the first thing a prospect sees on Google Maps.',
    present: hasTitle,
    severityWhenMissing: 'critical',
  }));

  raw.push(buildFinding({
    id: 'gbp-no-description',
    title: 'GBP description',
    detail: hasDescription ? `Description present (${description.length} chars).` : 'Google Business Profile has no description.',
    benefit: 'The GBP description lets you control your narrative on Maps — what services, who you serve, what differentiates you.',
    present: hasDescription,
  }));

  if (hasDescription) {
    raw.push(buildFinding({
      id: 'gbp-description-no-keywords',
      title: 'GBP description includes dental keywords',
      detail: descriptionHasKeywords
        ? 'Description includes dental/practice keywords.'
        : 'Description present but missing dental/practice keywords.',
      benefit: 'Keywords in the GBP description improve relevance for local "dentist near me" queries.',
      present: descriptionHasKeywords,
    }));
  }

  raw.push(buildFinding({
    id: 'gbp-no-phone',
    title: 'GBP phone number',
    detail: hasPhone ? `Phone: ${phone}` : 'No phone number on the Google Business Profile.',
    benefit: 'A phone number on GBP enables click-to-call directly from Maps — the highest-converting action for local search.',
    present: hasPhone,
    severityWhenMissing: 'critical',
  }));

  raw.push(buildFinding({
    id: 'gbp-no-hours',
    title: 'GBP business hours',
    detail: hasHours ? `Hours set for ${hours.length} days.` : 'Google Business Profile is missing complete business hours.',
    benefit: 'Hours on GBP are required for the "Open now" filter and prevent visitors from showing up to a closed office.',
    present: hasHours,
  }));

  raw.push(buildFinding({
    id: 'gbp-no-website-linked',
    title: 'GBP website link',
    detail: hasWebsite ? `Website: ${website}` : 'No website linked from the Google Business Profile.',
    benefit: 'Linking your site from GBP drives qualified Maps traffic to your booking flow and consolidates SEO equity.',
    present: hasWebsite,
  }));

  raw.push(buildFinding({
    id: 'gbp-low-review-count',
    title: 'GBP review volume',
    detail: enoughReviews
      ? `${userRatingCount} reviews — above the ${LOW_REVIEW_THRESHOLD} threshold.`
      : `Only ${userRatingCount} review${userRatingCount === 1 ? '' : 's'} (below ${LOW_REVIEW_THRESHOLD} threshold).`,
    benefit: 'Review count is the single biggest local-pack ranking factor after relevance. More reviews = higher placement on Maps.',
    present: enoughReviews,
  }));

  raw.push(buildFinding({
    id: 'gbp-category-mismatch',
    title: 'GBP primary category aligned',
    detail: categoryAligned
      ? `Primary category: ${primaryType || '(matches dental)'}`
      : `Primary category "${primaryType || '—'}" does not match dental keywords.`,
    benefit: 'The GBP primary category drives which "near me" queries you appear for. A misaligned category caps your reach.',
    present: categoryAligned,
  }));

  // composite "profile complete"
  const completenessFlags = [hasTitle, hasDescription, hasPhone, hasHours, hasWebsite, categoryAligned];
  const completePct = completenessFlags.filter(Boolean).length / completenessFlags.length;
  const profileComplete = completePct >= 0.85;
  raw.push(buildFinding({
    id: 'gbp-incomplete-profile',
    title: 'GBP profile completeness',
    detail: profileComplete
      ? `${Math.round(completePct * 100)}% of essential GBP fields present.`
      : `Only ${Math.round(completePct * 100)}% of essential GBP fields are filled in.`,
    benefit: 'Google ranks more complete profiles higher in the local pack and shows them more prominently in the Knowledge Panel.',
    present: profileComplete,
  }));

  const findings = enrichFindings(raw);
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };

  return {
    findings,
    summary,
    meta: {
      placeId,
      displayName,
      formattedAddress: place.formattedAddress || '',
      googleMapsUri: place.googleMapsUri || '',
      userRatingCount,
      rating: place.rating ?? null,
      businessStatus: place.businessStatus || '',
      primaryType,
      lookedUpVia: lookup ? 'text-search' : 'place-id',
      lookupQuery: businessName || null,
    },
  };
}
