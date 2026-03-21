#!/usr/bin/env node
/**
 * scripts/gbp-respond.js
 * Reply to a Google Business Profile review.
 *
 * Setup:
 *   Same OAuth credentials as gbp-reviews.js.
 *   Get the review ID from gbp-reviews.js output.
 *
 * Environment variables (.env):
 *   GBP_CLIENT_ID       - OAuth 2.0 client ID
 *   GBP_CLIENT_SECRET   - OAuth 2.0 client secret
 *   GBP_REFRESH_TOKEN   - Refresh token from OAuth consent flow
 *   GBP_ACCOUNT_ID      - GBP account ID
 *   GBP_LOCATION_ID     - GBP location ID
 *
 * Usage:
 *   node scripts/gbp-respond.js --review-id <reviewId> --reply "Your reply text"
 */

import 'dotenv/config';
import { getAccessToken, getLocationName, gbpFetch } from './lib/gbp-auth.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { reviewId: null, reply: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--review-id' && args[i + 1]) opts.reviewId = args[i + 1];
    if (args[i] === '--reply' && args[i + 1]) opts.reply = args[i + 1];
  }
  return opts;
}

async function replyToReview(accessToken, reviewId, replyText) {
  const locationName = getLocationName();
  const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${reviewId}/reply`;
  const res = await gbpFetch(url, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ comment: replyText }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP API error ${res.status}: ${err}`);
  }

  return res.status === 204 ? { success: true } : res.json();
}

async function main() {
  const opts = parseArgs();

  if (!opts.reviewId || !opts.reply) {
    console.error('Usage: node scripts/gbp-respond.js --review-id <reviewId> --reply "Your reply text"');
    console.error('Get review IDs from: node scripts/gbp-reviews.js --unanswered');
    process.exit(1);
  }

  if (opts.reply.length > 4096) {
    console.error(`Reply is too long (${opts.reply.length} chars). Maximum is 4096 characters.`);
    process.exit(1);
  }

  console.log(`\nReplying to review: ${opts.reviewId}`);
  console.log(`Reply (${opts.reply.length} chars): ${opts.reply.substring(0, 100)}${opts.reply.length > 100 ? '...' : ''}`);

  const accessToken = await getAccessToken();
  await replyToReview(accessToken, opts.reviewId, opts.reply);

  console.log('\nReply posted successfully!');
}

main().catch(err => {
  console.error('GBP reply failed:', err.message);
  process.exit(1);
});
