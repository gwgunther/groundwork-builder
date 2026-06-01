#!/usr/bin/env node
/**
 * Groundwork Builder — Standalone Site Audit
 *
 * Scrapes an existing site, runs PageSpeed + tech audit + AI content audit,
 * and generates two client-facing HTML reports. No site generation.
 *
 * Usage:
 *   node scripts/pipeline/audit-site.js --url https://example.com
 *   node scripts/pipeline/audit-site.js --url https://example.com --output _audits/smith-dental
 *   node scripts/pipeline/audit-site.js --url https://example.com --verbose
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';

// Load .env from repo root (same pattern as build-site.js)
dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { scrape }                 from './lib/scraper.js';
import { extractSilver }          from './lib/ai-silver.js';
import { analyzeImages }          from './lib/ai-images.js';
import { runPageSpeed }           from './lib/pagespeed.js';
import { runTechAudit }           from './lib/tech-audit.js';
import { runTrustScan }           from './lib/trust-scanner.js';
import { runHostingScan }         from './lib/hosting-scanner.js';
import { runGbpScan }             from './lib/gbp-scanner.js';
import { runConversionScan }      from './lib/conversion-scanner.js';
import { summarizeFindings, enrichFinding } from './lib/findings.js';
import { buildFixWorklist, summarizeWorklist } from './lib/fix-worklist.js';
import { startAuditRun, updateRun }   from './lib/airtable.js';
import { createRunStorage }           from './lib/storage.js';
import { slugFromUrl }                from './lib/slug.js';
import { runSiteAudit }           from './lib/ai-audit.js';
import { generateAuditReports }   from './lib/audit-report-generator.js';
import { mergeData }              from './lib/merger.js';
import { loadPreset }             from './lib/preset-loader.js';

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url:             null,
    output:          null,
    preset:          'dental',
    verbose:         false,
    previewUrl:      null,
    placeId:         null,
    businessName:    null,
    skipGbp:         false,
    email:           null,
    source:          'manual',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        opts.url = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--preset':
        opts.preset = args[++i];
        break;
      case '--preview-url':
        opts.previewUrl = args[++i];
        break;
      case '--place-id':
        opts.placeId = args[++i];
        break;
      case '--business-name':
        opts.businessName = args[++i];
        break;
      case '--skip-gbp':
        opts.skipGbp = true;
        break;
      case '--email':
        opts.email = args[++i];
        break;
      case '--source':
        // 'self-serve' | 'manual' | 'biz-dev'
        opts.source = args[++i];
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (args[i].startsWith('--')) {
          console.warn(`Unknown flag: ${args[i]}`);
        }
        break;
    }
  }

  if (!opts.url) {
    console.error('Error: --url is required.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
Groundwork Builder — Site Audit

Usage:
  node scripts/pipeline/audit-site.js [options]

Options:
  --url <url>            Site URL to audit (required)
  --output <path>        Output directory (default: _audits/<slug>)
  --preset <name>        Vertical preset (default: dental)
  --preview-url <url>    Link to a Groundwork preview for this site
  --place-id <id>        Google Place ID to scan GBP directly (skips lookup)
  --business-name <q>    Business name to text-search for GBP (default: silver practice name + city)
  --skip-gbp             Skip the GBP scan entirely
  --verbose              Detailed output
  --help                 Show this help

Examples:
  node scripts/pipeline/audit-site.js --url https://smithdental.com
  node scripts/pipeline/audit-site.js --url https://smithdental.com --output _audits/smith-dental
`.trim());
}

// ---------------------------------------------------------------------------
// Slugify helper (replicated locally to avoid importing from utils)
// ---------------------------------------------------------------------------

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'audit';
}

function getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ''; }
}

function eTldPlusOne(hostname) {
  const h = hostname.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const twoPart = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i;
  const last2 = parts.slice(-2).join('.');
  return twoPart.test(last2) ? parts.slice(-3).join('.') : last2;
}

/**
 * Cross-source check: GBP's linked website should match the audited domain.
 * Returns a single enriched finding, or null if the check doesn't apply
 * (no GBP scan, no websiteUri on the GBP).
 */
function buildGbpWebsiteMismatchFinding(auditedUrl, gbpScan) {
  const websiteUri = gbpScan?.meta?.websiteUri;
  if (!websiteUri) return null;
  const auditRoot = eTldPlusOne(getHostname(auditedUrl));
  const gbpRoot   = eTldPlusOne(getHostname(websiteUri));
  if (!auditRoot || !gbpRoot) return null;
  const mismatch = auditRoot !== gbpRoot;
  return enrichFinding({
    id: 'gbp-website-mismatches-audit-url',
    category: 'gbp',
    severity: mismatch ? 'warning' : 'passed',
    title: 'GBP website link matches audited domain',
    detail: mismatch
      ? `GBP links to ${gbpRoot} but the audited site is ${auditRoot}. Two domains for the same brand split SEO authority and confuse prospects.`
      : `GBP website link (${gbpRoot}) matches the audited domain.`,
    benefit: 'When the GBP points to a different domain than the practice\'s main site, the listing\'s authority bleeds out to a domain you may not even control.',
    affectedPages: [],
    count: mismatch ? 1 : 0,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log('');
  console.log('=== Groundwork Builder — Site Audit ===');
  console.log('');
  console.log(`  URL:     ${opts.url}`);
  console.log(`  Preset:  ${opts.preset}`);
  console.log(`  Source:  ${opts.source}${opts.email ? ' · ' + opts.email : ''}`);
  console.log('');

  // ── Derive slug + start Airtable run early so we have a record even if
  //    a later phase crashes. Slug is provisional — based on URL hostname;
  //    silver refines practiceName + city later, used to update the row.
  // Canonical slug — URL-derived (stable, used by Airtable + GCS + output dir)
  const canonicalSlug = slugFromUrl(opts.url) || slugify(opts.url);
  let airtableRunId = null;
  let airtableAccountId = null;
  try {
    const { accountId, runId } = await startAuditRun({
      slug:         canonicalSlug,
      practiceUrl:  opts.url,
      contactEmail: opts.email,  // --email flag: submitter (latest form input)
      source:       opts.source,
    });
    airtableAccountId = accountId;
    airtableRunId     = runId;
    globalThis.__groundworkAirtableRunId = runId;  // accessible to outer fatal-error handler
    if (runId) console.log(`[Airtable] Tracking run: ${runId} (account: ${accountId})`);
    else       console.log(`[Airtable] Disabled (env vars missing). Continuing without tracking.`);
    console.log('');
  } catch (err) {
    console.warn(`[Airtable] startAuditRun failed (non-fatal): ${err.message}`);
    console.log('');
  }

  // ── Init GCS-backed storage so intermediate artifacts persist beyond the
  //    operator's local disk (essential when this runs in a container).
  const runStorage = createRunStorage(canonicalSlug);

  // ── Load preset ─────────────────────────────────────────────────────────
  console.log(`[Preset] Loading "${opts.preset}" preset...`);
  const preset = await loadPreset(opts.preset);
  console.log(`[Preset] ${preset.name}`);
  console.log('');

  // ── Phase 1: Scrape → Bronze ─────────────────────────────────────────────
  console.log('[Phase 1] Crawling site (bronze)...');
  let bronze = null;
  try {
    bronze = await scrape(opts.url, { verbose: opts.verbose });
    console.log(`  Crawled ${bronze.pageCount} pages.`);
  } catch (err) {
    console.error(`  Crawl failed: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // ── Phase 1b: Image analysis (cached in Supabase by URL + slug) ────────
  console.log('[Phase 1b] Analyzing images...');
  // Derive slug from URL hostname for now — replaced by practice slug after silver
  const urlSlug = slugify(new URL(opts.url).hostname.replace(/^www\./, '').split('.')[0]);
  try {
    bronze.imageAnalysis = await analyzeImages(bronze, urlSlug, { verbose: opts.verbose });
    const count = Object.keys(bronze.imageAnalysis).length;
    console.log(`  ${count} images analyzed.`);
  } catch (err) {
    console.warn(`  Image analysis failed (non-fatal): ${err.message}`);
    bronze.imageAnalysis = {};
  }
  console.log('');

  // ── Phase 2: Silver extraction ───────────────────────────────────────────
  console.log('[Phase 2] Extracting silver data via Claude...');
  let scraped = null;
  try {
    scraped = await extractSilver(bronze);
    console.log('  Silver extraction complete.');
  } catch (err) {
    console.warn(`  Silver extraction failed (non-fatal): ${err.message}`);
    scraped = {};
  }
  console.log('');

  // Save silver for debugging (written after outputDir is resolved below)
  const _silverForSave = scraped;

  // Resolve practice name early for output dir
  const practiceName = scraped?.practice?.name
    || (new URL(opts.url).hostname.replace(/^www\./, '').split('.')[0])
    || 'Site Audit';

  // Resolve output dir
  // Output dir uses the canonical (URL-derived) slug, NOT the practice name.
  // Keeps Airtable/GCS/output dir all on the same identifier.
  let outputDir = opts.output;
  if (!outputDir) {
    outputDir = resolve('_audits', canonicalSlug);
  }
  outputDir = resolve(outputDir);
  const dataDir = join(outputDir, '_data');
  await mkdir(dataDir, { recursive: true });
  console.log(`[Output] ${outputDir}`);
  console.log('');

  // Save silver data for debugging
  await writeFile(join(dataDir, 'silver.json'), JSON.stringify(_silverForSave, null, 2), 'utf-8').catch(() => {});

  // ── Phase 3: PageSpeed ───────────────────────────────────────────────────
  // Always runs. Lighthouse performance scores are core to the grader's
  // value prop (LCP, CLS, mobile-perf), and the resulting findings drive
  // the worklist gates downstream. Skipping it was a dev convenience flag
  // that risked shipping reports with no performance signal — removed.
  console.log('[Phase 3] Running PageSpeed Insights...');
  let pagespeed = null;
  try {
    pagespeed = await runPageSpeed(opts.url);
    const m = pagespeed.mobile;
    const d = pagespeed.desktop;
    if (m) console.log(`  Mobile:  perf=${m.performance} seo=${m.seo} a11y=${m.accessibility} bp=${m.bestPractices}`);
    if (d) console.log(`  Desktop: perf=${d.performance} seo=${d.seo} a11y=${d.accessibility} bp=${d.bestPractices}`);
    await writeFile(join(dataDir, 'pagespeed.json'), JSON.stringify(pagespeed, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`  PageSpeed failed (non-fatal): ${err.message}`);
    pagespeed = { mobile: null, desktop: null };
  }
  console.log('');

  // ── Phase 4: Tech Audit ──────────────────────────────────────────────────
  console.log('[Phase 4] Running tech audit...');
  const techAudit = runTechAudit(bronze, pagespeed, { city: scraped?.address?.city || '' });
  console.log(`  ${techAudit.summary.critical} critical · ${techAudit.summary.warnings} warnings · ${techAudit.summary.passed} passed`);
  await writeFile(join(dataDir, 'tech-audit.json'), JSON.stringify(techAudit, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4b: Trust scan ────────────────────────────────────────────────
  console.log('[Phase 4b] Running trust scan...');
  const trustScan = runTrustScan(bronze);
  console.log(`  ${trustScan.summary.critical} critical · ${trustScan.summary.warnings} warnings · ${trustScan.summary.passed} passed`);
  await writeFile(join(dataDir, 'trust-scan.json'), JSON.stringify(trustScan, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4c: Hosting scan ──────────────────────────────────────────────
  console.log('[Phase 4c] Running hosting scan...');
  let hostingScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  try {
    hostingScan = await runHostingScan(bronze);
    console.log(`  ${hostingScan.summary.critical} critical · ${hostingScan.summary.warnings} warnings · ${hostingScan.summary.passed} passed`);
    if (hostingScan.meta?.hostname) {
      console.log(`  Host: ${hostingScan.meta.hostname} · NS: ${(hostingScan.meta.nameservers || []).slice(0, 2).join(', ') || 'n/a'}`);
    }
  } catch (err) {
    console.warn(`  Hosting scan failed (non-fatal): ${err.message}`);
  }
  await writeFile(join(dataDir, 'hosting-scan.json'), JSON.stringify(hostingScan, null, 2), 'utf-8');
  console.log('');

  // ── Phase 4d: GBP scan (Places Details API) ─────────────────────────────
  let gbpScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  if (opts.skipGbp) {
    console.log('[Phase 4d] Skipping GBP scan (--skip-gbp).');
    console.log('');
  } else if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[Phase 4d] Skipping GBP scan (GOOGLE_PLACES_API_KEY not set).');
    console.log('');
  } else {
    console.log('[Phase 4d] Running GBP scan...');
    try {
      const businessName = opts.businessName
        || (scraped?.practice?.name && scraped?.address?.city
            ? `${scraped.practice.name} ${scraped.address.city}`
            : scraped?.practice?.name || practiceName);
      gbpScan = await runGbpScan({ placeId: opts.placeId, businessName });
      if (gbpScan.meta?.found === false) {
        console.log(`  No GBP match for "${gbpScan.meta.query}".`);
      } else {
        console.log(`  Resolved: ${gbpScan.meta.displayName} · ${gbpScan.meta.userRatingCount} reviews`);
        console.log(`  ${gbpScan.summary.critical} critical · ${gbpScan.summary.warnings} warnings · ${gbpScan.summary.passed} passed`);
      }
    } catch (err) {
      console.warn(`  GBP scan failed (non-fatal): ${err.message}`);
    }
    await writeFile(join(dataDir, 'gbp-scan.json'), JSON.stringify(gbpScan, null, 2), 'utf-8');
    console.log('');
  }

  // Cross-source: does GBP's linked website match the audited URL?
  const gbpWebsiteMismatch = buildGbpWebsiteMismatchFinding(opts.url, gbpScan);
  if (gbpWebsiteMismatch) {
    gbpScan.findings.push(gbpWebsiteMismatch);
    if (gbpWebsiteMismatch.severity === 'warning') gbpScan.summary.warnings += 1;
    else if (gbpWebsiteMismatch.severity === 'passed') gbpScan.summary.passed += 1;
  }

  // Prefer silver > GBP displayName > URL slug for the report title.
  const displayPracticeName = (scraped?.practice?.name && scraped.practice.name.trim())
    || (gbpScan.meta?.displayName && gbpScan.meta.displayName.trim())
    || practiceName;

  // ── Phase 4e: Conversion-tracking scan (GA4 + phone_click) ───────────────
  console.log('[Phase 4e] Running conversion-tracking scan...');
  let conversionScan = { findings: [], summary: { critical: 0, warnings: 0, passed: 0 }, meta: {} };
  try {
    conversionScan = await runConversionScan(bronze);
    if (conversionScan.meta?.fetched) {
      const sig = [
        conversionScan.meta.ga4Id ? `GA4:${conversionScan.meta.ga4Id}` : null,
        conversionScan.meta.gtmContainerId ? `GTM:${conversionScan.meta.gtmContainerId}` : null,
        conversionScan.meta.hasPhoneClick ? 'phone_click' : null,
      ].filter(Boolean).join(' · ') || 'no signals detected';
      console.log(`  ${sig}`);
      console.log(`  ${conversionScan.summary.critical} critical · ${conversionScan.summary.warnings} warnings · ${conversionScan.summary.passed} passed`);
    } else {
      console.log(`  Skipped: ${conversionScan.meta?.reason || 'no signals available'}`);
    }
  } catch (err) {
    console.warn(`  Conversion scan failed (non-fatal): ${err.message}`);
  }
  await writeFile(join(dataDir, 'conversion-scan.json'), JSON.stringify(conversionScan, null, 2), 'utf-8');
  console.log('');

  // ── Combined findings across all detector outputs ──────────────────────
  // Report shows objective counts only — no subjective composite "score."
  // Prospects can verify the numbers themselves by counting cards.
  const allFindings = [
    ...techAudit.findings,
    ...trustScan.findings,
    ...hostingScan.findings,
    ...gbpScan.findings,
    ...conversionScan.findings,
  ];
  const findingsSummary = summarizeFindings(allFindings);
  console.log(`  Checks: ${findingsSummary.total} total · ${findingsSummary.passed} passed · ${findingsSummary.critical} critical · ${findingsSummary.warnings} warnings`);
  console.log('');
  await writeFile(
    join(dataDir, 'findings.json'),
    JSON.stringify({ summary: findingsSummary, findings: allFindings }, null, 2),
    'utf-8',
  );

  // ── Fix worklist: actionable de-duped list of generators the builder should run
  const fixWorklist = buildFixWorklist(allFindings);
  const worklistSummary = summarizeWorklist(fixWorklist);
  if (worklistSummary.totalActions > 0) {
    const byKind = Object.entries(worklistSummary.byKind)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ');
    console.log(`  Fix worklist: ${worklistSummary.totalActions} action${worklistSummary.totalActions === 1 ? '' : 's'} (${byKind}) covering ${worklistSummary.totalFindings} finding${worklistSummary.totalFindings === 1 ? '' : 's'}`);
    console.log('');
  }
  await writeFile(
    join(dataDir, 'fix-worklist.json'),
    JSON.stringify({ summary: worklistSummary, worklist: fixWorklist }, null, 2),
    'utf-8',
  );

  // ── Phase 5: AI Audit ────────────────────────────────────────────────────
  console.log('[Phase 5] Running AI content audit...');
  let aiAudit = null;
  try {
    const merged = mergeData(scraped, null, preset);
    aiAudit = await runSiteAudit(scraped, merged, preset, { verbose: opts.verbose });
    if (aiAudit) {
      console.log('  AI audit complete.');
      await writeFile(join(dataDir, 'ai-audit.json'), JSON.stringify(aiAudit, null, 2), 'utf-8');
    } else {
      console.log('  AI audit skipped (no API key or failed).');
    }
  } catch (err) {
    console.warn(`  AI audit failed (non-fatal): ${err.message}`);
  }
  console.log('');

  // ── Phase 6: Generate Reports ────────────────────────────────────────────
  console.log('[Phase 6] Generating audit reports...');
  // Synthesized "tech audit" view for the report = all findings merged so the
  // Findings tab renders site + perf + trust + hosting + GBP in one place.
  const combinedTechAudit = {
    findings: allFindings,
    summary: {
      critical: allFindings.filter(f => f.severity === 'critical').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      passed:   allFindings.filter(f => f.severity === 'passed').length,
    },
  };
  const { fullPath, summaryPath } = await generateAuditReports(outputDir, {
    url: opts.url,
    practiceName: displayPracticeName,
    pagespeed,
    techAudit: combinedTechAudit,
    aiAudit,
    scraped,
    previewUrl: opts.previewUrl || null,
    findingsSummary,
    gbpMeta: gbpScan.meta || null,
  });
  console.log('');

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(56));
  console.log('  AUDIT SUMMARY');
  console.log('='.repeat(56));
  console.log('');
  console.log(`  Practice:  ${displayPracticeName}`);
  console.log(`  URL:       ${opts.url}`);
  console.log(`  Pages:     ${bronze.pageCount}`);
  console.log('');

  if (pagespeed?.mobile) {
    const m = pagespeed.mobile;
    console.log(`  Scores (mobile):`);
    console.log(`    Performance:    ${m.performance ?? '—'}`);
    console.log(`    SEO:            ${m.seo ?? '—'}`);
    console.log(`    Accessibility:  ${m.accessibility ?? '—'}`);
    console.log(`    Best Practices: ${m.bestPractices ?? '—'}`);
    console.log('');
  }

  console.log(`  Tech findings:`);
  console.log(`    Critical:  ${techAudit.summary.critical}`);
  console.log(`    Warnings:  ${techAudit.summary.warnings}`);
  console.log(`    Passed:    ${techAudit.summary.passed}`);
  console.log('');

  if (techAudit.summary.critical > 0) {
    const crits = techAudit.findings.filter(f => f.severity === 'critical');
    console.log('  Critical issues:');
    for (const f of crits) {
      console.log(`    - [${f.category}] ${f.title}`);
    }
    console.log('');
  }

  console.log(`  Output:`);
  console.log(`    Full report:    ${fullPath}`);
  console.log(`    Summary:        ${summaryPath}`);
  console.log(`    Raw data:       ${dataDir}/`);
  console.log(`  Time: ${elapsed}s`);
  console.log('');
  console.log('='.repeat(56));
  console.log('');

  // ── Finalize Airtable tracking row ──────────────────────────────────────
  // Update both the Account (with refined practice info from silver) and the
  // Run (with the metrics + URLs). All non-fatal — local report is still
  // written even if Airtable rejects the call.
  if (airtableRunId) {
    try {
      const { upsertAccount } = await import('./lib/airtable.js');
      // Refresh account with details we couldn't know at the start.
      // Two emails: businessEmail = scraped practice contact (info@...),
      //             contactEmail  = whoever submitted the form (--email flag)
      await upsertAccount({
        slug:           canonicalSlug,
        practiceUrl:    opts.url,
        practiceName:   displayPracticeName,
        businessEmail:  scraped?.practice?.email || null,
        contactEmail:   opts.email || null,
        phone:          scraped?.practice?.phone || gbpScan?.meta?.nationalPhoneNumber || null,
        city:           scraped?.address?.city  || null,
        state:          scraped?.address?.state || null,
        source:         opts.source,
        lifecycleStage: 'Audited',
      });
      await updateRun(airtableRunId, {
        status: 'Done',
        audit: {
          totalChecks:    findingsSummary.total,
          passed:         findingsSummary.passed,
          critical:       findingsSummary.critical,
          warnings:       findingsSummary.warnings,
          mobileScore:    pagespeed?.mobile?.performance  ?? null,
          desktopScore:   pagespeed?.desktop?.performance ?? null,
          gbpReviews:     gbpScan?.meta?.userRatingCount ?? null,
          gbpRating:      gbpScan?.meta?.rating ?? null,
          // auditReportUrl populated later by the API server when it hosts the file
        },
      });
      console.log(`[Airtable] Run ${airtableRunId} marked Done.`);
    } catch (err) {
      console.warn(`[Airtable] finalize failed (non-fatal): ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// Module-level reference to the active Airtable Run id, set by main() once
// startAuditRun completes. The outer .catch reads it to mark the row Failed.
globalThis.__groundworkAirtableRunId = null;

main().catch(async (err) => {
  console.error('');
  console.error('Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  try {
    if (globalThis.__groundworkAirtableRunId) {
      await updateRun(globalThis.__groundworkAirtableRunId, {
        status: 'Failed',
        errorDetail: err.message + (err.stack ? '\n\n' + err.stack : ''),
      });
      console.error('[Airtable] Run marked Failed.');
    }
  } catch (e) {
    console.error('[Airtable] Could not mark run Failed:', e.message);
  }
  process.exit(1);
});
