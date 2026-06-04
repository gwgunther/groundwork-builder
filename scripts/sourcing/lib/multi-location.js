// Multi-location detection from rendered HTML.
//
// Signals (any match → multi-location):
//   1. Multiple unique street addresses on the homepage
//   2. Schema.org markup with multiple Place / PostalAddress nodes
//   3. Nav contains "Locations" (plural) link
//   4. URL paths like /locations/, /our-locations/
//
// Independent practices typically have ONE address on the homepage.
// Two or more strongly suggests multi-location (own branch, sister office, etc).

const STREET_ADDRESS_RE =
  /(\d{1,5})\s+([A-Za-z0-9.'\- ]{3,40})\s+(St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Way|Pkwy|Parkway|Ct|Court|Hwy|Highway|Pl|Place)\b/gi;

const LOCATIONS_LINK_RE =
  /<a[^>]+href=["']([^"']*\/(?:locations|our-locations|our-offices|offices)\/?[^"']*)["'][^>]*>(\s*<[^>]+>\s*)*\s*(?:our\s+)?locations?/i;

export function detectMultiLocation({ html = '', finalUrl = '' } = {}) {
  if (!html) return { multiLocation: false, reason: 'no html', addressCount: 0 };

  // 1. Unique addresses on the page
  const matches = [...html.matchAll(STREET_ADDRESS_RE)];
  const normalized = new Set(
    matches.map((m) => `${m[1]} ${m[2].toLowerCase().replace(/\s+/g, ' ').trim()}`),
  );
  const addressCount = normalized.size;

  // 2. JSON-LD with multiple PostalAddress
  const ldBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  let ldAddressCount = 0;
  for (const m of ldBlocks) {
    const blob = m[1] || '';
    const hits = blob.match(/"@type"\s*:\s*"PostalAddress"/g);
    if (hits) ldAddressCount += hits.length;
  }

  // 3. "Locations" plural nav link
  const hasLocationsLink = LOCATIONS_LINK_RE.test(html);

  // 4. Final URL contains /locations/
  const urlHasLocations = /\/locations?\//i.test(finalUrl);

  const multiLocation =
    addressCount >= 2 || ldAddressCount >= 2 || hasLocationsLink || urlHasLocations;

  return {
    multiLocation,
    addressCount,
    ldAddressCount,
    hasLocationsLink,
    urlHasLocations,
    reason: multiLocation
      ? [
          addressCount >= 2 && `${addressCount} addresses`,
          ldAddressCount >= 2 && `${ldAddressCount} schema postal addresses`,
          hasLocationsLink && 'locations nav link',
          urlHasLocations && '/locations/ in URL',
        ].filter(Boolean).join('; ')
      : 'single location signals',
  };
}
