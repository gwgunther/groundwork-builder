/**
 * Consumer-facing copy and display metadata for audit-data.json findings.
 * Numbers and evidence come from scanners — only phrasing lives here.
 */

/** @type {Record<string, string>} */
export const CATEGORY_LABELS = {
  'low-performance':     'Page speed',
  'low-lcp':             'Page speed',
  'high-cls':            'Layout stability',
  'missing-meta':        'Search snippets',
  'missing-title':       'Search visibility',
  'duplicate-titles':    'Search visibility',
  'title-no-city':       'Local search titles',
  'missing-h1':          'Heading structure',
  'multiple-h1':         'Heading structure',
  'thin-content':        'Content depth',
  'missing-schema':      'Structured data',
  'missing-canonical':   'Canonical tags',
  'missing-alt':         'Image search',
  'no-testimonials':     'Social proof',
  'no-faq':              'FAQ content',
  'thin-about':          'About page',
  'no-viewport':         'Mobile display',
  'no-phone-on-site':    'Phone number',
  'no-address-on-site':  'Address',
  'no-hours-on-site':    'Hours',
  'no-social-links':     'Social links',
  'no-ga4-configured':   'Analytics',
  'no-phone-click-tracking': 'Call tracking',
  'gbp-no-description':  'Google Business Profile',
  'gbp-incomplete-profile': 'Google Business Profile',
  'gbp-low-review-count': 'Google reviews',
  'using-third-party-domain': 'Domain ownership',
  'fractured-web-presence': 'Web presence',
  'no-llms-txt':           'AI agent readiness',
  'llms-txt-poor':         'AI agent readiness',
  'agent-accessibility-tree-poor': 'AI agent readiness',
  'schema-no-dates':       'AEO: Content freshness',
  'no-snippet-structure':  'AEO: Answer structure',
};

/** @type {Record<string, 'foundation'|'performance'|'content'|'conversion'>} */
export const WORKSTREAMS = {
  'low-performance': 'performance',
  'low-lcp': 'performance',
  'high-cls': 'performance',
  'missing-alt': 'performance',
  'missing-meta': 'foundation',
  'missing-title': 'foundation',
  'duplicate-titles': 'foundation',
  'title-no-city': 'foundation',
  'missing-h1': 'foundation',
  'multiple-h1': 'foundation',
  'thin-content': 'content',
  'missing-schema': 'content',
  'missing-canonical': 'foundation',
  'no-testimonials': 'content',
  'no-faq': 'content',
  'thin-about': 'content',
  'no-viewport': 'foundation',
  'no-phone-on-site': 'conversion',
  'no-address-on-site': 'conversion',
  'no-hours-on-site': 'conversion',
  'no-social-links': 'conversion',
  'no-ga4-configured': 'conversion',
  'no-phone-click-tracking': 'conversion',
  'gbp-no-title': 'conversion',
  'gbp-no-description': 'conversion',
  'gbp-description-no-keywords': 'conversion',
  'gbp-no-phone': 'conversion',
  'gbp-no-hours': 'conversion',
  'gbp-no-website-linked': 'conversion',
  'gbp-low-review-count': 'conversion',
  'gbp-category-mismatch': 'conversion',
  'gbp-incomplete-profile': 'conversion',
  'gbp-website-mismatches-audit-url': 'conversion',
  'using-third-party-domain': 'foundation',
  'fractured-web-presence': 'foundation',
  'no-llms-txt': 'content',
  'llms-txt-poor': 'content',
  'agent-accessibility-tree-poor': 'foundation',
  'schema-no-dates': 'content',
  'no-snippet-structure': 'content',
};

/** Finding IDs that must never appear on the sales one-pager. */
export const SUMMARY_EXCLUDE = new Set([
  'missing-canonical',
  'multiple-h1',
  'missing-h1',
  'missing-meta',
  'missing-schema',
  'high-cls',
  'no-viewport',
  'title-no-city',
  'missing-title',
  'gbp-no-title',
  'gbp-no-phone',
  'gbp-no-hours',
  'gbp-no-website-linked',
  'gbp-category-mismatch',
  'gbp-website-mismatches-audit-url',
  'gbp-description-no-keywords',
  'using-third-party-domain',
  'fractured-web-presence',
  'no-address-on-site',
  'no-hours-on-site',
  'no-social-links',
  'no-ga4-configured',
]);

/** Extra weight for customer-impact ordering (multiplier on catalog weight). */
export const CUSTOMER_IMPACT = {
  'low-lcp': 1.6,
  'low-performance': 1.4,
  'duplicate-titles': 1.5,
  'missing-alt': 1.3,
  'no-phone-click-tracking': 1.5,
  'no-faq': 1.35,
  'no-testimonials': 1.2,
  'thin-content': 1.1,
  'no-phone-on-site': 1.4,
  'gbp-no-description': 0.85,
  'gbp-incomplete-profile': 1.0,
  'gbp-low-review-count': 1.0,
  'no-llms-txt': 1.15,
  'llms-txt-poor': 1.35,
};

/**
 * @type {Record<string, { now: string, good: string }>}
 * Use {{city}}, {{audience}}, {{lcpSec}} — replaced in assembler.
 */
export const CONSUMER_COPY = {
  'low-lcp': {
    now: 'Your page takes ~{{lcpSec}} seconds to load on a phone. Most visitors leave before it finishes.',
    good: 'Under 2.5 seconds — the page appears before a visitor loses patience.',
  },
  'low-performance': {
    now: 'Your site scores {{perfScore}}/100 on mobile speed. Google treats slow sites as lower quality.',
    good: 'A fast mobile experience keeps visitors on the page long enough to call or book.',
  },
  'duplicate-titles': {
    now: 'Pages share the same title tags, so search engines can\'t tell them apart or rank them right.',
    good: 'Each page has a unique title, so it can rank for its own search.',
  },
  'missing-alt': {
    now: '{{count}} photos have no alt text — the description search engines read. Without it, they can\'t appear in image results.',
    good: 'Every photo has alt text, so your before-and-afters can turn up in image search.',
  },
  'no-phone-click-tracking': {
    now: 'No call tracking is installed, so you can\'t see which pages or ads lead to phone calls.',
    good: 'Calls are tracked, so you can see exactly what drives them.',
  },
  'no-faq': {
    now: 'No pages use FAQ markup — the structured format Google reads to show questions directly in search results.',
    good: 'Service pages use FAQ markup, making them eligible for Google\'s expandable question results.',
  },
  'no-llms-txt': {
    now: 'No llms.txt file — AI assistants cannot reliably discover what your practice offers or which pages to cite.',
    good: 'A machine-readable llms.txt at your domain root lists your services, key pages, and contact info for ChatGPT, Gemini, and Perplexity.',
  },
  'llms-txt-poor': {
    now: 'Your llms.txt exists but reads like a CMS dump — popup pages, plugin boilerplate, or missing services — so AI assistants get the wrong summary of your practice.',
    good: 'A curated llms.txt with your practice name, a short summary, linked services, and contact info — no popups or internal CMS noise.',
  },
  'agent-accessibility-tree-poor': {
    now: 'The accessibility tree AI agents use to navigate your site is malformed — unlabeled buttons and broken structure block reliable machine interaction.',
    good: 'Semantic HTML and proper labels give AI assistants a clean map of your pages and forms.',
  },
  'schema-no-dates': {
    now: '{{count}} blog posts have no publish date in their schema — AI search engines (ChatGPT, Perplexity, Gemini) can\'t tell if your content is current and may skip it in favor of dated sources.',
    good: 'Every blog post carries a publish and update date, giving AI systems the freshness signal they prioritize when surfacing answers.',
  },
  'no-snippet-structure': {
    now: '{{count}} service pages use blocks of prose with no structured subheadings, lists, or comparisons — formats AI models can\'t easily extract as direct answers.',
    good: 'Service pages break down topics with numbered steps, comparison tables, and Q&A sections that AI assistants can quote directly.',
  },
  'no-testimonials': {
    now: 'No patient reviews or testimonials are visible on the site — new visitors have little social proof.',
    good: 'Real patient stories appear where trust matters most, helping visitors feel confident booking.',
  },
  'thin-content': {
    now: '{{count}} pages have very little text — not enough for Google to understand what you offer.',
    good: 'Service pages answer the questions patients search for, with enough depth to earn rankings.',
  },
  'no-phone-on-site': {
    now: 'A click-to-call phone number isn\'t easy to find on mobile — patients may leave instead of calling.',
    good: 'Your phone number is one tap away on every page, especially on mobile.',
  },
  'missing-meta': {
    now: '{{count}} pages have no meta description — Google writes its own snippet, often poorly.',
    good: 'Every page has a tailored description that convinces patients to click in search results.',
  },
  'gbp-no-description': {
    now: 'Your Google Business Profile has no description — a missed chance to rank for local searches.',
    good: 'A keyword-rich description tells Google exactly what services you offer in {{city}}.',
  },
  'gbp-incomplete-profile': {
    now: 'Your Google Business Profile is incomplete — Google favors fully filled profiles in the map pack.',
    good: 'Every essential field is complete, improving visibility when patients search nearby.',
  },
  'gbp-low-review-count': {
    now: 'You have fewer Google reviews than competitors in your area — reviews heavily influence who gets the call.',
    good: 'A steady flow of new reviews builds trust and improves map pack placement.',
  },
};

/** @type {Record<string, string>} */
export const BUILD_HINTS = {
  'page-titles': 'Per-route title template {Page} — {Service} in {City} | {Business}.',
  'meta-descriptions': 'Required meta description per page; generate fallback from first paragraph.',
  'page-headings': 'One H1 per template (page-title slot). Demote stray content H1s to H2/H3.',
  'canonical-tags': 'Self-referencing <link rel="canonical"> in base layout head, derived from route.',
  'schema-config': 'Inject Dentist + LocalBusiness JSON-LD on home; breadcrumb schema on service pages.',
  'content-expand': 'Expand thin pages with substantive service copy and patient-focused FAQs.',
  'astro-build': 'Astro responsive images (AVIF/WebP), defer non-critical CSS/JS, system fonts.',
  'image-roles': 'Make alt a required prop on the image component; backfill during migration.',
  'faq-section': 'FAQBlock + FAQ JSON-LD on top service pages.',
  'testimonials-section': 'Google review feed + curated testimonials on home and /reviews.',
  'phone-click-tracking': 'Fire GA4 phone_click on every tel: link; mark as conversion; import to Google Ads.',
  'ga4-config': 'GA4 measurement ID in layout; verify data collection before Ads import.',
  'header-phone': 'Click-to-call tel: link in header on every page.',
  'contact-block': 'NAP block in footer and contact page with schema alignment.',
  'hours-block': 'Structured hours on contact page and in LocalBusiness JSON-LD.',
  'doctor-brief': 'Expand About page with doctor bio, credentials, and team photography.',
};
