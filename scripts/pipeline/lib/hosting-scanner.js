/**
 * Hosting Scanner — domain + presence checks against bronze data.
 * One DNS lookup (NS) per run; otherwise no network.
 *
 * Export:
 *   runHostingScan(bronze) → Promise<{ findings, summary, meta }>
 */

import { promises as dns } from 'node:dns';
import { enrichFindings } from './findings.js';

// Hosts whose primary domain implies the practice does NOT control its own.
// Match against the bronze.baseUrl hostname.
const THIRD_PARTY_HOST_PATTERNS = [
  /\.wixsite\.com$/i,
  /\.squarespace\.com$/i,
  /\.weebly\.com$/i,
  /\.godaddysites\.com$/i,
  /\.sites\.google\.com$/i,
  /\.business\.site$/i,        // Google Business sites
  /\.webnode\.com$/i,
  /\.jimdofree\.com$/i,
];

function getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ''; }
}

function eTldPlusOne(hostname) {
  // Very rough — sufficient for "is this the same brand domain" comparison.
  // Strips leading 'www.' and keeps the last 2 labels for normal TLDs,
  // or last 3 for common 2-part TLDs (.co.uk, .com.au).
  const h = hostname.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const twoPart = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i;
  const last2 = parts.slice(-2).join('.');
  return twoPart.test(last2) ? parts.slice(-3).join('.') : last2;
}

async function getNameservers(hostname) {
  try {
    const ns = await dns.resolveNs(hostname);
    return ns.map(n => n.toLowerCase());
  } catch {
    return [];
  }
}

function buildFinding({ id, category, title, detail, benefit, severity }) {
  return {
    id,
    category,
    severity,
    title,
    detail,
    benefit,
    affectedPages: [],
    count: severity === 'passed' ? 0 : 1,
  };
}

/**
 * @param {object} bronze
 * @returns {Promise<{ findings: object[], summary: object, meta: object }>}
 */
export async function runHostingScan(bronze) {
  const baseUrl = bronze?.baseUrl || '';
  const homeHost = getHostname(baseUrl);
  const homeRoot = eTldPlusOne(homeHost);
  const raw = [];

  // ── third-party domain ────────────────────────────────────────────────────
  const onThirdParty = THIRD_PARTY_HOST_PATTERNS.some(re => re.test(homeHost));
  raw.push(buildFinding({
    id: 'using-third-party-domain',
    category: 'hosting',
    title: 'First-party domain',
    detail: onThirdParty
      ? `Site is hosted on a third-party subdomain (${homeHost}). A first-party domain looks more credible and consolidates SEO equity.`
      : `Site is on a first-party domain (${homeRoot}).`,
    benefit: 'A first-party domain (yourname.com) signals legitimacy, consolidates SEO equity, and gives full control over redirects, email, and tracking.',
    severity: onThirdParty ? 'critical' : 'passed',
  }));

  // ── fractured web presence ────────────────────────────────────────────────
  // Count distinct e-TLD+1 domains across discovered URLs (excluding social).
  const SOCIAL_RE = /\b(facebook|instagram|twitter|x\.com|yelp|youtube|linkedin|tiktok|pinterest|nextdoor|google|maps)\b/i;
  const allUrls = bronze?.siteAssets?.allUrls || [];
  const externalRoots = new Set();
  for (const u of allUrls) {
    const h = getHostname(u);
    if (!h || SOCIAL_RE.test(h)) continue;
    const root = eTldPlusOne(h);
    if (root && root !== homeRoot) externalRoots.add(root);
  }

  // Heuristic: a "branded" external root contains a chunk of the home root's first label.
  const homeStem = homeRoot.split('.')[0] || '';
  const brandedExternals = [...externalRoots].filter(r => {
    if (homeStem.length < 4) return false;
    return r.includes(homeStem.slice(0, Math.min(8, homeStem.length)));
  });

  const fractured = brandedExternals.length > 0;
  raw.push(buildFinding({
    id: 'fractured-web-presence',
    category: 'hosting',
    title: 'Single primary domain',
    detail: fractured
      ? `Found ${brandedExternals.length} additional brand-related domain${brandedExternals.length === 1 ? '' : 's'}: ${brandedExternals.slice(0, 3).join(', ')}. Multiple domains for one practice split SEO authority.`
      : 'Web presence is consolidated under one primary domain.',
    benefit: 'When the same brand exists on multiple domains, Google has to guess which one is authoritative — splitting rankings and link equity.',
    severity: fractured ? 'warning' : 'passed',
  }));

  // ── nameservers (informational, used downstream for hosting recommendations)
  const nameservers = homeHost ? await getNameservers(homeHost) : [];

  const findings = enrichFindings(raw);
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };

  return {
    findings,
    summary,
    meta: { hostname: homeHost, rootDomain: homeRoot, nameservers },
  };
}
