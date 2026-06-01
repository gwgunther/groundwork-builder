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

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'prompts', 'silver-extract.md');

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
  // Force-include — team/staff pages always get included regardless of cap,
  // because losing the team page means losing every non-doctor staff member.
  const FORCE = [
    p => /\/(team|staff|meet[-_]our[-_](team|staff))/i.test(p.path),
  ];

  const PRIORITY = [
    p => p.path === '/',
    p => /\/about/.test(p.path),
    p => /\/contact/.test(p.path),
    p => /\/dr[-_]/.test(p.path) || /\/doctor/.test(p.path) || /\/meet[-_]dr/i.test(p.path),
    p => /\/services/.test(p.path),
    p => /\/appointment/.test(p.path) || /\/schedule/.test(p.path),
    p => /\/specials/.test(p.path) || /\/offers/.test(p.path),
  ];

  const picked  = [];
  const pickedSet = new Set();

  // Force-includes first — never get squeezed out by the 8-page cap.
  for (const test of FORCE) {
    for (const page of pages) {
      if (!pickedSet.has(page.url) && test(page)) {
        picked.push(page);
        pickedSet.add(page.url);
      }
    }
  }

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

  // Always include body text for contact/about pages — phone, email, hours are often plain text
  if (page.bodyText) {
    lines.push(`Body text: ${page.bodyText.slice(0, 1500)}`);
  }

  return lines.join('\n');
}

async function buildPrompt(bronze) {
  const keyPages  = selectKeyPages(bronze.pages);
  const allPaths  = bronze.siteAssets.allUrls.map(u => {
    try { return new URL(u).pathname; } catch { return u; }
  });

  const pageBlocks = keyPages.map(formatPage).join('\n\n---\n\n');

  const siteData = [
    `WEBSITE: ${bronze.baseUrl}`,
    `CRAWLED: ${bronze.pageCount} pages`,
    `ALL PATHS: ${allPaths.slice(0, 40).join(', ')}`,
    '',
    pageBlocks,
    '',
    '---',
    `SITE NAVIGATION: ${bronze.siteAssets.navigation.map(n => n.text).join(', ')}`,
    `SOCIAL LINKS: ${bronze.siteAssets.socialLinks.slice(0, 8).join(' | ') || 'none found'}`,
    `CSS COLORS (raw list): ${bronze.siteAssets.cssColors.slice(0, 30).join(', ') || 'none found'}`,
  ].join('\n');

  let template;
  try {
    template = await readFile(PROMPT_PATH, 'utf-8');
  } catch {
    throw new Error(`Could not load silver extraction prompt from ${PROMPT_PATH}`);
  }

  return template.replace('{{siteData}}', siteData);
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

function normalizeAiOutput(raw, bronze) {
  const bronzeBaseUrl = typeof bronze === 'string' ? bronze : bronze?.baseUrl;
  const bronzeNav     = typeof bronze === 'object' ? (bronze?.siteAssets?.navigation || []) : [];

  // Ensure every array field exists
  const practice = raw.practice || {};
  const address  = raw.address  || {};
  const hours    = raw.hours    || null;
  const services = raw.services || {};
  const brand    = raw.brand    || {};
  const content  = raw.content  || {};
  const images   = raw.images   || {};
  const migration = raw.migration || {};

  // ---- Doctors[] — unified array; back-compat to doctor + additionalDoctors ----
  // Build a single canonical doctors[] from whichever shape the model produced.
  // Accept either: (a) new `doctors[]` array, or (b) legacy `doctor` + `additionalDoctors[]`.
  const rawDoctors = Array.isArray(raw.doctors) && raw.doctors.length > 0
    ? raw.doctors
    : [
        ...(raw.doctor && (raw.doctor.name || raw.doctor.firstName) ? [raw.doctor] : []),
        ...(Array.isArray(raw.additionalDoctors) ? raw.additionalDoctors : []),
      ];

  const doctors = rawDoctors.map((d, idx) => ({
    name:        d?.name        || null,
    firstName:   d?.firstName   || null,
    lastName:    d?.lastName    || null,
    credentials: d?.credentials || null,
    bio:         d?.bio         || null,
    education:   d?.education   || null,
    specialties: d?.specialties || [],
    photoPath:   d?.photoUrl    || d?.photoPath || null,
    rank:        d?.rank        || idx + 1,
  }));

  const primaryDoctor = doctors[0] || {
    name: null, firstName: null, lastName: null, credentials: null,
    bio: null, education: null, specialties: [], photoPath: null,
  };
  const secondaryDoctors = doctors.slice(1);

  // ---- Staff[] — non-doctor team members ----
  const staff = (Array.isArray(raw.staff) ? raw.staff : []).map(s => ({
    name:        s?.name        || null,
    role:        s?.role        || 'other',
    bio:         s?.bio         || null,
    credentials: s?.credentials || null,
    photoPath:   s?.photoUrl    || s?.photoPath || null,
  })).filter(s => s.name);

  // ---- Navigation — prefer AI-extracted tree; fall back to bronze flat nav ----
  const navigation = Array.isArray(raw.navigation) && raw.navigation.length > 0
    ? raw.navigation
    : bronzeNav;

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
    // Canonical: doctors[] is the source of truth (rank 1 = primary).
    doctors,
    // Staff[] — non-doctor team (hygienists, assistants, receptionists, office managers).
    staff,
    // Navigation tree from the source site — used by injector to build navLinks.
    navigation,
    // Back-compat: legacy consumers still read `doctor` and `additionalDoctors`.
    // These mirror doctors[0] and doctors[1..].
    doctor: primaryDoctor,
    additionalDoctors: secondaryDoctors,
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

  const prompt = await buildPrompt(bronze);
  let raw;
  try {
    raw = await callClaude(prompt);
  } catch (err) {
    console.warn(`[ai-silver] Claude call failed: ${err.message}. Returning empty silver.`);
    return {};
  }

  const silver = normalizeAiOutput(raw, bronze);

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
  console.log(`  Doctors:   ${silver.doctors.length} (primary: ${silver.doctor.name})`);
  console.log(`  Staff:     ${silver.staff.length}`);
  console.log(`  Nav items: ${silver.navigation.length}`);
  console.log(`  Phone:     ${silver.practice.phone}`);
  console.log(`  Address:   ${silver.address.full}`);
  console.log(`  Hours:     ${silver.hours?.raw || silver.hours?.display?.[0]?.day || 'null'}`);
  console.log(`  Services:  ${silver.services.offered.length}`);
  console.log(`  Colors:    primary=${silver.brand.colors?.primary}`);
  console.log(`  Images:    hero=${silver.images.hero.length} team=${silver.images.team.length} gallery=${silver.images.gallery.length}`);

  return silver;
}
