#!/usr/bin/env node
/**
 * scripts/gbp-reviews.js
 * Fetch and display recent Google Business Profile reviews for your practice.
 *
 * Setup:
 *   Same OAuth credentials as gbp-post.js.
 *   Set GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN, GBP_ACCOUNT_ID,
 *   and GBP_LOCATION_ID in .env.
 *
 * Environment variables (.env):
 *   GBP_CLIENT_ID       - OAuth 2.0 client ID
 *   GBP_CLIENT_SECRET   - OAuth 2.0 client secret
 *   GBP_REFRESH_TOKEN   - Refresh token from OAuth consent flow
 *   GBP_ACCOUNT_ID      - GBP account ID
 *   GBP_LOCATION_ID     - GBP location ID
 *   PRACTICE_NAME       - Your practice name (for report headers)
 *
 * Usage: node scripts/gbp-reviews.js [--limit 10] [--stars 1] [--unanswered]
 */

import 'dotenv/config';
import { getAccessToken, getLocationName } from './lib/gbp-auth.js';

const PRACTICE_NAME = process.env.PRACTICE_NAME || '[PRACTICE_NAME]';
const STAR_LABELS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 10, minStars: 1, unansweredOnly: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1]);
    if (args[i] === '--stars' && args[i + 1]) opts.minStars = parseInt(args[i + 1]);
    if (args[i] === '--unanswered') opts.unansweredOnly = true;
  }
  return opts;
}

async function fetchReviews(accessToken, pageToken = null) {
  const locationName = getLocationName();
  const params = new URLSearchParams({ pageSize: 50 });
  if (pageToken) params.set('pageToken', pageToken);

  const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GBP API error ${res.status}: ${err}`);
  }
  return res.json();
}

function starValue(starRating) {
  return STAR_LABELS[starRating] || 0;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function stars(rating) {
  const val = starValue(rating);
  return '\u2605'.repeat(val) + '\u2606'.repeat(5 - val);
}

async function main() {
  const opts = parseArgs();
  const accessToken = await getAccessToken();

  // Fetch reviews (paginate up to get enough)
  let allReviews = [];
  let pageToken = null;
  do {
    const data = await fetchReviews(accessToken, pageToken);
    allReviews = allReviews.concat(data.reviews || []);
    pageToken = data.nextPageToken;
  } while (pageToken && allReviews.length < 200);

  // Filter
  let filtered = allReviews.filter(r => starValue(r.starRating) >= opts.minStars);
  if (opts.unansweredOnly) filtered = filtered.filter(r => !r.reviewReply);

  // Sort by create time descending
  filtered.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

  const displayed = filtered.slice(0, opts.limit);

  console.log(`\nGoogle Business Profile Reviews — ${PRACTICE_NAME}`);
  console.log(`Showing ${displayed.length} of ${filtered.length} reviews (filtered from ${allReviews.length} total)`);
  if (opts.unansweredOnly) console.log('Filter: Unanswered only');
  if (opts.minStars > 1) console.log(`Filter: ${opts.minStars}+ stars`);

  for (const review of displayed) {
    console.log(`\n${'\u2500'.repeat(70)}`);
    console.log(`${stars(review.starRating)}  ${formatDate(review.createTime)}`);
    console.log(`Reviewer: ${review.reviewer?.displayName || 'Anonymous'}`);
    if (review.comment) {
      console.log(`\n"${review.comment.substring(0, 300)}${review.comment.length > 300 ? '...' : ''}"`);
    } else {
      console.log('\n(No written review — rating only)');
    }
    if (review.reviewReply) {
      console.log(`\nYour reply (${formatDate(review.reviewReply.updateTime)}):`);
      console.log(`"${review.reviewReply.comment.substring(0, 200)}${review.reviewReply.comment.length > 200 ? '...' : ''}"`);
    } else {
      console.log('\n[No reply yet]');
    }
    console.log(`Review ID: ${review.reviewId}`);
  }

  // Stats
  const avgRating = allReviews.reduce((sum, r) => sum + starValue(r.starRating), 0) / (allReviews.length || 1);
  const unanswered = allReviews.filter(r => !r.reviewReply).length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Total reviews: ${allReviews.length}  |  Avg rating: ${avgRating.toFixed(2)}  |  Unanswered: ${unanswered}`);
  console.log('');
}

main().catch(err => {
  console.error('GBP reviews fetch failed:', err.message);
  process.exit(1);
});
