// Email extraction from rendered HTML — for the outreach product.
//
// Strategy (in priority order):
//   1. mailto: links — most reliable, explicitly published contact.
//   2. Plain-text email regex in the HTML — filtered hard to drop junk
//      (vendor/tracking/example addresses, asset filenames that look emailish).
//   3. Prefer an address whose domain matches the practice's own domain
//      (e.g. office@thepractice.com beats a gmail, beats a vendor address).
//
// If the homepage yields nothing, run.js can fetch ONE contact page (via
// findContactUrl) and re-run extraction — bounded to a single extra fetch.

// Junk domains/patterns that are never the practice's real contact email.
const JUNK_DOMAINS = [
  'example.com', 'example.org', 'sentry.io', 'wix.com', 'wixpress.com',
  'squarespace.com', 'godaddy.com', 'cloudflare.com', 'schema.org',
  'googleapis.com', 'gstatic.com', 'w3.org', 'sentry-next.wixpress.com',
  'domain.com', 'email.com', 'yourdomain.com', 'company.com',
  // Accessibility-overlay & widget vendors that embed their OWN support email
  // (common on dental sites — not the practice's address).
  'userway.org', 'userway.com', 'accessibe.com', 'audioeye.com',
  'support.userway.org', 'equalweb.com', 'getwidget.com',
  // Marketing/analytics vendors occasionally leave contact addresses in markup.
  'mailchimp.com', 'hubspot.com', 'sentry.wixpress.com',
];
const JUNK_LOCALPARTS = ['noreply', 'no-reply', 'donotreply', 'postmaster', 'abuse', 'mailer-daemon'];

// Email regex — BOUNDED quantifiers (not unbounded +). An unbounded + on a
// long homogeneous run (e.g. 1MB of repeated chars with no '@') causes O(n²)
// scanning: it greedily consumes the run, fails to find '@', backtracks, and
// retries at every position. Capping each segment's length bounds that window
// so scanning stays effectively linear. Email parts are short, so no real
// address is lost.
const EMAIL_RE = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,4}\.[a-z]{2,24}/gi;

// Rendered HTML can be multi-MB. Cap what we scan — contact info lives in
// header/footer/body, well within the first slice — so even linear regexes
// stay fast and we never pathologically chew a giant document.
const MAX_SCAN_CHARS = 1_500_000;

function isJunk(email) {
  const lower = email.toLowerCase();
  const [local, domain] = lower.split('@');
  if (!domain) return true;
  if (JUNK_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true;
  if (JUNK_LOCALPARTS.includes(local)) return true;
  // Looks like an asset/hash, not a person/office.
  if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(lower)) return true;
  if (local.length > 40) return true;
  return false;
}

function siteDomainOf(url) {
  return (url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
}

/**
 * Extract candidate emails from HTML.
 *
 * @param {object} args
 * @param {string} args.html
 * @param {string} [args.siteUrl]  - used to prefer same-domain addresses
 * @returns {{ best: string|null, all: string[], source: 'mailto'|'text'|null }}
 */
export function extractEmails({ html = '', siteUrl = '' } = {}) {
  if (!html) return { best: null, all: [], source: null };
  if (html.length > MAX_SCAN_CHARS) html = html.slice(0, MAX_SCAN_CHARS);

  const siteDomain = siteDomainOf(siteUrl);

  // 1. mailto: links
  const mailtos = [];
  const mailtoRe = /href=["']mailto:([^"'?]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html))) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (EMAIL_RE.test(e) && !isJunk(e)) mailtos.push(e);
    EMAIL_RE.lastIndex = 0;
  }

  // 2. plain-text emails
  const textHits = (html.match(EMAIL_RE) || [])
    .map((e) => e.toLowerCase())
    .filter((e) => !isJunk(e));

  const dedupe = (arr) => [...new Set(arr)];
  const mail = dedupe(mailtos);
  const text = dedupe(textHits);

  // Pick best: prefer mailto, then same-domain, then a "contact-ish" localpart.
  const pool = mail.length ? mail : text;
  if (!pool.length) return { best: null, all: [], source: null };

  const sameDomain = pool.filter((e) => siteDomain && e.endsWith('@' + siteDomain));
  const contactish = pool.filter((e) => /^(info|office|contact|hello|admin|frontdesk|smile|reception|appointments?)@/.test(e));

  const best =
    sameDomain.find((e) => contactish.includes(e)) ||
    sameDomain[0] ||
    contactish[0] ||
    pool[0];

  return {
    best,
    all: dedupe([...mail, ...text]),
    source: mail.length ? 'mailto' : 'text',
  };
}

/**
 * Find a contact-page URL from the homepage HTML, resolved against baseUrl.
 * Returns null if none found. Used to do one bounded extra fetch when the
 * homepage has no email.
 */
export function findContactUrl({ html = '', baseUrl = '' } = {}) {
  if (html.length > MAX_SCAN_CHARS) html = html.slice(0, MAX_SCAN_CHARS);
  // IMPORTANT: avoid nested-quantifier regexes here — an earlier version used
  // /<a ...>(?:[^<]*<[^>]*>)*\s*contact/ which caused catastrophic backtracking
  // (ReDoS) on large pages and pinned a CPU core indefinitely.
  //
  // Instead: scan each anchor tag individually (linear), and decide from the
  // href + the tag's inner text whether it's a contact/booking link.
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  let m;
  // Pass 1: prefer hrefs that literally point at a contact path.
  const candidates = [];
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const innerText = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (/\/contact/i.test(href)) return resolveUrl(href, baseUrl);
    if (/\b(contact|get in touch|book|appointment|schedule)\b/.test(innerText)) {
      candidates.push(href);
    }
  }
  return candidates.length ? resolveUrl(candidates[0], baseUrl) : null;
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}
