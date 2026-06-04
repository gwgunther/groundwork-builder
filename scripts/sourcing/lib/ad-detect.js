// Ad-spend detection — Meta Ad Library + Google Ads (best-effort scrape).
//
// Both are scraped via Playwright. The official Meta Ad Library API exists
// but requires a verified Facebook developer account + access token; until
// that's set up, scraping the public page works. Google has no official API.
//
// Both return { running: bool, count: number, error?: string }. Errors are
// non-fatal — the pipeline still writes the row, just with `running: false`.
//
// IMPORTANT: scraping is fragile. If page selectors change, fix them here.
// Both fns accept a Playwright browser instance to reuse the session.

const META_TIMEOUT_MS = 20_000;
const GOOGLE_TIMEOUT_MS = 20_000;

// ──────────────────────────────────────────────────────────────────────
// Meta Ad Library — search by domain (most reliable identifier)
// ──────────────────────────────────────────────────────────────────────

export async function detectMetaAds({ browser, domain }) {
  if (!domain) return { running: false, count: 0, error: 'no domain' };

  const url =
    'https://www.facebook.com/ads/library/' +
    `?active_status=active&ad_type=all&country=US&search_type=keyword_unordered&media_type=all&q=${encodeURIComponent(domain)}`;

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(META_TIMEOUT_MS);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Meta's results render client-side; wait for either result rows or the empty-state.
    await page.waitForTimeout(3500);

    // Meta has gone through many DOM revs. Cast a wide net for "X results"
    // or the "Showing N ads" header, then fall back to row count.
    const result = await page.evaluate(() => {
      // Look for any "results" / "ads" count text in the header area.
      const bodyText = document.body?.innerText || '';
      const m =
        bodyText.match(/~?(\d{1,5})\s+(?:results?|ads?)\b/i) ||
        bodyText.match(/Showing\s+(\d{1,5})/i);
      let parsedCount = m ? parseInt(m[1], 10) : null;

      // Fallback: count ad-card containers. Selectors change; try a few.
      let rowCount = 0;
      for (const sel of ['[role="article"]', '[data-testid="ad_card"]', 'div[aria-label*="ad"]']) {
        const n = document.querySelectorAll(sel).length;
        if (n > rowCount) rowCount = n;
      }

      const empty = /no ads (?:to display|match|found)/i.test(bodyText);
      return { parsedCount, rowCount, empty, snippet: bodyText.slice(0, 300) };
    });

    if (result.empty) return { running: false, count: 0 };
    const count = result.parsedCount ?? result.rowCount ?? 0;
    return { running: count > 0, count };
  } catch (e) {
    return { running: false, count: 0, error: e.message };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────
// Google Ads — check via SERP "Sponsored" markers
// ──────────────────────────────────────────────────────────────────────
//
// Google has the Ads Transparency Center (adstransparency.google.com) but it
// requires the advertiser's name and is heavily JS-driven. Simpler approach:
// search "{practice name} {city}" and look for "Sponsored" results pointing
// to the practice's domain. Less robust than the Transparency Center but
// works without any auth.

export async function detectGoogleAds({ browser, practiceName, city, domain }) {
  if (!practiceName || !domain) return { running: false, count: 0, error: 'missing inputs' };

  const q = `${practiceName} ${city || ''}`.trim();
  const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&num=20`;

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(GOOGLE_TIMEOUT_MS);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const result = await page.evaluate((dom) => {
      const html = document.body?.innerHTML || '';
      const text = document.body?.innerText || '';

      // Detect Google's "are you a robot" page — abort silently.
      if (/unusual traffic|recaptcha|consent\.google\.com/i.test(text)) {
        return { blocked: true };
      }

      // Count "Sponsored" labels paired with links to this domain.
      // Sponsored blocks have role="region" or contain the literal "Sponsored" text.
      const sponsoredBlocks = [...document.querySelectorAll('*')].filter((el) =>
        /^\s*Sponsored\s*$/.test(el.textContent || '') && el.tagName !== 'SCRIPT',
      );

      // Walk up to find the link target near each "Sponsored" label.
      const escapedDom = dom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const domainRe = new RegExp(escapedDom, 'i');
      let matches = 0;
      for (const block of sponsoredBlocks) {
        const container = block.closest('div, section, article') || block.parentElement;
        if (!container) continue;
        const links = container.querySelectorAll('a[href]');
        for (const a of links) {
          if (domainRe.test(a.href) || domainRe.test(a.textContent || '')) {
            matches++;
            break;
          }
        }
      }
      return { matches, sponsoredBlocks: sponsoredBlocks.length };
    }, normalizeDomain(domain));

    if (result.blocked) return { running: false, count: 0, error: 'google bot challenge' };
    return { running: result.matches > 0, count: result.matches };
  } catch (e) {
    return { running: false, count: 0, error: e.message };
  } finally {
    await ctx.close().catch(() => {});
  }
}

function normalizeDomain(d) {
  return (d || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
}

export function extractDomain(url) {
  return normalizeDomain(url);
}
