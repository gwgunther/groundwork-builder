// Deterministic scoring layer: Lighthouse via PageSpeed Insights API,
// plus HTML pattern detection for schema, booking widgets, click-to-call,
// and dated-tech flags.
//
// Everything in here is reproducible — same input HTML/URL always produces
// the same score. The AI vision layer (vision-score.js) is the only
// non-deterministic part of the system.

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// ──────────────────────────────────────────────────────────────────────
// Lighthouse via PageSpeed Insights API
// ──────────────────────────────────────────────────────────────────────

/**
 * Run mobile Lighthouse audit via Google's PageSpeed Insights API.
 * Free tier: 25k req/day, ~400 req/100sec — plenty for 5k practices.
 *
 * Returns scores normalized to 0-100 plus a few key metrics. On failure
 * returns nulls so the row can still be scored on other signals.
 */
export async function runLighthouse(url, { apiKey, strategy = 'mobile', timeoutMs = 60_000 } = {}) {
  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance', // we'll add others one at a time
  });
  // PSI uses repeated `category=` params for multi-category
  const u = `${PSI_BASE}?${params.toString()}&category=accessibility&category=best-practices&category=seo${apiKey ? `&key=${apiKey}` : ''}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `PSI ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    const cats = json.lighthouseResult?.categories || {};
    const audits = json.lighthouseResult?.audits || {};
    return {
      ok: true,
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      lcp: audits['largest-contentful-paint']?.numericValue ?? null,
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Deterministic HTML feature detectors
// ──────────────────────────────────────────────────────────────────────

const BOOKING_VENDORS = [
  { id: 'localmed', re: /localmed\.com|localmed-/i },
  { id: 'nexhealth', re: /nexhealth\.com|nexhealth-/i },
  { id: 'zocdoc', re: /zocdoc\.com|zd-widget/i },
  { id: 'dentrix-hub', re: /dentrixhub\.com|dentrix\.com\/online/i },
  { id: 'lighthouse-360', re: /lighthouse360\.com/i },
  { id: 'mydentistlink', re: /mydentistlink\.com/i },
  { id: 'curve-dental', re: /curvedental\.com\/online/i },
  { id: 'demandforce', re: /demandforce\.com/i },
  { id: 'flex-dental', re: /flexdentalsolutions/i },
  { id: 'engagedental', re: /engagedental\.com|engage-dental/i },
];

const DATED_TECH_FLAGS = [
  { id: 'jquery', re: /(jquery-?\d|jquery\.min\.js|code\.jquery\.com)/i, weight: 1 },
  { id: 'table-layout', re: /<table[^>]*\bwidth=["']?(\d{2,3}%|\d{3,})/i, weight: 2 }, // table-for-layout
  { id: 'flash-refs', re: /<embed[^>]+type=["']application\/x-shockwave-flash|\.swf["']/i, weight: 2 },
  { id: 'inline-bgcolor', re: /<\w+[^>]+\bbgcolor=["']/i, weight: 1 },
  { id: 'web-1.0-fonts', re: /font-family:\s*["']?(Comic Sans|Times New Roman|Courier New|Arial Black)/i, weight: 1 },
  { id: 'marquee', re: /<marquee\b/i, weight: 2 },
  { id: 'rollover-images', re: /onmouseover=["'][^"']*\.src/i, weight: 1 },
];

const SERVICE_KEYWORDS = [
  'cosmetic', 'orthodontic', 'braces', 'invisalign', 'implant', 'whitening',
  'emergency', 'pediatric', 'children', 'veneer', 'root-canal', 'extraction',
  'crown', 'bridge', 'denture', 'periodont', 'endodontic', 'oral-surgery',
];

export function detectHtmlFeatures({ html = '', finalUrl = '' } = {}) {
  const features = {
    hasHttps: /^https:/i.test(finalUrl),
    hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
    hasSchemaOrg: /<script[^>]+application\/ld\+json[\s\S]*?(Dentist|LocalBusiness|MedicalBusiness|DentalClinic)/i.test(html),
    hasClickToCall: /<a[^>]+href=["']tel:/i.test(html),
    hasFacebookPixel: /connect\.facebook\.net\/.+\/fbevents\.js/i.test(html),
    hasGoogleAnalytics: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/ga\.js|googletagmanager\.com\/ns\.html/i.test(html),

    booking: detectBookingWidget(html),
    serviceLinkCount: countServiceLinks(html),

    datedTechFlags: detectDatedTechFlags(html),
  };

  features.datedTechFlagCount = features.datedTechFlags.length;
  features.datedTechPenalty = features.datedTechFlags.reduce((s, f) => s + f.weight, 0);

  return features;
}

function detectBookingWidget(html) {
  for (const v of BOOKING_VENDORS) {
    if (v.re.test(html)) return { present: true, vendor: v.id };
  }
  // Generic "book online"/"schedule appointment" CTA in a link/button
  if (/<(a|button)[^>]*>\s*(?:book\s+online|book\s+now|schedule\s+(?:online|appointment|now)|request\s+appointment)/i.test(html)) {
    return { present: true, vendor: 'generic-cta' };
  }
  return { present: false, vendor: null };
}

function countServiceLinks(html) {
  const seen = new Set();
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)</gi;
  let m;
  while ((m = linkRe.exec(html))) {
    const href = (m[1] || '').toLowerCase();
    const text = (m[2] || '').toLowerCase();
    for (const kw of SERVICE_KEYWORDS) {
      if (href.includes(kw) || text.includes(kw)) {
        // Normalize so /services/braces and #braces count as one
        const key = kw;
        seen.add(key);
        break;
      }
    }
  }
  return seen.size;
}

function detectDatedTechFlags(html) {
  return DATED_TECH_FLAGS.filter((f) => f.re.test(html)).map((f) => ({ id: f.id, weight: f.weight }));
}

// ──────────────────────────────────────────────────────────────────────
// Composite Design Score
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute the deterministic portion of the Design Score (0–85 max,
 * the remaining 15 points come from vision scoring downstream).
 *
 * @param {object} input
 * @param {object} input.lighthouse  - Result from runLighthouse()
 * @param {object} input.features    - Result from detectHtmlFeatures()
 */
export function computeDeterministicDesignScore({ lighthouse, features }) {
  let score = 0;

  if (lighthouse?.ok) {
    score += (lighthouse.performance / 100) * 20;
    score += (lighthouse.accessibility / 100) * 10;
    score += (lighthouse.bestPractices / 100) * 10;
  }
  if (features?.hasHttps) score += 5;
  if (features?.hasViewportMeta) score += 5;
  if (features?.hasSchemaOrg) score += 5;
  if (features?.hasClickToCall) score += 3;
  if (features?.booking?.present) score += 5;
  if (features?.serviceLinkCount >= 3) score += 5;

  score -= (features?.datedTechPenalty ?? 0) * 2;

  return Math.max(0, Math.min(85, Math.round(score)));
}

// ──────────────────────────────────────────────────────────────────────
// Business Value Score (uses only Google Places data — no fetch needed)
// ──────────────────────────────────────────────────────────────────────

const SPECIALTY_PREMIUMS = {
  orthodontist: 20,
  cosmetic_dentist: 20,
  dental_implants_periodontist: 20,
  periodontist: 18,
  endodontist: 15,
  oral_surgeon: 15,
  prosthodontist: 15,
  pediatric_dentist: 10,
  dentist: 5,
  dental_clinic: 5,
};

export function computeBusinessValueScore({ rating, reviewCount, primaryType, multiLocation = false, runningAds = false }) {
  let score = 0;

  // Review count (log-scaled, max 30 at ~2000 reviews)
  if (reviewCount > 0) {
    score += Math.min(30, Math.log10(reviewCount + 1) * 9);
  }
  // Rating: (rating − 3.5) × 20, clamped to 0–20
  if (rating != null) {
    score += Math.max(0, Math.min(20, (rating - 3.5) * 20));
  }
  // Specialty premium
  score += SPECIALTY_PREMIUMS[primaryType] ?? 5;

  // Multi-location signal (adds 0–15; we set a fixed 15 when present)
  if (multiLocation) score += 15;

  // Active ad spend (any platform)
  if (runningAds) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ──────────────────────────────────────────────────────────────────────
// Vendor multiplier
// ──────────────────────────────────────────────────────────────────────

export function vendorMultiplier({ vendorCategory, vendor }) {
  if (vendorCategory === 'dental-mill') return 1.5;
  if (vendorCategory === 'diy-builder') return 1.2;
  if (vendor === 'wordpress-generic') return 1.1;
  if (vendorCategory === 'modern-stack') return 0.3;
  return 1.0;
}

// ──────────────────────────────────────────────────────────────────────
// Final Opportunity Score + tier + quadrant
// ──────────────────────────────────────────────────────────────────────

export function computeOpportunity({ designScore, businessValue, multiplier }) {
  const raw = businessValue * ((100 - designScore) / 100) * multiplier;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function tierFor(opportunity) {
  if (opportunity >= 60) return 'A';
  if (opportunity >= 40) return 'B';
  if (opportunity >= 20) return 'C';
  return 'D';
}

export function quadrantFor({ designScore, businessValue }) {
  const goodDesign = designScore >= 60;
  const highValue = businessValue >= 50;
  if (highValue && !goodDesign) return 'Prime';
  if (highValue && goodDesign) return 'Skip — already sorted';
  if (!highValue && !goodDesign) return 'Nurture';
  return 'Low Priority';
}
