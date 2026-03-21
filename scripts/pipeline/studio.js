#!/usr/bin/env node
/**
 * Groundwork Builder — Pipeline Studio
 *
 * Interactive web app for stepping through the pipeline manually.
 * Each phase runs on demand; you review results before proceeding.
 *
 * Usage:
 *   node scripts/pipeline/studio.js
 *   # opens at http://localhost:4321
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, dirname as pathDirname } from 'node:path';
import { fileURLToPath as pathFileURLToPath } from 'node:url';
dotenvConfig({
  path: pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4001;

// ---------------------------------------------------------------------------
// Dynamic imports of pipeline modules
// ---------------------------------------------------------------------------

async function loadModules() {
  const [
    { scrape },
    { extractSilver },
    { loadPreset },
    { mergeData },
    { runSiteAudit },
    { runDesignMapping },
    { runContentMapping },
    { generateMissingPage },
    { injectTemplate },
    { generatePages },
    { generateBlogStubs },
    { downloadImages },
    { validate },
    { slugify },
    { createArtifactWriter },
    { generateReport },
  ] = await Promise.all([
    import('./lib/scraper.js'),
    import('./lib/ai-silver.js'),
    import('./lib/preset-loader.js'),
    import('./lib/merger.js'),
    import('./lib/ai-audit.js'),
    import('./lib/ai-design.js'),
    import('./lib/ai-content.js'),
    import('./lib/missing-page.js'),
    import('./lib/injector.js'),
    import('./lib/page-generator.js'),
    import('./lib/blog-generator.js'),
    import('./lib/image-downloader.js'),
    import('./lib/validator.js'),
    import('./lib/utils.js'),
    import('./lib/artifacts.js'),
    import('./lib/report-generator.js'),
  ]);

  return {
    scrape, extractSilver, loadPreset, mergeData, runSiteAudit, runDesignMapping,
    runContentMapping, generateMissingPage, injectTemplate, generatePages,
    generateBlogStubs, downloadImages, validate, slugify,
    createArtifactWriter, generateReport,
  };
}

// ---------------------------------------------------------------------------
// In-memory pipeline state
// ---------------------------------------------------------------------------

const state = {
  url: null,
  outputDir: null,
  preset: null,
  bronze: null,   // raw BronzeData from scraper.js
  scraped: null,  // silver-shaped PracticeData from ai-silver.js
  merged: null,
  audit: null,
  design: null,
  content: null,
  validation: null,
  missing: null,
  artifacts: null,
  steps: {
    scrape:  { status: 'idle', log: [], data: null },
    audit:   { status: 'idle', log: [], data: null },
    design:  { status: 'idle', log: [], data: null },
    content: { status: 'idle', log: [], data: null },
    build:   { status: 'idle', log: [], data: null },
    missing: { status: 'idle', log: [], data: null },
  },
};

let mods = null;

// ---------------------------------------------------------------------------
// Console capture helper
// ---------------------------------------------------------------------------

function withLogCapture(logArray, fn) {
  const origLog   = console.log;
  const origWarn  = console.warn;
  const origError = console.error;

  const push = (...args) => logArray.push(args.map(String).join(' '));
  console.log   = (...a) => { push(...a); origLog(...a); };
  console.warn  = (...a) => { push('[warn] ' + a.map(String).join(' ')); origWarn(...a); };
  console.error = (...a) => { push('[error] ' + a.map(String).join(' ')); origError(...a); };

  const restore = () => {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origError;
  };

  return fn().then(result => { restore(); return result; }).catch(err => { restore(); throw err; });
}

// ---------------------------------------------------------------------------
// Step runners
// ---------------------------------------------------------------------------

async function runStep(name, fn) {
  const step = state.steps[name];
  step.status = 'running';
  step.log    = [];
  step.data   = null;
  try {
    const result = await withLogCapture(step.log, fn);
    step.data   = result;
    step.status = 'done';
    return result;
  } catch (err) {
    step.log.push('[fatal] ' + err.message);
    step.status = 'error';
    throw err;
  }
}

async function doScrape(url) {
  if (!mods) mods = await loadModules();
  state.url = url;

  const preset = await mods.loadPreset('dental');
  state.preset = preset;

  // Phase 1a — Bronze: pure crawl, no interpretation
  const bronze = await mods.scrape(url, { verbose: true });
  state.bronze = bronze;

  // Phase 1b — Silver: Claude extracts structured PracticeData from bronze
  const silver = await mods.extractSilver(bronze);
  state.scraped = silver; // downstream steps (audit, design, content) use this

  // Merge with no intake data yet — fills defaults for anything Claude missed
  const merged = mods.mergeData(silver, null, preset);
  state.merged = merged;

  // Derive output dir
  const slug = merged.practice?.name
    ? mods.slugify(merged.practice.name)
    : mods.slugify(url.replace(/^https?:\/\//, '').replace(/\.\w+$/, ''));
  state.outputDir = resolve(__dirname, '..', '..', '..', 'output', slug);
  state.artifacts = mods.createArtifactWriter(state.outputDir);

  // Write bronze artifact (summary + full dump)
  await state.artifacts.writeStep('01-bronze', {
    input: { url },
    output: {
      pageCount:      bronze.pageCount,
      allUrls:        bronze.siteAssets.allUrls,
      cssColorCount:  bronze.siteAssets.cssColors.length,
      externalCssUrl: bronze.siteAssets.externalCssUrl,
    },
  });
  await state.artifacts.writeStep('01-bronze-full', bronze);

  // Write silver artifact (summary + full dump)
  await state.artifacts.writeStep('01-silver', {
    input: { url },
    output: {
      practice:        silver.practice,
      doctor:          silver.doctor ? { name: silver.doctor.name, credentials: silver.doctor.credentials } : null,
      address:         silver.address,
      hours:           silver.hours,
      servicesCount:   silver.services?.offered?.length || 0,
      colorsExtracted: !!silver.brand?.colors?.primary,
      heroTagline:     silver.content?.heroTagline,
      imageCount: {
        hero:    silver.images?.hero?.length    || 0,
        team:    silver.images?.team?.length    || 0,
        gallery: silver.images?.gallery?.length || 0,
        office:  silver.images?.office?.length  || 0,
      },
    },
    confidence: silver.meta?.confidenceFlags || [],
  });
  await state.artifacts.writeStep('01-silver-full', silver);

  return { bronze, silver, merged, outputDir: state.outputDir };
}

async function doAudit() {
  if (!state.scraped || !state.merged) throw new Error('Run scrape first.');
  if (!mods) mods = await loadModules();

  const audit = await mods.runSiteAudit(state.scraped, state.merged, state.preset, { verbose: true });
  state.audit = audit;

  if (audit) {
    await state.artifacts.writeStep('02-audit', {
      input: { url: state.url },
      output: audit,
    });
  }
  return audit;
}

async function doDesign() {
  if (!state.scraped || !state.merged) throw new Error('Run scrape first.');
  if (!mods) mods = await loadModules();

  const design = await mods.runDesignMapping(state.scraped, state.merged, state.audit, { verbose: true });
  state.design = design;

  if (design) {
    await state.artifacts.writeStep('04-design', {
      input: { url: state.url },
      output: design,
    });
  }
  return design;
}

async function doContent() {
  if (!state.scraped || !state.merged) throw new Error('Run scrape first.');
  if (!mods) mods = await loadModules();

  const contentMap = await mods.runContentMapping(state.scraped, state.merged, state.audit, state.preset, { verbose: true });
  state.content = contentMap;

  if (contentMap) {
    // Surface into merged
    if (contentMap.homepage) {
      state.merged.content.heroTagline     = contentMap.homepage.heroTagline     || state.merged.content.heroTagline;
      state.merged.content.heroHeadline    = contentMap.homepage.heroHeadline    || state.merged.content.heroHeadline;
      state.merged.content.heroSubheadline = contentMap.homepage.heroSubheadline || state.merged.content.heroSubheadline;
      state.merged.content.ctaText         = contentMap.homepage.ctaText         || state.merged.content.ctaText;
      state.merged.content.valueProp       = contentMap.homepage.valueProp       || state.merged.content.valueProp;
    }
    if (contentMap.about) {
      state.merged.content.aboutText     = contentMap.about.introParagraph || state.merged.content.aboutText;
      state.merged.content.aboutHeadline = contentMap.about.headline       || state.merged.content.aboutHeadline;
      state.merged.content.philosophy    = contentMap.about.philosophy     || state.merged.content.philosophy;
    }
    if (contentMap.faqs?.length > 0 && state.merged.content.faqs.length === 0) {
      state.merged.content.generatedFAQs = contentMap.faqs;
    }
    state.merged.content.generated = contentMap;

    await state.artifacts.writeStep('03-content', {
      input: { url: state.url },
      output: contentMap,
    });
  }
  return contentMap;
}

async function doBuild(opts = {}) {
  if (!state.merged) throw new Error('Run scrape first.');
  if (!mods) mods = await loadModules();

  // Inject template
  await mods.injectTemplate(state.merged, state.outputDir, state.preset);

  // Generate pages
  const pageResult = await mods.generatePages(state.merged, state.outputDir, state.preset);

  // Blog stubs
  const blogStubs = await mods.generateBlogStubs(state.merged, state.outputDir, state.preset);

  // Images (optional)
  let imagesDownloaded = 0;
  if (!opts.skipImages) {
    imagesDownloaded = await mods.downloadImages(state.merged, state.outputDir);
  }

  // Write merge artifact
  await state.artifacts.writeStep('06-merge', {
    input: { hasScrape: true, hasIntake: false },
    output: {
      practice: state.merged.practice?.name,
      hubs: state.merged.services.hubs.map(h => typeof h === 'string' ? h : h.slug),
      servicesOffered: state.merged.services.offered.length,
    },
  });
  await state.artifacts.writeStep('07-inject', { output: { filesInjected: ['site.ts', 'navigation.ts', 'tailwind.config.mjs'] } });
  await state.artifacts.writeStep('08-pages', {
    output: {
      hubsKept: state.merged.services.hubs.map(h => typeof h === 'string' ? h : h.slug),
      pagesRemoved: pageResult?.removed || 0,
      blogStubs,
      imagesDownloaded,
    },
  });

  // Validate build
  let validation = { buildSuccess: false, placeholders: [], errors: [] };
  if (!opts.skipBuild) {
    validation = await mods.validate(state.outputDir);
    state.validation = validation;
    await state.artifacts.writeStep('09-build', {
      output: {
        buildSuccess: validation.buildSuccess,
        placeholders: validation.placeholders,
        errors: validation.errors,
      },
    });
  }

  return { blogStubs, imagesDownloaded, pageResult, validation };
}

async function doMissing() {
  if (!state.merged) throw new Error('Run scrape first.');
  if (!mods) mods = await loadModules();

  const result = await mods.generateMissingPage(
    state.merged,
    state.outputDir,
    state.validation ? { placeholders: state.validation.placeholders } : null,
  );
  state.missing = result;

  // Generate HTML report
  await mods.generateReport(resolve(state.outputDir, '_pipeline'), { scraped: state.scraped });

  // Write summary
  await state.artifacts.writeSummary({
    preset: 'dental',
    scrapedUrl: state.url,
    practiceName: state.merged.practice?.name || '[unknown]',
    doctorName: state.merged.doctor?.name || '[unknown]',
    phone: state.merged.practice?.phone || '[unknown]',
    serviceHubs: state.merged.services?.hubs?.length || 0,
    buildSuccess: state.validation?.buildSuccess || false,
    placeholders: state.validation?.placeholders || [],
    confidenceFlags: state.scraped?.meta?.confidenceFlags || [],
    errors: state.validation?.errors || [],
    hasDesign: !!state.design,
    hasContent: !!state.content,
    missingCritical: result.summary.critical,
    missingImportant: result.summary.important,
  });

  return result;
}

// ---------------------------------------------------------------------------
// HTTP Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // JSON body parser
  async function readBody() {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
  }

  function json(status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // ── GET / ────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(frontendHTML());
    return;
  }

  // ── GET /api/state ───────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/state') {
    json(200, {
      url: state.url,
      outputDir: state.outputDir,
      steps: Object.fromEntries(
        Object.entries(state.steps).map(([k, v]) => [k, { status: v.status, log: v.log }])
      ),
      // Summarized data for each step
      scrape: state.scraped ? {
        practiceName: state.scraped.practice?.name,
        doctorName: state.scraped.doctor?.name,
        phone: state.scraped.practice?.phone,
        email: state.scraped.practice?.email,
        address: state.scraped.address?.full,
        hours: state.scraped.hours?.display,
        colors: state.scraped.brand?.colors,
        pageCount: state.scraped.pageInventory?.length || 0,
        pages: state.scraped.pageInventory || [],
        services: state.scraped.services?.offered || [],
        testimonials: state.scraped.content?.testimonials || [],
        faqs: state.scraped.content?.faqs || [],
        stats: state.scraped.content?.stats || {},
        insurance: state.scraped.content?.insurance || [],
        images: {
          logo:    state.scraped.images?.logo    || null,
          team:    state.scraped.images?.team    || [],
          office:  state.scraped.images?.office  || [],
          gallery: state.scraped.images?.gallery || [],
          hero:    state.scraped.images?.hero    || [],
          other:   state.scraped.images?.other   || [],
        },
        confidenceFlags: state.scraped.meta?.confidenceFlags || [],
        socialLinks: state.scraped.practice?.sameAs || [],
      } : null,
      audit: state.audit,
      design: state.design,
      content: state.content,
      missing: state.missing,
      validation: state.validation,
    });
    return;
  }

  // ── POST /api/run/:step ──────────────────────────────────────────────────
  if (req.method === 'POST' && path.startsWith('/api/run/')) {
    const stepName = path.replace('/api/run/', '');
    const body = await readBody();

    const runners = {
      scrape:  () => doScrape(body.url || state.url),
      audit:   () => doAudit(),
      design:  () => doDesign(),
      content: () => doContent(),
      build:   () => doBuild({ skipImages: body.skipImages, skipBuild: body.skipBuild }),
      missing: () => doMissing(),
    };

    if (!runners[stepName]) { json(404, { error: 'Unknown step' }); return; }
    if (state.steps[stepName]?.status === 'running') {
      json(409, { error: 'Step already running' });
      return;
    }

    // Run in background — client polls /api/state
    runStep(stepName, runners[stepName]).catch(() => {});
    json(202, { status: 'started', step: stepName });
    return;
  }

  // ── PUT /api/edit ────────────────────────────────────────────────────────
  if (req.method === 'PUT' && path === '/api/edit') {
    const body = await readBody();
    // Apply patch to state.merged (top-level fields only for safety)
    if (state.merged && body.path && body.value !== undefined) {
      const parts = body.path.split('.');
      let obj = state.merged;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = body.value;
    }
    json(200, { ok: true });
    return;
  }

  // ── GET /api/raw/:type ──────────────────────────────────────────────────
  if (req.method === 'GET' && path.startsWith('/api/raw/')) {
    const type = path.replace('/api/raw/', '');
    if (type === 'bronze') { json(200, state.bronze || null); return; }
    if (type === 'silver') { json(200, state.scraped || null); return; }
    json(404, { error: 'Unknown type' });
    return;
  }

  // ── POST /api/open ───────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/open') {
    const body = await readBody();
    const target = body.path || state.outputDir;
    if (target) exec(`open "${target}"`);
    json(200, { ok: true });
    return;
  }

  // ── POST /api/reset ──────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/reset') {
    state.url = null; state.outputDir = null; state.preset = null;
    state.scraped = null; state.merged = null; state.audit = null;
    state.design = null; state.content = null; state.validation = null;
    state.missing = null; state.artifacts = null;
    for (const k of Object.keys(state.steps)) {
      state.steps[k] = { status: 'idle', log: [], data: null };
    }
    json(200, { ok: true });
    return;
  }

  json(404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log('  │  Groundwork Builder — Pipeline Studio   │');
  console.log(`  │  http://localhost:${PORT}                    │`);
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
  // Open browser automatically
  exec(`open http://localhost:${PORT}`);
});

// ---------------------------------------------------------------------------
// Frontend HTML (self-contained SPA)
// ---------------------------------------------------------------------------

function frontendHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Studio — Groundwork Builder</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --charcoal:   #1A1A1A;
  --terracotta: #C45D3E;
  --cream:      #FAF8F5;
  --sage:       #6B7F6E;
  --surface:    #FFFFFF;
  --border:     #E5E0DA;
  --text-dim:   #666259;
  --green:      #2E7D4F;
  --red:        #C0392B;
  --amber:      #C07A1A;
  --blue:       #1B5EA6;
  --radius:     8px;
  --font:       -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono:       'SFMono-Regular', Consolas, monospace;
}
body { font-family: var(--font); background: var(--cream); color: var(--charcoal); font-size: 14px; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

/* ── Top bar ── */
.topbar { background: var(--charcoal); color: white; padding: 0 20px; display: flex; align-items: center; gap: 16px; height: 56px; flex-shrink: 0; }
.topbar-logo { font-size: 15px; font-weight: 700; letter-spacing: -0.3px; white-space: nowrap; }
.topbar-logo span { color: var(--terracotta); }
.url-form { display: flex; gap: 8px; flex: 1; max-width: 560px; }
.url-input { flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 7px 12px; color: white; font-size: 13px; outline: none; }
.url-input::placeholder { color: rgba(255,255,255,0.4); }
.url-input:focus { border-color: var(--terracotta); background: rgba(255,255,255,0.15); }
.btn { padding: 7px 16px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s, transform 0.1s; white-space: nowrap; }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: var(--terracotta); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-ghost  { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); }
.btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
.btn-sm { padding: 5px 12px; font-size: 12px; }
.btn-outline { background: transparent; color: var(--terracotta); border: 1px solid var(--terracotta); }
.btn-outline:hover:not(:disabled) { background: var(--terracotta); color: white; }
.btn-reset { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); font-size: 12px; padding: 5px 10px; }

/* ── Layout ── */
.layout { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
.sidebar { width: 200px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; padding: 16px 0; }
.sidebar-section { padding: 0 12px 8px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-dim); }
.step-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 16px; cursor: pointer; border-radius: 0; transition: background 0.12s; border-left: 3px solid transparent; }
.step-nav-item:hover { background: var(--cream); }
.step-nav-item.active { background: #FEF4F1; border-left-color: var(--terracotta); }
.step-nav-item.active .step-nav-label { color: var(--terracotta); font-weight: 700; }
.step-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.icon-idle    { background: #F0EDE8; color: #aaa; border: 1px dashed #ccc; }
.icon-running { background: #FFF3CD; color: var(--amber); animation: pulse 1s ease-in-out infinite; }
.icon-done    { background: #D4EDD9; color: var(--green); }
.icon-error   { background: #FDDCDC; color: var(--red); }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
.step-nav-label { font-size: 13px; color: var(--charcoal); }
.sidebar-output { margin-top: auto; padding: 12px; border-top: 1px solid var(--border); }
.sidebar-output p { font-size: 11px; color: var(--text-dim); line-height: 1.5; word-break: break-all; }
.sidebar-output .open-btn { margin-top: 6px; width: 100%; font-size: 11px; padding: 5px 8px; }

/* ── Main ── */
.main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.step-header { padding: 20px 28px 16px; border-bottom: 1px solid var(--border); background: var(--surface); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.step-header h2 { font-size: 17px; font-weight: 700; }
.step-header .step-desc { font-size: 13px; color: var(--text-dim); margin-top: 3px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.step-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }

/* ── Log panel ── */
.log-panel { background: var(--charcoal); border-radius: var(--radius); padding: 14px 16px; font-family: var(--mono); font-size: 12px; line-height: 1.7; color: #ccc; max-height: 220px; overflow-y: auto; }
.log-panel .log-line { color: #bbb; }
.log-panel .log-line.warn { color: #F0C040; }
.log-panel .log-line.error { color: #F08080; }
.running-spinner { display: inline-block; animation: spin 1s linear infinite; margin-right: 6px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Data cards ── */
.data-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.data-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.data-card h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px; }
.field-row { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid #F5F2EE; gap: 8px; font-size: 13px; }
.field-row:last-child { border-bottom: none; }
.field-key { color: var(--text-dim); font-size: 12px; flex-shrink: 0; }
.field-val { font-weight: 600; text-align: right; word-break: break-word; }
.field-val.missing { color: #bbb; font-weight: 400; font-style: italic; }

/* ── Flag row ── */
.flags { display: flex; flex-wrap: wrap; gap: 6px; }
.flag { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-family: var(--mono); }
.flag.ok      { background: #D4EDD9; color: #1D5C35; }
.flag.missing { background: #FEF3CD; color: #7A5014; }
.flag.default { background: #E8EDE9; color: var(--sage); }

/* ── Page inventory ── */
.page-list { display: flex; flex-direction: column; gap: 5px; }
.page-item { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.page-item summary { padding: 9px 14px; cursor: pointer; font-size: 13px; display: flex; justify-content: space-between; align-items: center; background: #FAFAF8; user-select: none; }
.page-item summary:hover { background: #F5F2EE; }
.page-path { font-family: var(--mono); font-size: 12px; font-weight: 700; }
.page-wc { font-size: 11px; color: var(--text-dim); }
.page-detail-body { padding: 10px 14px; font-size: 12px; display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--border); }
.detail-row { display: flex; gap: 10px; }
.detail-key { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); min-width: 60px; flex-shrink: 0; padding-top: 1px; }
.detail-val { line-height: 1.5; color: #333; }

/* ── Color palette ── */
.palette-row { display: flex; gap: 10px; flex-wrap: wrap; }
.swatch { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.swatch-block { width: 56px; height: 56px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.08); }
.swatch-name { font-size: 10px; color: var(--text-dim); font-weight: 600; }
.swatch-hex  { font-size: 10px; font-family: var(--mono); }

/* ── Copy blocks ── */
.copy-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.copy-section-header { padding: 11px 16px; background: #F5F2EE; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); border-bottom: 1px solid var(--border); }
.copy-section-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.copy-field { display: flex; gap: 12px; align-items: flex-start; }
.copy-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); min-width: 110px; flex-shrink: 0; padding-top: 2px; letter-spacing: 0.3px; }
.copy-value { font-size: 13px; line-height: 1.6; flex: 1; }
.copy-value.hero { font-size: 15px; font-weight: 700; }
.copy-value.tagline { font-size: 13px; color: var(--terracotta); font-style: italic; }
.faq-item { padding: 9px 0; border-bottom: 1px solid #F0EDE8; }
.faq-item:last-child { border-bottom: none; }
.faq-q { font-weight: 700; font-size: 13px; margin-bottom: 3px; }
.faq-a { font-size: 12px; color: var(--text-dim); line-height: 1.5; }
.service-item { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 6px; }
.service-item summary { padding: 9px 14px; cursor: pointer; font-weight: 700; font-size: 13px; background: #FAFAF8; }
.service-item summary:hover { background: #F5F2EE; }
.service-item-body { padding: 12px 14px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }

/* ── Missing items ── */
.missing-group { display: flex; flex-direction: column; gap: 8px; }
.missing-group h4 { font-size: 13px; font-weight: 700; padding-bottom: 6px; border-bottom: 2px solid var(--border); }
.critical-title  { color: var(--red);   border-color: #FDDCDC; }
.important-title { color: var(--amber); border-color: #FEF3CD; }
.optional-title  { color: var(--green); border-color: #D4EDD9; }
.missing-cards   { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.missing-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
.critical-card  { border-left: 3px solid var(--red); }
.important-card { border-left: 3px solid var(--amber); }
.optional-card  { border-left: 3px solid var(--green); }
.cat-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); background: #F0EDE8; padding: 2px 7px; border-radius: 3px; display: inline-block; margin-bottom: 5px; }
.missing-field { font-size: 13px; font-weight: 700; display: block; margin-bottom: 4px; }
.missing-hint  { font-size: 12px; color: var(--text-dim); line-height: 1.45; }

/* ── Idle / empty states ── */
.idle-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 12px; color: var(--text-dim); padding: 48px; text-align: center; }
.idle-state .big-icon { font-size: 48px; }
.idle-state p { font-size: 14px; max-width: 360px; line-height: 1.6; }

/* ── Misc ── */
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 500; }
.tag-primary   { background: var(--terracotta); color: white; }
.tag-secondary { background: #F0EDE8; color: var(--charcoal); }
.section-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-dim); }
.bullet-list { list-style: none; display: flex; flex-direction: column; gap: 5px; padding-left: 14px; }
.bullet-list li { font-size: 13px; position: relative; }
.bullet-list li::before { content: '•'; position: absolute; left: -12px; color: var(--terracotta); }
.divider { height: 1px; background: var(--border); }
.text-dim { color: var(--text-dim); font-size: 12px; }
.bold { font-weight: 700; }
.mood-badge { font-size: 18px; font-weight: 800; color: var(--charcoal); }
.font-pair { display: flex; gap: 16px; flex-wrap: wrap; }
.font-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; flex: 1; min-width: 160px; }
.font-role { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 4px; }
.font-name { font-size: 15px; font-weight: 700; }
.font-sample { font-size: 12px; color: var(--text-dim); margin-top: 4px; font-style: italic; }
.build-badge { display: inline-block; font-size: 13px; font-weight: 800; letter-spacing: 2px; padding: 8px 18px; border-radius: 6px; font-family: var(--mono); }
.build-badge.pass    { background: #D4EDD9; color: var(--green); }
.build-badge.fail    { background: #FDDCDC; color: var(--red); }
.build-badge.skipped { background: #EDE8E0; color: #888; }
.inline-link { color: var(--terracotta); text-decoration: none; font-weight: 600; font-size: 13px; }
.inline-link:hover { text-decoration: underline; }

/* ── Raw data viewer ── */
.raw-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 16px; flex-shrink: 0; }
.raw-tab { padding: 8px 20px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: none; color: var(--text-dim); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.12s; }
.raw-tab:hover { color: var(--charcoal); }
.raw-tab.active { color: var(--terracotta); border-bottom-color: var(--terracotta); }
.raw-viewer { background: var(--charcoal); border-radius: var(--radius); padding: 16px; font-family: var(--mono); font-size: 12px; line-height: 1.6; overflow: auto; flex: 1; min-height: 0; white-space: pre; }
.json-key    { color: #79b8ff; }
.json-string { color: #9ecbff; }
.json-number { color: #f8c555; }
.json-bool   { color: #79b8ff; font-weight: 700; }
.json-null   { color: #666; font-style: italic; }
</style>
</head>
<body>

<!-- ═══ TOP BAR ═══════════════════════════════════════════════════════════ -->
<div class="topbar">
  <div class="topbar-logo">Ground<span>work</span> Studio</div>
  <form class="url-form" onsubmit="startScrape(event)">
    <input id="urlInput" class="url-input" type="text" placeholder="example-dental.com" required>
    <button type="submit" class="btn btn-primary" id="scrapeBtn">Scrape Site</button>
  </form>
  <button class="btn btn-reset" onclick="resetAll()">Reset</button>
</div>

<!-- ═══ LAYOUT ═══════════════════════════════════════════════════════════ -->
<div class="layout">

  <!-- Sidebar -->
  <nav class="sidebar">
    <div class="sidebar-section" style="margin-bottom:8px">Pipeline Steps</div>
    <div class="step-nav-item active" data-step="scrape"  onclick="selectStep('scrape')">
      <div class="step-icon icon-idle" id="icon-scrape">1</div>
      <span class="step-nav-label">Scrape</span>
    </div>
    <div class="step-nav-item" data-step="audit"   onclick="selectStep('audit')">
      <div class="step-icon icon-idle" id="icon-audit">2</div>
      <span class="step-nav-label">AI Audit</span>
    </div>
    <div class="step-nav-item" data-step="design"  onclick="selectStep('design')">
      <div class="step-icon icon-idle" id="icon-design">3</div>
      <span class="step-nav-label">AI Design</span>
    </div>
    <div class="step-nav-item" data-step="content" onclick="selectStep('content')">
      <div class="step-icon icon-idle" id="icon-content">4</div>
      <span class="step-nav-label">AI Content</span>
    </div>
    <div class="step-nav-item" data-step="build"   onclick="selectStep('build')">
      <div class="step-icon icon-idle" id="icon-build">5</div>
      <span class="step-nav-label">Build</span>
    </div>
    <div class="step-nav-item" data-step="missing" onclick="selectStep('missing')">
      <div class="step-icon icon-idle" id="icon-missing">6</div>
      <span class="step-nav-label">What's Missing</span>
    </div>

    <div style="padding:0 12px;margin-top:16px;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim)">Data</div>
    <div class="step-nav-item" data-step="raw" onclick="selectStep('raw')">
      <div class="step-icon icon-idle" id="icon-raw" style="font-size:13px">{ }</div>
      <span class="step-nav-label">Raw Data</span>
    </div>

    <div class="sidebar-output" id="sidebarOutput" style="display:none">
      <p id="outputDirText"></p>
      <button class="btn btn-outline btn-sm open-btn" onclick="openOutput()">Open in Finder ↗</button>
      <button class="btn btn-outline btn-sm open-btn" style="margin-top:6px" onclick="openReport()">View Report ↗</button>
    </div>
  </nav>

  <!-- Main content -->
  <div class="main" id="mainArea">
    <div class="step-header">
      <div>
        <h2 id="stepTitle">Enter a URL to begin</h2>
        <div class="step-desc" id="stepDesc">Paste a dental practice website URL above and click Scrape Site to start the pipeline.</div>
      </div>
      <div class="header-actions" id="headerActions"></div>
    </div>
    <div class="step-body" id="stepBody">
      <div class="idle-state">
        <div class="big-icon">🏗</div>
        <p>Paste a practice website URL in the bar above to begin. The pipeline will scrape the existing site and extract all content, then you can step through each AI phase at your own pace.</p>
      </div>
    </div>
  </div>

</div>

<script>
// ── State ──────────────────────────────────────────────────────────────────
let appState = null;
let currentStep = 'scrape';
let pollTimer = null;
let wasRunning = {};

const STEP_META = {
  scrape:  { title: 'Phase 1 — Scrape',          desc: 'Crawls the existing website and extracts all content: NAP, pages, doctor info, services, colors, testimonials, FAQs, and more.' },
  audit:   { title: 'Phase 2 — AI Audit',         desc: 'Claude analyzes the scraped data and recommends positioning, tone, service emphasis, differentiators, and content gaps.' },
  design:  { title: 'Phase 3 — AI Design System', desc: 'Claude analyzes the current brand colors and generates an elevated, modern color palette and font pairing.' },
  content: { title: 'Phase 4 — AI Content',       desc: 'Claude writes the new site copy — homepage hero, about page, per-service content, FAQs, and blog topic ideas.' },
  build:   { title: 'Phase 5 — Build Site',       desc: 'Injects all data into the Astro template, generates pages, downloads images, and validates the build.' },
  missing: { title: "Phase 6 \u2014 What's Missing",  desc: 'Analyzes the complete pipeline output and produces a categorized checklist of everything needed before launch.' },
  raw:     { title: 'Raw Data',                        desc: 'Full bronze (pure crawl) and silver (AI-extracted) JSON dumps. Also written to _pipeline/01-bronze-full.json and 01-silver-full.json after each scrape.' },
};

// ── Raw data cache ─────────────────────────────────────────────────────────
let rawCache = { bronze: null, silver: null };
let rawTab = 'silver'; // default to silver since it's more readable

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// ── Polling ────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const state = await api('GET', '/api/state');
    appState = state;
    updateSidebar(state);
    renderCurrentStep(state);

    // Stop polling when nothing is running
    const anyRunning = Object.values(state.steps).some(s => s.status === 'running');
    if (!anyRunning) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 600);
}

// ── Actions ────────────────────────────────────────────────────────────────
async function startScrape(e) {
  e.preventDefault();
  let url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  if (url.indexOf('://') === -1) url = 'https://' + url;
  selectStep('scrape');
  await api('POST', '/api/run/scrape', { url });
  startPolling();
}

async function runStep(step) {
  const body = step === 'build' ? { skipImages: false } : {};
  await api('POST', \`/api/run/\${step}\`, body);
  startPolling();
}

function resetAll() {
  if (!confirm('Reset the pipeline? All current state will be cleared.')) return;
  rawCache = { bronze: null, silver: null };
  api('POST', '/api/reset').then(() => location.reload());
}

function openOutput() {
  if (appState?.outputDir) api('POST', '/api/open', { path: appState.outputDir });
}

function openReport() {
  if (appState?.outputDir) {
    api('POST', '/api/open', { path: appState.outputDir + '/_pipeline/index.html' });
  }
}

function selectStep(step) {
  currentStep = step;
  document.querySelectorAll('.step-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.step === step);
  });
  if (appState) renderCurrentStep(appState);
  else renderEmpty(step);
}

// ── Sidebar icons ──────────────────────────────────────────────────────────
function updateSidebar(state) {
  const statusToIcon = { idle: 'idle', running: 'running', done: 'done', error: 'error' };
  const statusToChar = { idle: step => step.charCodeAt(0) - 96, running: '⟳', done: '✓', error: '✗' };
  const steps = ['scrape','audit','design','content','build','missing'];
  steps.forEach((s, i) => {
    const el = document.getElementById(\`icon-\${s}\`);
    if (!el) return;
    const status = state.steps[s]?.status || 'idle';
    el.className = \`step-icon icon-\${status}\`;
    el.textContent = status === 'idle' ? (i + 1) : status === 'running' ? '⟳' : status === 'done' ? '✓' : '✗';
  });
  // Raw data tab — show green dot if scrape is done
  const rawEl = document.getElementById('icon-raw');
  if (rawEl) {
    if (state.steps.scrape?.status === 'done') {
      rawEl.className = 'step-icon icon-done';
      rawEl.textContent = '✓';
    } else {
      rawEl.className = 'step-icon icon-idle';
      rawEl.textContent = '{ }';
      rawEl.style.fontSize = '13px';
    }
  }

  if (state.outputDir) {
    document.getElementById('sidebarOutput').style.display = 'block';
    document.getElementById('outputDirText').textContent = state.outputDir.replace(/.*\\/output\\//, '~/output/');
  }
}

// ── Main renderer ──────────────────────────────────────────────────────────
function renderEmpty(step) {
  const meta = STEP_META[step] || {};
  document.getElementById('stepTitle').textContent = meta.title || step;
  document.getElementById('stepDesc').textContent  = meta.desc  || '';
  document.getElementById('headerActions').innerHTML = '';
  document.getElementById('stepBody').innerHTML = \`<div class="idle-state"><div class="big-icon">○</div><p>Complete previous steps first.</p></div>\`;
}

function renderCurrentStep(state) {
  const step = currentStep;
  const meta = STEP_META[step];
  const stepState = state.steps[step] || { status: 'idle', log: [] };

  document.getElementById('stepTitle').textContent = meta.title;
  document.getElementById('stepDesc').textContent  = meta.desc;

  const acts = document.getElementById('headerActions');
  const isRunning = stepState.status === 'running';
  const isDone    = stepState.status === 'done';
  const isIdle    = stepState.status === 'idle' || stepState.status === 'error';
  const canRun    = step === 'scrape' ? true : !!state.scrape;

  acts.innerHTML = step === 'raw'
    ? (appState?.steps?.scrape?.status === 'done'
        ? \`<button class="btn btn-outline btn-sm" onclick="refreshRaw()">Refresh</button>\`
        : '')
    : isRunning
      ? \`<span class="text-dim"><span class="running-spinner">⟳</span> Running…</span>\`
      : canRun
        ? \`<button class="btn btn-primary btn-sm" onclick="runStep('\${step}')">\${isDone ? 'Re-run' : 'Run Step'}</button>\`
        : \`<button class="btn btn-primary btn-sm" disabled>Run Step</button>\`;

  const body = document.getElementById('stepBody');

  // Show log if running or errored
  const logHTML = (isRunning || stepState.status === 'error') && stepState.log.length
    ? \`<div class="log-panel">\${stepState.log.map(l => \`<div class="log-line \${l.startsWith('[warn') ? 'warn' : l.startsWith('[error') ? 'error' : ''}">\${esc(l)}</div>\`).join('')}</div>\`
    : '';

  if (isRunning && !isDone) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon"><span class="running-spinner">⟳</span></div><p>Running…</p></div>\`;
    if (logHTML) scrollLogToBottom();
    return;
  }

  switch (step) {
    case 'scrape':  renderScrape(state, logHTML, body); break;
    case 'audit':   renderAudit(state, logHTML, body); break;
    case 'design':  renderDesign(state, logHTML, body); break;
    case 'content': renderContent(state, logHTML, body); break;
    case 'build':   renderBuild(state, logHTML, body); break;
    case 'missing': renderMissing(state, logHTML, body); break;
    case 'raw':     renderRaw(state, body); break;
  }
}

function scrollLogToBottom() {
  const log = document.querySelector('.log-panel');
  if (log) log.scrollTop = log.scrollHeight;
}

// ── Step renderers ─────────────────────────────────────────────────────────

function renderScrape(state, logHTML, body) {
  const s = state.scrape;
  if (!s) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">🌐</div><p>Enter a URL above and click Scrape Site.</p></div>\`;
    return;
  }

  const flagHTML = s.confidenceFlags.map(f => {
    const cls = f.includes(':found') || /:\\d/.test(f) ? 'ok' : f.includes('missing') ? 'missing' : 'default';
    return \`<span class="flag \${cls}">\${esc(f)}</span>\`;
  }).join('');

  const pagesHTML = s.pages.map(p => \`
    <details class="page-item">
      <summary>
        <span class="page-path">\${esc(p.path)}</span>
        <span class="page-wc">\${p.wordCount || 0} words</span>
      </summary>
      <div class="page-detail-body">
        \${p.title ? \`<div class="detail-row"><span class="detail-key">Title</span><span class="detail-val">\${esc(p.title)}</span></div>\` : ''}
        \${p.metaDesc ? \`<div class="detail-row"><span class="detail-key">Meta</span><span class="detail-val">\${esc(p.metaDesc)}</span></div>\` : ''}
        \${p.h1 ? \`<div class="detail-row"><span class="detail-key">H1</span><span class="detail-val bold">\${esc(p.h1)}</span></div>\` : ''}
        \${p.h2s?.length ? \`<div class="detail-row"><span class="detail-key">H2s</span><span class="detail-val">\${esc(p.h2s.slice(0,4).join(' · '))}</span></div>\` : ''}
        \${p.paragraphs?.[0] ? \`<div class="detail-row"><span class="detail-key">Excerpt</span><span class="detail-val" style="font-style:italic;color:#555">\${esc(p.paragraphs[0].slice(0, 200))}\${p.paragraphs[0].length > 200 ? '…' : ''}</span></div>\` : ''}
      </div>
    </details>\`).join('');

  const testimonialsHTML = s.testimonials.length
    ? s.testimonials.map(t => \`<div class="faq-item"><p class="faq-q">\${esc(t.author || 'Patient')}</p><p class="faq-a">"\${esc(t.text)}"</p></div>\`).join('')
    : '<p class="text-dim">None found on current site.</p>';

  const faqsHTML = s.faqs.length
    ? s.faqs.map(f => \`<div class="faq-item"><p class="faq-q">\${esc(f.question)}</p><p class="faq-a">\${esc(f.answer.slice(0, 200))}</p></div>\`).join('')
    : '<p class="text-dim">None found on current site.</p>';

  const st = s.stats;
  const statsHTML = [
    st.yearsExperience ? \`<div class="field-row"><span class="field-key">Years in practice</span><span class="field-val">\${st.yearsExperience}</span></div>\` : '',
    st.happyPatients   ? \`<div class="field-row"><span class="field-key">Patients</span><span class="field-val">\${st.happyPatients}+</span></div>\` : '',
    st.googleRating    ? \`<div class="field-row"><span class="field-key">Google rating</span><span class="field-val">\${st.googleRating} ★</span></div>\` : '',
    st.fiveStarReviews ? \`<div class="field-row"><span class="field-key">5★ reviews</span><span class="field-val">\${st.fiveStarReviews}</span></div>\` : '',
  ].filter(Boolean).join('') || '<p class="text-dim">None found.</p>';

  const colorsHTML = s.colors
    ? Object.entries(s.colors).filter(([,v]) => v).map(([k, v]) =>
        \`<div class="swatch"><div class="swatch-block" style="background:\${esc(v)}"></div><div class="swatch-name">\${esc(k)}</div><div class="swatch-hex">\${esc(v)}</div></div>\`
      ).join('')
    : '<p class="text-dim">No colors extracted.</p>';

  // Build images panel across all categories
  const imgCats = [
    { key: 'logo',    label: 'Logo',    items: s.images.logo ? [s.images.logo] : [] },
    { key: 'team',    label: 'Team',    items: s.images.team    || [] },
    { key: 'hero',    label: 'Hero',    items: s.images.hero    || [] },
    { key: 'gallery', label: 'Gallery', items: s.images.gallery || [] },
    { key: 'office',  label: 'Office',  items: s.images.office  || [] },
    { key: 'other',   label: 'Other',   items: s.images.other   || [] },
  ].filter(c => c.items.length > 0);

  const imagesHTML = imgCats.length === 0
    ? ''
    : \`<div>
      <div class="section-label" style="margin-bottom:8px">Scraped Images (\${imgCats.reduce((n,c) => n + c.items.length, 0)} total)</div>
      \${imgCats.map(cat => \`
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:6px">\${esc(cat.label)} (\${cat.items.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            \${cat.items.map(src => \`<a href="\${esc(src)}" target="_blank" title="\${esc(src)}" style="display:block;flex-shrink:0">
              <img src="\${esc(src)}" style="width:100px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:#f0ede8" loading="lazy" onerror="this.style.display='none'">
            </a>\`).join('')}
          </div>
        </div>\`).join('')}
    </div>\`;

  body.innerHTML = \`
    \${logHTML}

    <div class="data-grid">
      <div class="data-card">
        <h4>Practice Info</h4>
        \${fieldRow('Name', s.practiceName)}
        \${fieldRow('Phone', s.phone)}
        \${fieldRow('Email', s.email)}
        \${fieldRow('Address', s.address)}
      </div>
      <div class="data-card">
        <h4>Doctor</h4>
        \${fieldRow('Name', s.doctorName)}
      </div>
      <div class="data-card">
        <h4>Site Stats</h4>
        \${fieldRow('Pages crawled', s.pageCount)}
        \${fieldRow('Services found', s.services.length)}
        \${fieldRow('Social links', s.socialLinks.length > 0 ? s.socialLinks.length : null)}
        \${fieldRow('Insurance found', s.insurance.length > 0 ? s.insurance.join(', ') : null)}
      </div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">Confidence Flags</div>
      <div class="flags">\${flagHTML}</div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">Existing Brand Colors</div>
      <div class="palette-row">\${colorsHTML}</div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">Statistics Found on Site</div>
      <div class="data-card">\${statsHTML}</div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">Testimonials Found (\${s.testimonials.length})</div>
      <div class="data-card">\${testimonialsHTML}</div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">FAQs Found (\${s.faqs.length})</div>
      <div class="data-card">\${faqsHTML}</div>
    </div>

    <div>
      <div class="section-label" style="margin-bottom:8px">Page Inventory (\${s.pageCount} pages)</div>
      <div class="page-list">\${pagesHTML}</div>
    </div>

    \${imagesHTML}
  \`;
}

function renderAudit(state, logHTML, body) {
  const a = state.audit;
  if (!a) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">🤖</div><p>\${state.scrape ? 'Click "Run Step" to run the AI audit.' : 'Complete scrape first.'}</p></div>\`;
    return;
  }

  const svcsHTML = \`
    \${a.serviceEmphasis?.primary ? \`<span class="tag tag-primary">\${esc(a.serviceEmphasis.primary)}</span>\` : ''}
    \${(a.serviceEmphasis?.secondary || []).map(s => \`<span class="tag tag-secondary">\${esc(s)}</span>\`).join('')}
  \`;

  body.innerHTML = \`
    \${logHTML}
    <div class="data-grid">
      <div class="data-card">
        <h4>Positioning</h4>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Current</p>
        <p style="font-size:13px;margin-bottom:10px">\${esc(a.positioning?.current || '—')}</p>
        <p style="font-size:12px;color:var(--terracotta);font-weight:700;margin-bottom:4px">Recommended</p>
        <p style="font-size:13px;font-weight:600">\${esc(a.positioning?.recommended || '—')}</p>
        <p style="font-size:12px;color:var(--text-dim);font-style:italic;margin-top:6px">\${esc(a.positioning?.rationale || '')}</p>
      </div>
      <div class="data-card">
        <h4>Brand Tone</h4>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Current</p>
        <p style="font-size:13px;margin-bottom:10px">\${esc(a.tone?.current || '—')}</p>
        <p style="font-size:12px;color:var(--terracotta);font-weight:700;margin-bottom:4px">Recommended</p>
        <p style="font-size:13px;font-weight:600">\${esc(a.tone?.recommended || '—')}</p>
        <p style="font-size:12px;color:var(--text-dim);font-style:italic;margin-top:6px">\${esc(a.tone?.rationale || '')}</p>
      </div>
      <div class="data-card">
        <h4>Service Emphasis</h4>
        <div class="tag-list">\${svcsHTML}</div>
        <p style="font-size:12px;color:var(--text-dim);font-style:italic;margin-top:10px">\${esc(a.serviceEmphasis?.rationale || '')}</p>
      </div>
    </div>
    <div class="data-grid">
      <div class="data-card">
        <h4>Differentiators</h4>
        <ul class="bullet-list">\${(a.differentiators || []).map(d => \`<li>\${esc(d)}</li>\`).join('')}</ul>
      </div>
      <div class="data-card">
        <h4>Content Gaps</h4>
        <ul class="bullet-list">\${(a.contentGaps || []).map(g => \`<li>\${esc(g)}</li>\`).join('')}</ul>
      </div>
      <div class="data-card">
        <h4>SEO Opportunities</h4>
        <ul class="bullet-list">\${(a.seoOpportunities || []).map(o => \`<li>\${esc(o)}</li>\`).join('')}</ul>
      </div>
    </div>
    \${a.warnings?.length ? \`<div class="data-card"><h4>⚠️ Warnings</h4><ul class="bullet-list">\${a.warnings.map(w => \`<li>\${esc(w)}</li>\`).join('')}</ul></div>\` : ''}
  \`;
}

function renderDesign(state, logHTML, body) {
  const d = state.design;
  if (!d) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">🎨</div><p>\${state.scrape ? 'Click "Run Step" to generate a design palette.' : 'Complete scrape first.'}</p></div>\`;
    return;
  }

  const newPalette  = d.palette  || {};
  const oldColors   = state.scrape?.colors || {};
  const renderSwatches = (colors, label) => {
    const entries = Object.entries(colors).filter(([, v]) => v && /^#/.test(String(v)));
    if (!entries.length) return \`<p class="text-dim">None available.</p>\`;
    return \`<div class="palette-row">\${entries.map(([k, v]) => {
      const hex = String(v).match(/#[0-9a-fA-F]{3,8}/)?.[0] || v;
      return \`<div class="swatch"><div class="swatch-block" style="background:\${esc(hex)}"></div><div class="swatch-name">\${esc(k)}</div><div class="swatch-hex">\${esc(hex)}</div></div>\`;
    }).join('')}</div>\`;
  };

  body.innerHTML = \`
    \${logHTML}
    <div class="data-card">
      <h4>Design Mood</h4>
      <div class="mood-badge" style="margin:8px 0">\${esc(d.mood || '—')}</div>
      <p style="font-size:13px;color:var(--text-dim);margin-top:4px">\${esc(d.rationale || '')}</p>
      \${d.sourceInspo ? \`<p style="font-size:12px;color:var(--text-dim);font-style:italic;margin-top:8px"><strong>Inspiration:</strong> \${esc(d.sourceInspo)}</p>\` : ''}
    </div>
    <div class="data-card">
      <h4>New Palette</h4>
      \${renderSwatches(newPalette, 'New')}
    </div>
    <div class="data-card">
      <h4>Original Site Colors</h4>
      \${renderSwatches(oldColors, 'Original')}
    </div>
    <div>
      <div class="section-label" style="margin-bottom:8px">Typography</div>
      <div class="font-pair">
        <div class="font-card">
          <div class="font-role">Heading</div>
          <div class="font-name">\${esc(d.fonts?.heading || 'Playfair Display')}</div>
          <div class="font-sample">Aa Bb Cc — elegant dental branding</div>
        </div>
        <div class="font-card">
          <div class="font-role">Body</div>
          <div class="font-name">\${esc(d.fonts?.body || 'DM Sans')}</div>
          <div class="font-sample">Clear, readable text for all patients</div>
        </div>
      </div>
    </div>
    \${d.tailwind ? \`<div class="data-card"><h4>Style Preferences</h4>\${fieldRow('Border radius', d.tailwind.borderRadius)}\${fieldRow('Shadows', d.tailwind.shadowStyle)}</div>\` : ''}
  \`;
}

function renderContent(state, logHTML, body) {
  const c = state.content;
  if (!c) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">✍️</div><p>\${state.scrape ? 'Click "Run Step" to generate site copy.' : 'Complete scrape first.'}</p></div>\`;
    return;
  }

  const hp = c.homepage || {};
  const ab = c.about    || {};
  const svcs = c.services   || {};
  const faqs = c.faqs        || [];
  const blogs = c.blogTopics || [];

  const serviceKeys = Object.keys(svcs);
  const serviceHTML = serviceKeys.map(slug => \`
    <details class="service-item">
      <summary>\${esc(slug)}</summary>
      <div class="service-item-body">
        \${hp_field('Headline', svcs[slug].headline)}
        \${hp_field('Subheadline', svcs[slug].subheadline)}
        \${hp_field('Intro', svcs[slug].intro)}
        \${svcs[slug].benefits?.length ? \`<div class="copy-field"><span class="copy-label">Benefits</span><ul style="font-size:13px;padding-left:16px;line-height:1.7">\${svcs[slug].benefits.map(b => \`<li>\${esc(b)}</li>\`).join('')}</ul></div>\` : ''}
        \${hp_field('CTA', svcs[slug].cta)}
      </div>
    </details>\`).join('');

  const faqsHTML = faqs.map(f => \`<div class="faq-item"><p class="faq-q">\${esc(f.question)}</p><p class="faq-a">\${esc(f.answer)}</p></div>\`).join('');
  const blogsHTML = blogs.map(b => \`<div class="faq-item"><p class="faq-q">\${esc(b.title)}</p><p class="faq-a">\${esc(b.excerpt)}</p></div>\`).join('');

  body.innerHTML = \`
    \${logHTML}
    <div class="copy-section">
      <div class="copy-section-header">Homepage</div>
      <div class="copy-section-body">
        \${hp.heroHeadline ? \`<div class="copy-field"><span class="copy-label">Hero Headline</span><span class="copy-value hero">\${esc(hp.heroHeadline)}</span></div>\` : ''}
        \${hp.heroSubheadline ? \`<div class="copy-field"><span class="copy-label">Subheadline</span><span class="copy-value">\${esc(hp.heroSubheadline)}</span></div>\` : ''}
        \${hp.heroTagline ? \`<div class="copy-field"><span class="copy-label">Tagline</span><span class="copy-value tagline">\${esc(hp.heroTagline)}</span></div>\` : ''}
        \${hp.ctaText ? \`<div class="copy-field"><span class="copy-label">CTA</span><span class="copy-value">\${esc(hp.ctaText)}</span></div>\` : ''}
        \${hp.ctaSecondaryText ? \`<div class="copy-field"><span class="copy-label">Secondary CTA</span><span class="copy-value">\${esc(hp.ctaSecondaryText)}</span></div>\` : ''}
        \${hp.valueProp ? \`<div class="copy-field"><span class="copy-label">Value Prop</span><span class="copy-value">\${esc(hp.valueProp)}</span></div>\` : ''}
      </div>
    </div>
    <div class="copy-section">
      <div class="copy-section-header">About Page</div>
      <div class="copy-section-body">
        \${hp_field('Headline', ab.headline)}
        \${hp_field('Intro', ab.introParagraph)}
        \${hp_field('Philosophy', ab.philosophy)}
        \${hp_field('Closing CTA', ab.closingCTA)}
      </div>
    </div>
    \${serviceKeys.length ? \`<div class="copy-section"><div class="copy-section-header">Service Pages (\${serviceKeys.length})</div><div class="copy-section-body">\${serviceHTML}</div></div>\` : ''}
    \${faqs.length ? \`<div class="copy-section"><div class="copy-section-header">FAQs (\${faqs.length})</div><div class="copy-section-body">\${faqsHTML}</div></div>\` : ''}
    \${blogs.length ? \`<div class="copy-section"><div class="copy-section-header">Blog Topic Ideas</div><div class="copy-section-body">\${blogsHTML}</div></div>\` : ''}
  \`;
}

function renderBuild(state, logHTML, body) {
  const v = state.validation;
  const stepState = appState?.steps?.build;
  if (!stepState || stepState.status === 'idle') {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">🔨</div><p>\${state.scrape ? 'Click "Run Step" to build the site.' : 'Complete earlier steps first.'}</p></div>\`;
    return;
  }
  if (!v) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">🔨</div><p>Build running or no result yet.</p></div>\`;
    if (logHTML) body.innerHTML = logHTML;
    return;
  }

  const placeholders = v.placeholders || [];
  const errors = v.errors || [];

  body.innerHTML = \`
    \${logHTML}
    <div style="display:flex;align-items:center;gap:16px">
      <div class="build-badge \${v.buildSuccess ? 'pass' : 'fail'}">\${v.buildSuccess ? 'PASSED' : 'FAILED'}</div>
      \${state.outputDir ? \`<a class="inline-link" href="#" onclick="openOutput()">Open output folder ↗</a>\` : ''}
      \${state.outputDir ? \`<a class="inline-link" href="#" onclick="openReport()">Open report ↗</a>\` : ''}
    </div>
    \${errors.length ? \`<div class="data-card"><h4>Build Errors</h4>\${errors.map(e => \`<div style="font-size:12px;background:#FEE8E8;color:var(--red);padding:6px 10px;border-radius:4px;font-family:var(--mono);margin-bottom:4px">\${esc(e)}</div>\`).join('')}</div>\` : ''}
    \${placeholders.length ? \`<div class="data-card"><h4>Leftover Placeholders (\${placeholders.length})</h4>\${placeholders.map(p => \`<div class="field-row"><span class="field-key" style="font-family:var(--mono);font-size:11px">\${esc(p.file?.replace('dist/','') || '—')}</span><span class="field-val" style="font-family:var(--mono);font-size:11px;color:var(--red)">\${esc(p.pattern || '—')}</span></div>\`).join('')}</div>\` : ''}
    \${!errors.length && !placeholders.length ? \`<div class="data-card" style="color:var(--green);font-weight:600">✓ No errors or leftover placeholders found.</div>\` : ''}
  \`;
}

function renderMissing(state, logHTML, body) {
  const m = state.missing;
  if (!m) {
    body.innerHTML = logHTML || \`<div class="idle-state"><div class="big-icon">📋</div><p>\${state.scrape ? 'Click "Run Step" to generate the missing items checklist.' : 'Complete scrape first.'}</p></div>\`;
    return;
  }

  const renderGroup = (items, cls, title) => {
    if (!items?.length) return '';
    return \`<div class="missing-group">
      <h4 class="\${cls}-title">\${title}</h4>
      <div class="missing-cards">
        \${items.map(item => \`
        <div class="missing-card \${cls}-card">
          <span class="cat-badge">\${esc(item.category)}</span>
          <strong class="missing-field">\${esc(item.field)}</strong>
          <p class="missing-hint">\${esc(item.hint)}</p>
        </div>\`).join('')}
      </div>
    </div>\`;
  };

  body.innerHTML = \`
    \${logHTML}
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div style="background:#FDDCDC;color:var(--red);font-weight:700;padding:10px 18px;border-radius:8px;font-size:20px">\${m.summary.critical}<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Critical</div></div>
      <div style="background:#FEF3CD;color:var(--amber);font-weight:700;padding:10px 18px;border-radius:8px;font-size:20px">\${m.summary.important}<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Important</div></div>
      <div style="background:#D4EDD9;color:var(--green);font-weight:700;padding:10px 18px;border-radius:8px;font-size:20px">\${m.summary.optional}<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Optional</div></div>
    </div>
    \${renderGroup(m.critical,  'critical',  '🚨 Critical — Required Before Launch')}
    \${renderGroup(m.important, 'important', '⚠️ Important — Should Complete Before Launch')}
    \${renderGroup(m.optional,  'optional',  '✓ Optional — Nice to Have')}
    \${state.outputDir ? \`<p><a class="inline-link" href="#" onclick="openReport()">Open full pipeline report ↗</a></p>\` : ''}
  \`;
}

function renderRaw(state, body) {
  const hasScrape = state.steps?.scrape?.status === 'done';
  if (!hasScrape) {
    body.innerHTML = \`<div class="idle-state"><div class="big-icon">{ }</div><p>Run scrape first to see raw data.</p></div>\`;
    return;
  }

  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '0';
  body.style.padding = '0';
  body.style.overflow = 'hidden';

  body.innerHTML = \`
    <div style="padding:16px 28px 0;flex-shrink:0">
      <div class="raw-tabs">
        <button class="raw-tab \${rawTab === 'silver' ? 'active' : ''}" onclick="switchRawTab('silver')">Silver (AI-extracted)</button>
        <button class="raw-tab \${rawTab === 'bronze' ? 'active' : ''}" onclick="switchRawTab('bronze')">Bronze (raw crawl)</button>
      </div>
    </div>
    <div style="flex:1;overflow:hidden;padding:0 28px 24px;display:flex;flex-direction:column">
      <div id="rawViewerWrap" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
        <div id="rawLoading" class="idle-state" style="flex:1"><div class="big-icon">⟳</div><p>Loading…</p></div>
        <pre id="rawViewer" class="raw-viewer" style="display:none"></pre>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-dim)">
        Also saved to <code style="font-family:var(--mono);background:#F0EDE8;padding:1px 5px;border-radius:3px">_pipeline/01-\${rawTab}-full.json</code> after each scrape run.
      </div>
    </div>
  \`;

  loadRawData(rawTab);
}

async function loadRawData(type) {
  const viewer = document.getElementById('rawViewer');
  const loading = document.getElementById('rawLoading');
  if (!viewer) return;

  if (rawCache[type]) {
    showRawData(rawCache[type]);
    return;
  }

  loading && (loading.style.display = 'flex');
  viewer.style.display = 'none';

  try {
    const data = await api('GET', \`/api/raw/\${type}\`);
    rawCache[type] = data;
    showRawData(data);
  } catch (e) {
    if (loading) loading.innerHTML = \`<p style="color:var(--red)">Failed to load \${type} data.</p>\`;
  }
}

function showRawData(data) {
  const viewer = document.getElementById('rawViewer');
  const loading = document.getElementById('rawLoading');
  if (!viewer) return;
  if (loading) loading.style.display = 'none';
  viewer.style.display = 'block';
  viewer.innerHTML = syntaxHighlight(JSON.stringify(data, null, 2));
}

function switchRawTab(type) {
  rawTab = type;
  document.querySelectorAll('.raw-tab').forEach(t => t.classList.toggle('active', t.textContent.startsWith(type === 'silver' ? 'Silver' : 'Bronze')));
  const filePath = document.querySelector('[id="rawViewerWrap"] + div code');
  if (filePath) filePath.textContent = \`_pipeline/01-\${type}-full.json\`;
  const viewer = document.getElementById('rawViewer');
  if (rawCache[type]) { showRawData(rawCache[type]); }
  else { if (viewer) viewer.style.display = 'none'; loadRawData(type); }
}

function refreshRaw() {
  rawCache = { bronze: null, silver: null };
  if (appState) renderRaw(appState, document.getElementById('stepBody'));
}

function syntaxHighlight(str) {
  return str.replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
    .replace(/:\s*(\b\d+(?:\.\d+)?\b)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(\btrue\b|\bfalse\b)/g, ': <span class="json-bool">$1</span>')
    .replace(/:\s*(\bnull\b)/g, ': <span class="json-null">$1</span>');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fieldRow(key, val) {
  const missing = !val;
  return \`<div class="field-row"><span class="field-key">\${esc(key)}</span><span class="field-val \${missing ? 'missing' : ''}">\${missing ? 'not found' : esc(String(val))}</span></div>\`;
}
function hp_field(label, val) {
  if (!val) return '';
  return \`<div class="copy-field"><span class="copy-label">\${esc(label)}</span><span class="copy-value">\${esc(val)}</span></div>\`;
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  appState = await api('GET', '/api/state');
  updateSidebar(appState);
  renderCurrentStep(appState);
  // Resume polling if a step was running
  const anyRunning = Object.values(appState.steps).some(s => s.status === 'running');
  if (anyRunning) startPolling();
})();
</script>
</body>
</html>`;
}
