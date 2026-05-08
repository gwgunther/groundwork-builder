/**
 * generate-sections.js — Orchestrates AI generation of all section components.
 *
 * Atomic design pipeline:
 *   Stage 1 (ai-director)   → DNA tokens (archetype, radius, density, etc.)
 *   Stage 2 (ai-molecules)  → Molecule library (shared button/card/heading classes)
 *   Stage 3 (skill-generate)→ Individual section components, all using Stage 2 molecules
 *
 * The homepage dispatcher (`src/pages/index.astro`) statically imports every
 * section component from `src/components/generated/*` and renders them in
 * `designDNA.sectionOrder`. This generator simply overwrites those component
 * files with AI-produced content. Sections we can't (or don't) generate are
 * left as stubs that ship with the source template.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { run as runGenerate } from '../skills/skill-generate.js';
import { buildMolecules } from './ai-molecules.js';

// Sections always generated
// FAQ moved to ALWAYS_GENERATE: the FAQ skill synthesizes content from
// services + practice data even when no FAQs were scraped, so it never
// has zero data to render.
const ALWAYS_GENERATE = ['nav', 'footer', 'cta', 'hero', 'faq'];

// Sections generated only when present in sectionOrder
const CONDITIONAL_GENERATE = ['services', 'doctor-intro', 'stat-bar', 'reviews'];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {object} dna        - Design DNA
 * @param {object} practice   - { name, doctor, city, phone, address }
 * @param {object} merged     - Full merged practice data
 * @param {object} bronze     - Raw scrape data (for real navigation links)
 * @param {string} outputDir  - Absolute path to the output project directory
 * @returns {Promise<{ generated: string[], files: string[], errors: string[] }>}
 */
export async function generateSections(dna, practice, merged, bronze, outputDir) {
  const sectionOrder = dna.sectionOrder || [];

  // Stage 2: Build molecule library from locked DNA tokens
  // This is deterministic — no API call. All sections receive the same snippets.
  const molecules = buildMolecules(dna);

  // Assemble section content from merged + bronze data
  const content = buildSectionContent(merged, bronze);

  // Determine which sections to generate
  const toGenerate = [...ALWAYS_GENERATE];
  for (const section of CONDITIONAL_GENERATE) {
    if (toGenerate.includes(section) || !sectionOrder.includes(section)) continue;

    // Data guards — don't generate sections without data
    if (section === 'doctor-intro' && !practice.doctor) continue;
    if (section === 'stat-bar') {
      const stats = content.stats || {};
      const hasAnyStats = stats.yearsExperience || stats.happyPatients || stats.googleRating || stats.fiveStarReviews;
      if (!hasAnyStats) continue;
    }
    if (section === 'reviews' && (!content.reviews?.testimonials?.length)) continue;
    // FAQ no longer in CONDITIONAL_GENERATE — see ALWAYS_GENERATE comment

    toGenerate.push(section);
  }

  // Ensure generated/ directory exists
  const generatedDir = resolve(outputDir, 'src', 'components', 'generated');
  await mkdir(generatedDir, { recursive: true });

  // Stage 3: Run all section generations in parallel — each receives the same molecules
  const results = await Promise.allSettled(
    toGenerate.map(async (sectionType) => {
      const sectionContent = getSectionContent(sectionType, content);
      const result = await runGenerate({ dna, practice, sectionType, content: sectionContent, molecules });
      return { sectionType, result };
    })
  );

  const generated = [];
  const files = [];
  const errors = [];

  for (const outcome of results) {
    if (outcome.status === 'fulfilled') {
      const { sectionType, result } = outcome.value;
      try {
        if (result.isVariant) {
          // Variant path: write JSON content file + Astro shim
          const jsonAbs  = resolve(outputDir, result.jsonFile);
          const shimAbs  = resolve(outputDir, result.shimFile);
          await mkdir(dirname(jsonAbs), { recursive: true });
          await writeFile(jsonAbs, result.jsonContent, 'utf8');
          await writeFile(shimAbs, result.shimContent, 'utf8');
          generated.push(sectionType);
          files.push(result.shimFile);
          console.log(`    [generate] ${sectionType} → ${result.shimFile} (variant: ${result.meta?.variantKey})`);
        } else {
          // Legacy path: write Astro file directly
          const absPath = resolve(outputDir, result.file);
          await mkdir(dirname(absPath), { recursive: true });
          await writeFile(absPath, result.content, 'utf8');
          generated.push(sectionType);
          files.push(result.file);
          console.log(`    [generate] ${sectionType} → ${result.file}`);
        }
      } catch (writeErr) {
        console.warn(`    [generate] Failed to write ${sectionType}: ${writeErr.message}`);
        errors.push(`${sectionType}: write failed — ${writeErr.message}`);
      }
    } else {
      const reason = outcome.reason?.message || String(outcome.reason);
      console.warn(`    [generate] Skipped section (generation failed): ${reason}`);
      errors.push(reason);
    }
  }

  // Post-generation validation: catch hallucinated paths and naming errors
  // the AI ships despite the prompt rules. Auto-fix where safe; surface the
  // rest as warnings so the operator knows. Unfixable issues are returned in
  // `validationIssues` so build-site can plumb them into the missing report.
  const validationIssues = [];
  if (files.length > 0) {
    const { validateGeneratedFiles, autofixGeneratedIssues } = await import('./validate-generated.js');
    const absPaths = files.map(f => resolve(outputDir, f));
    const issues = await validateGeneratedFiles(absPaths, outputDir);

    if (issues.length > 0) {
      const fixed = await autofixGeneratedIssues(issues, outputDir);
      const fixedCount = [...fixed.values()].reduce((a, b) => a + b, 0);
      const remaining = issues.filter(i => i.issue !== 'double-doctor-prefix'); // these are auto-fixed

      if (fixedCount > 0) {
        console.log(`  [validate] Auto-fixed ${fixedCount} generation issue(s) (double-doctor-prefix).`);
      }
      for (const iss of remaining) {
        console.warn(`  [validate] ${iss.issue} in ${iss.file}: ${iss.detail}`);
        errors.push(`${iss.issue}: ${iss.detail}`);
        validationIssues.push(iss);
      }
    }
  }

  return { generated, files, errors, validationIssues };
}

// ---------------------------------------------------------------------------
// Section content assembly
// ---------------------------------------------------------------------------

/**
 * Build the complete content object from merged data + raw bronze scrape.
 * Lives here (not in build-site.js) because it's generation-specific logic.
 */
function buildSectionContent(merged, bronze = null) {
  const generated = merged?.content?.generated || {};
  const homepage  = generated?.homepage || {};

  // Build navigation from scraped site — map to known template routes only.
  // The template has a fixed set of pages; scraped links that don't map to them
  // are dropped to prevent 404s.
  //
  // TEMPLATE_ROUTES: exact paths that exist in the Astro template.
  const TEMPLATE_ROUTES = new Set(['/', '/about', '/services', '/blog', '/gallery', '/faq', '/financing', '/schedule']);

  // ROUTE_ALIASES: common scraped paths → nearest template equivalent.
  const ROUTE_ALIASES = {
    '/appointment':    '/schedule',
    '/book':           '/schedule',
    '/contact':        '/schedule',
    '/new-patients':   '/schedule',
    '/request-appointment': '/schedule',
    '/dr-anthony-hoang': '/about',
    '/meet-the-doctor': '/about',
    '/meet-dr':        '/about',
    '/our-team':       '/about',
    '/team':           '/about',
    '/about-us':       '/about',
    '/testimonials':   null,   // no template page — drop
    '/reviews':        null,
    '/before-after':   null,
    '/gallery':        '/gallery',
    '/special-offers': null,
    '/promotions':     null,
    '/careers':        null,
    '/privacy':        null,
  };

  // Map and deduplicate nav entries.
  const navSeen = new Set();
  const scrapedNav = (bronze?.siteAssets?.navigation || [])
    .filter(n => n.href && n.text && n.text.length < 40)
    .filter(n => !/request appointment|learn more|home/i.test(n.text))
    .map(n => {
      const raw = n.href.startsWith('/') ? n.href
        : (() => { try { return new URL(n.href).pathname; } catch { return n.href; } })();
      // Strip trailing slash for comparison
      const path = raw.replace(/\/$/, '') || '/';
      // Only top-level paths (no /services/something, no /blog/slug)
      const segments = path.replace(/^\//, '').split('/').filter(Boolean);
      if (segments.length > 1) return null;
      // Map to known template route
      let mapped = path;
      if (!TEMPLATE_ROUTES.has(path)) {
        // Check aliases (prefix match for paths like /dr-john-smith → /about)
        const aliasKey = Object.keys(ROUTE_ALIASES).find(k => path === k || path.startsWith(k + '/'));
        mapped = aliasKey ? ROUTE_ALIASES[aliasKey] : null;
      }
      if (!mapped) return null;  // no template equivalent — drop
      return { href: mapped, text: n.text };
    })
    .filter(Boolean)
    .filter(n => {
      if (navSeen.has(n.href)) return false;
      navSeen.add(n.href);
      return true;
    })
    .filter(n => n.href !== '/') // never add Home to desktop nav
    .slice(0, 7);

  // Always ensure /about is reachable if a doctor is present
  if (merged?.doctor?.name && !navSeen.has('/about')) {
    const doctorLabel = merged.doctor.name ? `Meet ${merged.doctor.name.split(' ').slice(-1)[0]}` : 'About';
    scrapedNav.push({ href: '/about', text: doctorLabel });
  }

  return {
    hero: {
      tagline:     merged?.content?.heroTagline     || homepage.heroTagline     || null,
      headline:    merged?.content?.heroHeadline    || homepage.heroHeadline    || null,
      subheadline: merged?.content?.heroSubheadline || homepage.heroSubheadline || null,
    },
    services: {
      list: (merged?.services?.offered || []).slice(0, 8).map(s => ({
        name: typeof s === 'string' ? s : s.name,
        slug: typeof s === 'string'
          ? s.toLowerCase().replace(/\s+/g, '-')
          : (s.slug || s.name?.toLowerCase().replace(/\s+/g, '-')),
        desc: typeof s === 'object' ? (s.description || s.blurb || '') : '',
      })),
    },
    navigation: scrapedNav,
    doctor: {
      // X3 — primary doctor pulled from doctors[0]; back-compat with old shape
      name:        merged?.doctors?.[0]?.name        || merged?.doctor?.name        || null,
      bio:         merged?.doctors?.[0]?.bio         || merged?.doctor?.bio         || merged?.content?.aboutText || null,
      credentials: merged?.doctors?.[0]?.credentials || merged?.doctor?.credentials || null,
      // Relevant rescued content for grounding the bio in real voice.
      // Filter additionalContent to types that make sense for a doctor section:
      // pull-quotes from this doctor, philosophy paragraphs, welcome statements.
      // X2: read top-level; back-compat with nested location
      additionalContent: (merged?.additionalContent || merged?.content?.additionalContent || []).filter(item => {
        const type = String(item.type || '').toLowerCase();
        const text = String(item.content || '').toLowerCase();
        const docName = String(merged?.doctors?.[0]?.name || merged?.doctor?.name || '').toLowerCase();
        const docLast = docName.replace(/^dr\.?\s+/, '').split(/\s+/).pop() || '';
        const matchesType = /pullquote|quote|philosophy|approach|welcome|mission|patient-experience|community/.test(type);
        // Pull quote from THIS doctor specifically (mentions their name)
        const mentionsThisDoctor = docLast && text.includes(docLast);
        return matchesType || mentionsThisDoctor;
      }).slice(0, 4),
    },
    cta: {
      headline:    merged?.content?.ctaText           || homepage.ctaText           || null,
      subheadline: merged?.content?.ctaSecondaryText  || homepage.ctaSecondaryText  || null,
    },
    stats: {
      yearsExperience: merged?.content?.stats?.yearsExperience || null,
      happyPatients:   merged?.content?.stats?.happyPatients   || null,
      googleRating:    merged?.content?.stats?.googleRating    || null,
      fiveStarReviews: merged?.content?.stats?.fiveStarReviews || null,
    },
    reviews: {
      testimonials: merged?.content?.testimonials || merged?.content?.reviews || [],
      rating:       merged?.reviews?.rating       || null,
      reviewCount:  merged?.reviews?.reviewCount  || null,
      gmapsUrl:     merged?.reviews?.gmapsUrl     || merged?.practice?.googleProfileLink || null,
    },
    faqs: merged?.content?.faqs || merged?.content?.generatedFAQs || [],
    // X2 — Catch-all rescued content from silver. Top-level on the new shape;
    // legacy nested location supported for back-compat.
    additionalContent: merged?.additionalContent || merged?.content?.additionalContent || [],
    // X3 — Full doctors[] array (primary at [0]). Section briefs that need ALL
    // doctors (about page, team blocks) read from here. Briefs that need just
    // the primary read content.doctor (above).
    doctors: merged?.doctors || (merged?.doctor && merged.doctor.name
      ? [merged.doctor, ...(merged.additionalDoctors || [])]
      : []),
    // Practice specialty hint for FAQ generation — used to scope question topics
    specialty: merged?.practice?.specialty
            || merged?.preset?.specialty
            || (merged?.practice?.name && /ortho/i.test(merged.practice.name) ? 'orthodontics'
              : merged?.practice?.name && /pediatric|kid/i.test(merged.practice.name) ? 'pediatric dentistry'
              : merged?.practice?.name && /cosmetic/i.test(merged.practice.name) ? 'cosmetic dentistry'
              : 'general dentistry'),
  };
}

/**
 * Extract section-specific content slice from the full content object.
 */
function getSectionContent(sectionType, content = {}) {
  switch (sectionType) {
    case 'hero':         return content.hero         || {};
    case 'services':     return content.services     || {};
    case 'doctor-intro': return content.doctor       || {};
    case 'cta':          return content.cta          || {};
    case 'nav':          return { services: content.services || {}, navigation: content.navigation || [] };
    case 'footer':       return {};
    case 'stat-bar':     return content.stats        || {};
    case 'reviews':      return content.reviews      || {};
    case 'faq':          return {
      faqs:      content.faqs     || [],
      services:  content.services || {},
      specialty: content.specialty || content.practice?.specialty || null,
      // FAQ-relevant rescued content — types that often answer common questions:
      // financing/insurance copy, emergency policy, accessibility/multilingual notes,
      // first-visit / approach descriptions.
      additionalContent: (content.additionalContent || []).filter(item => {
        const type = String(item.type || '').toLowerCase();
        return /financing|insurance|emergency|accessibility|multilingual|approach|first-visit|patient-experience|community|technology/.test(type);
      }).slice(0, 6),
    };
    default:             return content[sectionType] || {};
  }
}

