/**
 * scrape-reviews.js
 *
 * Extracts Google Maps and Yelp review data from bronze crawl output.
 * Uses Google Places API if GOOGLE_PLACES_API_KEY is set.
 *
 * @param {object} bronze - Bronze scrape result: { pageCount, pages[], siteAssets }
 * @returns {Promise<ReviewResult>}
 *
 * ReviewResult: {
 *   source: 'google'|'yelp'|null,
 *   placeId: string|null,        // hex ID from Maps URL
 *   reviews: ReviewObject[],
 *   rating: number|null,
 *   reviewCount: number|null,
 *   gmapsUrl: string|null,
 *   yelpUrl: string|null,
 * }
 *
 * ReviewObject: { author, rating, text, date, source }
 */

/**
 * @param {object} bronze
 * @returns {Promise<import('./scraper.js').ReviewResult>}
 */
export async function scrapeReviews(bronze) {
  const result = {
    source: null,
    placeId: null,
    reviews: [],
    rating: null,
    reviewCount: null,
    gmapsUrl: null,
    yelpUrl: null,
  };

  try {
    if (!bronze || !Array.isArray(bronze.pages)) return result;

    // ── 1. Collect all external links from all pages ──────────────────────
    // externalLinks may be plain strings OR { href, text, social } objects
    const allExternalLinks = [];
    for (const page of bronze.pages) {
      if (Array.isArray(page.externalLinks)) {
        for (const link of page.externalLinks) {
          const href = typeof link === 'string' ? link : (link?.href || link?.url || '');
          if (href) allExternalLinks.push(href);
        }
      }
    }

    // ── 2. Find Google Maps / Business Profile URL ────────────────────────
    // Match any of these patterns:
    //   google.com/maps/place/...
    //   g.page/<name>/review
    //   search.google.com/local/writereview?placeid=...
    //   maps.google.com/...
    const gmapsUrl =
      allExternalLinks.find(url => url.includes('google.com/maps/place')) ||
      allExternalLinks.find(url => url.includes('g.page/')) ||
      allExternalLinks.find(url => url.includes('search.google.com/local')) ||
      allExternalLinks.find(url => url.includes('maps.google.com')) ||
      null;
    result.gmapsUrl = gmapsUrl;

    // ── 3. Extract place ID from any Google URL format ────────────────────
    if (gmapsUrl) {
      // Format A: maps/place hex ID  (!1s0x...)
      const hexMatch = gmapsUrl.match(/!1s(0x[^!&?]+)/);
      if (hexMatch) {
        result.placeId = decodeURIComponent(hexMatch[1]);
      }
      // Format B: writereview?placeid=ChIJ...
      const placeIdMatch = gmapsUrl.match(/[?&]placeid=([^&]+)/i);
      if (!result.placeId && placeIdMatch) {
        result.placeId = decodeURIComponent(placeIdMatch[1]);
      }
      result.source = 'google';
    }

    // ── 4. Find Yelp URL ──────────────────────────────────────────────────
    const yelpUrl = allExternalLinks.find(url => url.includes('yelp.com/biz/')) || null;
    result.yelpUrl = yelpUrl;
    if (!result.source && yelpUrl) {
      result.source = 'yelp';
    }

    // ── 5. Check for embedded schema.org/Review objects ───────────────────
    const schemaReviews = [];
    for (const page of bronze.pages) {
      const structured = page.structuredData || [];
      const items = Array.isArray(structured) ? structured : [structured];
      for (const item of items) {
        if (!item) continue;
        // Flatten nested @graph arrays
        const nodes = item['@graph'] ? item['@graph'] : [item];
        for (const node of nodes) {
          const type = node['@type'];
          // Direct Review nodes
          if (type === 'Review' || type === 'UserReview') {
            const rev = parseSchemaReview(node);
            if (rev) schemaReviews.push(rev);
          }
          // Reviews embedded inside a LocalBusiness or similar
          if (node.review) {
            const revList = Array.isArray(node.review) ? node.review : [node.review];
            for (const r of revList) {
              const rev = parseSchemaReview(r);
              if (rev) schemaReviews.push(rev);
            }
          }
          // aggregateRating
          if (node.aggregateRating && result.rating === null) {
            const agg = node.aggregateRating;
            if (agg.ratingValue) result.rating = parseFloat(agg.ratingValue) || null;
            if (agg.reviewCount) result.reviewCount = parseInt(agg.reviewCount, 10) || null;
            if (agg.ratingCount && !result.reviewCount) result.reviewCount = parseInt(agg.ratingCount, 10) || null;
          }
        }
      }
    }

    if (schemaReviews.length > 0) {
      result.reviews = schemaReviews;
      if (!result.source) result.source = 'google';
    }

    // ── 6. Google Places API ──────────────────────────────────────────────
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey && gmapsUrl) {
      try {
        // Need a text query to resolve the canonical place_id for the Places API.
        // Build query from practice name + city extracted from bronze pages.
        const practiceName = getPracticeName(bronze);
        const city = getCity(bronze);
        const query = [practiceName, city].filter(Boolean).join(', ') || 'dental';

        // findplacefromtext → canonical place_id
        const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${apiKey}`;
        const findResp = await fetchJson(findUrl);
        const canonicalId = findResp?.candidates?.[0]?.place_id;

        if (canonicalId) {
          // details
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(canonicalId)}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;
          const detailsResp = await fetchJson(detailsUrl);
          const placeResult = detailsResp?.result;

          if (placeResult) {
            if (placeResult.rating != null) result.rating = placeResult.rating;
            if (placeResult.user_ratings_total != null) result.reviewCount = placeResult.user_ratings_total;
            if (Array.isArray(placeResult.reviews)) {
              result.reviews = placeResult.reviews.slice(0, 5).map(r => ({
                author: r.author_name || null,
                rating: r.rating || null,
                text: r.text || null,
                date: r.relative_time_description || (r.time ? new Date(r.time * 1000).toISOString() : null),
                source: 'google',
              }));
            }
            result.source = 'google';
          }
        }
      } catch (apiErr) {
        // Non-fatal — fall through to schema reviews or empty
        console.warn(`  [scrapeReviews] Places API error: ${apiErr.message}`);
      }
    }

  } catch (err) {
    // Non-throwing — return whatever we have so far
    console.warn(`  [scrapeReviews] Unexpected error: ${err.message}`);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSchemaReview(node) {
  if (!node) return null;
  try {
    const author = node.author?.name || node.author || null;
    const rating = node.reviewRating?.ratingValue
      ? parseFloat(node.reviewRating.ratingValue)
      : null;
    const text = node.reviewBody || node.description || null;
    const date = node.datePublished || null;
    if (!author && !text) return null;
    return { author, rating, text, date, source: 'schema' };
  } catch {
    return null;
  }
}

function getPracticeName(bronze) {
  // Try structured data first
  for (const page of bronze.pages || []) {
    for (const item of (page.structuredData || [])) {
      if (!item) continue;
      const nodes = item['@graph'] ? item['@graph'] : [item];
      for (const n of nodes) {
        if (n['@type'] === 'Dentist' || n['@type'] === 'LocalBusiness' || n['@type'] === 'MedicalBusiness') {
          if (n.name) return n.name;
        }
      }
    }
  }
  // Fall back to homepage title
  const home = bronze.pages?.find(p => p.path === '/' || p.url?.replace(/https?:\/\/[^/]+/, '') === '/');
  if (home?.title) return home.title.split('|')[0].split('–')[0].trim();
  return null;
}

function getCity(bronze) {
  for (const page of bronze.pages || []) {
    for (const item of (page.structuredData || [])) {
      if (!item) continue;
      const nodes = item['@graph'] ? item['@graph'] : [item];
      for (const n of nodes) {
        if (n.address?.addressLocality) return n.address.addressLocality;
      }
    }
  }
  return null;
}

async function fetchJson(url) {
  const { default: https } = await import('node:https');
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
