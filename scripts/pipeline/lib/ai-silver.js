/**
 * Silver Transform — AI-Powered Bronze → PracticeData
 *
 * Takes raw BronzeData (from scraper.js) and uses Claude to extract
 * structured practice information, returning a partial PracticeData object
 * that matches the schema in schema.js.
 *
 * This replaces all heuristic extraction that previously lived in scraper.js.
 * Claude understands context, layout intent, and natural language — it handles
 * edge cases (unusual hours formats, split practice names, etc.) far better
 * than regex patterns.
 */

const MODEL   = 'claude-opus-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

// ---------------------------------------------------------------------------
// Page selection — pick the most informative pages to send Claude
// ---------------------------------------------------------------------------

/**
 * Select the most information-dense pages from the bronze crawl.
 * Prioritizes: homepage, about, contact, doctor pages, services pages.
 * Caps at ~8 pages to keep the prompt manageable.
 */
function selectKeyPages(pages) {
  const PRIORITY = [
    p => p.path === '/',
    p => /\/about/.test(p.path),
    p => /\/contact/.test(p.path),
    p => /\/dr[-_]/.test(p.path) || /\/doctor/.test(p.path),
    p => /\/services/.test(p.path),
    p => /\/team/.test(p.path) || /\/staff/.test(p.path),
    p => /\/appointment/.test(p.path) || /\/schedule/.test(p.path),
    p => /\/specials/.test(p.path) || /\/offers/.test(p.path),
  ];

  const picked  = [];
  const pickedSet = new Set();

  for (const test of PRIORITY) {
    for (const page of pages) {
      if (!pickedSet.has(page.url) && test(page)) {
        picked.push(page);
        pickedSet.add(page.url);
      }
    }
    if (picked.length >= 8) break;
  }

  // Fill remaining slots with highest word-count pages not yet picked
  if (picked.length < 8) {
    const rest = pages
      .filter(p => !pickedSet.has(p.url))
      .sort((a, b) => b.wordCount - a.wordCount);
    for (const p of rest) {
      if (picked.length >= 8) break;
      picked.push(p);
    }
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function formatPage(page) {
  const lines = [`## ${page.path}  (${page.title})`];

  if (page.metaDescription) lines.push(`Meta: ${page.metaDescription}`);

  if (page.heroTexts.length) {
    lines.push(`Hero text: ${page.heroTexts.join(' | ')}`);
  }

  if (page.headings.length) {
    lines.push('Headings:');
    for (const h of page.headings.slice(0, 20)) {
      lines.push(`  H${h.level}: ${h.text}`);
    }
  }

  if (page.paragraphs.length) {
    lines.push('Paragraphs:');
    for (const p of page.paragraphs.slice(0, 8)) {
      lines.push(`  - ${p.slice(0, 200)}`);
    }
  }

  if (page.images.length) {
    lines.push('Images (src | alt):');
    for (const img of page.images.slice(0, 15)) {
      lines.push(`  ${img.src} | ${img.alt}`);
    }
  }

  if (page.structuredData.length) {
    lines.push('JSON-LD:');
    for (const item of page.structuredData.slice(0, 3)) {
      lines.push('  ' + JSON.stringify(item).slice(0, 400));
    }
  }

  return lines.join('\n');
}

function buildPrompt(bronze) {
  const keyPages  = selectKeyPages(bronze.pages);
  const allPaths  = bronze.siteAssets.allUrls.map(u => {
    try { return new URL(u).pathname; } catch { return u; }
  });

  const pageBlocks = keyPages.map(formatPage).join('\n\n---\n\n');

  return `You are analyzing raw crawled data from a dental practice website.
Your job: extract structured practice information and return it as JSON.

WEBSITE: ${bronze.baseUrl}
CRAWLED: ${bronze.pageCount} pages
ALL PATHS: ${allPaths.slice(0, 40).join(', ')}

${pageBlocks}

---
SITE NAVIGATION: ${bronze.siteAssets.navigation.map(n => n.text).join(', ')}
SOCIAL LINKS: ${bronze.siteAssets.socialLinks.slice(0, 8).join(' | ') || 'none found'}
CSS COLORS (raw list): ${bronze.siteAssets.cssColors.slice(0, 30).join(', ') || 'none found'}

---
Extract the following as a single JSON object. Use null for any field you cannot determine with confidence.

{
  "practice": {
    "name": "Full legal practice name (e.g. 'Spring St. Dentistry', not truncated)",
    "phone": "Phone in (XXX) XXX-XXXX format",
    "email": "Email address or null",
    "domain": "Domain without protocol",
    "googleReviewLink": "URL to leave a Google review, or null",
    "googleProfileLink": "URL of Google Business Profile, or null",
    "sameAs": ["Social/directory profile URLs"]
  },
  "address": {
    "street": "Street address",
    "city": "City",
    "state": "2-letter state",
    "zip": "ZIP code"
  },
  "hours": {
    "display": [{ "day": "Mon", "time": "9am – 5pm" }],
    "raw": "Raw hours text as found on site"
  },
  "doctor": {
    "name": "Full name with Dr. prefix",
    "firstName": "First name only",
    "lastName": "Last name only",
    "credentials": "e.g. DMD, DDS",
    "bio": "Full bio paragraph(s) — do not truncate",
    "education": "Education/training details or null",
    "specialties": ["List of specialties or focus areas"],
    "photoUrl": "URL of doctor headshot photo or null"
  },
  "additionalDoctors": [
    {
      "name": "Full name with Dr. prefix",
      "firstName": "First",
      "lastName": "Last",
      "credentials": "e.g. DDS",
      "bio": "Bio text or null",
      "photoUrl": "Photo URL or null"
    }
  ],
  "services": {
    "offered": [
      {
        "name": "Human-readable service name",
        "category": "general|cosmetic|orthodontic|emergency|specialty|implant|pediatric"
      }
    ]
  },
  "brand": {
    "colors": {
      "primary": "The dominant non-white, non-black brand color hex (e.g. a teal or navy)",
      "secondary": "Second most prominent brand color hex",
      "accent": "Accent color hex or null"
    },
    "logoUrl": "URL of the practice logo image"
  },
  "content": {
    "heroTagline": "The main hero/banner headline (short, punchy — e.g. 'Creating the Perfect Smile for Your Family')",
    "heroSubheadline": "Supporting hero subtext or null",
    "aboutText": "Full about-us / practice philosophy paragraph(s)",
    "testimonials": [
      { "text": "Review text", "author": "Name or null", "stars": 5 }
    ],
    "faqs": [
      { "question": "Q", "answer": "A" }
    ],
    "insurance": ["List of accepted insurance plans"],
    "specials": [
      { "title": "Special offer title", "description": "Description" }
    ],
    "stats": {
      "yearsExperience": null,
      "googleRating": null,
      "fiveStarReviews": null
    }
  },
  "images": {
    "logo": "URL of logo image",
    "hero": ["URLs of hero/banner background images"],
    "team": ["URLs of doctor/staff headshot photos"],
    "office": ["URLs of office/facility interior photos"],
    "gallery": ["URLs of service category or treatment images"],
    "beforeAfter": ["URLs of before/after smile transformation photos"]
  },
  "migration": {
    "oldUrls": ["All crawled page paths, one per entry"]
  }
}

Rules:
- practice.name: use the FULL name as it appears in the footer or logo alt text, not truncated
- brand.colors.primary: must NOT be white (#fff, #ffffff, #f*) or near-black (#000, #111, #222, #333). Pick the actual brand color.
- images: classify based on URL path patterns AND alt text. /client/images/dr-* → team. /home-slider/* → hero. /dental-services/* → gallery. Before/after → beforeAfter.
- hours: parse whatever format appears (e.g. "Monday-Thursday 9:00AM-6:00PM" → display: [{day:"Mon–Thu", time:"9:00AM–6:00PM"}])
- services: extract everything mentioned as a service, treatment, or procedure across all pages
- If JSON-LD structured data exists, prefer it for NAP (name, address, phone), hours, and doctor info
- Return ONLY the JSON object. No markdown. No explanation.`;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data  = await res.json();
  const text  = data.content?.[0]?.text || '';

  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(clean);
}

// ---------------------------------------------------------------------------
// Post-process: normalize the AI output into the merger's expected shape
// ---------------------------------------------------------------------------

function normalizeAiOutput(raw, bronzeBaseUrl) {
  // Ensure every array field exists
  const practice = raw.practice || {};
  const address  = raw.address  || {};
  const hours    = raw.hours    || null;
  const doctor   = raw.doctor   || {};
  const services = raw.services || {};
  const brand    = raw.brand    || {};
  const content  = raw.content  || {};
  const images   = raw.images   || {};
  const migration = raw.migration || {};

  return {
    practice: {
      name:               practice.name    || null,
      domain:             practice.domain  || new URL(bronzeBaseUrl).hostname,
      phone:              practice.phone   || null,
      email:              practice.email   || null,
      googleReviewLink:   practice.googleReviewLink  || null,
      googleProfileLink:  practice.googleProfileLink || null,
      priceRange:         '$$',
      medicalSpecialty:   null,
      sameAs:             practice.sameAs  || [],
    },
    doctor: {
      name:        doctor.name        || null,
      firstName:   doctor.firstName   || null,
      lastName:    doctor.lastName    || null,
      credentials: doctor.credentials || null,
      bio:         doctor.bio         || null,
      education:   doctor.education   || null,
      specialties: doctor.specialties || [],
      photoPath:   doctor.photoUrl    || null,
    },
    additionalDoctors: (raw.additionalDoctors || []).map(d => ({
      name:        d.name        || null,
      firstName:   d.firstName   || null,
      lastName:    d.lastName    || null,
      credentials: d.credentials || null,
      bio:         d.bio         || null,
      education:   null,
      specialties: [],
      photoPath:   d.photoUrl    || null,
    })),
    address: {
      street:  address.street  || null,
      city:    address.city    || null,
      state:   address.state   || null,
      zip:     address.zip     || null,
      country: 'US',
      full:    [address.street, address.city,
                [address.state, address.zip].filter(Boolean).join(' ')]
               .filter(Boolean).join(', ') || null,
    },
    hours: hours || null,
    services: {
      offered: (services.offered || []).map(s => ({
        name:       s.name     || s,
        slug:       slugify(s.name || s),
        category:   s.category || 'general',
        source:     'scrape',
        confidence: 0.85,
      })),
    },
    brand: {
      colors: brand.colors ? {
        primary:   brand.colors.primary   || null,
        secondary: brand.colors.secondary || null,
        light:     null,
        accent:    brand.colors.accent    || null,
        highlight: null,
      } : null,
      fonts:    null,
      logoPath: brand.logoUrl || images.logo || null,
    },
    content: {
      heroTagline:     content.heroTagline     || null,
      heroHeadline:    content.heroTagline     || null,
      heroSubheadline: content.heroSubheadline || null,
      ctaText:         null,
      ctaSecondaryText:null,
      valueProp:       null,
      aboutText:       content.aboutText       || null,
      aboutHeadline:   null,
      philosophy:      null,
      closingCTA:      null,
      testimonials:    content.testimonials    || [],
      faqs:            content.faqs            || [],
      generatedFAQs:   [],
      stats: {
        yearsExperience: content.stats?.yearsExperience  || null,
        happyPatients:   null,
        googleRating:    content.stats?.googleRating     || null,
        fiveStarReviews: content.stats?.fiveStarReviews  || null,
      },
      insurance: content.insurance || [],
      generated: null,
    },
    images: {
      logo:        images.logo       || null,
      hero:        images.hero       || [],
      team:        images.team       || [],
      office:      images.office     || [],
      gallery:     images.gallery    || [],
      beforeAfter: images.beforeAfter|| [],
    },
    migration: {
      oldUrls:     migration.oldUrls || [],
      redirectMap: [],
    },
    meta: {
      oldSiteUrl:     bronzeBaseUrl,
      scrapedAt:      new Date().toISOString(),
      intakeSource:   'ai-silver',
      clientId:       null,
      confidenceFlags: [],
    },
    // Pass through for downstream AI steps that use raw page content
    pageInventory: null,
  };
}

// Simple slug helper (mirrors utils.js without the import)
function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transform raw BronzeData into a partial PracticeData object using Claude.
 *
 * Falls back to an empty object (not an error) if API key is absent,
 * so the pipeline can still run with intake-only data.
 *
 * @param {import('./scraper.js').BronzeData} bronze
 * @returns {Promise<object>} Partial PracticeData matching schema.js shape
 */
export async function extractSilver(bronze) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[ai-silver] ANTHROPIC_API_KEY not set — returning empty silver (intake-only mode).');
    return {};
  }

  console.log('[ai-silver] Sending bronze data to Claude for silver extraction...');

  const prompt = buildPrompt(bronze);
  let raw;
  try {
    raw = await callClaude(prompt);
  } catch (err) {
    console.warn(`[ai-silver] Claude call failed: ${err.message}. Returning empty silver.`);
    return {};
  }

  const silver = normalizeAiOutput(raw, bronze.baseUrl);

  // Attach page inventory for downstream AI steps (ai-content, ai-audit)
  silver.pageInventory = bronze.pages.map(p => ({
    url:       p.url,
    path:      p.path,
    title:     p.title,
    metaDesc:  p.metaDescription,
    h1:        p.headings.find(h => h.level === 1)?.text || null,
    h2s:       p.headings.filter(h => h.level === 2).map(h => h.text),
    h3s:       p.headings.filter(h => h.level === 3).map(h => h.text),
    paragraphs:p.paragraphs.slice(0, 5),
    wordCount: p.wordCount,
    bodyText:  p.bodyText.slice(0, 2000),
  }));

  console.log(`[ai-silver] Silver extraction complete.`);
  console.log(`  Practice:  ${silver.practice.name}`);
  console.log(`  Doctor:    ${silver.doctor.name}`);
  console.log(`  Phone:     ${silver.practice.phone}`);
  console.log(`  Address:   ${silver.address.full}`);
  console.log(`  Hours:     ${silver.hours?.raw || silver.hours?.display?.[0]?.day || 'null'}`);
  console.log(`  Services:  ${silver.services.offered.length}`);
  console.log(`  Colors:    primary=${silver.brand.colors?.primary}`);
  console.log(`  Images:    hero=${silver.images.hero.length} team=${silver.images.team.length} gallery=${silver.images.gallery.length}`);

  return silver;
}
