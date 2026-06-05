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
    hasContactForm: detectContactForm(html), // contactability signal (not a design signal)

    datedTechFlags: detectDatedTechFlags(html),
  };

  features.datedTechFlagCount = features.datedTechFlags.length;
  features.datedTechPenalty = features.datedTechFlags.reduce((s, f) => s + f.weight, 0);

  return features;
}

// Contactability signal — does the site have a usable contact form?
// All patterns are simple / non-backtracking (ReDoS-safe).
function detectContactForm(html) {
  // Known form plugins/builders/vendors
  if (/(wpcf7|contact-form-7|gravity[ _-]?forms?|gform_|jotform|hsforms\.net|hubspotforms|formstack|wufoo|typeform|ninja[ _-]?forms)/i.test(html)) return true;
  // An explicit email input field — strong signal of a real contact form
  if (/<input[^>]+type=["']email["']/i.test(html)) return true;
  // A <form> plus a <textarea> (message box) anywhere on the page
  if (/<form[\s>]/i.test(html) && /<textarea[\s>]/i.test(html)) return true;
  return false;
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
// Lighthouse bands — Google's own quality tiers. We consume BANDS, never the
// raw 0–100 (per Google's variability guidance, the band is the trustworthy
// unit). 90–100 = Good (green, ~top 8% of the web) · 50–89 = Needs Improvement
// (orange) · 0–49 = Poor (red).
// ──────────────────────────────────────────────────────────────────────

export function lighthouseBand(score) {
  if (score == null) return null;
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

export function lighthouseBands(lighthouse) {
  if (!lighthouse?.ok) return { performance: null, accessibility: null, bestPractices: null, seo: null };
  return {
    performance: lighthouseBand(lighthouse.performance),
    accessibility: lighthouseBand(lighthouse.accessibility),
    bestPractices: lighthouseBand(lighthouse.bestPractices),
    seo: lighthouseBand(lighthouse.seo),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Quality Checklist — the ONE computed number, a UNIFORM count (no weights).
// Each item is a pass/fail bar grounded in an external standard (Google
// Lighthouse band) or a verifiable HTML fact. Score = how many pass (0–11).
// The FAILED items are the outreach pitch.
//
// Lighthouse band per item is chosen to be the band that DISCRIMINATES in this
// vertical: "Good" (green) where it's achievable (a11y/best-practices/SEO),
// "not Poor" (≥50) for performance — because Google-green mobile performance is
// near-impossible for content-heavy dental sites (only ~3% reach it), so
// requiring it would carry no information. Both are Google's own boundaries.
// ──────────────────────────────────────────────────────────────────────

export const QUALITY_CHECKS = [
  { key: 'perf_not_poor',  label: 'Mobile performance not Poor (Google)',
    test: (c) => c.lighthouse?.ok && c.lighthouse.performance >= 50 },
  { key: 'a11y_good',      label: 'Accessibility rated Good (Google)',
    test: (c) => c.lighthouse?.ok && c.lighthouse.accessibility >= 90 },
  { key: 'bp_good',        label: 'Best Practices rated Good (Google)',
    test: (c) => c.lighthouse?.ok && c.lighthouse.bestPractices >= 90 },
  { key: 'seo_good',       label: 'SEO rated Good (Google)',
    test: (c) => c.lighthouse?.ok && c.lighthouse.seo >= 90 },
  { key: 'custom_build',   label: 'Custom build (not a template/mill)',
    test: (c) => c.vendorCategory === 'modern-stack' },
  { key: 'schema',         label: 'Structured data (schema.org)',
    test: (c) => !!c.features?.hasSchemaOrg },
  { key: 'booking',        label: 'Online booking',
    test: (c) => !!c.features?.booking?.present },
  { key: 'click_to_call',  label: 'Click-to-call',
    test: (c) => !!c.features?.hasClickToCall },
  { key: 'https',          label: 'HTTPS',
    test: (c) => !!c.features?.hasHttps },
  { key: 'viewport',       label: 'Mobile viewport',
    test: (c) => !!c.features?.hasViewportMeta },
  { key: 'no_dated_tech',  label: 'No dated tech',
    test: (c) => (c.features?.datedTechFlagCount || 0) === 0 },
];

export const QUALITY_TOTAL = QUALITY_CHECKS.length; // 11

/**
 * Run the checklist. Returns the count passed, plus passed/failed label lists.
 * The failed labels feed the outreach pitch ("Missing Items").
 */
export function computeChecklist({ lighthouse, features, vendorCategory } = {}) {
  const ctx = { lighthouse, features, vendorCategory };
  const passed = [], failed = [];
  for (const chk of QUALITY_CHECKS) {
    (chk.test(ctx) ? passed : failed).push(chk.label);
  }
  return {
    qualityScore: passed.length,        // 0–11 (higher = better site)
    weaknessScore: failed.length,       // 0–11 (higher = weaker site)
    total: QUALITY_TOTAL,
    passed,
    failed,                             // = the pitch
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tiers — gate-based, over two OBJECTIVE axes (no blended number).
//   • Business strength  = review-count percentile (data-relative, per metro)
//   • Site weakness      = failed-check count (uniform)
// ──────────────────────────────────────────────────────────────────────

export function weaknessTier(weaknessScore) {
  if (weaknessScore >= 6) return 'Severe';
  if (weaknessScore >= 3) return 'Moderate';
  return 'Minor';
}

// Business tier from this practice's review count vs the metro's distribution.
// thresholds = { p75, median } computed per metro (see computeMetroThresholds).
export function businessTier(reviewCount, thresholds) {
  const n = reviewCount || 0;
  if (thresholds && n >= thresholds.p75) return 'High';
  if (thresholds && n >= thresholds.median) return 'Med';
  return 'Low';
}

export function quadrantFor({ bizTier, weakTier }) {
  const highBiz = bizTier === 'High';
  const weakSite = weakTier === 'Severe' || weakTier === 'Moderate';
  if (highBiz && weakSite) return 'Prime';
  if (highBiz && !weakSite) return 'Skip — already sorted';
  if (!highBiz && weakSite) return 'Nurture';
  return 'Low Priority';
}

// At-a-glance tier from the two axes. A = best prospect (strong biz + very weak site).
export function tierFor({ bizTier, weakTier }) {
  if (bizTier === 'High' && weakTier === 'Severe') return 'A';
  if (bizTier === 'High' && weakTier === 'Moderate') return 'B';
  if (bizTier === 'Med' && (weakTier === 'Severe' || weakTier === 'Moderate')) return 'C';
  return 'D';
}

// ──────────────────────────────────────────────────────────────────────
// Per-metro percentile thresholds (data-relative — no invented absolutes).
// Pass the metro's practices; get { reviews:{median,p75}, ratingMedian }.
// ──────────────────────────────────────────────────────────────────────

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

export function computeMetroThresholds(practices) {
  const reviews = practices.map((r) => r.reviewCount || 0).sort((a, b) => a - b);
  const ratings = practices.map((r) => r.rating || 0).filter((x) => x > 0).sort((a, b) => a - b);
  return {
    reviews: { median: percentile(reviews, 50), p75: percentile(reviews, 75) },
    ratingMedian: percentile(ratings, 50),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Exemplar ("Top Site") — pure objective GATES:
//   independent · not a mill · custom build · Good a11y/best-practices/SEO ·
//   "established" (review floor) · "well-liked" (rating floor)
//
// Why FLOORS, not percentiles, for the business gates here (unlike the prospect
// business-tier, which IS percentile-ranked):
//   • Reviews are right-skewed — "top quartile" measures SIZE, not whether a
//     practice is established. A floor ("150+ patient reviews") captures the
//     intent: proven enough that the site demonstrably works.
//   • Dental ratings are compressed at the top (metro medians ~4.9), so
//     "above median" is hypersensitive (a 4.8 site fails). A floor ("4.5★+")
//     is the meaningful "strongly liked" cut.
// Performance deliberately NOT gated — universally low / noisy in this vertical.
// ──────────────────────────────────────────────────────────────────────

export const EXEMPLAR_MIN_REVIEWS = 150; // "established" floor
export const EXEMPLAR_MIN_RATING = 4.5;  // "well-liked" floor

export function classifyExemplar({ lighthouse, vendorCategory, isChain, reviewCount, rating }) {
  const lh = lighthouse?.ok ? lighthouse : null;
  const reasons = [];
  if (isChain) reasons.push('chain/DSO');
  if (vendorCategory === 'dental-mill') reasons.push('mill template');
  if (vendorCategory !== 'modern-stack') reasons.push('not a custom build');
  if (!lh || lh.accessibility < 90) reasons.push('accessibility not Good');
  if (!lh || lh.bestPractices < 90) reasons.push('best-practices not Good');
  if (!lh || lh.seo < 90) reasons.push('SEO not Good');
  if ((rating || 0) < EXEMPLAR_MIN_RATING) reasons.push(`rating < ${EXEMPLAR_MIN_RATING}`);
  if ((reviewCount || 0) < EXEMPLAR_MIN_REVIEWS) reasons.push(`reviews < ${EXEMPLAR_MIN_REVIEWS}`);
  return { isExemplar: reasons.length === 0, failedOn: reasons };
}
