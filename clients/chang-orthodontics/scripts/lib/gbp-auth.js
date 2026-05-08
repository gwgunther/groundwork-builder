/**
 * scripts/lib/gbp-auth.js
 * Shared Google Business Profile OAuth utilities.
 * Used by gbp-post.js, gbp-reviews.js, and gbp-respond.js.
 *
 * Setup:
 *   Set the following in your .env file:
 *     GBP_CLIENT_ID      - OAuth 2.0 client ID from Google Cloud Console
 *     GBP_CLIENT_SECRET   - OAuth 2.0 client secret
 *     GBP_REFRESH_TOKEN   - Refresh token obtained via OAuth consent flow
 *     GBP_ACCOUNT_ID      - Your GBP account ID (use gbp-list-locations.js to find it)
 *     GBP_LOCATION_ID     - Your GBP location ID (use gbp-list-locations.js to find it)
 */

/**
 * Exchange a refresh token for a new access token.
 * Reads GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN from process.env.
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
    console.error('Error: GBP_CLIENT_ID, GBP_CLIENT_SECRET, and GBP_REFRESH_TOKEN must be set in .env');
    process.exit(1);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GBP_CLIENT_ID,
      client_secret: GBP_CLIENT_SECRET,
      refresh_token: GBP_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

/**
 * Return the GBP location resource path (accounts/.../locations/...).
 * Reads GBP_ACCOUNT_ID and GBP_LOCATION_ID from process.env.
 * @returns {string}
 */
export function getLocationName() {
  const { GBP_ACCOUNT_ID, GBP_LOCATION_ID } = process.env;
  if (!GBP_ACCOUNT_ID || !GBP_LOCATION_ID) {
    console.error('Error: GBP_ACCOUNT_ID and GBP_LOCATION_ID must be set in .env');
    process.exit(1);
  }
  return `accounts/${GBP_ACCOUNT_ID}/locations/${GBP_LOCATION_ID}`;
}

/**
 * Make an authenticated GBP API request.
 * @param {string} url
 * @param {string} accessToken
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function gbpFetch(url, accessToken, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}
