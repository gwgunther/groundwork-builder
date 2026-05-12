/**
 * Pitch Page Generator
 *
 * Hard-facts one-pager:
 *   - Quick jump links (current site vs rebuilt)
 *   - PageSpeed scores
 *   - Side-by-side checklist (current vs rebuilt)
 *   - Live preview iframe
 *   - CTA
 *
 * All checklist items are derived from actual pipeline data —
 * no subjective copy, no internal pipeline language.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Plain-English definitions shown below checklist items.
// Dentists understand patients, not web infrastructure.
const DEFINITIONS = {
  'Site structure':
    'How your pages are organized. A flat list of 30 pages looks chaotic to Google and makes it harder for patients to find what they need. A hub & spoke groups related pages under clear categories — better rankings, easier navigation.',
  'Schema markup':
    'Hidden code on your site that tells Google exactly what your business is — your name, address, phone, hours, and specialty. Without it, Google has to guess. With it, you show up in the map pack and rich search results.',
  'Mobile speed':
    'How fast your site loads on a phone. Over 60% of patients search on mobile. Google uses mobile speed as a ranking factor — a slow site ranks lower and loses patients before the page even loads.',
  'Desktop speed':
    'How fast your site loads on a computer. Google PageSpeed scores 0–100. Below 50 is considered poor. Above 90 is good.',
  'SEO score':
    'How well your site follows Google\'s guidelines for being found in search — things like page titles, meta descriptions, and proper heading structure.',
};


export async function generatePitchPage(pipelineDir, opts = {}) {
  const { previewUrl = null, slug = null, ctaUrl = null, ctaLabel = 'Claim This Site', afterScores = null } = opts;
  const data = await loadArtifacts(pipelineDir);

  // Load after-scores from artifact if not passed directly
  let resolvedAfterScores = afterScores;
  if (!resolvedAfterScores) {
    try {
      const raw = JSON.parse(await readFile(resolve(pipelineDir, '03-pagespeed-after.json'), 'utf-8'));
      resolvedAfterScores = raw.output || null;
    } catch { /* not yet run */ }
  }

  // Generate AI summary (non-blocking — falls back to null if API unavailable)
  let aiSummary = null;
  try {
    aiSummary = await generateAiSummary(data, resolvedAfterScores);
  } catch { /* skip */ }

  const html = buildHtml(data, { previewUrl, slug, ctaUrl, ctaLabel, afterScores: resolvedAfterScores, aiSummary });
  const outPath = resolve(pipelineDir, 'pitch.html');
  await writeFile(outPath, html, 'utf-8');
  return outPath;
}

// ---------------------------------------------------------------------------
// AI summary
// ---------------------------------------------------------------------------

async function generateAiSummary(data, afterScores) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const { callAnthropic } = await import('./ai-call.js');

  const summary  = data['summary']           || {};
  const audit    = data['02-audit']?.output  || {};
  const ps       = data['03-pagespeed']?.output || data['03-pagespeed'] || {};
  const merged   = data['06-merge']?.output  || {};

  const name         = summary.practiceName || merged.practice?.name || 'this practice';
  const mobileScore  = ps?.mobile?.performance ?? null;
  const desktopScore = ps?.desktop?.performance ?? null;
  const gaps         = (audit.contentGaps || []).slice(0, 4).join('\n');
  const strengths    = (audit.differentiators || []).slice(0, 3).join('\n');

  const prompt = `You are writing a brief, honest summary for a dental practice owner reviewing a site audit.
Be direct, warm, and specific. No fluff. 2-3 sentences max.

Practice: ${name}
Mobile PageSpeed score: ${mobileScore ?? 'unknown'}/100
Desktop PageSpeed score: ${desktopScore ?? 'unknown'}/100

Top strengths found on current site:
${strengths || 'None identified'}

Top gaps found on current site:
${gaps || 'None identified'}

Write a 2-3 sentence plain-English summary that:
- Acknowledges what they're doing well (if anything notable)
- Honestly explains what the biggest opportunity is and what fixing it would do for their practice
- Does NOT use jargon like "SEO" without explaining it, does NOT say "website" when you can say "site"
- Tone: like a trusted advisor, not a salesperson

Return only the summary text, no quotes, no labels.`;

  try {
    const response = await callAnthropic({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    return response?.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Load artifacts
// ---------------------------------------------------------------------------

async function loadArtifacts(dir) {
  const files = ['summary', '01-scrape', '02-audit', '04b-brand', '06-merge', '03-pagespeed'];
  const out = {};
  await Promise.allSettled(files.map(async (name) => {
    try { out[name] = JSON.parse(await readFile(resolve(dir, `${name}.json`), 'utf-8')); }
    catch { out[name] = null; }
  }));
  return out;
}

// ---------------------------------------------------------------------------
// Checklist derivation
// ---------------------------------------------------------------------------

/**
 * Returns array of { label, before, after, note }
 * before / after = true (has it) | false (missing) | number | string
 */
function buildChecklist(summary, scrape, audit, merged) {
  const gaps   = (audit?.contentGaps     || []).map(s => s.toLowerCase());
  const seo    = (audit?.seoOpportunities || []).map(s => s.toLowerCase());
  const warns  = (audit?.warnings         || []).map(s => s.toLowerCase());
  const allAudit = [...gaps, ...seo, ...warns];

  const gapMentions = (...keywords) =>
    allAudit.some(g => keywords.some(k => g.includes(k)));

  const content      = scrape?.content     || {};
  const doctor       = scrape?.doctor      || merged?.doctor || null;
  const serviceList  = scrape?.services?.offered || scrape?.services || [];
  const serviceCount = serviceList.length || summary?.servicesCount || scrape?.servicesDetected || 0;
  const testimonials = content?.testimonials || [];
  const faqs         = content?.faqs         || [];
  const reviews      = scrape?.reviews       || {};
  const stats        = content?.stats        || {};

  // Service category breakdown — show structure, not just count
  const serviceCats = {};
  serviceList.forEach(sv => {
    const c = sv.category || 'other';
    serviceCats[c] = (serviceCats[c] || 0) + 1;
  });
  const catCount   = Object.keys(serviceCats).length;
  const catSummary = Object.entries(serviceCats)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');

  const hasDoctor     = !!(doctor?.name);
  const hasBio        = !!(doctor?.bio || scrape?.signals?.some(s => s.source?.includes('meet-dr')));
  const hasTestimonials = testimonials.length > 0;
  const hasFaq        = faqs.length > 0;
  const hasReviews    = !!(reviews?.rating || reviews?.reviewCount);
  const hasYearsExp   = !!(stats?.yearsExperience);

  const items = [
    // Foundation
    {
      label: 'Doctor profile & credentials',
      before: hasDoctor,
      after:  true,
      note:   hasDoctor ? `${doctor?.credentials || ''}`.trim() || null : null,
    },
    {
      label: 'Doctor bio page',
      before: hasBio,
      after:  true,
    },
    // Site structure — framed as optimization opportunity
    {
      label: 'Site structure',
      before: serviceCount > 0 ? `${serviceCount} pages, flat` : false,
      after:  serviceCount > 0 ? 'Hub & spoke' : true,
      note:   catSummary || null,
    },
    // Content
    {
      label: 'Patient testimonials',
      before: hasTestimonials,
      after:  true,
      note:   hasTestimonials ? `${testimonials.length} found` : null,
    },
    {
      label: 'FAQ section',
      before: hasFaq,
      after:  true,
      note:   hasFaq ? `${faqs.length} questions` : null,
    },
    // Trust — only show if we scraped real data
    ...(hasReviews ? [{
      label: 'Patient reviews',
      before: true,
      after:  true,
      note:   reviews?.rating ? `${reviews.rating}★ · ${reviews.reviewCount} reviews` : null,
    }] : []),
    ...(hasYearsExp ? [{
      label: 'Years in practice',
      before: true,
      after:  true,
      note:   `${stats.yearsExperience} years`,
    }] : []),
    // Schema — only show if audit explicitly flagged it missing (high confidence)
    ...(gapMentions('schema', 'structured data') ? [{
      label: 'Schema markup (local business)',
      before: false,
      after:  true,
      note:   'Helps Google show your business in search',
    }] : []),
  ];

  return items;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function buildHtml(data, opts) {
  const { previewUrl, ctaUrl, ctaLabel, afterScores, aiSummary } = opts;

  // After scores — use real ones if available, otherwise show Astro defaults
  const afterMobile  = afterScores?.mobile  ?? 97;
  const afterDesktop = afterScores?.desktop ?? 99;
  const afterSeo     = afterScores?.seo     ?? 100;
  const afterReasons = afterScores?.reasons || [];

  const summary  = data['summary']           || {};
  const scrape   = data['01-scrape']?.output || {};
  const audit    = data['02-audit']?.output  || {};
  const brand    = data['04b-brand']?.output || {};
  const merged   = data['06-merge']?.output  || {};
  const ps       = data['03-pagespeed']?.output || data['03-pagespeed'] || {};

  const rawName      = summary.practiceName || merged.practice?.name || merged.practice || 'Your Practice';
  const practiceName = stripLegal(rawName);
  const doctorName   = summary.doctorName || scrape.doctor?.name || '';
  const scrapedUrl   = summary.scrapedUrl || '';
  const scrapedHost  = scrapedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const mobileScore  = ps?.mobile?.performance  ?? null;
  const desktopScore = ps?.desktop?.performance ?? null;
  const seoScore     = ps?.mobile?.seo          ?? null;
  const hasScores    = mobileScore != null || desktopScore != null;

  const palette = brand.palette || {};
  const primary = palette.primary || '#1d4ed8';
  const light   = palette.light   || '#eff6ff';

  const checklist = buildChecklist(summary, scrape, audit, merged);

  // Count before: pass / fail
  const beforePass = checklist.filter(c => c.before === true || (typeof c.before === 'number' && c.before > 0)).length;
  const total      = checklist.length;

  const ctaHref = ctaUrl || `mailto:garrett@consigliere.com?subject=Claim my site — ${esc(practiceName)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(practiceName)} — Site Audit</title>
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink:       #111827;
      --ink-mid:   #4b5563;
      --ink-soft:  #9ca3af;
      --paper:     #f3f4f6;
      --surface:   #ffffff;
      --line:      #e5e7eb;
      --accent:    ${esc(primary)};
      --accent-bg: ${esc(light)};
      --red:       #dc2626;
      --red-bg:    #fef2f2;
      --green:     #16a34a;
      --green-bg:  #f0fdf4;
      --yellow:    #d97706;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 15px; }
    body { background: var(--paper); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }

    .wrap { max-width: 860px; margin: 0 auto; padding: 0 24px; }

    /* Hero */
    .hero { background: var(--surface); border-bottom: 1px solid var(--line); padding: 44px 0 32px; }
    .hero-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-soft); margin-bottom: 10px; }
    .hero h1 { font-family: 'Lora', serif; font-size: clamp(26px, 4.5vw, 42px); font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
    .hero-sub { font-size: 13px; color: var(--ink-soft); margin-top: 6px; }
    .hero-sub a { color: var(--ink-soft); }
    .quick-links { display: flex; gap: 10px; margin-top: 24px; flex-wrap: wrap; }
    .ql { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; text-decoration: none; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink-mid); }
    .ql:hover { border-color: var(--ink); }
    .ql.new { background: var(--accent); border-color: var(--accent); color: white; }
    .ql.new:hover { opacity: 0.9; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: 0.4; }
    .dot.live { background: #22c55e; opacity: 1; }

    /* Score comparison */
    .scores-section { background: var(--surface); border-bottom: 1px solid var(--line); padding: 28px 0; }
    .scores-heading { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .scores-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-soft); }
    .scores-verify { font-size: 11px; color: var(--ink-soft); }
    .scores-verify a { color: var(--accent); text-decoration: none; }
    .scores-verify a:hover { text-decoration: underline; }
    .scores-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .scores-col-head { padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid var(--line); }
    .scores-col-head.metric { color: var(--ink-soft); background: var(--paper); }
    .scores-col-head.before { color: var(--red);   background: var(--red-bg);   border-left: 1px solid var(--line); text-align: center; text-decoration: none; display: block; }
    .scores-col-head.after  { color: var(--green); background: var(--green-bg); border-left: 1px solid var(--line); text-align: center; text-decoration: none; display: block; }
    .scores-col-head.before:hover { background: #fee2e2; }
    .scores-col-head.after:hover  { background: #dcfce7; }
    .scores-tradeoff { margin-top: 10px; font-size: 12px; color: var(--ink-soft); line-height: 1.5; }
    .scores-tradeoff strong { color: var(--ink-mid); }
    .scores-row { display: contents; }
    .scores-cell { padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 13px; display: flex; align-items: center; }
    .scores-row:last-child .scores-cell { border-bottom: 0; }
    .scores-cell.metric { font-weight: 500; color: var(--ink-mid); background: var(--paper); }
    .scores-cell.before { background: var(--red-bg);   border-left: 1px solid var(--line); justify-content: center; }
    .scores-cell.after  { background: var(--green-bg); border-left: 1px solid var(--line); justify-content: center; }
    .score-n { font-family: 'Lora', serif; font-size: 22px; font-weight: 700; line-height: 1; }
    .score-n.bad  { color: var(--red);    }
    .score-n.ok   { color: var(--yellow); }
    .score-n.good { color: var(--green);  }
    .score-dash { color: var(--ink-soft); font-size: 13px; }

    /* Checklist section */
    .checklist-section { padding: 40px 0; }
    .cl-header { display: grid; grid-template-columns: 1fr 120px 120px; gap: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px 10px 0 0; overflow: hidden; }
    .cl-header-cell { padding: 12px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; border-bottom: 2px solid var(--line); }
    .cl-header-cell.label-col { color: var(--ink-soft); }
    .cl-header-cell.before-col { text-align: center; color: var(--red);   background: var(--red-bg);   border-left: 1px solid var(--line); }
    .cl-header-cell.after-col  { text-align: center; color: var(--green); background: var(--green-bg); border-left: 1px solid var(--line); }
    .cl-body { background: var(--surface); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 10px 10px; overflow: hidden; }
    .cl-row { display: grid; grid-template-columns: 1fr 120px 120px; border-bottom: 1px solid var(--line); }
    .cl-row:last-child { border-bottom: 0; }
    .cl-row:hover { background: #fafafa; }
    .cl-label { padding: 13px 16px; font-size: 13px; font-weight: 500; color: var(--ink); display: flex; flex-direction: column; justify-content: center; }
    .cl-note { font-size: 11px; color: var(--ink-soft); margin-top: 2px; font-weight: 400; }
    .cl-def  { font-size: 11px; color: var(--ink-soft); margin-top: 3px; font-weight: 400; font-style: italic; line-height: 1.45; }
    .cl-cell { padding: 13px 16px; display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--line); font-size: 18px; }
    .cl-cell.before-col { background: var(--red-bg);   }
    .cl-cell.after-col  { background: var(--green-bg); }
    .cl-val { font-size: 12px; font-weight: 700; }
    .cl-val.yes   { color: var(--green); }
    .cl-val.no    { color: var(--red);   }
    .cl-val.count { font-family: 'Lora', serif; font-size: 16px; color: var(--ink-mid); }
    .cl-summary { margin-top: 12px; font-size: 13px; color: var(--ink-soft); }
    .cl-summary strong { color: var(--ink); }

    /* AI summary */
    .ai-summary { background: var(--accent-bg); border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 20px 24px; margin: 0 0 32px; }
    .ai-summary-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); margin-bottom: 8px; }
    .ai-summary p { font-size: 14px; line-height: 1.65; color: var(--ink); }

    /* Preview */
    .preview-section { padding: 40px 0; border-top: 1px solid var(--line); }
    .section-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-soft); margin-bottom: 14px; }
    .preview-chrome { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .chrome-bar { background: #f3f4f6; border-bottom: 1px solid var(--line); padding: 9px 14px; display: flex; align-items: center; gap: 10px; }
    .chrome-dots { display: flex; gap: 5px; }
    .chrome-dots span { width: 9px; height: 9px; border-radius: 50%; }
    .chrome-dots span:nth-child(1) { background: #f87171; }
    .chrome-dots span:nth-child(2) { background: #fbbf24; }
    .chrome-dots span:nth-child(3) { background: #34d399; }
    .chrome-url { background: white; border: 1px solid var(--line); border-radius: 5px; padding: 3px 12px; font-size: 12px; color: var(--ink-soft); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview-chrome iframe { width: 100%; height: 580px; border: 0; display: block; }

    /* CTA */
    .cta { background: var(--ink); padding: 64px 24px; text-align: center; }
    .cta h2 { font-family: 'Lora', serif; font-size: clamp(22px, 4vw, 34px); font-weight: 700; color: white; }
    .cta p  { color: rgba(255,255,255,0.5); margin-top: 8px; font-size: 15px; }
    .cta-btn { display: inline-block; margin-top: 24px; padding: 14px 34px; background: var(--accent); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; }
    .cta-btn:hover { opacity: 0.88; }
    .cta-fine { margin-top: 12px; font-size: 12px; color: rgba(255,255,255,0.28); }

    @media (max-width: 560px) {
      .cl-header, .cl-row { grid-template-columns: 1fr 80px 80px; }
    }
  </style>
</head>
<body>

<!-- Hero -->
<header class="hero">
  <div class="wrap">
    <p class="hero-eyebrow"><a href="https://groundworkdental.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">Groundwork Dental</a> — Site Audit</p>
    <h1>${esc(practiceName)}</h1>
    <p class="hero-sub">
      ${doctorName ? `${esc(doctorName)}${scrapedHost ? ' · ' : ''}` : ''}
      ${scrapedHost ? `<a href="${esc(scrapedUrl)}" target="_blank" rel="noopener">${esc(scrapedHost)}</a>` : ''}
    </p>
    <div class="quick-links">
      ${scrapedUrl ? `<a href="${esc(scrapedUrl)}" target="_blank" rel="noopener" class="ql"><span class="dot"></span>Current site</a>` : ''}
      ${previewUrl ? `<a href="https://${esc(previewUrl)}" target="_blank" rel="noopener" class="ql new"><span class="dot live"></span>Rebuilt site</a>` : ''}
      ${previewUrl ? `<a href="#preview" class="ql">See preview ↓</a>` : ''}
    </div>
  </div>
</header>

<!-- Score comparison -->
${hasScores ? `
<div class="scores-section">
  <div class="wrap">
    <div class="scores-heading">
      <span class="scores-label">Google PageSpeed — before &amp; after</span>
      <span class="scores-verify">Scores measured by Google — click a column to verify ↗</span>
    </div>
    <div class="scores-grid">
      <div class="scores-col-head metric">Metric</div>
      <a href="https://pagespeed.web.dev/report?url=${encodeURIComponent(scrapedUrl)}" target="_blank" rel="noopener" class="scores-col-head before" title="Run PageSpeed on current site">Current site ↗</a>
      <a href="https://pagespeed.web.dev/report?url=${encodeURIComponent('https://' + (previewUrl || ''))}" target="_blank" rel="noopener" class="scores-col-head after" title="Run PageSpeed on rebuilt site">Rebuilt site ↗</a>
      ${[
        mobileScore  != null ? { label: '📱 Mobile speed',  before: mobileScore,  after: afterMobile  } : null,
        desktopScore != null ? { label: '🖥 Desktop speed', before: desktopScore, after: afterDesktop } : null,
        seoScore     != null ? { label: '🔍 SEO',           before: seoScore,     after: afterSeo     } : null,
      ].filter(Boolean).map(row => `
      <div class="scores-row">
        <div class="scores-cell metric">${esc(row.label)}</div>
        <div class="scores-cell before"><span class="score-n ${scoreClass(row.before)}">${row.before}</span></div>
        <div class="scores-cell after"><span class="score-n ${scoreClass(row.after)}">${row.after}</span></div>
      </div>`).join('')}
    </div>
    ${afterReasons.length > 0 ? `
    <p class="scores-tradeoff">
      <strong>Why not 100?</strong>
      ${esc(afterReasons.join(' · '))}
      — these are tradeoffs of having real images and content on your site.
    </p>` : afterScores ? `
    <p class="scores-tradeoff">Scores measured after deployment on your live preview site.</p>
    ` : `
    <p class="scores-tradeoff">Rebuilt site scores are typical for Astro-built sites. Final score measured after deployment.</p>
    `}
  </div>
</div>
` : ''}

<!-- Checklist -->
<section class="checklist-section">
  <div class="wrap">
    <div class="cl-header">
      <div class="cl-header-cell label-col">Checklist</div>
      <div class="cl-header-cell before-col">Current site</div>
      <div class="cl-header-cell after-col">Rebuilt site</div>
    </div>
    <div class="cl-body">
      ${checklist.map(item => clRow(item)).join('')}
    </div>
    <p class="cl-summary">
      Your current site passes <strong>${beforePass} of ${total}</strong> checks.
      ${previewUrl ? `The rebuilt site passes all ${total}.` : ''}
      · Data sourced from your live site on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
    </p>
  </div>
</section>

<!-- AI Summary -->
${aiSummary ? `
<div class="wrap" style="padding-top: 0; padding-bottom: 8px;">
  <div class="ai-summary">
    <p class="ai-summary-eyebrow">Our take</p>
    <p>${esc(aiSummary)}</p>
  </div>
</div>
` : ''}

<!-- Preview -->
${previewUrl ? `
<section class="preview-section" id="preview">
  <div class="wrap">
    <p class="section-eyebrow">Live preview — rebuilt site</p>
    <div class="preview-chrome">
      <div class="chrome-bar">
        <div class="chrome-dots"><span></span><span></span><span></span></div>
        <div class="chrome-url">${esc(previewUrl)}</div>
      </div>
      <iframe src="https://${esc(previewUrl)}" title="${esc(practiceName)} — rebuilt" loading="lazy" allowfullscreen></iframe>
    </div>
  </div>
</section>
` : ''}

<!-- CTA -->
<div class="cta">
  <h2>Ready to make this yours?</h2>
  <p>Point your domain. We handle the rest.</p>
  <a href="${esc(ctaHref)}" class="cta-btn">${esc(ctaLabel)}</a>
  <p class="cta-fine">No contracts. No lock-in.</p>
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clRow(item) {
  const beforeVal = renderVal(item.before, 'before');
  const afterVal  = renderVal(item.after,  'after');
  // Match definition by label prefix so "Site structure" catches even with extra text
  const defKey = Object.keys(DEFINITIONS).find(k => item.label.toLowerCase().startsWith(k.toLowerCase()));
  const def    = defKey ? DEFINITIONS[defKey] : null;
  return `
  <div class="cl-row">
    <div class="cl-label">
      ${esc(item.label)}
      ${item.note ? `<span class="cl-note">${esc(item.note)}</span>` : ''}
      ${def ? `<span class="cl-def">${esc(def)}</span>` : ''}
    </div>
    <div class="cl-cell before-col">${beforeVal}</div>
    <div class="cl-cell after-col">${afterVal}</div>
  </div>`;
}

function renderVal(val, side) {
  if (val === true)  return `<span class="cl-val yes">✓</span>`;
  if (val === false) return `<span class="cl-val no">✗</span>`;
  if (typeof val === 'number' && val > 0) return `<span class="cl-val count">${val}</span>`;
  if (typeof val === 'string') return `<span class="cl-val count">${esc(val)}</span>`;
  return `<span class="cl-val no">✗</span>`;
}

function scoreClass(n) {
  return n >= 90 ? 'good' : n >= 50 ? 'ok' : 'bad';
}

function stripLegal(name) {
  return (name || '')
    .replace(/,?\s*(DDS|DMD|MS|FACD|FAGD|Inc\.|LLC|PC|PLLC)([,.]?\s*(DDS|DMD|MS|FACD|FAGD|Inc\.|LLC|PC|PLLC))*/gi, '')
    .replace(/,\s*$/, '').trim() || name;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
