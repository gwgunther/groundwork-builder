/**
 * One-pager generator
 *
 * Reads _pipeline/*.json artifacts and produces _pipeline/one-pager.html —
 * a single, pitch-ready page intended for the practice owner. Sections:
 *   1. Header        — practice name + redesign tagline
 *   2. Old site      — overall audit verdict + top 3 issues
 *   3. What we built — brand snapshot (palette + fonts + mood)
 *   4. What's left   — top 3 action items from the missing report
 *   5. Working with us — pitch boilerplate from config/pitch.md
 *
 * NEVER embeds raw prompts, JSON dumps, or pipeline metadata — that's the
 * internal report's job. Use this when sharing with the prospect.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PITCH_PATH = resolve(__dirname, '..', 'config', 'pitch.md');

export async function generateOnePager(pipelineDir) {
  const data = await loadArtifacts(pipelineDir);
  const pitch = await loadPitch();
  const html = buildHtml(data, pitch);
  await writeFile(resolve(pipelineDir, 'one-pager.html'), html, 'utf-8');
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

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
  // Designer Agent output (10-agent.json) — rubric scores
  try {
    const raw = await readFile(resolve(pipelineDir, '10-agent.json'), 'utf-8');
    out['10-agent'] = JSON.parse(raw)?.output || null;
  } catch {
    out['10-agent'] = null;
  }
  return out;
}

async function loadPitch() {
  try {
    const raw = await readFile(PITCH_PATH, 'utf-8');
    const { parsePitch } = await import('./pitch-parser.js');
    return parsePitch(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function buildHtml(data, pitch) {
  const summary = data['summary'] || {};
  const audit = data['02-audit']?.output || {};
  const brand = data['04b-brand']?.output || {};
  const director = data['05-director']?.output || {};
  const merged = data['06-merge']?.output || {};
  const missing = data['missing']?.output || data['missing'] || {};
  const agent = data['10-agent'] || {};

  const practiceName = summary.practiceName || merged.practice?.name || 'Site Redesign';
  const doctorName = summary.doctorName || merged.doctor?.name || '';
  const cityState = [merged.address?.city, merged.address?.state].filter(Boolean).join(', ');

  // Audit findings — top 3 issues from priorityFixes or topGaps
  const topIssues = collectTopIssues(audit);

  // Action items — top 3 from missing report
  const topMissing = collectTopMissing(missing);

  // Brand swatches
  const palette = brand.palette || {};
  const fonts = brand.typography || {};
  const fontHeading = stripDesc(fonts.heading);
  const fontBody = stripDesc(fonts.body);

  // Designer Agent score — finalScore is an object with { dimensions, overall, gate_pass, next_action }
  const finalScoreObj = agent?.finalScore || {};
  const overallScore = finalScoreObj.overall ?? null;
  const dimensions = finalScoreObj.dimensions || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(practiceName)} — Site Redesign Brief</title>
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
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.55; }
    .page { max-width: 880px; margin: 0 auto; padding: 56px 48px 96px; }
    .lead { font-family: 'Lora', Georgia, serif; font-weight: 500; }
    h1, h2, h3 { font-family: 'Lora', Georgia, serif; font-weight: 700; margin: 0; color: var(--ink); }
    h1 { font-size: 36px; line-height: 1.1; letter-spacing: -0.01em; }
    h2 { font-size: 22px; line-height: 1.2; margin-bottom: 12px; }
    h3 { font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: var(--ink-soft); font-weight: 600; }
    section { padding: 32px 0; border-top: 1px solid var(--line); }
    section:first-of-type { border-top: 0; padding-top: 0; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
    .swatch { width: 100%; height: 56px; border-radius: 6px; margin-bottom: 8px; border: 1px solid var(--line); }
    .swatch-label { font-size: 11px; color: var(--ink-soft); display: flex; justify-content: space-between; }
    .issue-list { list-style: none; padding: 0; margin: 0; }
    .issue-list li { padding: 14px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; }
    .issue-list li:last-child { border-bottom: 0; }
    .issue-num { font-family: 'Lora', serif; font-size: 18px; color: var(--accent); font-weight: 700; }
    .issue-title { font-weight: 600; margin-bottom: 4px; }
    .issue-body { color: var(--ink-soft); font-size: 13px; }
    .pitch-card { background: var(--accent-soft); border: 1px solid var(--accent); border-radius: 12px; padding: 32px; }
    .pitch-card h2 { color: var(--accent); }
    .vp-list { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .vp-title { font-weight: 600; margin-bottom: 4px; }
    .vp-body { font-size: 13px; color: var(--ink-soft); }
    .next-step { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--accent); font-weight: 500; color: var(--accent); }
    .meta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: var(--ink-soft); }
    .pill { background: var(--accent-soft); color: var(--accent); padding: 2px 10px; border-radius: 999px; font-weight: 500; font-size: 11px; }
    .score-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 12px; }
    .score-cell { text-align: center; padding: 8px 4px; background: white; border: 1px solid var(--line); border-radius: 6px; }
    .score-num { font-family: 'Lora', serif; font-size: 22px; font-weight: 700; color: var(--accent); }
    .score-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); margin-top: 4px; }
    @media print { body { background: white; } .page { max-width: 100%; padding: 24px; } }
    @media (max-width: 720px) { .page { padding: 32px 20px; } .grid-2, .grid-3, .vp-list { grid-template-columns: 1fr; } .score-grid { grid-template-columns: repeat(3, 1fr); } }
  </style>
</head>
<body>
  <main class="page">

    <section>
      <p class="eyebrow">Site redesign brief</p>
      <h1>${esc(practiceName)}</h1>
      <div class="meta-row">
        ${doctorName ? `<span>${esc(doctorName)}</span>` : ''}
        ${cityState ? `<span>${esc(cityState)}</span>` : ''}
        ${summary.scrapedUrl ? `<span><a href="${esc(summary.scrapedUrl)}" style="color:var(--ink-soft)">${esc(summary.scrapedUrl)}</a></span>` : ''}
      </div>
    </section>

    <section>
      <p class="eyebrow">Old site at a glance</p>
      <h2>${describeAuditVerdict(audit)}</h2>
      <ul class="issue-list">
        ${topIssues.map((iss, i) => `
          <li>
            <span class="issue-num">${i + 1}</span>
            <div>
              <div class="issue-title">${esc(iss.title)}</div>
              ${iss.body ? `<div class="issue-body">${esc(iss.body)}</div>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </section>

    <section>
      <p class="eyebrow">What we built</p>
      <h2>${esc(brand.mood || 'A new direction')}</h2>
      <div class="grid-2" style="margin-top: 16px;">
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
        </div>
        <div class="card">
          <h3>Typography &amp; tone</h3>
          ${fontHeading ? `<div style="margin-top: 12px;"><div style="font-family:'Lora',serif; font-size: 28px; line-height: 1; font-weight: 700;">${esc(fontHeading)}</div><div style="font-size: 11px; color: var(--ink-soft); margin-top: 4px;">Headlines</div></div>` : ''}
          ${fontBody ? `<div style="margin-top: 16px;"><div style="font-size: 18px; font-weight: 500;">${esc(fontBody)}</div><div style="font-size: 11px; color: var(--ink-soft); margin-top: 4px;">Body</div></div>` : ''}
          ${brand.voice?.tone_notes ? `<p style="margin-top: 16px; color: var(--ink-soft); font-size: 13px;">${esc(brand.voice.tone_notes)}</p>` : ''}
        </div>
      </div>
      ${overallScore != null ? `
        <div style="margin-top: 24px;">
          <p class="eyebrow">Quality score (rebuilt site)</p>
          <div class="score-grid">
            ${Object.entries(dimensions).slice(0, 6).map(([k, v]) => `
              <div class="score-cell">
                <div class="score-num">${esc(typeof v === 'object' ? v.score : v)}</div>
                <div class="score-label">${esc(prettyDim(k))}</div>
              </div>
            `).join('')}
          </div>
          <p style="margin-top: 8px; font-size: 12px; color: var(--ink-soft);">Overall: <strong>${esc(overallScore)}/10</strong></p>
        </div>
      ` : ''}
    </section>

    <section>
      <p class="eyebrow">What's left</p>
      <h2>Top items needing your attention</h2>
      <ul class="issue-list">
        ${topMissing.map((m, i) => `
          <li>
            <span class="issue-num">${i + 1}</span>
            <div>
              <div class="issue-title">${esc(m.title)}</div>
              ${m.body ? `<div class="issue-body">${esc(m.body)}</div>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </section>

    ${pitch ? `
    <section>
      <div class="pitch-card">
        <p class="eyebrow" style="color: var(--accent);">Working with us</p>
        <h2>${esc(pitch.headline)}</h2>
        ${pitch.subheadline ? `<p class="lead" style="font-size: 17px; margin-top: 8px;">${esc(pitch.subheadline)}</p>` : ''}
        <div class="vp-list">
          ${pitch.valueProps.map(vp => `
            <div>
              <div class="vp-title">${esc(vp.title)}</div>
              <div class="vp-body">${esc(vp.body)}</div>
            </div>
          `).join('')}
        </div>
        ${pitch.engagement?.whatYouGet?.length ? `
          <h3 style="margin-top: 24px;">What you get</h3>
          <ul style="margin-top: 8px; padding-left: 20px;">
            ${pitch.engagement.whatYouGet.map(item => `<li style="margin-bottom: 4px;">${esc(item)}</li>`).join('')}
          </ul>
        ` : ''}
        ${pitch.engagement?.nextStep ? `
          <p class="next-step">${esc(pitch.engagement.nextStep)}</p>
        ` : ''}
      </div>
    </section>
    ` : ''}

  </main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Data extraction helpers
// ---------------------------------------------------------------------------

function describeAuditVerdict(audit) {
  if (!audit) return 'Audit not available';
  // The audit emits positioning + tone as { current, recommended, rationale }.
  // The "current" field is the diagnosis of the existing site — exactly what
  // a one-line verdict needs.
  const current = audit.positioning?.current || audit.tone?.current;
  if (current) return current.length > 220 ? current.slice(0, 217) + '…' : current;
  return 'Findings from the existing site';
}

function collectTopIssues(audit) {
  if (!audit) return [];
  // The audit's most actionable findings live in contentGaps + warnings.
  // Both arrays are typically strings; some fields may emit objects.
  const flat = []
    .concat(audit.contentGaps || [])
    .concat(audit.warnings || [])
    .concat(audit.seoOpportunities || []);
  return flat.slice(0, 3).map(toIssue);
}

function toIssue(item) {
  if (typeof item === 'string') {
    // Many audit findings use "Title — body" format. Split for readability.
    const parts = item.split(/\s—\s/);
    return parts.length > 1
      ? { title: parts[0].trim(), body: parts.slice(1).join(' — ').trim() }
      : { title: item, body: '' };
  }
  return {
    title: item.title || item.issue || item.label || item.gap || 'Issue',
    body: item.description || item.detail || item.why || item.recommendation || '',
  };
}

function collectTopMissing(missing) {
  if (!missing) return [];
  const items = (missing.critical || []).concat(missing.important || []).slice(0, 3);
  return items.map(item => {
    if (typeof item === 'string') return { title: item, body: '' };
    return {
      title: item.title || item.label || item.field || 'Action item',
      body: item.description || item.why || item.recommendation || '',
    };
  });
}

function stripDesc(s) {
  if (!s) return '';
  return String(s).split('—')[0].trim();
}

function prettyDim(k) {
  const map = {
    typography: 'Typography',
    color_contrast: 'Color',
    spatial_layout: 'Spatial',
    information_hierarchy: 'Hierarchy',
    craft: 'Craft',
    ux_writing: 'UX Writing',
    distinctiveness: 'Distinct.',
    trust_signals: 'Trust',
  };
  return map[k] || k.replace(/_/g, ' ').slice(0, 10);
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
