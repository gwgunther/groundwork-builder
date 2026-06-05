/**
 * Vendor detection + subscription TCO estimates for audit sales docs.
 */

import { detectVendor } from '../../sourcing/lib/vendor-fingerprints.js';

const VENDOR_LABELS = {
  prosites: 'ProSites',
  pbhs: 'PBHS',
  officite: 'Officite',
  'smile-marketing': 'Smile Marketing',
  'dentist-identity': 'Dentist Identity',
  'roadside-dental': 'Roadside Dental',
  'tnt-dental': 'TNT Dental',
  wix: 'Wix',
  squarespace: 'Squarespace',
  weebly: 'Weebly',
  wordpress: 'WordPress',
  unknown: 'Unknown provider',
  unreachable: 'Site unreachable',
};

/** Monthly subscription bands used for 3-year TCO wedge copy. */
const TCO_BANDS = {
  'dental-mill':    { low: 200, high: 500, label: 'dental website subscription' },
  'diy-builder':    { low: 30,  high: 80,  label: 'website builder plan' },
  cms:              { low: 50,  high: 150, label: 'hosting + maintenance' },
  'modern-stack':   { low: 20,  high: 60,  label: 'hosting + domain' },
  unknown:          null,
};

/**
 * Fetch homepage HTML for vendor fingerprinting.
 */
export async function fetchHomepageHtml(url) {
  const target = url.startsWith('http') ? url : `https://${url}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Groundwork/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Detect vendor from a practice URL (fetches homepage).
 */
export async function detectVendorFromUrl(url) {
  const html = await fetchHomepageHtml(url);
  return detectVendor({ html, finalUrl: url });
}

export function vendorDisplayName(vendorId) {
  if (!vendorId) return 'Unknown provider';
  return VENDOR_LABELS[vendorId] || vendorId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Rule-based 3-year TCO estimate for lock-in wedge copy.
 * @returns {object|null}
 */
export function estimateTco(vendorResult) {
  if (!vendorResult || vendorResult.category === 'unknown') return null;

  const band = TCO_BANDS[vendorResult.category];
  if (!band) return null;

  const midMonthly = Math.round((band.low + band.high) / 2);
  const threeYearLow  = band.low  * 36;
  const threeYearHigh = band.high * 36;
  const threeYearMid  = midMonthly * 36;

  return {
    category: vendorResult.category,
    vendor: vendorResult.vendor,
    monthly_low: band.low,
    monthly_high: band.high,
    monthly_mid: midMonthly,
    years: 3,
    three_year_low: threeYearLow,
    three_year_high: threeYearHigh,
    three_year_mid: threeYearMid,
    label: band.label,
    copy: `Estimated ${band.label}: ~$${band.low}–$${band.high}/mo → ~$${threeYearLow.toLocaleString()}–$${threeYearHigh.toLocaleString()} over 3 years.`,
    lock_in_risk: vendorResult.category === 'dental-mill' ? 'high' : vendorResult.category === 'diy-builder' ? 'medium' : 'low',
  };
}

/**
 * Normalize vendor + TCO block for audit-data.json.
 */
export function buildVendorBlock(vendorResult) {
  const tco = estimateTco(vendorResult);
  return {
    id: vendorResult?.vendor || 'unknown',
    category: vendorResult?.category || 'unknown',
    confidence: vendorResult?.confidence ?? 0,
    display_name: vendorDisplayName(vendorResult?.vendor),
    subscription_tco: tco,
  };
}
