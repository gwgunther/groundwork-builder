/**
 * Bronze Layer — Pure Site Crawler
 *
 * Crawls a website and returns raw, uninterpreted page data.
 * No extraction, no mapping, no classification — just what's on the pages.
 *
 * Output shape: BronzeData (see bottom of file for type comments)
 * Consumer:     lib/ai-silver.js (transforms bronze → silver PracticeData)
 */

import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT  = 'GroundworkBuilder-Scraper/1.0 (+internal)';
const CONCURRENCY = 5;
const DEFAULT_LIMIT = 500;

/** Classes/IDs that suggest hero/banner text blocks worth surfacing. */
const HERO_SELECTORS = [
  '[class*="slide-heading"]', '[class*="hero-heading"]', '[class*="hero-title"]',
  '[class*="banner-heading"]', '[class*="banner-title"]', '[class*="slider-heading"]',
  '[class*="hero-text"]', '[class*="slide-title"]', '[class*="slideshow-heading"]',
  '[class*="hero-content"] h1', '[class*="hero-content"] h2', '[class*="hero-content"] p',
  '[class*="banner-content"] h1', '[class*="banner-content"] h2',
];

/** Social domain patterns — used to tag external links. */
const SOCIAL_DOMAINS = /\b(facebook|instagram|twitter|yelp|google|youtube|linkedin|tiktok|pinterest|nextdoor)\b/i;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = await res.text();
    return { html, status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Per-page data extraction (raw only — no interpretation)
// ---------------------------------------------------------------------------

function extractRawPage(doc, url, rawHtml) {
  const base = new URL(url);

  // Title + meta
  const title     = doc.querySelector('title')?.textContent?.trim() || '';
  const metaDesc  = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  const metaKw    = doc.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() || '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || null;

  // All headings h1–h6 in DOM order with their level
  const headings = [];
  for (const el of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (text) headings.push({ level: parseInt(el.tagName[1]), text });
  }

  // Hero / slider texts (common patterns TheDocSites and similar CMSes use)
  const heroTexts = [];
  const heroSeen  = new Set();
  for (const sel of HERO_SELECTORS) {
    for (const el of doc.querySelectorAll(sel)) {
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (t && t.length > 3 && t.length < 300 && !heroSeen.has(t)) {
        heroTexts.push(t);
        heroSeen.add(t);
      }
    }
  }

  // All paragraphs (raw text, no filtering)
  const paragraphs = Array.from(doc.querySelectorAll('p'))
    .map(p => p.textContent.replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 10);

  // All images — src + alt only, no classification
  const images = Array.from(doc.querySelectorAll('img'))
    .map(img => ({
      src: img.getAttribute('src') || '',
      alt: (img.getAttribute('alt') || '').trim(),
    }))
    .filter(i => i.src && !i.src.startsWith('data:'));

  // Links (split internal vs external)
  const internalLinks = [];
  const externalLinks = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    const text = a.textContent.replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript')) continue;
    try {
      const abs = new URL(href, base);
      if (abs.hostname === base.hostname) {
        internalLinks.push({ href: abs.pathname, text });
      } else {
        externalLinks.push({ href: abs.href, text, social: SOCIAL_DOMAINS.test(abs.hostname) });
      }
    } catch { /* malformed href */ }
  }

  // JSON-LD structured data (raw parsed objects)
  const structuredData = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      const items  = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      structuredData.push(...items);
    } catch { /* skip malformed */ }
  }

  // Full page body text (cleaned)
  doc.querySelectorAll('style, script, noscript').forEach(el => el.remove());
  const bodyText  = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter(Boolean).length;

  return {
    url,
    path: base.pathname,
    title,
    metaDescription: metaDesc,
    metaKeywords:    metaKw,
    canonicalUrl:    canonical,
    headings,
    heroTexts,
    paragraphs,
    images,
    internalLinks,
    externalLinks,
    structuredData,
    bodyText: bodyText.slice(0, 8000),
    wordCount,
  };
}

// ---------------------------------------------------------------------------
// Site-level asset extraction (navigation, colors, social links)
// ---------------------------------------------------------------------------

/** Pull top-level nav links from the first <nav> or <header> on the page. */
function extractNavigation(doc, baseUrl) {
  const navEl = doc.querySelector('nav, header');
  if (!navEl) return [];
  return Array.from(navEl.querySelectorAll('a[href]'))
    .map(a => {
      const href = a.getAttribute('href') || '';
      const text = a.textContent.replace(/\s+/g, ' ').trim();
      try {
        const abs = new URL(href, baseUrl);
        if (abs.hostname === new URL(baseUrl).hostname) return { text, href: abs.pathname };
      } catch { /* skip */ }
      return null;
    })
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Fetch an external CSS file and extract every hex color mentioned.
 * Returns a deduplicated array of lowercase hex strings.
 */
async function extractCssColors(cssUrl) {
  try {
    const css = await fetch(cssUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.text());

    const colors = new Set();
    for (const m of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      colors.add('#' + m[1].toLowerCase());
    }
    return [...colors];
  } catch {
    return [];
  }
}

/** Find the first same-origin stylesheet URL in <head>. */
function findExternalCssUrl(doc, baseUrl) {
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href') || '';
    try {
      const abs = new URL(href, baseUrl);
      if (abs.hostname === new URL(baseUrl).hostname) return abs.href;
    } catch { /* skip */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// BFS crawler
// ---------------------------------------------------------------------------

async function crawlSite(baseUrl, limit) {
  const visited = new Set();
  const discovered = new Set();
  const queue = [baseUrl + '/'];
  const pages = [];

  async function processUrl(url) {
    if (visited.has(url) || visited.size >= limit) return [];
    visited.add(url);

    let fetchResult;
    try { fetchResult = await fetchPage(url); } catch { return []; }

    const { html, status } = fetchResult;
    if (status !== 200 || !html) return [];

    // Strip <style> before JSDOM parse (prevents CSS crash)
    const cleanHtml = html.replace(/<style[\s\S]*?<\/style>/gi, '');
    let dom;
    try { dom = new JSDOM(cleanHtml); } catch { return []; }

    const doc = dom.window.document;
    const page = extractRawPage(doc, url, html);
    pages.push(page);

    // Discover more same-origin links
    const newLinks = [];
    for (const a of doc.querySelectorAll('a[href]')) {
      let href = a.getAttribute('href') || '';
      if (href.startsWith('/')) href = baseUrl + href;
      if (!href.startsWith(baseUrl)) continue;
      href = href.split('?')[0].split('#')[0];
      if (href !== baseUrl + '/' && href.endsWith('/')) href = href.slice(0, -1);
      if (!visited.has(href) && !discovered.has(href)) {
        discovered.add(href);
        newLinks.push(href);
      }
    }
    return newLinks;
  }

  while (queue.length > 0 && visited.size < limit) {
    const batch = queue.splice(0, CONCURRENCY);
    const newLinks = await Promise.all(batch.map(processUrl));
    for (const links of newLinks) queue.push(...links);
  }

  return { pages, visitedUrls: Array.from(visited), discoveredUrls: Array.from(discovered) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Crawl a website and return raw bronze data — no interpretation, no mapping.
 *
 * @param {string} url          - Practice website URL
 * @param {object} [opts]
 * @param {number} [opts.limit] - Max pages to crawl (default 30)
 * @returns {Promise<BronzeData>}
 */
export async function scrape(url, opts = {}) {
  const baseUrl = url.replace(/\/+$/, '');
  const limit   = opts.limit || DEFAULT_LIMIT;

  console.log(`[scraper] Crawling ${baseUrl} (limit: ${limit} pages)...`);

  const { pages, visitedUrls, discoveredUrls } = await crawlSite(baseUrl, limit);

  console.log(`[scraper] Crawled ${pages.length} pages, discovered ${discoveredUrls.length} links.`);

  // Site-level assets — parse from homepage
  const homepage = pages[0] ? new JSDOM(
    // Re-fetch not needed — use the already-parsed bodyText... actually we need
    // nav from the first page DOM. Re-use rawHtml isn't available here, so we
    // derive navigation from internalLinks on the homepage instead.
    ''
  ) : null;

  // Navigation: deduplicate internal links from homepage that appear in order
  const navigation = pages[0]
    ? [...new Map(pages[0].internalLinks.map(l => [l.href, l])).values()].slice(0, 20)
    : [];

  // Social links: aggregate from all pages
  const socialLinks = [
    ...new Set(
      pages.flatMap(p => p.externalLinks.filter(l => l.social).map(l => l.href))
    ),
  ];

  // CSS colors: find external stylesheet from homepage links, then fetch it
  let cssColors = [];
  let externalCssUrl = null;

  // We need the homepage HTML for CSS link detection — refetch just the homepage
  try {
    const { html: homeHtml } = await fetchPage(baseUrl + '/');
    const cleanHome = homeHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
    const homeDom = new JSDOM(cleanHome);
    externalCssUrl = findExternalCssUrl(homeDom.window.document, baseUrl);
    if (externalCssUrl) {
      cssColors = await extractCssColors(externalCssUrl);
      if (cssColors.length) {
        console.log(`[scraper] Extracted ${cssColors.length} raw colors from ${externalCssUrl}`);
      }
    }
  } catch { /* non-fatal */ }

  return {
    baseUrl,
    crawledAt: new Date().toISOString(),
    pageCount: pages.length,
    pages,
    siteAssets: {
      navigation,
      socialLinks,
      cssColors,
      externalCssUrl,
      allUrls: visitedUrls.sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// BronzeData type (JSDoc reference)
// ---------------------------------------------------------------------------
/**
 * @typedef {object} BronzePage
 * @property {string}   url
 * @property {string}   path
 * @property {string}   title
 * @property {string}   metaDescription
 * @property {string}   metaKeywords
 * @property {string|null} canonicalUrl
 * @property {{ level: number, text: string }[]} headings
 * @property {string[]} heroTexts
 * @property {string[]} paragraphs
 * @property {{ src: string, alt: string }[]} images
 * @property {{ href: string, text: string }[]} internalLinks
 * @property {{ href: string, text: string, social: boolean }[]} externalLinks
 * @property {object[]} structuredData
 * @property {string}   bodyText
 * @property {number}   wordCount
 *
 * @typedef {object} BronzeData
 * @property {string}      baseUrl
 * @property {string}      crawledAt
 * @property {number}      pageCount
 * @property {BronzePage[]} pages
 * @property {{ navigation: object[], socialLinks: string[], cssColors: string[], externalCssUrl: string|null, allUrls: string[] }} siteAssets
 */
