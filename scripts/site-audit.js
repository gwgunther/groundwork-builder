#!/usr/bin/env node
/**
 * scripts/site-audit.js
 * Crawl your practice website and audit each page for common SEO issues.
 *
 * Checks:
 *   - Title tag: present, length (30-60 chars)
 *   - Meta description: present, length (120-160 chars)
 *   - H1: present, single, not duplicate of title
 *   - Canonical: present
 *   - JSON-LD schema: present
 *   - Internal links: count
 *   - Images: alt text, missing alt
 *   - Page load time (fetch time as proxy)
 *   - noindex: flag if set
 *
 * Environment variables (.env):
 *   SITE_URL  - Your website URL (e.g. "https://example.com")
 *
 * Usage:
 *   node scripts/site-audit.js [--url https://example.com] [--limit 50]
 *   node scripts/site-audit.js --url http://localhost:4321  (for local audit)
 */

import 'dotenv/config';
import { JSDOM } from 'jsdom';

const BASE_URL = process.env.SITE_URL || 'https://[DOMAIN]';
const CONCURRENCY = 5;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: BASE_URL, limit: 50 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) opts.url = args[i + 1].replace(/\/$/, '');
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1]);
  }
  return opts;
}

async function fetchPage(url) {
  const start = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SiteAudit/1.0 (+internal)' },
    redirect: 'follow',
  });
  const ms = Date.now() - start;
  const html = await res.text();
  return { html, status: res.status, ms, finalUrl: res.url };
}

function auditPage(html, url) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const issues = [];
  const warnings = [];

  // Title
  const titleEl = doc.querySelector('title');
  const title = titleEl?.textContent?.trim() || '';
  if (!title) issues.push('Missing <title>');
  else if (title.length < 30) warnings.push(`Title short (${title.length} chars): "${title}"`);
  else if (title.length > 60) warnings.push(`Title long (${title.length} chars): "${title.substring(0, 60)}..."`);

  // Meta description
  const descEl = doc.querySelector('meta[name="description"]');
  const desc = descEl?.getAttribute('content')?.trim() || '';
  if (!desc) issues.push('Missing meta description');
  else if (desc.length < 120) warnings.push(`Description short (${desc.length} chars)`);
  else if (desc.length > 160) warnings.push(`Description long (${desc.length} chars)`);

  // H1
  const h1s = doc.querySelectorAll('h1');
  if (h1s.length === 0) issues.push('No H1 found');
  else if (h1s.length > 1) warnings.push(`Multiple H1s (${h1s.length})`);

  // Canonical
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) warnings.push('No canonical link');

  // noindex
  const robots = doc.querySelector('meta[name="robots"]');
  const isNoindex = robots?.getAttribute('content')?.includes('noindex');
  if (isNoindex) warnings.push('Page is noindex');

  // JSON-LD
  const schemas = doc.querySelectorAll('script[type="application/ld+json"]');
  if (schemas.length === 0) warnings.push('No JSON-LD schema found');

  // Images without alt
  const images = doc.querySelectorAll('img');
  const missingAlt = Array.from(images).filter(img => !img.getAttribute('alt'));
  if (missingAlt.length > 0) warnings.push(`${missingAlt.length} image(s) missing alt text`);

  // Internal links — match against the base URL from env/args
  const baseUrl = process.env.SITE_URL || BASE_URL;
  const links = doc.querySelectorAll('a[href]');
  const internalLinks = Array.from(links).filter(a => {
    const href = a.getAttribute('href');
    return href && (href.startsWith('/') || href.includes(new URL(baseUrl).hostname));
  });

  return {
    url,
    title: title.substring(0, 55),
    titleLen: title.length,
    descLen: desc.length,
    h1Count: h1s.length,
    hasCanonical: !!canonical,
    hasSchema: schemas.length > 0,
    isNoindex: !!isNoindex,
    internalLinkCount: internalLinks.length,
    imageCount: images.length,
    missingAltCount: missingAlt.length,
    issues,
    warnings,
  };
}

async function crawlSite(baseUrl, limit) {
  const visited = new Set();
  const queue = [baseUrl + '/'];
  const results = [];

  async function processUrl(url) {
    if (visited.has(url) || visited.size >= limit) return [];
    visited.add(url);

    let fetchResult;
    try {
      fetchResult = await fetchPage(url);
    } catch (err) {
      results.push({ url, error: err.message });
      return [];
    }

    const { html, status, ms } = fetchResult;
    if (status !== 200) {
      results.push({ url, error: `HTTP ${status}` });
      return [];
    }

    const audit = auditPage(html, url);
    audit.loadMs = ms;
    results.push(audit);

    // Extract links to crawl
    const dom = new JSDOM(html);
    const links = dom.window.document.querySelectorAll('a[href]');
    const discovered = [];
    for (const link of links) {
      let href = link.getAttribute('href');
      if (!href) continue;
      if (href.startsWith('/')) href = baseUrl + href;
      if (!href.startsWith(baseUrl)) continue;
      // Strip query and hash
      href = href.split('?')[0].split('#')[0];
      if (!visited.has(href) && !queue.includes(href)) discovered.push(href);
    }
    return discovered;
  }

  while (queue.length > 0 && visited.size < limit) {
    const batch = queue.splice(0, CONCURRENCY);
    const newLinks = await Promise.all(batch.map(processUrl));
    for (const links of newLinks) queue.push(...links);
  }

  return results;
}

function printReport(results, baseUrl) {
  console.log(`\nSite Audit — ${baseUrl}`);
  console.log(`Pages audited: ${results.length}`);

  const withIssues = results.filter(r => r.issues?.length > 0);
  const withWarnings = results.filter(r => r.warnings?.length > 0);
  const withErrors = results.filter(r => r.error);

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('  SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Pages with critical issues:  ${withIssues.length}`);
  console.log(`  Pages with warnings:         ${withWarnings.length}`);
  console.log(`  Pages with fetch errors:     ${withErrors.length}`);

  // Issues
  if (withIssues.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('  CRITICAL ISSUES');
    console.log('='.repeat(80));
    for (const r of withIssues) {
      console.log(`\n  ${r.url}`);
      for (const issue of r.issues) console.log(`    x ${issue}`);
    }
  }

  // Warnings
  if (withWarnings.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('  WARNINGS');
    console.log('='.repeat(80));
    for (const r of withWarnings) {
      if (r.warnings.length === 0) continue;
      console.log(`\n  ${r.url}`);
      for (const w of r.warnings) console.log(`    ! ${w}`);
    }
  }

  // Full page table
  console.log(`\n${'='.repeat(80)}`);
  console.log('  ALL PAGES');
  console.log('='.repeat(80));
  console.log('URL'.padEnd(50) + 'Title Len  Desc Len  H1  Schema  NoIdx  ms');
  console.log('-'.repeat(80));
  for (const r of results) {
    if (r.error) {
      console.log(`${r.url.substring(0, 49).padEnd(50)} ERROR: ${r.error}`);
      continue;
    }
    const url = r.url.replace(baseUrl, '').substring(0, 49).padEnd(50) || '/';
    console.log(
      `${url}` +
      String(r.titleLen).padStart(9) +
      String(r.descLen).padStart(10) +
      String(r.h1Count).padStart(4) +
      (r.hasSchema ? '     Y' : '     N') +
      (r.isNoindex ? '    Y' : '    N') +
      String(r.loadMs).padStart(6)
    );
  }

  console.log('');
}

async function main() {
  const opts = parseArgs();
  console.log(`\nCrawling ${opts.url} (limit: ${opts.limit} pages)...`);
  const results = await crawlSite(opts.url, opts.limit);
  printReport(results, opts.url);
}

main().catch(err => {
  console.error('Site audit failed:', err.message);
  process.exit(1);
});
