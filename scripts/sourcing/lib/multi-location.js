// Multi-location detection from rendered HTML.
//
// Signals (any match → multi-location):
//   1. Schema.org markup with multiple PostalAddress nodes
//   2. A nav/link pointing at a /locations (or /offices) path
//   3. URL paths like /locations/, /our-locations/
//
// Independent practices typically have ONE address; multiple strongly
// suggests multi-location (own branch, sister office, etc.).
//
// NOTE: an earlier version also scanned free text for street addresses with
//   /(\d{1,5})\s+([A-Za-z0-9.'\- ]{3,40})\s+(St|Ave|...)/g
// — a class containing spaces wrapped in \s+...\s+. On whitespace-heavy pages
// (e.g. a 325KB chain site) the ambiguous whitespace partitioning caused
// catastrophic regex backtracking that pinned a CPU core indefinitely. That
// signal was also the noisiest, so it was removed entirely. All remaining
// patterns are linear / non-backtracking.

// Cap regex-scanned size defensively — rendered HTML can be multi-MB.
const MAX_SCAN_CHARS = 1_500_000;

export function detectMultiLocation({ html = '', finalUrl = '' } = {}) {
  if (!html) return { multiLocation: false, reason: 'no html', ldAddressCount: 0 };
  if (html.length > MAX_SCAN_CHARS) html = html.slice(0, MAX_SCAN_CHARS);

  // 1. JSON-LD with multiple PostalAddress nodes
  const ldBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  let ldAddressCount = 0;
  for (const m of ldBlocks) {
    const blob = m[1] || '';
    const hits = blob.match(/"@type"\s*:\s*"PostalAddress"/g);
    if (hits) ldAddressCount += hits.length;
  }

  // 2. A link whose href points at a /locations|/offices path. Simple href
  //    scan — no nested quantifiers, linear.
  const hasLocationsLink = /href=["'][^"']*\/(?:locations|our-locations|our-offices|offices)\b/i.test(html);

  // 3. Final URL contains /locations/
  const urlHasLocations = /\/locations?\//i.test(finalUrl);

  const multiLocation = ldAddressCount >= 2 || hasLocationsLink || urlHasLocations;

  return {
    multiLocation,
    ldAddressCount,
    hasLocationsLink,
    urlHasLocations,
    reason: multiLocation
      ? [
          ldAddressCount >= 2 && `${ldAddressCount} schema postal addresses`,
          hasLocationsLink && 'locations link',
          urlHasLocations && '/locations/ in URL',
        ].filter(Boolean).join('; ')
      : 'single location signals',
  };
}
