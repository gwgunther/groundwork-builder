// Thin wrapper around Google Places API (New).
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
//
// We use Text Search (POST) with a field mask to control cost.
// Returns up to 20 results per page, up to 3 pages (60 max) per query.

const BASE = 'https://places.googleapis.com/v1/places:searchText';

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
  'places.location',          // {latitude, longitude} — was missing; needed for map views
  'places.googleMapsUri',     // canonical Google Maps / GBP link
  'nextPageToken',
].join(',');

/**
 * Text Search. Optionally biased/restricted to a circle (lat/lng + radius)
 * for metro-wide "most prominent" coverage.
 *
 * @param {object} args
 * @param {string} args.query          - e.g. "dentist" or "cosmetic dentist"
 * @param {object} [args.locationBias] - { latitude, longitude, radiusMeters }
 *        Uses locationBias (not locationRestriction) so Google still ranks by
 *        prominence within the area rather than hard-clipping to the circle.
 */
export async function textSearch({ apiKey, query, maxPages = 3, pageSize = 20, locationBias }) {
  const results = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const body = { textQuery: query, pageSize };
    if (pageToken) body.pageToken = pageToken;
    if (locationBias) {
      body.locationBias = {
        circle: {
          center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
          radius: locationBias.radiusMeters,
        },
      };
    }

    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': SEARCH_FIELDS,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places API ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = await res.json();
    if (json.places) results.push(...json.places);
    pageToken = json.nextPageToken;
    if (!pageToken) break;
    // Required short delay before pageToken becomes valid.
    await new Promise((r) => setTimeout(r, 2000));
  }
  return results;
}

/**
 * Geocode a place name (e.g. "Dallas, TX") to { latitude, longitude } using
 * the Places Text Search endpoint (no separate Geocoding API needed). Returns
 * null if nothing found.
 */
export async function geocodePlace({ apiKey, query }) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Geocode ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const loc = json.places?.[0]?.location;
  return loc ? { latitude: loc.latitude, longitude: loc.longitude } : null;
}
