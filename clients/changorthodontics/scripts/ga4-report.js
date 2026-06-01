#!/usr/bin/env node
/**
 * scripts/ga4-report.js
 * Fetch GA4 analytics data for your practice website.
 * Reports sessions, conversions, top pages, and traffic sources.
 *
 * Setup:
 *   1. Enable the Google Analytics Data API in Google Cloud Console
 *   2. Create a Service Account, grant it Viewer access on the GA4 property
 *   3. Download JSON credentials and set GA4_CREDENTIALS_PATH in .env
 *   4. Set GA4_PROPERTY_ID in .env (format: "properties/XXXXXXXXX")
 *
 * Environment variables (.env):
 *   GA4_CREDENTIALS_PATH  - Path to service account JSON key file
 *   GA4_PROPERTY_ID       - GA4 property ID (e.g. "properties/123456789")
 *   PRACTICE_NAME         - Your practice name (for report headers)
 *
 * Usage: node scripts/ga4-report.js [--days 28] [--limit 20]
 */

import 'dotenv/config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import path from 'path';
import fs from 'fs';

const PRACTICE_NAME = process.env.PRACTICE_NAME || '[PRACTICE_NAME]';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 28, limit: 20 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) opts.days = parseInt(args[i + 1]);
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1]);
  }
  return opts;
}

function getClient() {
  const credPath = process.env.GA4_CREDENTIALS_PATH;
  if (!credPath) {
    console.error('Error: GA4_CREDENTIALS_PATH not set in .env');
    process.exit(1);
  }
  const keyFile = path.resolve(credPath);
  if (!fs.existsSync(keyFile)) {
    console.error(`Error: Credentials file not found at ${keyFile}`);
    process.exit(1);
  }
  return new BetaAnalyticsDataClient({ keyFile });
}

function getProperty() {
  const prop = process.env.GA4_PROPERTY_ID;
  if (!prop) {
    console.error('Error: GA4_PROPERTY_ID not set in .env (format: "properties/XXXXXXXXX")');
    process.exit(1);
  }
  return prop.startsWith('properties/') ? prop : `properties/${prop}`;
}

function getDateRange(days) {
  return { startDate: `${days}daysAgo`, endDate: 'yesterday' };
}

function printTable(title, rows, dimLabel, metricLabels) {
  console.log(`\n${'='.repeat(75)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(75));
  const header = dimLabel.padEnd(40) + metricLabels.map(m => m.padStart(10)).join('');
  console.log(header);
  console.log('-'.repeat(75));
  for (const row of rows) {
    const dim = (row.dimensionValues[0]?.value || '').substring(0, 39).padEnd(40);
    const metrics = row.metricValues.map(m => String(m.value).padStart(10)).join('');
    console.log(`${dim}${metrics}`);
  }
}

async function main() {
  const opts = parseArgs();
  const analyticsDataClient = getClient();
  const property = getProperty();
  const dateRange = getDateRange(opts.days);

  console.log(`\nGA4 Analytics Report — ${PRACTICE_NAME}`);
  console.log(`Period: last ${opts.days} days`);

  // Overview report: sessions, users, conversions
  const [overviewResponse] = await analyticsDataClient.runReport({
    property,
    dateRanges: [dateRange],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'conversions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
  });

  const ov = overviewResponse.rows?.[0]?.metricValues || [];
  console.log(`\n${'='.repeat(75)}`);
  console.log('  Overview');
  console.log('='.repeat(75));
  console.log(`  Sessions:                ${ov[0]?.value || 0}`);
  console.log(`  Total users:             ${ov[1]?.value || 0}`);
  console.log(`  New users:               ${ov[2]?.value || 0}`);
  console.log(`  Conversions:             ${ov[3]?.value || 0}`);
  console.log(`  Bounce rate:             ${ov[4]?.value ? (parseFloat(ov[4].value) * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`  Avg session duration:    ${ov[5]?.value ? Math.round(parseFloat(ov[5].value)) + 's' : 'N/A'}`);

  // Top pages
  const [pagesResponse] = await analyticsDataClient.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: opts.limit,
  });
  printTable(`Top Pages (${opts.limit})`, pagesResponse.rows || [], 'Page Path', ['Sessions', 'Convs']);

  // Traffic sources
  const [sourcesResponse] = await analyticsDataClient.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });
  printTable('Traffic by Channel', sourcesResponse.rows || [], 'Channel', ['Sessions', 'Convs']);

  // Device category
  const [deviceResponse] = await analyticsDataClient.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  printTable('Sessions by Device', deviceResponse.rows || [], 'Device', ['Sessions']);

  console.log('');
}

main().catch(err => {
  console.error('GA4 report failed:', err.message);
  process.exit(1);
});
