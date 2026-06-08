// DSO (Dental Service Organization) / chain detector.
//
// DSOs are corporate companies that own/manage many dental practices.
// Each location has its own Google Business Profile, so they appear as
// individual prospects — but the dentist can't change the website (HQ
// controls it), so they're not pitchable in our bulk pipeline.
//
// Detection strategies (any match → flagged):
//   1. URL/host patterns (most reliable — corporate template URLs)
//   2. Practice-name substring matches (catches owned brands)
//   3. Rendered-HTML markers (corporate template fingerprints)
//
// Output is conservative: false positives waste prospects; false negatives
// pollute the outreach list with non-pitchable practices. We prefer false
// negatives — better to occasionally pitch a chain than to miss real prospects.

export const CHAINS = [
  {
    id: 'pacific-dental-services',
    name: 'Pacific Dental Services',
    aka: ['PDS', 'SmileGeneration'],
    urlPatterns: [/sc_cid=GBP/i, /smilegeneration\.com/i, /pdshealth\.com/i],
    htmlPatterns: [/_pacificdentals/i, /smilegeneration\.com/i],
    namePatterns: [], // PDS practices use vanity names — can't catch by name alone
  },
  {
    id: 'heartland-dental',
    name: 'Heartland Dental',
    urlPatterns: [/heartland\.com/i, /heartlanddental\.com/i],
    htmlPatterns: [/Heartland Dental/i, /heartland\.com/i],
    namePatterns: [],
  },
  {
    id: 'aspen-dental',
    name: 'Aspen Dental',
    urlPatterns: [/aspendental\.com/i],
    htmlPatterns: [/Aspen Dental Management/i, /aspendental\.com/i],
    namePatterns: [/^Aspen Dental\b/i],
  },
  {
    id: 'western-dental',
    name: 'Western Dental',
    urlPatterns: [/westerndental\.com/i],
    htmlPatterns: [/Western Dental(?:\s*&|\s*and)\s*Orthodontics/i],
    namePatterns: [/^Western Dental\b/i],
  },
  {
    id: 'west-coast-dental',
    name: 'West Coast Dental',
    urlPatterns: [/westcoastdental\.com\/locations/i, /westcoastdental\.com/i],
    htmlPatterns: [/West Coast Dental Services/i],
    namePatterns: [/^West Coast Dental\b/i],
  },
  {
    id: 'smile-brands',
    name: 'Smile Brands',
    urlPatterns: [/smilebrands\.com/i, /bright-now-dental/i, /castledental\.com/i, /monarchdental\.com/i],
    htmlPatterns: [/Smile Brands/i],
    namePatterns: [/^Bright Now! Dental\b/i, /^Castle Dental\b/i, /^Monarch Dental\b/i],
  },
  {
    id: 'mb2-dental',
    name: 'MB2 Dental',
    urlPatterns: [/mb2dental\.com/i],
    htmlPatterns: [/MB2 Dental Solutions/i],
    namePatterns: [],
  },
  {
    id: 'affordable-dentures-implants',
    name: 'Affordable Dentures & Implants',
    urlPatterns: [/affordabledentures\.com/i],
    htmlPatterns: [/Affordable Dentures.*Implants/i],
    namePatterns: [/^Affordable Dentures\b/i],
  },
  {
    id: 'brident-dental',
    name: 'Brident Dental',
    urlPatterns: [/brident\.com/i],
    htmlPatterns: [/Brident Dental/i],
    namePatterns: [/^Brident\b/i],
  },
  {
    id: 'dental-views',
    name: 'Dental Views',
    urlPatterns: [/dentalviews\.com\/location/i],
    htmlPatterns: [/Dental Views/i],
    namePatterns: [],
  },
  {
    id: 'riverside-dental-group',
    name: 'Riverside Dental Group',
    urlPatterns: [/riversidedentalgroup\.com\//i],
    htmlPatterns: [],
    namePatterns: [],
  },
  {
    id: 'great-expressions',
    name: 'Great Expressions Dental Centers',
    urlPatterns: [/greatexpressions\.com/i],
    htmlPatterns: [/Great Expressions Dental Centers/i],
    namePatterns: [/^Great Expressions\b/i],
  },
];

/**
 * Detect whether a practice belongs to a known DSO/chain.
 *
 * @param {object} input
 * @param {string} input.practiceName  - From Google Places
 * @param {string} input.websiteUrl    - As listed on GBP (before redirects)
 * @param {string} input.finalUrl      - After redirects
 * @param {string} input.html          - Rendered HTML (use Playwright-rendered if available)
 * @returns {{ isChain: boolean, chainId: string|null, chainName: string|null,
 *            matchedBy: string[], confidence: number }}
 */
export function detectChain({ practiceName = '', websiteUrl = '', finalUrl = '', html = '' } = {}) {
  for (const chain of CHAINS) {
    const matched = [];

    for (const re of chain.urlPatterns) {
      if (re.test(websiteUrl) || re.test(finalUrl)) {
        matched.push(`url:${re.source.slice(0, 40)}`);
      }
    }
    for (const re of chain.htmlPatterns) {
      if (html && re.test(html)) matched.push(`html:${re.source.slice(0, 40)}`);
    }
    for (const re of chain.namePatterns) {
      if (re.test(practiceName)) matched.push(`name:${re.source.slice(0, 40)}`);
    }

    if (matched.length > 0) {
      return {
        isChain: true,
        chainId: chain.id,
        chainName: chain.name,
        matchedBy: matched,
        confidence: matched.length,
      };
    }
  }

  return { isChain: false, chainId: null, chainName: null, matchedBy: [], confidence: 0 };
}
