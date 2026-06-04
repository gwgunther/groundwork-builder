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
  'nextPageToken',
].join(',');

export async function textSearch({ apiKey, query, maxPages = 3, pageSize = 20 }) {
  const results = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const body = { textQuery: query, pageSize };
    if (pageToken) body.pageToken = pageToken;

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
