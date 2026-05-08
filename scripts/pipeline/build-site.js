#!/usr/bin/env node
/**
 * Groundwork Builder Pipeline
 *
 * Takes an existing website URL and/or intake form data,
 * and generates a ready-to-customize Astro project from the starter template.
 *
 * Usage:
 *   node scripts/pipeline/build-site.js --url https://old-site.com --output ../clients/smith-dental
 *   node scripts/pipeline/build-site.js --data intake.json --output ../clients/smith-dental
 *   node scripts/pipeline/build-site.js --url https://old-site.com --data intake.json --output ../clients/smith-dental
 *   node scripts/pipeline/build-site.js --client-id abc-123 --output ../clients/smith-dental
 *   node scripts/pipeline/build-site.js --preset dental --url https://old-site.com --output ../clients/smith-dental
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';
// Load .env relative to this file's location, not process.cwd()
dotenvConfig({ path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
import { resolve } from 'node:path';
import { loadPreset } from './lib/preset-loader.js';
import { scrape } from './lib/scraper.js';
import { extractSilver } from './lib/ai-silver.js';
import { loadIntake } from './lib/intake.js';
import { mergeData } from './lib/merger.js';
import { injectTemplate, injectGlobalCss } from './lib/injector.js';
import { generatePages } from './lib/page-generator.js';
import { generateBlogStubs } from './lib/blog-generator.js';
import { downloadImages } from './lib/image-downloader.js';
import { validate } from './lib/validator.js';
import { slugify } from './lib/utils.js';
import { createArtifactWriter } from './lib/artifacts.js';
import { runSiteAudit } from './lib/ai-audit.js';
import { runDesignMapping } from './lib/ai-design.js';
import { runContentMapping } from './lib/ai-content.js';
import { runContentMap } from './lib/ai-content-map.js';
import { generateMissingPage } from './lib/missing-page.js';
import { generateReport } from './lib/report-generator.js';
import { runCreativeDirector } from './lib/ai-director.js';
import { runBrandDirection } from './lib/ai-brand-direction.js';
import { scrapeReviews } from './lib/scrape-reviews.js';
import { analyzeImages } from './lib/ai-images.js';
import { classifyImageRoles } from './lib/ai-image-roles.js';
import { writeDesignDna } from './lib/injector.js';
import { distillDesign } from './lib/distill-design.js';
import { runDesignerAgent, buildAstro } from './lib/designer-agent.js';

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    data: null,
    clientId: null,
    output: null,
    preset: 'dental',
    skipScrape: false,
    skipImages: false,
    skipAudit: false,
    skipDesign: false,
    skipContent: false,
    skipBuild: false,
    skipGenerate: false,
    dryRun: false,
    verbose: false,
    agent: true,
    agentIterations: '6',
    publish: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        opts.url = args[++i];
        break;
      case '--data':
        opts.data = args[++i];
        break;
      case '--client-id':
        opts.clientId = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--preset':
        opts.preset = args[++i];
        break;
      case '--skip-scrape':
        opts.skipScrape = true;
        break;
      case '--skip-images':
        opts.skipImages = true;
        break;
      case '--skip-audit':
        opts.skipAudit = true;
        break;
      case '--skip-design':
        opts.skipDesign = true;
        break;
      case '--skip-content':
        opts.skipContent = true;
        break;
      case '--skip-build':
        opts.skipBuild = true;
        break;
      case '--skip-generate':
        opts.skipGenerate = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--agent':
        opts.agent = true;
        break;
      case '--no-agent':
        opts.agent = false;
        break;
      case '--agent-iterations':
        opts.agentIterations = args[++i];
        break;
      case '--include-debug-pages':
        // Ship internal debug pages (currently /missing) into the deployed
        // dist/. By default these are operator-only and live in _pipeline/.
        opts.includeDebugPages = true;
        break;
      case '--debug-prompts':
        // Dump every Claude API prompt + response to _pipeline/_debug/ for
        // post-mortem inspection. No-op unless the call sites support it.
        opts.debugPrompts = true;
        process.env.GROUNDWORK_DEBUG_PROMPTS = '1';
        break;
      case '--publish':
        // After build: generate pitch page, push to GitHub, create CF Pages
        // project, add subdomain, write Airtable row.
        opts.publish = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.warn(`Unknown flag: ${args[i]}`);
        break;
    }
  }

  if (!opts.url && !opts.data && !opts.clientId) {
    console.error('Error: At least one of --url, --data, or --client-id is required.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
Groundwork Builder Pipeline

Usage:
  node scripts/pipeline/build-site.js [options]

Options:
  --url <url>        Existing website URL to scrape
  --data <path>      Path to intake JSON file
  --client-id <id>   Supabase client UUID
  --output <path>    Output directory for new project
  --preset <name>    Vertical preset (default: dental)
  --skip-scrape      Skip website scraping
  --skip-images      Skip image downloading
  --skip-audit       Skip AI site audit
  --skip-build       Skip build validation
  --dry-run          Scrape + merge only, print JSON
  --verbose          Detailed output
  --help             Show this help message

Examples:
  node scripts/pipeline/build-site.js --url https://old-site.com --output ../clients/smith-dental
  node scripts/pipeline/build-site.js --data intake.json --output ../clients/smith-dental
  node scripts/pipeline/build-site.js --url https://old-site.com --data intake.json --output ../clients/smith-dental
`.trim());
}

// ---------------------------------------------------------------------------
// Main pipeline orchestrator
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log('');
  console.log('=== Groundwork Builder Pipeline ===');
  console.log('');

  // Load vertical preset
  console.log(`[Preset] Loading "${opts.preset}" preset...`);
  const preset = await loadPreset(opts.preset);
  console.log(`[Preset] Loaded: ${preset.name} (${preset.taxonomy.services.length} service taxonomy entries)`);
  console.log('');

  // Track stats for the summary
  const stats = {
    scrapedUrl: null,
    intakeFile: null,
    practiceName: null,
    doctorName: null,
    phone: null,
    servicesCount: 0,
    blogStubs: 0,
    imagesDownloaded: 0,
    buildSuccess: false,
    placeholders: [],
    brokenLinks: [],
    confidenceFlags: [],
    errors: [],
    hasDesign: false,
    hasContent: false,
    missingCritical: 0,
    missingImportant: 0,
  };

  // -----------------------------------------------------------------------
  // Phase 1a: Crawl existing website — Bronze layer (raw page dump)
  // -----------------------------------------------------------------------
  let bronze = null;
  let scraped = null; // silver-shaped data (for downstream compatibility)
  let reviews = null;

  if (opts.url && !opts.skipScrape) {
    console.log(`[Phase 1a] Crawling ${opts.url} (bronze)...`);
    try {
      bronze = await scrape(opts.url, { verbose: opts.verbose });
      stats.scrapedUrl = opts.url;
      console.log(`  Bronze: ${bronze.pageCount} pages crawled.`);
    } catch (err) {
      console.error(`  Crawl failed: ${err.message}`);
      stats.errors.push(`Crawl failed: ${err.message}`);
    }
    console.log('');

    // -----------------------------------------------------------------------
    // Phase 1b: AI Silver extraction — Bronze → structured PracticeData
    // -----------------------------------------------------------------------
    if (bronze) {
      console.log('[Phase 1b] Extracting silver data via Claude...');
      try {
        scraped = await extractSilver(bronze);
        // Hard check — if silver came back essentially empty, fail loudly.
        // Continuing with empty silver produces a garbage build downstream.
        const isEmpty = !scraped?.practice?.name && !scraped?.doctor?.name && (scraped?.services?.offered?.length ?? 0) === 0;
        if (isEmpty) {
          throw new Error('Silver extraction returned empty data — likely a transient API failure. Re-run the pipeline.');
        }
        console.log('  Silver extraction complete.');
      } catch (err) {
        console.error(`\n  ✗ FATAL: ${err.message}`);
        console.error(`  The pipeline cannot produce a meaningful build without silver data.`);
        console.error(`  Re-run with the same URL — bronze is cached and Phase 1a will be fast.\n`);
        process.exit(1);
      }
      console.log('');

      // -----------------------------------------------------------------------
      // Phase 1c: Scrape reviews from bronze (Google Maps / Yelp / schema.org)
      // -----------------------------------------------------------------------
      console.log('[Phase 1c] Scraping reviews from bronze...');
      try {
        reviews = await scrapeReviews(bronze);
        if (reviews.source) {
          console.log(`  Reviews: source=${reviews.source}, rating=${reviews.rating ?? '—'}, count=${reviews.reviewCount ?? '—'}, scraped=${reviews.reviews.length}`);
          if (reviews.gmapsUrl) console.log(`  Google Maps URL found.`);
          if (reviews.yelpUrl)  console.log(`  Yelp URL found.`);
        } else {
          console.log('  No review URLs found in bronze.');
        }
      } catch (err) {
        console.warn(`  Review scrape failed: ${err.message}`);
        reviews = null;
      }
      console.log('');

      // -----------------------------------------------------------------------
      // Phase 1d: AI image analysis (cached in Supabase by URL + slug)
      // -----------------------------------------------------------------------
      console.log('[Phase 1d] Analyzing images...');
      const _imgSlug = opts.url
        ? new URL(opts.url).hostname.replace(/^www\./, '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
        : 'unknown';
      try {
        bronze.imageAnalysis = await analyzeImages(bronze, _imgSlug, { verbose: opts.verbose });
        const count = Object.keys(bronze.imageAnalysis).length;
        console.log(`  ${count} images analyzed.`);
        // Store slug for deferred artifact write after artifacts is initialized
        bronze._imageAnalysisSlug = _imgSlug;
      } catch (err) {
        console.warn(`  Image analysis failed (non-fatal): ${err.message}`);
        bronze.imageAnalysis = {};
      }
      console.log('');

    }
  } else if (opts.url && opts.skipScrape) {
    console.log('[Phase 1] Skipping crawl (--skip-scrape).');
    console.log('');
  } else {
    console.log('[Phase 1] No URL provided — skipping crawl.');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2: Load intake data + merge
  // -----------------------------------------------------------------------
  console.log('[Phase 2] Loading intake data and merging...');

  let intake = null;
  if (opts.data || opts.clientId) {
    try {
      intake = await loadIntake({
        filePath: opts.data,
        clientId: opts.clientId,
      });
      stats.intakeFile = opts.data || `supabase:${opts.clientId}`;
      console.log('  Intake data loaded.');
    } catch (err) {
      console.error(`  Intake load failed: ${err.message}`);
      stats.errors.push(`Intake load failed: ${err.message}`);
    }
  }

  if (!scraped && !intake) {
    console.error('');
    console.error('Error: No data available. Both scrape and intake failed or were skipped.');
    process.exit(1);
  }

  const merged = mergeData(scraped, intake, preset);

  // Merge scraped reviews into merged — store under BOTH keys for compatibility
  if (reviews && reviews.reviews.length > 0) {
    if (!merged.content) merged.content = {};
    if (!merged.content.reviews || merged.content.reviews.length === 0) {
      merged.content.reviews = reviews.reviews;
    }
    // Also populate testimonials — generate-sections.js uses this key
    if (!merged.content.testimonials || merged.content.testimonials.length === 0) {
      merged.content.testimonials = reviews.reviews;
    }
    // Store aggregate review data at top level for director and components
    merged.reviews = {
      source:      reviews.source,
      rating:      reviews.rating,
      reviewCount: reviews.reviewCount,
      gmapsUrl:    reviews.gmapsUrl,
      yelpUrl:     reviews.yelpUrl,
      reviews:     reviews.reviews,
    };
  }

  // Parse social links from bronze siteAssets into practice fields
  if (bronze?.siteAssets?.socialLinks?.length) {
    const socials = bronze.siteAssets.socialLinks;
    if (!merged.practice) merged.practice = {};
    // Google Maps / review URL
    const gmaps = socials.find(u => u.includes('google.com/maps') || u.includes('maps.google'));
    if (gmaps && !merged.practice.googleProfileLink) merged.practice.googleProfileLink = gmaps;
    // Yelp
    const yelp = socials.find(u => u.includes('yelp.com'));
    if (yelp && !merged.practice.yelpUrl) merged.practice.yelpUrl = yelp;
    // Facebook
    const fb = socials.find(u => u.includes('facebook.com') && !u.includes('/reviews'));
    if (fb && !merged.practice.facebookUrl) merged.practice.facebookUrl = fb;
    // Collect all as sameAs for schema
    if (!merged.practice.sameAs?.length) merged.practice.sameAs = socials;
  }

  // Validate googleReviewLink — silver AI sometimes assigns Facebook/Yelp URLs
  // when source link text says "Google Reviews". Must be a real Google URL.
  if (merged.practice?.googleReviewLink) {
    const link = merged.practice.googleReviewLink;
    if (!/google\.(com|[a-z]{2,3})\//i.test(link)) {
      console.log(`  Discarding non-Google review link: ${link.slice(0, 60)}`);
      merged.practice.googleReviewLink = null;
    }
  }
  // Fallback: if review link missing but Google profile/maps URL is present, use it
  if (!merged.practice?.googleReviewLink && merged.practice?.googleProfileLink) {
    merged.practice.googleReviewLink = merged.practice.googleProfileLink;
  }
  // Use Google Maps URL from review scrape as last fallback
  if (!merged.practice?.googleReviewLink && merged.reviews?.gmapsUrl) {
    merged.practice.googleReviewLink = merged.reviews.gmapsUrl;
  }

  // Populate stats from merged data
  stats.practiceName = merged.practice.name || '[unknown]';
  stats.doctorName = merged.doctor?.name
    || (merged.doctor?.firstName
      ? `Dr. ${merged.doctor.firstName} ${merged.doctor.lastName}`
      : '[unknown]');
  stats.phone = merged.practice.phone || '[unknown]';
  stats.servicesCount = merged.services.offered?.length || 0;
  stats.confidenceFlags = merged.meta?.confidenceFlags || [];

  console.log(`  Practice: ${stats.practiceName}`);
  console.log(`  Doctor:   ${stats.doctorName}`);
  console.log(`  Phone:    ${stats.phone}`);
  console.log(`  Services: ${stats.servicesCount}`);
  console.log('');

  // -----------------------------------------------------------------------
  // Dry run — just print merged JSON and exit
  // -----------------------------------------------------------------------
  if (opts.dryRun) {
    console.log('[Dry Run] Merged data:');
    console.log(JSON.stringify(merged, null, 2));
    process.exit(0);
  }

  // -----------------------------------------------------------------------
  // Resolve output directory
  // -----------------------------------------------------------------------
  let outputDir = opts.output;
  if (!outputDir) {
    const slug = merged.practice.name
      ? slugify(merged.practice.name)
      : merged.practice.domain
        ? slugify(merged.practice.domain.replace(/\.\w+$/, ''))
        : 'new-dental-site';
    outputDir = resolve('..', 'output', `${slug}`);
  }
  outputDir = resolve(outputDir);
  console.log(`[Output] ${outputDir}`);
  console.log('');

  // Create run-scoped storage (GCS + local) and artifact writer
  const { createRunStorage, storageStatus } = await import('./lib/storage.js');
  const clientSlug = (merged?.practice?.name || 'build')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'build';
  const runStorage = createRunStorage(clientSlug);
  const artifacts  = createArtifactWriter(outputDir, runStorage);

  // Write deferred image analysis artifact (bronze.imageAnalysis captured in Phase 1d)
  if (bronze?.imageAnalysis && Object.keys(bronze.imageAnalysis).length > 0) {
    await artifacts.writeStep('07-image-analysis', {
      input: { slug: bronze._imageAnalysisSlug || 'unknown', imageCount: Object.keys(bronze.imageAnalysis).length },
      output: bronze.imageAnalysis,
    }).catch(() => {});
  }

  // Log GCS status once
  const gcsStatus = await storageStatus();
  if (gcsStatus.enabled) {
    console.log(`[Storage] GCS enabled → gs://${gcsStatus.bucket}/${runStorage.gcsPrefix}/`);
  } else {
    console.log(`[Storage] Local only (set GOOGLE_CLOUD_CREDENTIALS_JSON to enable GCS)`);
  }
  console.log('');

  // Persist full bronze to disk + GCS for later re-processing.
  if (bronze) {
    try {
      const bronzeJson = JSON.stringify(bronze, null, 2);
      await runStorage.writeArtifact('01-bronze.json', bronzeJson, resolve(outputDir, '_pipeline', '01-bronze.json'));
      console.log(`  Bronze saved: ${bronze.pageCount} pages, ${(bronzeJson.length / 1024).toFixed(0)}KB`);
    } catch (err) {
      console.warn(`  Bronze save failed: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2b: AI Site Audit (unless --skip-audit or no API key)
  // -----------------------------------------------------------------------
  let audit = null;
  if (!opts.skipAudit && scraped) {
    console.log('[Phase 2b] Running AI site audit...');
    const auditStart = Date.now();
    audit = await runSiteAudit(scraped, merged, preset, { verbose: opts.verbose });
    if (audit) {
      await artifacts.writeStep('02-audit', {
        input: { url: opts.url, preset: opts.preset },
        output: audit,
      }, auditStart);
      console.log('  Audit artifact written.');
    }
    console.log('');
  } else if (opts.skipAudit) {
    console.log('[Phase 2b] Skipping AI audit (--skip-audit).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2b2: PageSpeed Insights — current site scores (non-AI, fast)
  // -----------------------------------------------------------------------
  if (opts.url) {
    console.log('[Phase 2b2] Running PageSpeed Insights on current site...');
    const psStart = Date.now();
    try {
      const { runPageSpeed } = await import('./lib/pagespeed.js');
      const psResult = await runPageSpeed(opts.url);
      await artifacts.writeStep('03-pagespeed', { input: { url: opts.url }, output: psResult }, psStart);
      const mob = psResult?.mobile?.performance;
      const dsk = psResult?.desktop?.performance;
      console.log(`  Mobile: ${mob ?? '—'}  Desktop: ${dsk ?? '—'}`);
    } catch (err) {
      console.warn(`  PageSpeed skipped: ${err.message}`);
    }
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2c: AI Design Mapping
  // -----------------------------------------------------------------------
  let design = null;
  if (!opts.skipDesign && scraped) {
    console.log('[Phase 2c] Running AI design mapping...');
    const designStart = Date.now();
    design = await runDesignMapping(scraped, merged, audit, { verbose: opts.verbose, preset });
    if (design) {
      stats.hasDesign = true;
      await artifacts.writeStep('04-design', {
        input: { url: opts.url, preset: opts.preset },
        output: design,
      }, designStart);
      console.log(`  Brand strength: ${design.brandStrength || '—'} · Signal: ${design.evolutionSignal || '—'} · Mood: ${design.mood || '—'}`);
      console.log('  Design extraction artifact written.');
      // NOTE: merged.brand is NOT updated here. Brand Direction (Phase 2d) owns that.
    } else {
      console.log('  AI design extraction skipped or failed — Brand Direction will proceed without extraction signal.');
    }
    console.log('');
  } else if (opts.skipDesign) {
    console.log('[Phase 2c] Skipping AI design mapping (--skip-design).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2d: AI Brand Direction
  // -----------------------------------------------------------------------
  let brandBrief = null;
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Phase 2d] Running AI brand direction...');
    const brandStart = Date.now();
    brandBrief = await runBrandDirection(design, merged, audit, { verbose: opts.verbose });
    if (brandBrief) {
      // Promote brand brief palette/fonts into merged.brand — these override design mapping
      if (!merged.brand) merged.brand = {};
      if (brandBrief.palette) {
        merged.brand.colors = {
          primary:   brandBrief.palette.primary   || merged.brand.colors?.primary,
          secondary: brandBrief.palette.secondary || merged.brand.colors?.secondary,
          light:     brandBrief.palette.light     || merged.brand.colors?.light,
          accent:    brandBrief.palette.accent     || merged.brand.colors?.accent,
          dark:      brandBrief.palette.dark      || merged.brand.colors?.dark,
          muted:     brandBrief.palette.muted     || merged.brand.colors?.muted,
          highlight: brandBrief.palette.accent     || merged.brand.colors?.highlight,
        };

        // Deterministic WCAG contrast check on the proposed palette.
        // The AI brand-direction step self-reports contrast but its math is
        // unreliable (we've seen near-misses by 0.05 that fail in practice).
        // Auto-correct primary if it doesn't pass AA, then update the
        // brand-brief artifact so reports show the actual shipped values.
        try {
          const { validatePalette } = await import('./lib/contrast.js');
          const result = validatePalette(merged.brand.colors);
          if (result.adjustments.length > 0) {
            for (const adj of result.adjustments) {
              console.log(`  [contrast] auto-corrected ${adj.key}: ${adj.from} → ${adj.to}`);
              console.log(`             ${adj.reason}`);
              merged.brand.colors[adj.key] = adj.to;
              if (adj.key === 'primary') {
                merged.brand.colors.highlight = adj.to;
                brandBrief.palette.primary = adj.to;
              } else {
                brandBrief.palette[adj.key] = adj.to;
              }
              stats.confidenceFlags.push(`brand.${adj.key}: auto-darkened from ${adj.from} to ${adj.to} for WCAG AA contrast`);
            }
          }
          if (result.issuesAfter.length > 0) {
            console.warn(`  [contrast] ${result.issuesAfter.length} issue(s) remain after auto-correct:`);
            for (const iss of result.issuesAfter) {
              console.warn(`    - ${iss.label}: ${iss.contrast} (need ${iss.target})`);
              stats.confidenceFlags.push(`brand.contrast: ${iss.label} fails (${iss.contrast} < ${iss.target})`);
            }
          }
        } catch (err) {
          console.warn(`  [contrast] check failed: ${err.message}`);
        }
      }
      if (brandBrief.typography) {
        const stripDesc = s => (s || '').split('—')[0].trim();
        merged.brand.fonts = {
          heading: stripDesc(brandBrief.typography.heading) || merged.brand.fonts?.heading,
          body:    stripDesc(brandBrief.typography.body)    || merged.brand.fonts?.body,
        };
      }
      await artifacts.writeStep('04b-brand', {
        input: { url: opts.url, mood: design?.mood || null },
        output: brandBrief,
      }, brandStart);
      console.log(`  Mood:    ${brandBrief.mood}`);
      console.log(`  Palette: ${brandBrief.palette?.primary} / ${brandBrief.palette?.secondary}`);
      console.log(`  Fonts:   ${brandBrief.typography?.heading} / ${brandBrief.typography?.body}`);
      console.log('  Brand brief artifact written.');
    } else {
      console.log('  Brand direction skipped or failed — using design mapping output.');
    }
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2e: Content Map (audit / blueprint) — what each section needs and
  // what existing source material best fits. Produces `_pipeline/03-content-blueprint.json`.
  // -----------------------------------------------------------------------
  let blueprint = null;
  if (!opts.skipContent && scraped) {
    console.log('[Phase 2e] Running Content Map (blueprint / audit)...');
    const mapStart = Date.now();
    blueprint = await runContentMap(scraped, merged, audit, preset, { verbose: opts.verbose });
    if (blueprint) {
      await artifacts.writeStep('03-content-blueprint', {
        input: { url: opts.url, preset: opts.preset },
        output: blueprint,
      }, mapStart);
      const cov = blueprint.coverage || {};
      console.log(`  Blueprint: ${cov.totalSections || '?'} sections — quality ${JSON.stringify(cov.byQuality || {})}, action ${JSON.stringify(cov.byAction || {})}`);
    } else {
      console.log('  Content Map skipped or failed — Write will run in legacy single-pass mode.');
    }
    console.log('');
  }

  // Phase 2f: Content Write — composes copy per the blueprint's keep/optimize/create
  // decisions. Produces `_pipeline/03-content.json` (consumed by page-generator).
  // -----------------------------------------------------------------------
  let contentMap = null;
  if (!opts.skipContent && scraped) {
    console.log('[Phase 2f] Running Content Write...');
    const contentStart = Date.now();
    contentMap = await runContentMapping(scraped, merged, audit, preset, { verbose: opts.verbose }, blueprint);
    if (contentMap) {
      stats.hasContent = true;
      // Surface key generated fields into merged.content for injection
      if (contentMap.homepage) {
        merged.content.heroTagline    = contentMap.homepage.heroTagline    || merged.content.heroTagline;
        merged.content.heroHeadline   = contentMap.homepage.heroHeadline   || merged.content.heroHeadline;
        merged.content.heroSubheadline = contentMap.homepage.heroSubheadline || merged.content.heroSubheadline;
        merged.content.ctaText        = contentMap.homepage.ctaText        || merged.content.ctaText;
        merged.content.ctaSecondaryText = contentMap.homepage.ctaSecondaryText || merged.content.ctaSecondaryText;
        merged.content.valueProp      = contentMap.homepage.valueProp      || merged.content.valueProp;
      }
      if (contentMap.about) {
        merged.content.aboutText      = contentMap.about.introParagraph    || merged.content.aboutText;
        merged.content.aboutHeadline  = contentMap.about.headline          || merged.content.aboutHeadline;
        merged.content.philosophy     = contentMap.about.philosophy        || merged.content.philosophy;
        merged.content.closingCTA     = contentMap.about.closingCTA        || merged.content.closingCTA;
      }
      if (contentMap.faqs?.length > 0 && merged.content.faqs.length === 0) {
        merged.content.generatedFAQs = contentMap.faqs;
      }
      merged.content.generated = contentMap;
      await artifacts.writeStep('03-content', {
        input: { url: opts.url, preset: opts.preset },
        output: contentMap,
      }, contentStart);
      console.log('  Content artifact written.');
    } else {
      console.log('  AI content mapping skipped or failed.');
    }
    console.log('');
  } else if (opts.skipContent) {
    console.log('[Phase 2e+2f] Skipping Content Map + Write (--skip-content).');
    console.log('');
  }

  // Write deferred scrape artifact — full silver output including signals
  if (scraped) {
    await artifacts.writeStep('01-scrape', {
      input: { url: opts.url },
      output: {
        practice: scraped.practice,
        doctor: scraped.doctor ? { name: scraped.doctor.name, credentials: scraped.doctor.credentials } : null,
        address: scraped.address,
        hours: scraped.hours || null,
        brand: scraped.brand || null,
        services: { offered: scraped.services?.offered || [] },
        images: {
          logo:        scraped.images?.logo        || null,
          hero:        scraped.images?.hero        || [],
          team:        scraped.images?.team        || [],
          office:      scraped.images?.office      || [],
          gallery:     scraped.images?.gallery     || [],
          beforeAfter: scraped.images?.beforeAfter || [],
        },
        content: {
          heroTagline:     scraped.content?.heroTagline     || null,
          heroSubheadline: scraped.content?.heroSubheadline || null,
          testimonials:    scraped.content?.testimonials    || [],
          faqs:            scraped.content?.faqs            || [],
          insurance:       scraped.content?.insurance       || [],
          stats:           scraped.content?.stats           || {},
        },
        signals: scraped.signals || [],
        servicesDetected: scraped.services?.offered?.length || 0,
        pagesVisited: scraped.migration?.oldUrls?.length || 0,
        reviews: reviews || null,
      },
      confidence: scraped.meta?.confidenceFlags || [],
    });
  }

  // Write merge artifact
  await artifacts.writeStep('06-merge', {
    input: {
      hasScrape: !!scraped,
      hasIntake: !!intake,
    },
    output: {
      practice: merged.practice.name,
      doctor: stats.doctorName,
      phone: merged.practice.phone,
      servicesOffered: merged.services.offered.length,
      redirectCount: merged.migration?.redirectMap?.length || 0,
    },
    confidence: merged.meta?.confidenceFlags || [],
  });

  // -----------------------------------------------------------------------
  // Phase 2f: Creative Director — emit design DNA
  // -----------------------------------------------------------------------
  let director = null;
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Phase 2f] Running Creative Director...');
    try {
      director = await runCreativeDirector(merged, design, opts, brandBrief, audit);
      console.log(`  Archetype:  ${director.dna.archetype}`);
      console.log(`  Hero:       ${director.dna.heroVariant}`);
      console.log(`  Sections:   ${director.dna.sectionOrder.join(' → ')}`);
      if (director.dna.borrowedFrom) {
        console.log(`  Borrowed:   ${director.dna.borrowedTrait} (from ${director.dna.borrowedFrom})`);
      }
      await artifacts.writeStep('05-director', {
        input: {
          libraryUsed: director._meta.libraryUsed,
          designMood: design?.mood || null,
          brandMood:  brandBrief?.mood || null,
        },
        output: director.dna,
        _meta: director._meta,
      });
      console.log('  Director artifact written.');
    } catch (err) {
      console.warn(`  Creative Director failed: ${err.message}`);
      director = null;
    }
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 3: Inject template + generate pages + blog stubs + images
  // -----------------------------------------------------------------------
  console.log('[Phase 3] Building project...');
  const buildStart = Date.now();

  // 3a — Copy starter template and inject practice data
  console.log('  Injecting template...');
  await injectTemplate(merged, outputDir, preset, design);
  console.log('  Template injected.');

  // 3a-bis — Write design DNA (after template clone)
  if (director) {
    await writeDesignDna(director.dna, outputDir);
    await injectGlobalCss(director.dna, outputDir);
    console.log(`  Global CSS injected (radius: ${director.dna.radius}, density: ${director.dna.density}).`);
    console.log('  Design DNA written to src/config/design-dna.ts');
  }

  // 3b — Generate individual service pages (one per scraped service)
  console.log('  Generating pages...');
  const pageResult = await generatePages({ ...merged, bronze }, outputDir, preset);

  // 3b-bis — Generate redirect file from migration map
  const redirectMap = merged?.migration?.redirectMap || [];
  if (redirectMap.length > 0) {
    try {
      const { writeFile: wf } = await import('node:fs/promises');
      const { resolve: res } = await import('node:path');
      // Cloudflare Pages / Netlify _redirects format
      const lines = redirectMap
        .filter(r => r.from && r.to)
        .map(r => `${r.from}  ${r.to}  301`);
      await wf(res(outputDir, 'public', '_redirects'), lines.join('\n') + '\n', 'utf8');
      console.log(`  Wrote ${lines.length} redirect(s) to public/_redirects`);
      stats.redirectCount = lines.length;
    } catch (err) {
      console.warn(`  Redirect file write failed (non-fatal): ${err.message}`);
    }
  }

  // 3c — Generate blog stubs
  console.log('  Generating blog stubs...');
  stats.blogStubs = await generateBlogStubs({ ...merged, bronze }, outputDir, preset);

  // 3d — Download images (unless --skip-images)
  if (!opts.skipImages) {
    console.log('  Downloading images...');
    stats.imagesDownloaded = await downloadImages(merged, outputDir, runStorage);
    console.log(`  Downloaded ${stats.imagesDownloaded} image(s).`);
  } else {
    console.log('  Skipping image download (--skip-images).');
  }

  // 3e — Classify images via Vision → image-roles.json
  let imageRolesResult = null;
  if (!opts.skipImages && process.env.ANTHROPIC_API_KEY) {
    console.log('  Classifying image roles (Vision)...');
    try {
      imageRolesResult = await classifyImageRoles(outputDir, {
        // Pass silver data so the classifier can pair photos with named doctors
        // via filename/alt-text matching (multi-doctor practices).
        silver: {
          doctor: merged?.doctor,
          // X3: prefer doctors[]; fall back to doctor + additionalDoctors
          doctors: merged?.doctors || (merged?.doctor ? [merged.doctor, ...(merged?.additionalDoctors || [])] : []),
          additionalDoctors: merged?.additionalDoctors,  // back-compat
        },
      });

      // Hero fallback: if classifier found no hero, promote first gallery image
      if (!imageRolesResult.roles.hero && imageRolesResult.roles.gallery?.length > 0) {
        const promoted = imageRolesResult.roles.gallery.shift();
        imageRolesResult.roles.hero = promoted;
        console.log(`  No hero classified — promoted gallery image: ${promoted}`);
      }

      console.log(`  Classified ${imageRolesResult._meta.classified} image(s). Hero: ${imageRolesResult.roles.hero || '(none)'}`);
      await artifacts.writeStep('09-image-roles', {
        output: imageRolesResult.roles,
        _meta: imageRolesResult._meta,
      });
    } catch (err) {
      console.warn(`  Image classification failed: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3.5: Generate unique section components via AI (Atomic Design)
  //
  // Stage 1 (DNA) is already done above.
  // Stage 2 (Molecules) + Stage 3 (Organisms) run inside generateSections.
  // The homepage dispatcher (`src/pages/index.astro`) statically imports every
  // section component, so no template-assembly step is needed — generation just
  // overwrites the stub component files.
  // -----------------------------------------------------------------------
  if (!opts.skipGenerate && process.env.ANTHROPIC_API_KEY && director) {
    console.log('[Phase 3.5] Generating unique section components (atomic design)...');
    try {
      const { generateSections } = await import('./lib/generate-sections.js');
      const practiceForSections = {
        name:               merged?.practice?.name               || '',
        doctor:             merged?.doctor?.name                 || '',
        city:               merged?.address?.city                || '',
        phone:              merged?.practice?.phone              || '',
        address:            [merged?.address?.street, merged?.address?.city, merged?.address?.state].filter(Boolean).join(', '),
        googleProfileLink:  merged?.practice?.googleProfileLink  || null,
        googleReviewLink:   merged?.practice?.googleReviewLink   || null,
        yelpUrl:            merged?.practice?.yelpUrl            || null,
        facebookUrl:        merged?.practice?.facebookUrl        || null,
      };
      const genResult = await generateSections(director.dna, practiceForSections, merged, bronze, outputDir);
      console.log(`  Generated: ${genResult.generated.join(', ')}`);
      if (genResult.errors.length > 0) {
        for (const e of genResult.errors) console.warn(`  Skipped: ${e}`);
      }
      // Stash validator issues so the missing-page step can render them later.
      stats.generationIssues = genResult.validationIssues || [];

      // Link scrub — auto-fix known bad hrefs before the build runs.
      // Catches anything the generator snuck in despite route constraints.
      const { scrubLinks } = await import('./lib/link-scrub.js');
      const scrub = await scrubLinks(outputDir);
      if (scrub.fixed.length > 0) {
        console.log(`  Link scrub: auto-fixed ${scrub.fixed.length} bad href(s):`);
        for (const f of scrub.fixed) console.log(`    ${f.from} → ${f.to}  (${f.file})`);
      }
      if (scrub.flagged.length > 0) {
        console.log(`  Link scrub: ${scrub.flagged.length} unknown href(s) need review:`);
        for (const f of scrub.flagged) console.log(`    ${f.href}  (${f.file})`);
      }

      if (!opts.skipBuild && genResult.generated.length > 0) {
        console.log('  Rebuilding with generated components...');
        try {
          const { execSync } = await import('node:child_process');
          // Install deps first if node_modules doesn't exist yet
          const { existsSync } = await import('node:fs');
          if (!existsSync(`${outputDir}/node_modules`)) {
            console.log('  Installing dependencies before rebuild...');
            execSync('npm install --silent', { cwd: outputDir, stdio: 'pipe', timeout: 120_000 });
          }
          execSync('npm run build', { cwd: outputDir, stdio: 'pipe', timeout: 120_000 });
          console.log('  Rebuild succeeded.');
        } catch (rebuildErr) {
          const msg = rebuildErr.stderr?.toString().slice(-800) || rebuildErr.message;
          console.warn(`  Rebuild after generation failed:\n${msg}`);
        }
      }
    } catch (err) {
      console.warn(`  Phase 3.5 failed (non-fatal): ${err.message}`);
    }
    console.log('');
  } else if (opts.skipGenerate) {
    console.log('[Phase 3.5] Skipping AI generation (--skip-generate).');
    console.log('');
  }

  // Write inject + pages artifact
  await artifacts.writeStep('07-inject', {
    output: {
      filesInjected: ['site.ts', 'navigation.ts', 'tailwind.config.mjs', 'astro.config.mjs'],
    },
  }, buildStart);

  await artifacts.writeStep('08-pages', {
    output: {
      servicesOffered: merged.services.offered.length,
      pagesRemoved: pageResult?.removed || 0,
      blogStubs: stats.blogStubs,
      imagesDownloaded: stats.imagesDownloaded,
    },
  });

  console.log('');

  // -----------------------------------------------------------------------
  // Phase 4: Validate build (unless --skip-build)
  // -----------------------------------------------------------------------
  if (!opts.skipBuild) {
    console.log('[Phase 4] Validating build...');
    const validateStart = Date.now();
    const validation = await validate(outputDir);
    stats.buildSuccess = validation.buildSuccess;
    stats.placeholders = validation.placeholders;
    stats.brokenLinks  = validation.brokenLinks || [];
    if (validation.errors.length > 0) {
      stats.errors.push(...validation.errors);
    }

    // Post-build integrity validator: section presence, broken images,
    // broken internal links. Catches silent-failure bugs the Astro build
    // doesn't fail on (most importantly: section in sectionOrder that
    // didn't reach the rendered HTML).
    if (validation.buildSuccess && director?.dna?.sectionOrder) {
      const { validateBuild } = await import('./lib/validate-build.js');
      try {
        stats.buildIntegrity = await validateBuild(outputDir, director.dna.sectionOrder);
        if (stats.buildIntegrity.length > 0) {
          console.log(`  [build-integrity] Found ${stats.buildIntegrity.length} issue(s):`);
          for (const iss of stats.buildIntegrity.slice(0, 8)) {
            console.log(`    - ${iss.kind}: ${iss.detail.slice(0, 140)}`);
          }
        } else {
          console.log('  [build-integrity] No issues found.');
        }
      } catch (err) {
        console.warn(`  [build-integrity] Validator threw: ${err.message}`);
        stats.buildIntegrity = [];
      }
    } else {
      stats.buildIntegrity = [];
    }

    await artifacts.writeStep('09-build', {
      output: {
        buildSuccess: validation.buildSuccess,
        placeholders: validation.placeholders,
        brokenLinks:  validation.brokenLinks || [],
        errors: validation.errors,
        buildIntegrity: stats.buildIntegrity,
      },
    }, validateStart);

    console.log('');
  } else {
    console.log('[Phase 4] Skipping build validation (--skip-build).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 4.5: Designer Agent loop (observe → critique → act → rebuild)
  // Runs only when: build succeeded, API key present, and --agent flag set
  // (or GROUNDWORK_AGENT=1 env var). Safe to skip on linear runs.
  // -----------------------------------------------------------------------
  let agentResult = null;
  const runAgent = (opts.agent || process.env.GROUNDWORK_AGENT === '1')
    && stats.buildSuccess
    && !!process.env.ANTHROPIC_API_KEY;

  if (runAgent) {
    console.log('[Phase 4.5] Designer Agent loop starting...');
    const practice = {
      name:   merged?.practice?.name || '',
      city:   merged?.address?.city  || '',
      doctor: merged?.doctor?.name   || '',
    };
    try {
      agentResult = await runDesignerAgent({
        projectDir: outputDir,
        dna:        director?.dna || null,
        practice,
        maxIterations: parseInt(opts.agentIterations || '6', 10),
        buildFn: buildAstro,
      });
      stats.agentGatePass = agentResult.gate_pass;
      stats.agentIterations = agentResult.iterations;
      const agentDims = ['typography','color_contrast','spatial_layout','information_hierarchy','craft','ux_writing'];
      const humanDims = ['imagery','distinctiveness','trust_signals'];
      const finalDims = agentResult.finalScore?.dimensions || {};

      // Agent gate summary
      const agentScores = agentDims.map(d => {
        const val = finalDims[d]?.score ?? finalDims[d] ?? '?';
        return `${d.slice(0,6)}:${val}`;
      }).join(' ');
      console.log(`  Agent: ${agentResult.iterations} iter · gate=${agentResult.gate_pass} · score=${agentResult.finalScore?.overall}`);
      console.log(`  Dims:  ${agentScores}`);

      // Human gate — extract gripes and surface as action items
      const actionItems = [];
      for (const dim of humanDims) {
        const dimData = finalDims[dim];
        const score = dimData?.score ?? dimData ?? null;
        if (score !== null && score < 7) {
          const gripes = dimData?.gripes || [];
          actionItems.push({ dim, score, gripes });
        }
      }

      if (actionItems.length > 0) {
        console.log('');
        console.log('  ┌─ Action items (require your input before handoff) ─────────────');
        for (const item of actionItems) {
          const label = item.dim === 'imagery' ? 'Imagery'
            : item.dim === 'distinctiveness' ? 'Distinctiveness'
            : 'Trust Signals';
          console.log(`  │  ⚠  ${label} (${item.score}/10)`);
          for (const gripe of item.gripes.slice(0, 2)) {
            console.log(`  │     · ${gripe.slice(0, 100)}${gripe.length > 100 ? '…' : ''}`);
          }
        }
        console.log('  └────────────────────────────────────────────────────────────────');
      }
      await artifacts.writeStep('10-agent', { output: agentResult }, Date.now());
    } catch (err) {
      console.warn(`  Designer Agent failed: ${err.message}`);
    }
    console.log('');
  } else if (opts.agent) {
    console.log('[Phase 4.5] Designer Agent skipped (build not successful or no API key).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 4.6: SEO & AI-discoverability QC
  // -----------------------------------------------------------------------
  // Walks built dist/ and scores every notable page on traditional SEO and
  // AI/LLM discoverability lenses. Deterministic checks on every page; AI
  // evaluation on a sampled subset (homepage + one service detail + one
  // blog post + about). Output flows into the missing report.
  if (stats.buildSuccess) {
    console.log('[Phase 4.6] Running SEO audit...');
    const seoStart = Date.now();
    try {
      const { auditSeo } = await import('./lib/ai-seo-audit.js');
      const seoReport = await auditSeo(outputDir, { merged });
      stats.seoReport = seoReport;
      console.log(`  Pages scored: ${seoReport.pageCount}`);
      console.log(`  Overall: ${seoReport.overall}/10 · Traditional: ${seoReport.byLens.traditional}/10 · AI: ${seoReport.byLens.ai}/10`);
      if (seoReport.topIssues.length > 0) {
        console.log(`  Top issues (${seoReport.issueCount} total):`);
        for (const iss of seoReport.topIssues.slice(0, 5)) {
          console.log(`    - [${iss.score}/10] ${iss.dimension} on ${iss.url}: ${iss.issue.slice(0, 110)}`);
        }
      }
      await artifacts.writeStep('11-seo-audit', { output: seoReport }, seoStart);
      console.log('');
    } catch (err) {
      console.warn(`  SEO audit failed: ${err.message}`);
      stats.seoReport = null;
      console.log('');
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4.65: Accessibility audit (axe-core via Playwright)
  // -----------------------------------------------------------------------
  // Walks the built dist/ in a real browser and runs axe-core's WCAG 2.1 AA
  // ruleset. Catches a11y violations static HTML checks can't (color contrast,
  // focus visibility, ARIA misuse, computed-style problems). Zero AI cost.
  if (stats.buildSuccess) {
    console.log('[Phase 4.65] Accessibility audit (axe-core)...');
    const a11yStart = Date.now();
    try {
      const { auditA11y } = await import('./lib/a11y-audit.js');
      stats.a11yReport = await auditA11y(outputDir);
      const r = stats.a11yReport;
      const c = r.byImpact || {};
      console.log(`  Pages audited: ${r.pageCount} · ${r.violationCount} violation(s)`);
      console.log(`  By impact: critical=${c.critical || 0} serious=${c.serious || 0} moderate=${c.moderate || 0} minor=${c.minor || 0}`);
      if ((r.topIssues || []).length > 0) {
        console.log('  Top issues:');
        for (const iss of r.topIssues.slice(0, 5)) {
          console.log(`    - [${iss.impact}] ${iss.id}: ${iss.help} (${iss.occurrences}× on ${iss.pages.length} page(s))`);
        }
      }
      await artifacts.writeStep('11b-a11y-audit', { output: r }, a11yStart);
      console.log('');
    } catch (err) {
      console.warn(`  A11y audit failed: ${err.message}`);
      stats.a11yReport = null;
      console.log('');
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4.7: SEO Optimizer loop — iteratively apply fixes
  // -----------------------------------------------------------------------
  // Mirrors the Designer Agent loop pattern: optimize → rebuild → re-audit
  // until a gate is met. Each iteration applies the highest-leverage fixes
  // the optimizer finds (deterministic auto-fixes + capped AI rewrites);
  // intermediate audits skip AI evaluation to keep cost down. After the
  // final iteration, one full audit (with AI eval) captures the final
  // state for downstream reports.
  if (!opts.skipSeoOptimize && stats.buildSuccess && stats.seoReport && process.env.ANTHROPIC_API_KEY) {
    const MAX_ITERATIONS = 3;
    const TARGET_OVERALL = 9.0;
    const MIN_DELTA      = 0.1;

    console.log(`[Phase 4.7] SEO optimizer loop (up to ${MAX_ITERATIONS} iterations, gate ${TARGET_OVERALL}/10)`);
    const optStart = Date.now();
    const iterations = [];
    const allApplied = [];
    let stopReason = null;
    let lastReport = stats.seoReport;

    try {
      const { optimizeSeo } = await import('./lib/skill-seo-optimize.js');
      const { auditSeo }     = await import('./lib/ai-seo-audit.js');

      for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        const beforeOverall = lastReport.overall;
        const beforeIssues  = lastReport.issueCount;

        // Gate: already at target?
        if (beforeOverall >= TARGET_OVERALL) {
          stopReason = `score ${beforeOverall}/10 ≥ target ${TARGET_OVERALL}/10`;
          console.log(`  Iteration ${iter}: ${stopReason} — stopping.`);
          break;
        }

        console.log(`  Iteration ${iter}/${MAX_ITERATIONS} (current: ${beforeOverall}/10, ${beforeIssues} issues)`);

        // Optimize
        const optResult = await optimizeSeo({ outputDir, seoReport: lastReport, merged });
        const fixedCount = optResult.applied.filter(a => a.status === 'fixed').length;
        allApplied.push(...optResult.applied.map(a => ({ ...a, iteration: iter })));

        if (fixedCount === 0) {
          stopReason = 'no fixable issues remain';
          console.log(`    ${stopReason} — stopping.`);
          iterations.push({ iter, beforeOverall, afterOverall: beforeOverall, delta: 0, fixedCount: 0, stopReason });
          break;
        }

        for (const a of optResult.applied.filter(a => a.status === 'fixed')) {
          console.log(`    ✓ [${a.fix}] ${a.url} — ${a.detail || ''}`);
        }

        // Rebuild
        const validation = await validate(outputDir);
        if (!validation.buildSuccess) {
          stopReason = 'rebuild failed';
          console.warn(`    ${stopReason} — stopping.`);
          iterations.push({ iter, beforeOverall, afterOverall: beforeOverall, delta: 0, fixedCount, stopReason });
          break;
        }

        // Re-audit (deterministic-only to keep cost down between iterations;
        // a full audit with AI eval runs once at the end if any iteration applied fixes).
        const newReport = await auditSeo(outputDir, { merged, aiEvaluation: false });
        const delta = +(newReport.overall - beforeOverall).toFixed(1);
        console.log(`    Score: ${beforeOverall}/10 → ${newReport.overall}/10 (Δ ${delta >= 0 ? '+' : ''}${delta}) · issues ${beforeIssues}→${newReport.issueCount}`);

        iterations.push({ iter, beforeOverall, afterOverall: newReport.overall, delta, fixedCount });
        lastReport = newReport;

        // Diminishing returns?
        if (Math.abs(delta) < MIN_DELTA) {
          stopReason = `delta ${delta} < ${MIN_DELTA}, diminishing returns`;
          console.log(`    ${stopReason} — stopping.`);
          break;
        }
      }

      // Final full audit with AI eval — only if we actually applied fixes,
      // and only once. The intermediate audits had AI eval off to save cost.
      const totalFixed = iterations.reduce((sum, it) => sum + (it.fixedCount || 0), 0);
      if (totalFixed > 0) {
        console.log('  Running final full audit with AI evaluation...');
        const finalReport = await auditSeo(outputDir, { merged, aiEvaluation: true });
        stats.seoReport = finalReport;
        console.log(`  Final: ${finalReport.overall}/10 (Traditional ${finalReport.byLens.traditional}, AI ${finalReport.byLens.ai}) · ${finalReport.issueCount} issues`);
      }

      // Persist artifacts. 11-seo-audit.json gets overwritten with the
      // post-optimization snapshot so every downstream report sees the
      // final state.
      await artifacts.writeStep('11-seo-audit', { output: stats.seoReport }, optStart);
      await artifacts.writeStep('12-seo-optimize', {
        output: {
          iterations,
          applied: allApplied,
          totalFixedCount: totalFixed,
          startingOverall: iterations[0]?.beforeOverall ?? stats.seoReport.overall,
          finalOverall: stats.seoReport.overall,
          totalDelta: +(stats.seoReport.overall - (iterations[0]?.beforeOverall ?? stats.seoReport.overall)).toFixed(1),
          stopReason: stopReason || `reached max iterations (${MAX_ITERATIONS})`,
        },
      }, optStart);
      console.log('');
    } catch (err) {
      console.warn(`  SEO optimizer failed: ${err.message}`);
      console.log('');
    }
  }

  // -----------------------------------------------------------------------
  // Phase 5: Generate "What's Missing" page
  // -----------------------------------------------------------------------
  console.log('[Phase 5] Generating "What\'s Missing" page...');
  try {
    // Build the validation payload for the missing report. This is the channel
    // for "things the operator should know that aren't already in items.*":
    //   - placeholders     : leftover [PLACEHOLDER] tokens in built files
    //   - generationIssues : post-generation validator findings (broken refs)
    //   - buildIntegrity   : post-build validator findings (section presence,
    //                        broken images/links in dist)
    //   - coverage         : director-time decisions to drop a section that
    //                        had data we *almost* had enough of
    //   - unusedImages     : photos downloaded but not assigned to a role
    const validationPayload = {
      placeholders: opts.skipBuild ? [] : (stats.placeholders || []),
      generationIssues: stats.generationIssues || [],
      buildIntegrity: stats.buildIntegrity || [],
      coverage: director?.dna?.coverage || null,
      unusedImages: imageRolesResult?.roles?.unused || [],
      seo: stats.seoReport || null,
      a11y: stats.a11yReport || null,
    };
    // Whether to ship /missing as a route in the deployed site. Defaults to
    // OFF — the page contains internal debug info (missing fields, broken
    // refs, coverage gaps) that real visitors should never see. Operators
    // can opt in via --include-debug-pages or INCLUDE_DEBUG_PAGES=true.
    const includeAstroPage = !!(opts.includeDebugPages || process.env.INCLUDE_DEBUG_PAGES === 'true');
    const missingResult = await generateMissingPage(
      merged,
      outputDir,
      validationPayload,
      bronze?.imageAnalysis || null,
      { includeAstroPage }
    );
    stats.missingCritical = missingResult.summary.critical;
    stats.missingImportant = missingResult.summary.important;
    console.log(`  Missing: ${missingResult.summary.critical} critical, ${missingResult.summary.important} important, ${missingResult.summary.optional} optional`);
    if (includeAstroPage) {
      console.log('  Missing page written to src/pages/missing.astro and _pipeline/missing.html');
    } else {
      console.log('  Missing report written to _pipeline/missing.html (operator-only — /missing route not built into dist)');
    }

    // If we opted in to /missing as a deployable route, rebuild so it lands in dist.
    if (includeAstroPage && !opts.skipBuild && stats.buildSuccess) {
      try {
        const { execSync } = await import('node:child_process');
        console.log('  Rebuilding to include /missing in dist...');
        execSync('npm run build', { cwd: outputDir, stdio: 'pipe', timeout: 120_000 });
        console.log('  Rebuild complete — /missing is now live.');
      } catch (rebuildErr) {
        const msg = rebuildErr.stderr?.toString().slice(-400) || rebuildErr.message;
        console.warn(`  Final rebuild failed (missing.html artifact still works): ${msg}`);
      }
    }
  } catch (err) {
    console.warn(`  Could not generate missing page: ${err.message}`);
  }
  console.log('');

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(56));
  console.log('  BUILD SUMMARY');
  console.log('='.repeat(56));
  console.log('');
  console.log(`  Practice:     ${stats.practiceName}`);
  console.log(`  Doctor:       ${stats.doctorName}`);
  console.log(`  Phone:        ${stats.phone}`);
  console.log(`  Services:     ${stats.servicesCount}`);
  console.log(`  Output:       ${outputDir}`);
  console.log('');
  console.log(`  Blog stubs:   ${stats.blogStubs}`);
  console.log(`  Images:       ${stats.imagesDownloaded}`);
  console.log(`  AI Design:    ${stats.hasDesign ? 'done' : 'skipped'}`);
  console.log(`  AI Content:   ${stats.hasContent ? 'done' : 'skipped'}`);
  console.log(`  Missing:      ${stats.missingCritical} critical / ${stats.missingImportant} important`);
  console.log(`  Build:        ${stats.buildSuccess ? 'PASSED' : opts.skipBuild ? 'SKIPPED' : 'FAILED'}`);
  console.log(`  Time:         ${elapsed}s`);

  // Cost & token usage across all AI calls in this build
  try {
    const { getCostLedger } = await import('./lib/ai-call.js');
    const ledger = getCostLedger();
    if (ledger.callCount > 0) {
      console.log(`  AI calls:     ${ledger.callCount} · ${ledger.totalInputTokens.toLocaleString()} in / ${ledger.totalOutputTokens.toLocaleString()} out tokens · $${ledger.totalCost.toFixed(2)} estimated`);
      // Top 3 most expensive phases
      const byPhase = new Map();
      for (const c of ledger.calls) {
        const cur = byPhase.get(c.phase) || { count: 0, cost: 0 };
        cur.count += 1;
        cur.cost  += c.cost;
        byPhase.set(c.phase, cur);
      }
      const topPhases = [...byPhase.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 3)
        .map(([phase, info]) => `${phase} ($${info.cost.toFixed(2)}, ${info.count}×)`);
      if (topPhases.length > 0) {
        console.log(`                Top phases: ${topPhases.join(' · ')}`);
      }
      // Persist to artifact
      try {
        await artifacts.writeStep('99-cost', { output: ledger }, Date.now() - elapsed * 1000);
      } catch { /* best-effort */ }
    }
  } catch { /* ledger not available */ }

  // Confidence flags
  if (stats.confidenceFlags.length > 0) {
    console.log('');
    console.log('  Confidence flags:');
    for (const flag of stats.confidenceFlags) {
      console.log(`    - ${flag}`);
    }
  }

  // Leftover placeholders
  if (stats.placeholders.length > 0) {
    console.log('');
    console.log('  Leftover placeholders found:');
    for (const p of stats.placeholders) {
      console.log(`    - ${p.file}: ${p.pattern}`);
    }
  }

  // Broken internal links
  if (stats.brokenLinks?.length > 0) {
    console.log('');
    console.log('  ⚠  Broken internal links (404s):');
    for (const l of stats.brokenLinks) {
      console.log(`    - ${l.href}  (${l.foundIn})`);
    }
  }

  // Errors
  if (stats.errors.length > 0) {
    console.log('');
    console.log('  Errors:');
    for (const err of stats.errors) {
      console.log(`    - ${err}`);
    }
  }

  // Next steps checklist
  console.log('');
  console.log('  Next steps:');
  console.log('  [ ] Review and edit site.ts with any missing practice info');
  console.log('  [ ] Replace placeholder images with real photos');
  console.log('  [ ] Write / expand blog post stubs (marked as draft)');
  if (stats.placeholders.length > 0) {
    console.log('  [ ] Fix leftover placeholders listed above');
  }
  if (stats.brokenLinks?.length > 0) {
    console.log('  [ ] Fix broken internal links listed above');
  }
  if (!stats.buildSuccess && !opts.skipBuild) {
    console.log('  [ ] Fix build errors and re-run: npm run build');
  }
  console.log('  [ ] Review services pages for accuracy');
  console.log('  [ ] Set up Google Analytics / Search Console');
  console.log('  [ ] Deploy to Cloudflare Pages');
  console.log('');
  console.log('='.repeat(56));
  console.log('');

  // Write final summary artifact
  await artifacts.writeSummary({
    preset: opts.preset,
    elapsed_s: parseFloat(elapsed),
    ...stats,
  });

  // Persist run record to Supabase
  try {
    const { insertRun } = await import('./lib/db.js');
    const runRow = await insertRun({
      client_slug:       clientSlug,
      gcs_prefix:        runStorage.gcsPrefix || null,
      url:               opts.url || null,
      practice_name:     stats.practiceName,
      doctor_name:       stats.doctorName,
      city:              merged?.address?.city || null,
      phone:             stats.phone,
      archetype:         director?.dna?.archetype || design?.layout?.archetype || null,
      hero_variant:      director?.dna?.heroVariant || design?.hero?.variant || null,
      font_heading:      merged?.brand?.fonts?.heading || null,
      font_body:         merged?.brand?.fonts?.body || null,
      palette_primary:   merged?.brand?.colors?.primary || null,
      palette_mood:      design?.mood || null,
      services_count:    stats.servicesCount,
      signals_count:     scraped?.signals?.length || 0,
      signals:           scraped?.signals || [],
      sections_generated: director?.dna?.sectionOrder || [],
      build_success:     stats.buildSuccess,
      duration_ms:       Math.round(parseFloat(elapsed) * 1000),
      errors:            stats.errors,
    });
    if (runRow) console.log(`  Run logged to Supabase (id: ${runRow.id})`);
  } catch (err) {
    console.warn(`  Supabase run log failed: ${err.message}`);
  }

  // Auto-distill the shipped build into the design library (own-build — used
  // as anti-inspo on the next run so future sites diverge from this one).
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const slug = (merged?.practice?.name || 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'build';
      await distillDesign({ source: outputDir, slug, tag: 'own', note: 'auto-distilled at build time' });
      console.log(`  Distilled build into design library as "${slug}" (own).`);
    } catch (err) {
      console.warn(`  Auto-distill skipped: ${err.message}`);
    }
  }

  // Coverage audit: compare scraped/silver data → final rebuild and flag gaps
  // (missing doctors, thinned service pages, mismatched contact info, etc.)
  try {
    const { runCoverageAudit } = await import('./lib/coverage-audit.js');
    const audit = await runCoverageAudit(outputDir);
    const auditDir = resolve(outputDir, '_pipeline');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(resolve(auditDir, 'coverage-audit.json'), JSON.stringify({ findings: audit.findings, summary: audit.summary }, null, 2));
    await wf(resolve(auditDir, 'coverage-audit.md'), audit.markdown);
    if (audit.summary.total > 0) {
      console.log('');
      console.log(`[Coverage Audit] ${audit.summary.critical} critical · ${audit.summary.warning} warning · ${audit.summary.note} note`);
      // Print critical findings inline so they don't get lost
      for (const f of audit.findings.filter(x => x.severity === 'CRITICAL')) {
        console.log(`  🔴 ${f.check}: ${f.message}`);
      }
      for (const f of audit.findings.filter(x => x.severity === 'WARNING').slice(0, 5)) {
        console.log(`  🟡 ${f.check}: ${f.message}`);
      }
      console.log(`  Full report: ${auditDir}/coverage-audit.md`);
    } else {
      console.log('[Coverage Audit] No gaps detected ✓');
    }
  } catch (err) {
    console.warn(`  Coverage audit failed: ${err.message}`);
  }

  // Generate HTML reports — three views of the same data:
  //   index.html          — internal report (operator: prompts, JSON, telemetry)
  //   external-report.html — practice-facing detailed report (no internals)
  //   one-pager.html       — practice-facing pitch summary
  const pipelineDir = resolve(outputDir, '_pipeline');
  await generateReport(pipelineDir, { scraped });
  try {
    const { generateExternalReport } = await import('./lib/external-report.js');
    await generateExternalReport(pipelineDir);
  } catch (err) {
    console.warn(`  External report generation failed: ${err.message}`);
  }
  try {
    const { generateOnePager } = await import('./lib/one-pager.js');
    await generateOnePager(pipelineDir);
  } catch (err) {
    console.warn(`  One-pager generation failed: ${err.message}`);
  }
  console.log(`  Internal report:    ${pipelineDir}/index.html`);
  console.log(`  External report:    ${pipelineDir}/external-report.html`);
  console.log(`  One-pager:          ${pipelineDir}/one-pager.html`);
  console.log(`  What's Missing:     ${pipelineDir}/missing.html`);
  console.log(`  Pipeline artifacts: ${pipelineDir}/`);
  console.log('');

  // --publish: deploy site + pitch page
  if (opts.publish) {
    try {
      const { publish } = await import('./lib/publish.js');
      await publish({
        outputDir,
        slug,
        practiceUrl: opts.url || null,
        previewUrl:  null, // auto-derived from slug + GROUNDWORK_SUBDOMAIN
      });
    } catch (err) {
      console.warn(`[Publish] Failed: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('');
  console.error('Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
