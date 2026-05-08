#!/usr/bin/env node
/**
 * scripts/gbp-list-locations.js
 * One-time helper: lists all GBP locations for the account so you can
 * find and copy the GBP_LOCATION_ID value for your .env file.
 *
 * Prerequisites (.env):
 *   GBP_CLIENT_ID       - OAuth 2.0 client ID
 *   GBP_CLIENT_SECRET   - OAuth 2.0 client secret
 *   GBP_REFRESH_TOKEN   - Refresh token from OAuth consent flow
 *   GBP_ACCOUNT_ID      - Your GBP account ID
 *
 * Usage: node scripts/gbp-list-locations.js
 */

import 'dotenv/config';

async function getAccessToken() {
  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
    console.error('\nMissing .env vars. Make sure these are set:');
    console.error('   GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN\n');
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
  if (!data.access_token) {
    console.error('\nFailed to get access token:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data.access_token;
}

async function listLocations() {
  const { GBP_ACCOUNT_ID } = process.env;
  if (!GBP_ACCOUNT_ID) {
    console.error('\nGBP_ACCOUNT_ID not set in .env\n');
    process.exit(1);
  }

  const token = await getAccessToken();

  // Use legacy v4 API — same endpoint as gbp-reviews.js and gbp-post.js
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${GBP_ACCOUNT_ID}/locations`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await res.json();

  if (data.error) {
    console.error('\nAPI error:', JSON.stringify(data.error, null, 2));
    console.error('\nGBP API access must be requested at: https://developers.google.com/my-business/content/prereqs\n');
    process.exit(1);
  }

  if (!data.locations?.length) {
    // Raw dump helps debug if field names differ
    console.log('\nResponse received but no locations array found. Raw response:');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`\nFound ${data.locations.length} location(s):\n`);
  data.locations.forEach((loc, i) => {
    // name format: "accounts/12345/locations/67890"
    const locationId = loc.name.split('/').pop();
    const title = loc.title ?? loc.locationName ?? '(no title)';
    console.log(`Location ${i + 1}: ${title}`);
    console.log(`  Full name : ${loc.name}`);
    console.log(`  GBP_LOCATION_ID=${locationId}\n`);
  });

  console.log('Copy the GBP_LOCATION_ID value above into your .env file.\n');
}

listLocations().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
