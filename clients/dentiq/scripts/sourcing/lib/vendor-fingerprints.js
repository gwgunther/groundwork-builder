// Vendor fingerprint detector for dental-practice websites.
//
// Each fingerprint has:
//   id          — slug used in output
//   category    — 'dental-mill' | 'diy-builder' | 'cms' | 'modern-stack'
//   signals[]   — patterns matched against HTML, headers, or final URL
//
// Signal types:
//   { html: /regex/ }            — match anywhere in HTML
//   { url:  /regex/ }            — match against finalUrl after redirects
//   { header: 'name', value: /regex/ } — match response header
//
// Scoring: any signal match counts the vendor; the vendor with the most
// matched signals wins. Ties broken by the order below (dental-mill > diy > cms).
//
// IMPORTANT: this is the v0 list. Expand as we see real-world misses in the
// spike output. Each pattern should be specific enough to avoid false positives
// (e.g. generic 'wordpress' mentions in blog content don't count — we look
// for /wp-content/ or /wp-includes/ paths in actual asset references).

export const FINGERPRINTS = [
  // ───────── Dental industry mills ─────────
  {
    id: 'prosites',
    category: 'dental-mill',
    signals: [
      { html: /prosites\.com/i },
      { html: /content="ProSites"/i },
      { html: /Powered by ProSites/i },
    ],
  },
  {
    id: 'pbhs',
    category: 'dental-mill',
    signals: [
      { html: /cdn\.pbhs\.com/i },
      { html: /pbhs\.com/i }, // loosened — covers https://www.pbhs.com, pbhs.com in any context
      { html: /PBHS,?\s*Inc/i },
      { html: /pbhsmysmile\.com/i },
      { html: /Dental Website Design by PBHS/i }, // footer attribution
    ],
  },
  {
    id: 'officite',
    category: 'dental-mill',
    signals: [
      { html: /officite\.com/i },
      { html: /<!--\s*Officite/i },
      { html: /Powered by Officite/i },
    ],
  },
  {
    id: 'smile-marketing',
    category: 'dental-mill',
    signals: [
      { html: /smilemarketing\.com/i },
      { html: /smile-marketing/i },
    ],
  },
  {
    id: 'dentist-identity',
    category: 'dental-mill',
    signals: [
      { html: /dentistidentity\.com/i },
      { html: /dentist-identity/i },
    ],
  },
  {
    id: 'roadside-dental',
    category: 'dental-mill',
    signals: [
      { html: /roadsidedental\.com/i },
      { html: /roadside dental marketing/i },
    ],
  },
  {
    id: 'tnt-dental',
    category: 'dental-mill',
    signals: [
      { html: /tntdental\.com/i },
      { html: /TNT Dental/i },
    ],
  },
  {
    id: 'dentalqore',
    category: 'dental-mill',
    signals: [
      { html: /dentalqore\.com/i },
      { html: /DentalQore/i },
    ],
  },
  {
    id: 'my-social-practice',
    category: 'dental-mill',
    signals: [{ html: /mysocialpractice\.com/i }],
  },
  {
    id: 'dentalcmo',
    category: 'dental-mill',
    signals: [{ html: /dentalcmo\.com/i }],
  },
  {
    id: 'great-dental-websites',
    category: 'dental-mill',
    signals: [{ html: /greatdentalwebsites\.com/i }],
  },
  {
    id: 'solution-reach',
    category: 'dental-mill',
    signals: [
      { html: /solutionreach\.com/i },
      { html: /SolutionReach/i },
    ],
  },
  {
    id: 'wpamplify',
    category: 'dental-mill',
    signals: [{ html: /wpamplify\.com/i }],
  },
  {
    id: 'identity-dental',
    category: 'dental-mill',
    signals: [{ html: /identitydental\.com/i }],
  },

  // ───────── Discovered via spike review (Riverside MSA, n=100) ─────────
  {
    id: 'docsites',
    category: 'dental-mill',
    signals: [
      { html: /docsites\.com/i },
      { html: /TheDocSites/i },
      { html: /Dental Website Design by TheDocSites/i },
      { html: /Dental Website Design by DocSites/i },
    ],
  },
  {
    id: 'informatics-inc',
    category: 'dental-mill',
    signals: [
      { html: /informaticsinc\.com/i },
      { html: /Web Application by Informatics/i },
    ],
  },
  {
    id: 'infostar-productions',
    category: 'dental-mill',
    signals: [
      { html: /infostarproductions\.com/i },
      { html: /InfoStar Productions/i },
    ],
  },
  // Pacific Dental Services / SmileGeneration — a hybrid case: PDS is
  // a DSO (corporate owner of many practices) AND ships a single shared
  // template across all of them. Practices appear individually in Google
  // Places but the website is HQ-controlled — not pitchable to the local
  // dentist. The chain-detector flags these as `Is Chain = true`; this
  // fingerprint also categorizes the SITE as a mill so the design-score
  // logic treats it consistently.
  {
    id: 'pacific-dental-services',
    category: 'dental-mill',
    signals: [
      { html: /smilegeneration\.com/i },
      { html: /_pacificdentals/i },
      { html: /pdshealth\.com/i },
      { url: /sc_cid=GBP/i }, // PDS-specific URL parameter pattern
    ],
  },

  // ───────── Custom design agencies (NOT mills — these are bespoke builds) ─────────
  // Tracked so we don't false-positive them as templates. Sites built by these
  // agencies are typically `modern-custom` or `wordpress-custom` — they get
  // categorized by underlying stack, not by the agency that built them.
  // (Listed for reference; no fingerprint match — these don't override category.)
  // Known custom agencies seen in the wild: misowebdesign.com

  // ───────── DIY builders ─────────
  {
    id: 'wix',
    category: 'diy-builder',
    signals: [
      { html: /content="Wix\.com"/i },
      { html: /static\.wixstatic\.com/i },
      { html: /wix-bolt|wixsite\.com/i },
    ],
  },
  {
    id: 'squarespace',
    category: 'diy-builder',
    signals: [
      { html: /content="Squarespace"/i },
      { html: /squarespace-cdn\.com/i },
      { html: /static1\.squarespace\.com/i },
    ],
  },
  {
    id: 'weebly',
    category: 'diy-builder',
    signals: [
      { html: /weebly\.com/i },
      { html: /cdn2\.editmysite\.com/i },
    ],
  },
  {
    id: 'godaddy-builder',
    category: 'diy-builder',
    signals: [
      { html: /img1\.wsimg\.com/i },
      { html: /content="GoDaddy Website Builder"/i },
    ],
  },
  {
    id: 'duda',
    category: 'diy-builder',
    signals: [
      { html: /irp\.cdn-website\.com/i },
      { html: /duda\.co/i },
    ],
  },

  // ───────── Generic CMSes ─────────
  {
    id: 'wordpress-generic',
    category: 'cms',
    signals: [
      { html: /\/wp-content\//i },
      { html: /\/wp-includes\//i },
      { html: /content="WordPress/i },
    ],
  },
  {
    id: 'drupal',
    category: 'cms',
    signals: [{ html: /content="Drupal/i }, { html: /\/sites\/default\/files\//i }],
  },
  {
    id: 'joomla',
    category: 'cms',
    signals: [{ html: /content="Joomla/i }],
  },

  // ───────── Modern stacks ─────────
  {
    id: 'webflow',
    category: 'modern-stack',
    signals: [
      { html: /webflow\.com|wf-/i },
      { html: /content="Webflow"/i },
      { html: /assets\.website-files\.com/i },
    ],
  },
  {
    id: 'framer',
    category: 'modern-stack',
    signals: [{ html: /framer\.com/i }, { html: /framerusercontent\.com/i }],
  },
  {
    id: 'nextjs',
    category: 'modern-stack',
    signals: [
      { html: /_next\/static\//i },
      { html: /__NEXT_DATA__/i },
    ],
  },
  {
    id: 'astro',
    category: 'modern-stack',
    signals: [{ html: /content="Astro/i }, { html: /astro-island/i }],
  },
  {
    id: 'gatsby',
    category: 'modern-stack',
    signals: [{ html: /content="Gatsby/i }, { html: /gatsby-image/i }],
  },
  {
    id: 'shopify',
    category: 'modern-stack',
    signals: [
      { html: /cdn\.shopify\.com/i },
      { html: /Shopify\.theme/i },
    ],
  },
];

function signalMatches(sig, { html, finalUrl, headers }) {
  if (sig.html) return sig.html.test(html);
  if (sig.url) return sig.url.test(finalUrl || '');
  if (sig.header) {
    const v = headers?.[sig.header.toLowerCase()];
    return v ? sig.value.test(v) : false;
  }
  return false;
}

/**
 * Extract the WordPress theme name from `/wp-content/themes/{name}/` paths.
 * Returns null if not a WordPress site or theme can't be determined.
 *
 * Many dental marketing agencies ship custom themes that we can't classify
 * as mill-vs-custom from the theme name alone — but capturing the name lets
 * us cluster sites by theme post-hoc and discover repeat patterns (e.g.
 * 20 different practices all on theme "dental-x" → that's a hidden mill).
 */
export function extractWpTheme(html) {
  if (!html) return null;
  const m = html.match(/\/wp-content\/themes\/([a-z0-9_\-]+)\//i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  // Ignore the WP defaults — they leak into too many sites
  if (/^(twenty(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twentyone|twentytwo|twentythree|twentyfour|twentyfive)|hello-)/i.test(name)) {
    return { name, isDefault: true };
  }
  return { name, isDefault: false };
}

export function detectVendor({ html = '', finalUrl = '', headers = {} } = {}) {
  if (!html) return { vendor: 'unreachable', category: 'unknown', confidence: 0, matched: [] };

  const ctx = { html, finalUrl, headers };
  const scored = [];

  for (const fp of FINGERPRINTS) {
    const hits = fp.signals.filter((s) => signalMatches(s, ctx));
    if (hits.length > 0) {
      scored.push({ id: fp.id, category: fp.category, hitCount: hits.length });
    }
  }

  if (scored.length === 0) {
    return { vendor: 'unknown', category: 'unknown', confidence: 0, matched: [] };
  }

  // Sort by hit count desc, then by category priority.
  const PRIORITY = { 'dental-mill': 0, 'diy-builder': 1, cms: 2, 'modern-stack': 3 };
  scored.sort(
    (a, b) =>
      b.hitCount - a.hitCount ||
      (PRIORITY[a.category] ?? 99) - (PRIORITY[b.category] ?? 99),
  );

  const top = scored[0];
  return {
    vendor: top.id,
    category: top.category,
    confidence: top.hitCount,
    matched: scored,
  };
}
