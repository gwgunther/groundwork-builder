#!/usr/bin/env node
/**
 * scripts/gbp-post.js
 * Create a Google Business Profile (GBP) post for your practice.
 *
 * Setup:
 *   1. Enable the My Business Business Information API and My Business Lodging API
 *      in Google Cloud Console
 *   2. Use OAuth 2.0 credentials (GBP does not support service accounts for posts)
 *   3. Set GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN, GBP_ACCOUNT_ID,
 *      and GBP_LOCATION_ID in .env
 *
 * Environment variables (.env):
 *   GBP_CLIENT_ID       - OAuth 2.0 client ID
 *   GBP_CLIENT_SECRET   - OAuth 2.0 client secret
 *   GBP_REFRESH_TOKEN   - Refresh token from OAuth consent flow
 *   GBP_ACCOUNT_ID      - GBP account ID
 *   GBP_LOCATION_ID     - GBP location ID
 *   SITE_URL            - Your website URL (used for default CTA link)
 *   DEFAULT_CTA_PATH    - Path for default CTA link (default: "/schedule")
 *
 * Usage:
 *   node scripts/gbp-post.js --text "Your post text" [--cta-type CALL] [--cta-url https://...]
 *
 * CTA types: LEARN_MORE, CALL, SIGN_UP, ORDER, BUY, GET_OFFER, BOOK
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { getLocationName, getAccessToken as getAccessTokenViaLib } from './lib/gbp-auth.js';

const CTA_TYPES = ['LEARN_MORE', 'CALL', 'SIGN_UP', 'ORDER', 'BUY', 'GET_OFFER', 'BOOK'];
const SITE_URL = process.env.SITE_URL || 'https://[DOMAIN]';
const DEFAULT_CTA_PATH = process.env.DEFAULT_CTA_PATH || '/schedule';
const DEFAULT_CTA_URL = `${SITE_URL}${DEFAULT_CTA_PATH}`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { text: null, ctaType: 'LEARN_MORE', ctaUrl: DEFAULT_CTA_URL };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text' && args[i + 1]) opts.text = args[i + 1];
    if (args[i] === '--cta-type' && args[i + 1]) opts.ctaType = args[i + 1].toUpperCase();
    if (args[i] === '--cta-url' && args[i + 1]) opts.ctaUrl = args[i + 1];
  }
  return opts;
}

function getOAuthClient() {
  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
    console.error('Error: GBP_CLIENT_ID, GBP_CLIENT_SECRET, and GBP_REFRESH_TOKEN must be set in .env');
    process.exit(1);
  }
  const auth = new google.auth.OAuth2(GBP_CLIENT_ID, GBP_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GBP_REFRESH_TOKEN });
  return auth;
}

async function createPost(text, ctaType, ctaUrl) {
  const auth = getOAuthClient();
  const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth });

  const postBody = {
    languageCode: 'en-US',
    summary: text,
    callToAction: {
      actionType: ctaType,
      url: ctaType !== 'CALL' ? ctaUrl : undefined,
    },
    topicType: 'STANDARD',
  };

  const locationName = getLocationName();

  // Note: The actual posts API endpoint uses mybusinesspostings v4.9
  // Using direct fetch as the googleapis client may not include this API
  const tokenResponse = await auth.getAccessToken();
  const accessToken = tokenResponse.token;

  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GBP API error ${response.status}: ${err}`);
  }

  return response.json();
}

async function main() {
  const opts = parseArgs();

  if (!opts.text) {
    console.error('Usage: node scripts/gbp-post.js --text "Your post text" [--cta-type LEARN_MORE] [--cta-url https://...]');
    console.error(`Valid CTA types: ${CTA_TYPES.join(', ')}`);
    process.exit(1);
  }

  if (!CTA_TYPES.includes(opts.ctaType)) {
    console.error(`Invalid CTA type "${opts.ctaType}". Valid types: ${CTA_TYPES.join(', ')}`);
    process.exit(1);
  }

  console.log('\nCreating Google Business Profile post...');
  console.log(`Text (${opts.text.length} chars): ${opts.text.substring(0, 80)}...`);
  console.log(`CTA: ${opts.ctaType} → ${opts.ctaUrl}`);

  const result = await createPost(opts.text, opts.ctaType, opts.ctaUrl);
  console.log('\nPost created successfully!');
  console.log(`Post name: ${result.name}`);
  console.log(`State: ${result.state}`);
}

main().catch(err => {
  console.error('GBP post failed:', err.message);
  process.exit(1);
});
