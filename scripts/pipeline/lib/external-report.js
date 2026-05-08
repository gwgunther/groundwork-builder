/**
 * External report generator
 *
 * Reads _pipeline/*.json artifacts and produces _pipeline/external-report.html
 * — a comprehensive, practice-owner-facing document. Unlike the internal
 * report, this NEVER embeds raw prompts, JSON dumps, AI metadata, or pipeline
 * mechanics; everything reads as findings/decisions, not telemetry.
 *
 * Sections:
 *   1. Executive summary       — practice + overall verdict
 *   2. Audit of existing site  — every finding, severity-organized
 *   3. Brand & design direction — full brand brief + rationale
 *   4. What we built           — architecture decisions (archetype, sections)
 *   5. Quality scores          — Designer Agent rubric, dimension by dimension
 *   6. Action items            — everything from the missing report + audit
 *                                recommendations not auto-fixed
 *   7. Engagement              — pitch boilerplate (closing)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PITCH_PATH = resolve(__dirname, '..', 'config', 'pitch.md');

export async function generateExternalReport(pipelineDir) {
  const data = await loadArtifacts(pipelineDir);
  const pitch = await loadPitch();
  const html = buildHtml(data, pitch);
  await writeFile(resolve(pipelineDir, 'external-report.html'), html, 'utf-8');
}

async function loadArtifacts(pipelineDir) {
  const files = ['summary', '01-scrape', '02-audit', '04-design', '04b-brand', '05-director', '06-merge', 'missing'];
  const out = {};
  await Promise.allSettled(files.map(async (name) => {
    try {
      const raw = await readFile(resolve(pipelineDir, `${name}.json`), 'utf-8');
      out[name] = JSON.parse(raw);
    } catch {
      out[name] = null;
    }
  }));
  try {
    const raw = await readFile(resolve(pipelineDir, '10-agent.json'), 'utf-8');
    out['10-agent'] = JSON.parse(raw)?.output || null;
  } catch {
    out['10-agent'] = null;
  }
  try {
    const raw = await readFile(resolve(pipelineDir, '11-seo-audit.json'), 'utf-8');
    out['11-seo-audit'] = JSON.parse(raw)?.output || null;
  } catch {
    out['11-seo-audit'] = null;
  }
  return out;
}

async function loadPitch() {
  try {
    const raw = await readFile(PITCH_PATH, 'utf-8');
    // Reuse the parser via dynamic import to avoid duplication
    const { parsePitch } = await import('./pitch-parser.js');
    return parsePitch(raw);
  } catch {
    return null;
  }
}

function buildHtml(data, pitch) {
  const summary = data['summary'] || {};
  const audit = data['02-audit']?.output || {};
  const design = data['04-design']?.output || {};
  const brand = data['04b-brand']?.output || {};
  const director = data['05-director']?.output || {};
  const merged = data['06-merge']?.output || {};
  const missing = data['missing']?.output || data['missing'] || {};
  const agent = data['10-agent'] || {};
  const seoAudit = data['11-seo-audit'] || null;

  const practiceName = summary.practiceName || merged.practice?.name || 'Site Audit';
  const doctorName = summary.doctorName || merged.doctor?.name || '';
  const cityState = [merged.address?.city, merged.address?.state].filter(Boolean).join(', ');
  const palette = brand.palette || {};
  const fonts = brand.typography || {};
  const finalScoreObj = agent?.finalScore || {};
  const overallScore = finalScoreObj.overall ?? null;
  const dimensions = finalScoreObj.dimensions || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(practiceName)} — Site Redesign Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #1a1f1c;
      --ink-soft: #4a5650;
      --paper: #faf8f4;
      --line: #e3ddd2;
      --accent: ${esc(palette.primary || '#4a7c6f')};
      --accent-soft: ${esc(palette.light || '#f4faf7')};
      --warn: #c4780a;
      --crit: #b04545;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.6; }
    a { color: var(--accent); }
    .page { max-width: 920px; margin: 0 auto; padding: 56px 48px 96px; }
    .toc { position: sticky; top: 0; background: var(--paper); padding: 16px 0; border-bottom: 1px solid var(--line); margin-bottom: 32px; font-size: 12px; }
    .toc a { color: var(--ink-soft); margin-right: 18px; text-decoration: none; }
    .toc a:hover { color: var(--accent); }
    h1, h2, h3, h4 { font-family: 'Lora', Georgia, serif; font-weight: 700; color: var(--ink); margin: 0 0 12px; }
    h1 { font-size: 38px; line-height: 1.1; letter-spacing: -0.01em; }
    h2 { font-size: 26px; line-height: 1.2; margin-top: 0; }
    h3 { font-size: 17px; }
    h4 { font-size: 14px; font-family: 'Inter', sans-serif; font-weight: 600; }
    p { margin: 0 0 12px; }
    ul, ol { margin: 0 0 12px; padding-left: 22px; }
    li { margin-bottom: 6px; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: var(--ink-soft); font-weight: 600; margin-bottom: 6px; }
    .meta-row { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--ink-soft); margin-top: 8px; }
    section { padding: 40px 0; border-top: 1px solid var(--line); }
    section:first-of-type { border-top: 0; padding-top: 0; }
    .card { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 24px; margin-bottom: 16px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .swatch { width: 100%; height: 56px; border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--line); }
    .swatch-label { font-size: 11px; color: var(--ink-soft); display: flex; justify-content: space-between; }
    .severity { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 8px; }
    .sev-critical { background: #fbe9e9; color: var(--crit); }
    .sev-important { background: #fbf2e3; color: var(--warn); }
    .sev-optional { background: var(--accent-soft); color: var(--accent); }
    .finding { padding: 16px 0; border-bottom: 1px solid var(--line); }
    .finding:last-child { border-bottom: 0; }
    .finding-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .finding-body { color: var(--ink-soft); font-size: 13px; }
    .score-row { display: grid; grid-template-columns: 1fr auto 240px; gap: 16px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .score-row:last-child { border-bottom: 0; }
    .score-bar { background: var(--line); height: 6px; border-radius: 3px; overflow: hidden; }
    .score-bar > div { background: var(--accent); height: 100%; }
    .score-num { font-family: 'Lora', serif; font-weight: 700; font-size: 18px; color: var(--accent); min-width: 40px; text-align: right; }
    .pitch-card { background: var(--accent-soft); border: 1px solid var(--accent); border-radius: 12px; padding: 32px; }
    .pitch-card h2 { color: var(--accent); }
    .vp-list { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 20px 0; }
    .vp-title { font-weight: 600; margin-bottom: 4px; }
    .vp-body { font-size: 13px; color: var(--ink-soft); }
    @media print { .toc { display: none; } body { background: white; } .page { padding: 24px; } }
    @media (max-width: 720px) { .page { padding: 32px 20px; } .grid-2, .grid-3, .vp-list { grid-template-columns: 1fr; } .score-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="page">

    <nav class="toc">
      <a href="#summary">Summary</a>
      <a href="#audit">Audit</a>
      <a href="#brand">Brand</a>
      <a href="#built">What we built</a>
      ${seoAudit ? '<a href="#seo">SEO</a>' : ''}
      <a href="#scores">Scores</a>
      <a href="#actions">Action items</a>
      <a href="#engagement">Engagement</a>
    </nav>

    <section id="summary">
      <p class="eyebrow">Site redesign report</p>
      <h1>${esc(practiceName)}</h1>
      <div class="meta-row">
        ${doctorName ? `<span>${esc(doctorName)}</span>` : ''}
        ${cityState ? `<span>${esc(cityState)}</span>` : ''}
        ${summary.scrapedUrl ? `<span><a href="${esc(summary.scrapedUrl)}">${esc(summary.scrapedUrl)}</a></span>` : ''}
      </div>
      <p style="margin-top: 18px; font-size: 16px; line-height: 1.55;">${esc(describeVerdict(audit))}</p>
    </section>

    <section id="audit">
      <p class="eyebrow">Audit of existing site</p>
      <h2>What's working — and what isn't</h2>
      ${audit.summary || audit.overallAssessment ? `<p style="color: var(--ink-soft);">${esc(audit.summary || audit.overallAssessment)}</p>` : ''}
      ${renderFindingsBuckets(audit)}
    </section>

    <section id="brand">
      <p class="eyebrow">Brand &amp; design direction</p>
      <h2>${esc(brand.mood || 'A new direction')}</h2>
      ${brand.rationale ? `<p style="color: var(--ink-soft); margin-bottom: 24px;">${esc(brand.rationale)}</p>` : ''}

      <div class="grid-2">
        <div class="card">
          <h3>Palette</h3>
          <div class="grid-3" style="margin-top: 12px;">
            ${['primary', 'secondary', 'accent', 'dark', 'light', 'muted'].filter(k => palette[k]).map(k => `
              <div>
                <div class="swatch" style="background: ${esc(palette[k])};"></div>
                <div class="swatch-label"><span>${k}</span><span>${esc(palette[k])}</span></div>
              </div>
            `).join('')}
          </div>
          ${brand.contrastCheck ? `<p style="margin-top: 16px; font-size: 12px; color: var(--ink-soft);"><strong>Contrast:</strong> ${esc(brand.contrastCheck)}</p>` : ''}
        </div>

        <div class="card">
          <h3>Typography</h3>
          ${fonts.heading ? `<p style="margin-top: 12px; font-family: 'Lora', serif; font-size: 22px; line-height: 1.1;">${esc(stripDesc(fonts.heading))}</p><p style="font-size: 12px; color: var(--ink-soft);">${esc(descOf(fonts.heading))}</p>` : ''}
          ${fonts.body ? `<p style="margin-top: 16px; font-size: 16px;">${esc(stripDesc(fonts.body))}</p><p style="font-size: 12px; color: var(--ink-soft);">${esc(descOf(fonts.body))}</p>` : ''}
        </div>
      </div>

      ${brand.voice ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Voice &amp; tone</h3>
          ${brand.voice.headline_style ? `<p style="margin-top: 8px;"><strong>Headlines:</strong> ${esc(brand.voice.headline_style)}</p>` : ''}
          ${brand.voice.cta_language ? `<p><strong>CTAs:</strong> ${esc(brand.voice.cta_language)}</p>` : ''}
          ${brand.voice.tone_notes ? `<p style="color: var(--ink-soft);">${esc(brand.voice.tone_notes)}</p>` : ''}
        </div>
      ` : ''}
    </section>

    <section id="built">
      <p class="eyebrow">What we built</p>
      <h2>Architecture &amp; layout decisions</h2>
      ${director.creativeDirection ? `<p style="color: var(--ink-soft); margin-bottom: 24px; font-style: italic;">"${esc(director.creativeDirection)}"</p>` : ''}
      <div class="grid-2">
        <div class="card">
          <h4 style="text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-size: 11px;">Archetype</h4>
          <p style="font-family: 'Lora', serif; font-size: 18px; font-weight: 700; margin-top: 4px;">${esc(director.archetype || '—')}</p>
          <p style="font-size: 12px; color: var(--ink-soft);">Hero: ${esc(director.heroVariant || '—')} · Density: ${esc(director.density || '—')} · Radius: ${esc(director.radius || '—')}</p>
        </div>
        <div class="card">
          <h4 style="text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-size: 11px;">Section order</h4>
          <p style="margin-top: 4px;">${(director.sectionOrder || []).map(s => `<span style="display: inline-block; background: var(--accent-soft); color: var(--accent); padding: 3px 10px; border-radius: 999px; font-size: 12px; margin: 2px 4px 2px 0;">${esc(s)}</span>`).join('')}</p>
        </div>
      </div>
      ${director.divergenceRationale ? `<p style="margin-top: 16px; color: var(--ink-soft);"><strong>Why this direction:</strong> ${esc(director.divergenceRationale)}</p>` : ''}
    </section>

    ${seoAudit ? `
    <section id="seo">
      <p class="eyebrow">SEO &amp; AI discoverability</p>
      <h2>How well the rebuilt site ranks across ${seoAudit.pageCount} pages</h2>
      <p style="color: var(--ink-soft);">
        Overall: <strong style="color: var(--accent); font-size: 20px; font-family: 'Lora', serif;">${esc(seoAudit.overall)}/10</strong>
        &nbsp;·&nbsp; Traditional SEO: <strong>${esc(seoAudit.byLens?.traditional)}/10</strong>
        &nbsp;·&nbsp; AI / LLM: <strong>${esc(seoAudit.byLens?.ai)}/10</strong>
      </p>
      ${seoAudit.topIssues?.length ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Top opportunities</h3>
          <p style="font-size: 12px; color: var(--ink-soft); margin-bottom: 12px;">Highest-leverage fixes from the per-page audit. The full per-page breakdown lives in <code>_pipeline/11-seo-audit.json</code>.</p>
          ${seoAudit.topIssues.slice(0, 10).map(iss => `
            <div class="finding">
              <div class="finding-title">[${esc(iss.score)}/10] ${esc(iss.dimension)} <span style="font-weight: 400; color: var(--ink-soft); font-size: 12px;">on ${esc(iss.url)}</span></div>
              <div class="finding-body">${esc(iss.issue)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color: var(--ink-soft);">No SEO issues detected — every checked page passed every dimension.</p>'}
    </section>
    ` : ''}

    ${overallScore != null ? `
    <section id="scores">
      <p class="eyebrow">Quality scores — the rebuilt site</p>
      <h2>Rubric scoring across ${Object.keys(dimensions).length} dimensions</h2>
      <p style="color: var(--ink-soft);">Overall score: <strong style="color: var(--accent); font-size: 20px; font-family: 'Lora', serif;">${esc(overallScore)}/10</strong></p>
      <div class="card" style="margin-top: 16px;">
        ${Object.entries(dimensions).map(([k, v]) => {
          const score = typeof v === 'object' ? v.score : v;
          // Each dimension has { score, evidence: [...], gripes: [...] }.
          // For the external report we want a single readable note —
          // prefer the first gripe (what's wrong) and fall back to evidence.
          const note = typeof v === 'object'
            ? (Array.isArray(v.gripes) && v.gripes[0]) || (Array.isArray(v.evidence) && v.evidence[0]) || ''
            : '';
          const pct = (Number(score) || 0) * 10;
          return `
            <div class="score-row">
              <div>
                <div style="font-weight: 600;">${esc(prettyDim(k))}</div>
                ${note ? `<div style="font-size: 12px; color: var(--ink-soft); margin-top: 2px;">${esc(note)}</div>` : ''}
              </div>
              <div class="score-num">${esc(score)}</div>
              <div class="score-bar"><div style="width: ${pct}%;"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
    ` : ''}

    <section id="actions">
      <p class="eyebrow">Action items</p>
      <h2>What's still needed</h2>
      ${renderMissingBuckets(missing)}
      ${renderRecommendations(audit)}
    </section>

    ${pitch ? `
    <section id="engagement">
      <div class="pitch-card">
        <p class="eyebrow" style="color: var(--accent);">Working with us</p>
        <h2>${esc(pitch.headline)}</h2>
        ${pitch.subheadline ? `<p style="font-family: 'Lora', serif; font-size: 17px; margin-top: 8px;">${esc(pitch.subheadline)}</p>` : ''}
        <div class="vp-list">
          ${pitch.valueProps.map(vp => `
            <div>
              <div class="vp-title">${esc(vp.title)}</div>
              <div class="vp-body">${esc(vp.body)}</div>
            </div>
          `).join('')}
        </div>
        ${pitch.engagement?.whatYouGet?.length ? `
          <h3 style="margin-top: 20px;">What you get</h3>
          <ul>${pitch.engagement.whatYouGet.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ` : ''}
        ${pitch.engagement?.nextStep ? `<p style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--accent); font-weight: 500; color: var(--accent);">${esc(pitch.engagement.nextStep)}</p>` : ''}
      </div>
    </section>
    ` : ''}

  </main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function describeVerdict(audit) {
  if (!audit) return '';
  // positioning + tone are emitted as { current, recommended, rationale }.
  // For the lead paragraph of the report, prefer the diagnosis of the
  // existing site (current) — the recommended state is covered later.
  return audit.positioning?.current
    || audit.tone?.current
    || '';
}

function renderFindingsBuckets(audit) {
  if (!audit) return '<p style="color: var(--ink-soft);">No audit available.</p>';

  // The audit emits four useful arrays: contentGaps, warnings (often
  // higher-severity), seoOpportunities, and differentiators (positive).
  // Bucket them by severity for the external report.
  const buckets = [
    { label: 'Warnings', severity: 'critical', items: audit.warnings || [] },
    { label: 'Content gaps', severity: 'important', items: audit.contentGaps || [] },
    { label: 'SEO opportunities', severity: 'optional', items: audit.seoOpportunities || [] },
  ].filter(b => Array.isArray(b.items) && b.items.length > 0);

  if (buckets.length === 0) return '<p style="color: var(--ink-soft);">No specific findings recorded.</p>';

  return buckets.map(b => `
    <div class="card">
      <h3><span class="severity sev-${b.severity}">${b.label}</span> ${b.items.length} item${b.items.length === 1 ? '' : 's'}</h3>
      <div style="margin-top: 12px;">
        ${b.items.map(item => {
          if (typeof item === 'string') {
            const parts = item.split(/\s—\s/);
            const title = parts[0].trim();
            const body = parts.length > 1 ? parts.slice(1).join(' — ').trim() : '';
            return `<div class="finding"><div class="finding-title">${esc(title)}</div>${body ? `<div class="finding-body">${esc(body)}</div>` : ''}</div>`;
          }
          const t = item.title || item.issue || item.gap || 'Finding';
          const body = item.description || item.detail || item.why || item.recommendation || '';
          return `<div class="finding"><div class="finding-title">${esc(t)}</div>${body ? `<div class="finding-body">${esc(body)}</div>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function renderMissingBuckets(missing) {
  if (!missing) return '';
  const buckets = [
    { label: 'Critical', severity: 'critical', items: missing.critical || [] },
    { label: 'Important', severity: 'important', items: missing.important || [] },
    { label: 'Optional', severity: 'optional', items: missing.optional || [] },
  ].filter(b => Array.isArray(b.items) && b.items.length > 0);

  if (buckets.length === 0) return '<p style="color: var(--ink-soft);">No outstanding action items.</p>';

  return buckets.map(b => `
    <div class="card">
      <h3><span class="severity sev-${b.severity}">${b.label}</span> ${b.items.length} item${b.items.length === 1 ? '' : 's'}</h3>
      <div style="margin-top: 12px;">
        ${b.items.map(item => {
          const t = typeof item === 'string' ? item : (item.title || item.label || item.field || 'Item');
          const body = typeof item === 'object' ? (item.description || item.why || item.recommendation || '') : '';
          return `<div class="finding"><div class="finding-title">${esc(t)}</div>${body ? `<div class="finding-body">${esc(body)}</div>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function renderRecommendations(audit) {
  if (!audit) return '';
  const recs = audit.recommendations || audit.discussion || audit.openQuestions || [];
  if (!Array.isArray(recs) || recs.length === 0) return '';
  return `
    <div class="card">
      <h3>Recommendations &amp; discussion items</h3>
      <p style="font-size: 12px; color: var(--ink-soft); margin-bottom: 12px;">Items that benefit from a conversation rather than an automated fix.</p>
      ${recs.map(item => {
        const t = typeof item === 'string' ? item : (item.title || item.recommendation || item.question || 'Recommendation');
        const body = typeof item === 'object' ? (item.description || item.detail || item.why || '') : '';
        return `<div class="finding"><div class="finding-title">${esc(t)}</div>${body ? `<div class="finding-body">${esc(body)}</div>` : ''}</div>`;
      }).join('')}
    </div>
  `;
}

function stripDesc(s) { return s ? String(s).split('—')[0].trim() : ''; }
function descOf(s) {
  if (!s) return '';
  const parts = String(s).split('—');
  return parts.length > 1 ? parts.slice(1).join('—').trim() : '';
}

function prettyDim(k) {
  const map = {
    typography: 'Typography',
    color_contrast: 'Color & contrast',
    spatial_layout: 'Spatial & layout',
    information_hierarchy: 'Information hierarchy',
    craft: 'Craft',
    ux_writing: 'UX writing',
    distinctiveness: 'Distinctiveness',
    trust_signals: 'Trust signals',
  };
  return map[k] || k.replace(/_/g, ' ');
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
