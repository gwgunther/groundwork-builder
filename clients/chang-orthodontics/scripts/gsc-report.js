#!/usr/bin/env node
/**
 * scripts/gsc-report.js
 * Fetch Google Search Console performance data for your practice website.
 * Reports top queries, pages, impressions, clicks, and CTR for the last 28 days.
 *
 * Setup:
 *   1. Enable Google Search Console API in Google Cloud Console
 *   2. Create a Service Account and download JSON credentials
 *   3. Add the service account email as a user in GSC (Verified owner or Read access)
 *   4. Set GSC_CREDENTIALS_PATH in .env
 *
 * Environment variables (.env):
 *   GSC_CREDENTIALS_PATH  - Path to service account JSON key file
 *   SITE_URL              - Your site URL as registered in GSC (e.g. "https://example.com/")
 *
 * Usage: node scripts/gsc-report.js [--days 28] [--limit 25]
 */

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SITE_URL = process.env.SITE_URL || 'https://[DOMAIN]/';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 28, limit: 25 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) opts.days = parseInt(args[i + 1]);
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1]);
  }
  return opts;
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

async function getAuthClient() {
  const credPath = process.env.GSC_CREDENTIALS_PATH;
  if (!credPath) {
    console.error('Error: GSC_CREDENTIALS_PATH not set in .env');
    process.exit(1);
  }
  const keyFile = path.resolve(credPath);
  if (!fs.existsSync(keyFile)) {
    console.error(`Error: Credentials file not found at ${keyFile}`);
    process.exit(1);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  return auth.getClient();
}

async function querySearchConsole(searchConsole, dateRange, dimensions, limit) {
  const res = await searchConsole.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions,
      rowLimit: limit,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    },
  });
  return res.data.rows || [];
}

function printTable(title, rows, keyLabel) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
  console.log(`${keyLabel.padEnd(45)} Clicks  Impr   CTR    Pos`);
  console.log('-'.repeat(70));
  for (const row of rows) {
    const key = (row.keys[0] || '').substring(0, 44).padEnd(45);
    const clicks = String(row.clicks).padStart(6);
    const impr = String(row.impressions).padStart(6);
    const ctr = `${(row.ctr * 100).toFixed(1)}%`.padStart(6);
    const pos = row.position.toFixed(1).padStart(6);
    console.log(`${key} ${clicks} ${impr} ${ctr} ${pos}`);
  }
}

async function main() {
  const opts = parseArgs();
  const dateRange = getDateRange(opts.days);

  console.log(`\nGoogle Search Console Report — ${SITE_URL}`);
  console.log(`Period: ${dateRange.startDate} → ${dateRange.endDate} (${opts.days} days)`);

  const authClient = await getAuthClient();
  const searchConsole = google.searchconsole({ version: 'v1', auth: authClient });

  const [queryRows, pageRows] = await Promise.all([
    querySearchConsole(searchConsole, dateRange, ['query'], opts.limit),
    querySearchConsole(searchConsole, dateRange, ['page'], opts.limit),
  ]);

  printTable(`Top Queries (last ${opts.days} days)`, queryRows, 'Query');
  printTable(`Top Pages (last ${opts.days} days)`, pageRows, 'Page');

  const totals = queryRows.reduce((acc, r) => ({
    clicks: acc.clicks + r.clicks,
    impressions: acc.impressions + r.impressions,
  }), { clicks: 0, impressions: 0 });

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Summary (top ${opts.limit} queries)`);
  console.log('='.repeat(70));
  console.log(`  Total clicks:      ${totals.clicks}`);
  console.log(`  Total impressions: ${totals.impressions}`);
  console.log(`  Avg CTR:           ${totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0}%`);
  console.log('');
}

main().catch(err => {
  console.error('GSC report failed:', err.message);
  process.exit(1);
});
