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
import { injectTemplate } from './lib/injector.js';
import { generatePages } from './lib/page-generator.js';
import { generateBlogStubs } from './lib/blog-generator.js';
import { downloadImages } from './lib/image-downloader.js';
import { validate } from './lib/validator.js';
import { slugify } from './lib/utils.js';
import { createArtifactWriter } from './lib/artifacts.js';
import { runSiteAudit } from './lib/ai-audit.js';
import { runDesignMapping } from './lib/ai-design.js';
import { runContentMapping } from './lib/ai-content.js';
import { generateMissingPage } from './lib/missing-page.js';
import { generateReport } from './lib/report-generator.js';

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
    dryRun: false,
    verbose: false,
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
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--verbose':
        opts.verbose = true;
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
  console.log(`[Preset] Loaded: ${preset.name} (${preset.taxonomy.services.length} services, ${preset.hubs.definitions.length} hubs)`);
  console.log('');

  // Track stats for the summary
  const stats = {
    scrapedUrl: null,
    intakeFile: null,
    practiceName: null,
    doctorName: null,
    phone: null,
    serviceHubs: 0,
    blogStubs: 0,
    imagesDownloaded: 0,
    buildSuccess: false,
    placeholders: [],
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
        console.log('  Silver extraction complete.');
      } catch (err) {
        console.error(`  Silver extraction failed: ${err.message}`);
        stats.errors.push(`Silver extraction failed: ${err.message}`);
        scraped = {}; // fall through to intake-only merge
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

  // Populate stats from merged data
  stats.practiceName = merged.practice.name || '[unknown]';
  stats.doctorName = merged.doctor?.name
    || (merged.doctor?.firstName
      ? `Dr. ${merged.doctor.firstName} ${merged.doctor.lastName}`
      : '[unknown]');
  stats.phone = merged.practice.phone || '[unknown]';
  stats.serviceHubs = merged.services.hubs.length;
  stats.confidenceFlags = merged.meta?.confidenceFlags || [];

  console.log(`  Practice: ${stats.practiceName}`);
  console.log(`  Doctor:   ${stats.doctorName}`);
  console.log(`  Phone:    ${stats.phone}`);
  const hubNames = merged.services.hubs.map(h => typeof h === 'string' ? h : h.slug);
  console.log(`  Hubs:     ${hubNames.join(', ') || 'none detected'}`);
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

  // Create artifact writer (all breadcrumbs go to _pipeline/)
  const artifacts = createArtifactWriter(outputDir);

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
  // Phase 2c: AI Design Mapping
  // -----------------------------------------------------------------------
  let design = null;
  if (!opts.skipDesign && scraped) {
    console.log('[Phase 2c] Running AI design mapping...');
    const designStart = Date.now();
    design = await runDesignMapping(scraped, merged, audit, { verbose: opts.verbose });
    if (design) {
      stats.hasDesign = true;
      await artifacts.writeStep('04-design', {
        input: { url: opts.url, preset: opts.preset },
        output: design,
      }, designStart);
      console.log(`  Design palette: ${design.palette?.primary || '—'} / ${design.palette?.secondary || '—'} · Mood: ${design.mood || '—'}`);
      console.log('  Design artifact written.');
    } else {
      console.log('  AI design mapping skipped or failed — using defaults.');
    }
    console.log('');
  } else if (opts.skipDesign) {
    console.log('[Phase 2c] Skipping AI design mapping (--skip-design).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 2d: AI Content Mapping
  // -----------------------------------------------------------------------
  let contentMap = null;
  if (!opts.skipContent && scraped) {
    console.log('[Phase 2d] Running AI content mapping...');
    const contentStart = Date.now();
    contentMap = await runContentMapping(scraped, merged, audit, preset, { verbose: opts.verbose });
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
    console.log('[Phase 2d] Skipping AI content mapping (--skip-content).');
    console.log('');
  }

  // Write deferred scrape artifact
  if (scraped) {
    await artifacts.writeStep('01-scrape', {
      input: { url: opts.url },
      output: {
        practice: scraped.practice,
        doctor: scraped.doctor ? { name: scraped.doctor.name, credentials: scraped.doctor.credentials } : null,
        address: scraped.address,
        servicesDetected: scraped.services?.offered?.length || 0,
        pagesVisited: scraped.migration?.oldUrls?.length || 0,
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
      hubs: merged.services.hubs.map(h => h.slug),
      servicesOffered: merged.services.offered.length,
      redirectCount: merged.migration?.redirectMap?.length || 0,
    },
    confidence: merged.meta?.confidenceFlags || [],
  });

  // -----------------------------------------------------------------------
  // Phase 3: Inject template + generate pages + blog stubs + images
  // -----------------------------------------------------------------------
  console.log('[Phase 3] Building project...');
  const buildStart = Date.now();

  // 3a — Copy starter template and inject practice data
  console.log('  Injecting template...');
  await injectTemplate(merged, outputDir, preset);
  console.log('  Template injected.');

  // 3b — Keep/remove service hub pages
  console.log('  Generating pages...');
  const pageResult = await generatePages(merged, outputDir, preset);

  // 3c — Generate blog stubs
  console.log('  Generating blog stubs...');
  stats.blogStubs = await generateBlogStubs(merged, outputDir, preset);

  // 3d — Download images (unless --skip-images)
  if (!opts.skipImages) {
    console.log('  Downloading images...');
    stats.imagesDownloaded = await downloadImages(merged, outputDir);
    console.log(`  Downloaded ${stats.imagesDownloaded} image(s).`);
  } else {
    console.log('  Skipping image download (--skip-images).');
  }

  // Write inject + pages artifact
  await artifacts.writeStep('07-inject', {
    output: {
      filesInjected: ['site.ts', 'navigation.ts', 'tailwind.config.mjs', 'astro.config.mjs'],
    },
  }, buildStart);

  await artifacts.writeStep('08-pages', {
    output: {
      hubsKept: merged.services.hubs.map(h => h.slug),
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
    if (validation.errors.length > 0) {
      stats.errors.push(...validation.errors);
    }

    await artifacts.writeStep('09-build', {
      output: {
        buildSuccess: validation.buildSuccess,
        placeholders: validation.placeholders,
        errors: validation.errors,
      },
    }, validateStart);

    console.log('');
  } else {
    console.log('[Phase 4] Skipping build validation (--skip-build).');
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 5: Generate "What's Missing" page
  // -----------------------------------------------------------------------
  console.log('[Phase 5] Generating "What\'s Missing" page...');
  try {
    const missingResult = await generateMissingPage(
      merged,
      outputDir,
      opts.skipBuild ? null : { placeholders: stats.placeholders }
    );
    stats.missingCritical = missingResult.summary.critical;
    stats.missingImportant = missingResult.summary.important;
    console.log(`  Missing: ${missingResult.summary.critical} critical, ${missingResult.summary.important} important, ${missingResult.summary.optional} optional`);
    console.log('  Missing page written to src/pages/missing.astro and _pipeline/missing.html');
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
  console.log(`  Output:       ${outputDir}`);
  console.log('');
  console.log(`  Service hubs: ${stats.serviceHubs}`);
  console.log(`  Blog stubs:   ${stats.blogStubs}`);
  console.log(`  Images:       ${stats.imagesDownloaded}`);
  console.log(`  AI Design:    ${stats.hasDesign ? 'done' : 'skipped'}`);
  console.log(`  AI Content:   ${stats.hasContent ? 'done' : 'skipped'}`);
  console.log(`  Missing:      ${stats.missingCritical} critical / ${stats.missingImportant} important`);
  console.log(`  Build:        ${stats.buildSuccess ? 'PASSED' : opts.skipBuild ? 'SKIPPED' : 'FAILED'}`);
  console.log(`  Time:         ${elapsed}s`);

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

  // Generate HTML report
  const pipelineDir = resolve(outputDir, '_pipeline');
  await generateReport(pipelineDir, { scraped });
  console.log(`  Pipeline report:    ${pipelineDir}/index.html`);
  console.log(`  What's Missing:     ${pipelineDir}/missing.html`);
  console.log(`  Pipeline artifacts: ${pipelineDir}/`);
  console.log('');
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
