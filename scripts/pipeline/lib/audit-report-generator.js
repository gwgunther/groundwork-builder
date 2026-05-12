/**
 * Audit Report Generator
 *
 * Generates two client-facing HTML reports from audit data:
 *   outputDir/audit-report.html  — full tabbed report (4 tabs)
 *   outputDir/audit-summary.html — 1-page printable summary
 *
 * Export:
 *   generateAuditReports(outputDir, { url, practiceName, pagespeed, techAudit, aiAudit, scraped, previewUrl })
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    return new Date(iso || Date.now()).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return String(iso || ''); }
}

function scoreColor(score) {
  if (score == null) return '#9E9990';
  if (score >= 90) return '#2E7D4F';
  if (score >= 50) return '#C07A1A';
  return '#C0392B';
}

function scoreBg(score) {
  if (score == null) return '#F0EDE8';
  if (score >= 90) return '#D4EDD9';
  if (score >= 50) return '#FEF3CD';
  return '#FDDCDC';
}

function growthLabel(score) {
  if (score == null) return '—';
  if (score >= 85) return 'Strong online presence';
  if (score >= 60) return 'Solid foundation, gaps to close';
  if (score >= 40) return 'Significant issues holding you back';
  return 'Major work needed';
}

function buildGrowthHero(score, techAudit, gbpMeta) {
  if (score == null) return '';
  const color = scoreColor(score);
  const bg = scoreBg(score);
  const label = growthLabel(score);
  const critical = techAudit?.summary?.critical || 0;
  const warnings = techAudit?.summary?.warnings || 0;
  const passed = techAudit?.summary?.passed || 0;
  const gbpLine = gbpMeta?.displayName
    ? `<div class="growth-hero-sub">GBP: <strong>${esc(gbpMeta.displayName)}</strong> · ${gbpMeta.userRatingCount ?? 0} reviews · ${gbpMeta.rating != null ? gbpMeta.rating.toFixed(1) + '★' : '—'}</div>`
    : '';

  return `
<section class="growth-hero" style="background:${bg};border-left:6px solid ${color}">
  <div class="growth-hero-left">
    <div class="growth-hero-eyebrow">Growth Score</div>
    <div class="growth-hero-score" style="color:${color}">${score}<span class="growth-hero-denom">/100</span></div>
    <div class="growth-hero-label">${esc(label)}</div>
    ${gbpLine}
  </div>
  <div class="growth-hero-right">
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--red)">${critical}</span><span class="growth-stat-label">Critical</span></div>
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--amber)">${warnings}</span><span class="growth-stat-label">Warnings</span></div>
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--green)">${passed}</span><span class="growth-stat-label">Passed</span></div>
  </div>
</section>`;
}

function scoreLabel(score) {
  if (score == null) return '—';
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs work';
  return 'Poor';
}

// ---------------------------------------------------------------------------
// Diff-mode (before/after) rendering
// ---------------------------------------------------------------------------

function buildDiffHero(diff) {
  if (!diff?.summary) return '';
  const { beforeScore, afterScore, delta, counts } = diff.summary;
  const afterColor = scoreColor(afterScore);
  const afterBg = scoreBg(afterScore);
  const beforeColor = scoreColor(beforeScore);
  const deltaSign = delta != null && delta >= 0 ? '+' : '';
  const deltaColor = delta == null ? '#9E9990' : delta >= 0 ? '#2E7D4F' : '#C0392B';

  return `
<section class="growth-hero diff-hero" style="background:${afterBg};border-left:6px solid ${afterColor}">
  <div class="growth-hero-left">
    <div class="growth-hero-eyebrow">Growth Score — Before → After</div>
    <div class="diff-score-row">
      <span class="diff-score-before" style="color:${beforeColor}">${beforeScore ?? '—'}</span>
      <span class="diff-arrow">→</span>
      <span class="growth-hero-score" style="color:${afterColor}">${afterScore ?? '—'}<span class="growth-hero-denom">/100</span></span>
      ${delta != null ? `<span class="diff-delta" style="color:${deltaColor};background:${deltaColor}1a">${deltaSign}${delta}</span>` : ''}
    </div>
    <div class="growth-hero-label">${esc(growthLabel(afterScore))}</div>
  </div>
  <div class="growth-hero-right">
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--green)">${counts.fixed}</span><span class="growth-stat-label">Fixed</span></div>
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--amber)">${counts['still-issue']}</span><span class="growth-stat-label">Still issue</span></div>
    <div class="growth-stat"><span class="growth-stat-num" style="color:var(--red)">${counts.regressed}</span><span class="growth-stat-label">Regressed</span></div>
  </div>
</section>`;
}

function diffTransitionMeta(transition) {
  return {
    fixed:         { label: 'Fixed',         color: 'var(--green)',  symbol: '✓' },
    'still-issue': { label: 'Still issue',   color: 'var(--amber)',  symbol: '!' },
    regressed:     { label: 'Regressed',     color: 'var(--red)',    symbol: '↓' },
    unchanged:     { label: 'Still passing', color: 'var(--green)',  symbol: '✓' },
    new:           { label: 'New finding',   color: 'var(--amber)',  symbol: '+' },
    removed:       { label: 'Not re-scanned', color: 'var(--text-dim)', symbol: '—' },
  }[transition] || { label: transition, color: 'var(--text-dim)', symbol: '·' };
}

function buildDiffCard(d) {
  const meta = diffTransitionMeta(d.transition);
  const beforeDetail = d.before?.detail || '—';
  const afterDetail  = d.after?.detail  || (d.transition === 'removed' ? 'Not re-scanned' : '—');
  const fixedLine = d.transition === 'fixed' && d.fixed_copy
    ? `<div class="diff-fixed-line">${esc(d.fixed_copy)}</div>`
    : '';

  return `
<article class="diff-card diff-card-${d.transition}">
  <header class="diff-card-header">
    <span class="diff-card-symbol" style="color:${meta.color}">${meta.symbol}</span>
    <div class="diff-card-titles">
      <div class="diff-card-title">${esc(d.title || d.id)}</div>
      <div class="diff-card-category">${esc(d.category || '')}</div>
    </div>
    <span class="diff-card-badge" style="color:${meta.color};border-color:${meta.color}">${esc(meta.label)}</span>
  </header>
  ${fixedLine}
  <div class="diff-card-row">
    <div class="diff-card-side diff-card-before">
      <div class="diff-side-label">Before</div>
      <div class="diff-side-detail">${esc(beforeDetail)}</div>
    </div>
    <div class="diff-card-side diff-card-after">
      <div class="diff-side-label">After</div>
      <div class="diff-side-detail">${esc(afterDetail)}</div>
    </div>
  </div>
  ${d.benefit ? `<div class="diff-card-benefit">Why this matters: ${esc(d.benefit)}</div>` : ''}
</article>`;
}

function buildDiffFindings(diff) {
  if (!diff?.diff?.length) {
    return `<div class="empty-state"><p>No diff data available.</p></div>`;
  }
  // Order groups for narrative: wins first, then problems, then context.
  const ORDER = ['fixed', 'regressed', 'still-issue', 'new', 'unchanged', 'removed'];
  const byTransition = {};
  for (const d of diff.diff) {
    (byTransition[d.transition] ||= []).push(d);
  }

  const groups = [];
  for (const t of ORDER) {
    const items = byTransition[t];
    if (!items?.length) continue;
    const meta = diffTransitionMeta(t);
    groups.push(`
<section class="diff-group">
  <h3 class="diff-group-title" style="color:${meta.color}">${esc(meta.label)} (${items.length})</h3>
  <div class="diff-group-list">
    ${items.map(buildDiffCard).join('\n')}
  </div>
</section>`);
  }
  return groups.join('\n');
}

function metricStatus(value, metric) {
  if (value == null) return 'na';
  if (metric === 'lcp') return value <= 2500 ? 'pass' : value <= 4000 ? 'warn' : 'fail';
  if (metric === 'fcp') return value <= 1800 ? 'pass' : value <= 3000 ? 'warn' : 'fail';
  if (metric === 'tbt') return value <= 200  ? 'pass' : value <= 600  ? 'warn' : 'fail';
  if (metric === 'cls') return value <= 0.1  ? 'pass' : value <= 0.25 ? 'warn' : 'fail';
  if (metric === 'si')  return value <= 3400 ? 'pass' : value <= 5800 ? 'warn' : 'fail';
  if (metric === 'tti') return value <= 3800 ? 'pass' : value <= 7300 ? 'warn' : 'fail';
  return 'na';
}

function formatMetric(value, metric) {
  if (value == null) return '—';
  if (metric === 'cls') return value.toFixed(3);
  if (metric === 'tbt') return `${Math.round(value).toLocaleString()}ms`; // TBT stays in ms (usually <1000)
  return `${(value / 1000).toFixed(2)}s`;
}

function severityIcon(severity) {
  if (severity === 'critical') return '✕';
  if (severity === 'warning')  return '!';
  return '✓';
}

// Human-readable display titles for finding IDs
const FINDING_DISPLAY_TITLES = {
  'missing-meta':      'Missing search result descriptions',
  'missing-title':     'Pages with no title in Google',
  'duplicate-titles':  'Pages competing against each other in Google',
  'missing-h1':        'Pages with no clear headline structure',
  'multiple-h1':       'Confusing headline structure on multiple pages',
  'thin-content':      'Pages with too little information for Google',
  'missing-schema':    'Not claiming your business identity in search',
  'missing-canonical': 'Search engines don\'t know which page to rank',
  'low-performance':   'Site is too slow on mobile phones',
  'low-lcp':           'First impression loads too slowly',
  'high-cls':          'Page content shifts around while loading',
  'missing-alt':       'Images invisible to Google and visually impaired patients',
  'no-testimonials':   'No patient reviews or social proof on site',
  'no-faq':            'No FAQ section to capture Google question searches',
  'thin-about':        'About page doesn\'t build enough trust',
};

function findingDisplayTitle(f) {
  return FINDING_DISPLAY_TITLES[f.id] || f.title;
}

// Human-readable "What We'd Fix" outcome text for each finding ID
const IMPROVEMENT_OUTCOMES = {
  'missing-meta':      'Every page gets a compelling description in Google search results, so patients actually click through to your site.',
  'missing-title':     'Every page gets a clear, keyword-rich title so Google knows what it\'s about — and so do patients.',
  'duplicate-titles':  'Each page targets a different search term, so your pages work together instead of canceling each other out.',
  'missing-h1':        'Patients and Google can immediately see what each page is about, making your content easier to navigate and rank.',
  'thin-content':      'Key service pages get the depth of information patients are searching for — and Google rewards.',
  'missing-schema':    'Your practice name, location, hours, and services are claimed in Google\'s knowledge graph for richer search listings.',
  'missing-canonical': 'Search engines consolidate ranking power behind the right page version instead of splitting it across duplicates.',
  'low-performance':   'Faster loading so phone visitors stay on your site — instead of leaving before they ever read your name.',
  'low-lcp':           'The first thing a patient sees loads in under 2.5 seconds, giving a strong first impression on any device.',
  'high-cls':          'Content stays in place as the page loads — no shifting, no accidental taps, no frustrated visitors.',
  'missing-alt':       'Every image is described for Google Image Search and for patients using screen readers or low vision.',
  'no-testimonials':   'Patient reviews and social proof are woven into the design so new patients feel confident choosing you.',
  'no-faq':            'A FAQ section captures patients asking questions in Google — and reduces repetitive phone calls to your front desk.',
  'thin-about':        'A rich About page with your story, credentials, and team photography that converts curious visitors into booked patients.',
};

// Derive key improvements from findings for "What We'd Fix" section
function deriveImprovements(techAudit, aiAudit) {
  const items = [];

  const findings = techAudit?.findings || [];
  const criticals = findings.filter(f => f.severity === 'critical');
  const warnings  = findings.filter(f => f.severity === 'warning');

  const seen = new Set();
  for (const f of [...criticals, ...warnings]) {
    const msg = IMPROVEMENT_OUTCOMES[f.id];
    if (msg && !seen.has(f.id)) {
      seen.add(f.id);
      items.push({ id: f.id, msg, severity: f.severity, findingTitle: findingDisplayTitle(f) });
    }
  }

  // Add AI audit improvements if available
  if (aiAudit?.contentGaps?.length) {
    items.push({
      id: 'content-gaps',
      msg: `New content addressing what patients in your area are actually searching for: ${aiAudit.contentGaps.slice(0, 2).join(', ')}.`,
      severity: 'warning',
    });
  }
  if (aiAudit?.positioning?.recommended) {
    items.push({
      id: 'positioning',
      msg: `Repositioned messaging that speaks directly to what makes your practice different: "${aiAudit.positioning.recommended.slice(0, 80)}…"`,
      severity: 'info',
    });
  }

  return items.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

function sharedCss() {
  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink:   #1A1A1A;
    --terracotta: #C45D3E;
    --cream:      #FAF8F5;
    --sage:       #6B7F6E;
    --surface:    #FFFFFF;
    --border:     #E5E0DA;
    --text-dim:   #666259;
    --green:      #2E7D4F;
    --red:        #C0392B;
    --amber:      #C07A1A;
    --blue:       #1565C0;
    --radius:     8px;
    --font:       -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono:       'SFMono-Regular', 'Consolas', monospace;
  }
  body { font-family: var(--font); background: var(--cream); color: var(--ink); font-size: 14px; line-height: 1.5; }

  /* Score circles */
  .score-circle {
    width: 100px; height: 100px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 4px solid currentColor;
    flex-shrink: 0;
  }
  .score-num { font-size: 28px; font-weight: 800; line-height: 1; }
  .score-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; opacity: 0.75; }

  /* Metric row */
  .metric-status-pass { color: var(--green); }
  .metric-status-warn { color: var(--amber); }
  .metric-status-fail { color: var(--red); }
  .metric-status-na   { color: var(--text-dim); }

  /* Finding cards */
  .finding-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
  .finding-card.critical { border-left: 4px solid var(--red); }
  .finding-card.warning  { border-left: 4px solid var(--amber); }
  .finding-card.passed   { border-left: 4px solid var(--green); }

  .finding-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
  .finding-icon {
    width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0; margin-top: 1px;
  }
  .finding-icon.critical { background: #FDDCDC; color: var(--red); }
  .finding-icon.warning  { background: #FEF3CD; color: var(--amber); }
  .finding-icon.passed   { background: #D4EDD9; color: var(--green); }

  .finding-title  { font-size: 14px; font-weight: 700; line-height: 1.3; }
  .finding-meta   { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-top: 2px; }
  .finding-detail { font-size: 13px; color: var(--ink); line-height: 1.55; margin-top: 8px; }
  .finding-evidence { font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.4; margin-top: 8px; }
  .finding-impact { font-size: 12px; color: var(--sage); line-height: 1.5; margin-top: 6px; font-style: italic; }
  .finding-source { font-size: 11px; color: var(--text-dim); margin-top: 6px; }
  .finding-pages  { margin-top: 8px; font-size: 11px; color: var(--text-dim); }
  .finding-pages summary { cursor: pointer; font-weight: 600; user-select: none; }
  .finding-pages summary:hover { color: var(--ink); }
  .finding-pages ul { list-style: none; margin-top: 5px; display: flex; flex-direction: column; gap: 2px; }
  .finding-pages li { font-family: var(--mono); font-size: 11px; padding: 2px 0; word-break: break-all; }

  /* Critical findings: show affected pages inline, no disclosure */
  .finding-pages-inline { margin-top: 10px; }
  .finding-pages-inline .pages-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 4px; }
  .finding-pages-inline ul { list-style: none; display: flex; flex-direction: column; gap: 2px; }
  .finding-pages-inline li { font-family: var(--mono); font-size: 11px; padding: 2px 0; word-break: break-all; color: var(--ink); }
  `;
}

// ---------------------------------------------------------------------------
// Full report builder (audit-report.html)
// ---------------------------------------------------------------------------

function buildFullReport({ url, practiceName, pagespeed, techAudit, aiAudit, scraped, previewUrl, growthScore = null, gbpMeta = null, diff = null }) {
  const runDate = formatDate(new Date().toISOString());
  const mobile  = pagespeed?.mobile  || null;
  const desktop = pagespeed?.desktop || null;

  const criticalCount = techAudit?.summary?.critical || 0;
  const diffMode = !!diff?.diff?.length;
  const hero = diffMode
    ? buildDiffHero(diff)
    : buildGrowthHero(growthScore, techAudit, gbpMeta);
  const findingsTabContent = diffMode
    ? buildDiffFindings(diff)
    : buildFindingsTab(techAudit);
  const findingsTabLabel = diffMode ? 'Before → After' : 'What We Found';
  const findingsTabBadgeCount = diffMode ? diff.summary.counts.fixed : criticalCount;
  const findingsTabBadgeClass = diffMode ? 'badge-green' : 'badge';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Site Audit — ${esc(practiceName)}</title>
<style>
${sharedCss()}

/* ── Header ── */
.header { background: var(--ink); color: white; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.header-left h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.header-left .sub { color: #9E9990; font-size: 13px; margin-top: 3px; }
.header-badge { font-size: 12px; color: #9E9990; text-align: right; line-height: 1.7; }
.gw-mark { font-size: 11px; font-weight: 700; color: var(--terracotta); letter-spacing: 1px; text-transform: uppercase; }

/* ── Tab Nav ── */
.tab-nav { background: var(--surface); border-bottom: 2px solid var(--border); padding: 0 32px; display: flex; gap: 0; overflow-x: auto; }
.tab-btn { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; padding: 13px 20px; font-size: 13px; font-weight: 600; color: var(--text-dim); cursor: pointer; white-space: nowrap; transition: color 0.15s, border-color 0.15s; }
.tab-btn:hover { color: var(--ink); }
.tab-btn.active { color: var(--terracotta); border-bottom-color: var(--terracotta); }
.badge { background: var(--red); color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 5px; vertical-align: middle; }

/* ── Main ── */
.main { max-width: 1080px; margin: 0 auto; padding: 32px 32px 80px; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* ── Section layout ── */
.section-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.section-header h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
.section-note { font-size: 12px; color: var(--text-dim); }

/* ── Growth Hero ── */
.growth-hero { max-width: 1080px; margin: 28px auto 0; padding: 22px 28px; border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap; }
.growth-hero-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 4px; }
.growth-hero-score { font-size: 56px; font-weight: 800; font-family: var(--mono); line-height: 1; letter-spacing: -1px; }
.growth-hero-denom { font-size: 22px; font-weight: 600; color: var(--text-dim); margin-left: 2px; }
.growth-hero-label { font-size: 15px; font-weight: 700; color: var(--ink); margin-top: 6px; }
.growth-hero-sub { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
.growth-hero-right { display: flex; gap: 28px; }
.growth-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.growth-stat-num { font-size: 30px; font-weight: 800; font-family: var(--mono); line-height: 1; }
.growth-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }

/* ── Diff hero + cards (re-scan / before→after mode) ── */
.diff-score-row { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.diff-score-before { font-size: 32px; font-weight: 800; font-family: var(--mono); line-height: 1; opacity: 0.7; text-decoration: line-through; text-decoration-thickness: 2px; }
.diff-arrow { font-size: 22px; font-weight: 700; color: var(--text-dim); }
.diff-delta { font-size: 14px; font-weight: 800; padding: 4px 10px; border-radius: 20px; font-family: var(--mono); }
.badge-green { background: var(--green); color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 5px; vertical-align: middle; }

.diff-group { margin-bottom: 32px; }
.diff-group-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px; }
.diff-group-list { display: flex; flex-direction: column; gap: 12px; }

.diff-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
.diff-card-fixed { border-left: 4px solid var(--green); }
.diff-card-regressed { border-left: 4px solid var(--red); }
.diff-card-still-issue { border-left: 4px solid var(--amber); }
.diff-card-new { border-left: 4px solid var(--amber); }
.diff-card-unchanged { border-left: 4px solid var(--green); opacity: 0.7; }
.diff-card-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.diff-card-symbol { font-size: 18px; font-weight: 800; line-height: 1.2; }
.diff-card-titles { flex: 1; }
.diff-card-title { font-size: 14px; font-weight: 700; }
.diff-card-category { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-top: 2px; }
.diff-card-badge { font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 12px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
.diff-fixed-line { font-size: 13px; font-weight: 600; color: var(--green); margin-bottom: 12px; }
.diff-card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.diff-card-side { padding: 12px 14px; }
.diff-card-before { background: #FDDCDC55; border-right: 1px solid var(--border); }
.diff-card-after  { background: #D4EDD955; }
.diff-side-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 4px; }
.diff-side-detail { font-size: 12px; line-height: 1.5; }
.diff-card-benefit { font-size: 12px; font-style: italic; color: var(--text-dim); margin-top: 10px; line-height: 1.5; }

/* ── Scorecard ── */
.score-strip { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 32px; }
.score-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.score-name { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); text-align: center; }
.score-subtitle { font-size: 11px; color: var(--text-dim); font-weight: 400; text-align: center; max-width: 90px; line-height: 1.35; }

.lighthouse-callout { background: #EEF4FF; border: 1px solid #C3D4F7; border-radius: var(--radius); padding: 16px 20px; margin-bottom: 28px; font-size: 13px; line-height: 1.6; color: var(--ink); }
.lighthouse-callout strong { color: #1565C0; }
.lighthouse-callout a { color: #1565C0; }

.compare-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px; }
.compare-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 8px 12px; background: #F5F2EE; border: 1px solid var(--border); }
.compare-table td { padding: 10px 12px; border: 1px solid var(--border); font-weight: 600; }
.compare-table td.score-desc { font-size: 11px; color: var(--text-dim); font-weight: 400; }
.compare-table tr:nth-child(even) td { background: #FAFAF8; }
.score-val { display: inline-flex; align-items: center; gap: 8px; }
.score-pill { font-size: 13px; font-weight: 800; padding: 3px 10px; border-radius: 20px; display: inline-block; }

.metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 32px; }
@media (max-width: 700px) { .metrics-grid { grid-template-columns: 1fr 1fr; } }
.metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.metric-label { font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 2px; }
.metric-sublabel { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 6px; }
.metric-value { font-size: 22px; font-weight: 800; font-family: var(--mono); line-height: 1; }
.metric-threshold { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.source-note { font-size: 11px; color: var(--text-dim); font-style: italic; margin-top: 8px; }

/* ── Technical Findings ── */
.findings-summary { background: var(--ink); color: white; border-radius: var(--radius); padding: 14px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.fs-stat { display: flex; align-items: center; gap: 8px; }
.fs-num { font-size: 22px; font-weight: 800; font-family: var(--mono); line-height: 1; }
.fs-num.critical { color: #FF6B6B; }
.fs-num.warning  { color: #FFD93D; }
.fs-label { font-size: 12px; font-weight: 600; color: #9E9990; }

.findings-group { margin-bottom: 28px; }
.findings-group-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.findings-group-title.critical { color: var(--red); }
.findings-group-title.warning  { color: var(--amber); }
.findings-group-title.passed   { color: var(--green); }
.findings-list { display: flex; flex-direction: column; gap: 10px; }

.passed-checklist { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
.passed-item { background: var(--surface); border: 1px solid #D4EDD9; border-radius: var(--radius); padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 13px; }
.passed-check { color: var(--green); font-weight: 800; flex-shrink: 0; }

/* ── AI Audit Tab ── */
.ai-source-note { background: #F5F2EE; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; color: var(--ink); }
.ai-source-note strong { color: var(--terracotta); }
.ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 700px) { .ai-grid { grid-template-columns: 1fr; } }
.ai-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.ai-block h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 12px; }
.current-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 3px; }
.rec-tag     { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--terracotta); margin-top: 10px; margin-bottom: 3px; }
.rec-text    { font-weight: 700; color: var(--terracotta); font-size: 13px; line-height: 1.5; }
.rationale   { font-size: 12px; color: var(--text-dim); font-style: italic; line-height: 1.5; margin-top: 4px; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.tag-primary   { background: var(--terracotta); color: white; font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
.tag-secondary { background: #F0EDE8; color: var(--ink); font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 500; }
.bullet-list { list-style: none; display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.bullet-list li { font-size: 13px; padding-left: 16px; position: relative; line-height: 1.5; }
.bullet-list li::before { content: '•'; position: absolute; left: 4px; color: var(--terracotta); font-weight: 700; }
.empty-state { text-align: center; padding: 48px 24px; color: var(--text-dim); }
.empty-state p { font-size: 14px; line-height: 1.6; }

/* ── What We'd Fix ── */
.preview-block { background: var(--ink); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px; }
.preview-block h3 { font-size: 22px; font-weight: 700; color: white; margin-bottom: 10px; }
.preview-block p { color: #9E9990; font-size: 14px; margin-bottom: 20px; }
.preview-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--terracotta); color: white; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: var(--radius); letter-spacing: 0.2px; }
.preview-btn:hover { opacity: 0.9; }
.preview-iframe { width: 100%; height: 500px; border: none; border-radius: var(--radius); margin-bottom: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }

.improvements-list { display: flex; flex-direction: column; gap: 12px; }
.improvement-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
.impr-finding-ref { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 5px; }
.impr-finding-ref.critical { color: var(--red); }
.impr-finding-ref.warning  { color: var(--amber); }
.impr-text { font-size: 13px; line-height: 1.55; }

.before-after-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 12px; }
.before-after-block .ba-header { padding: 12px 18px; background: #F5F2EE; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
.ba-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.ba-col { padding: 14px 18px; }
.ba-col:first-child { border-right: 1px solid var(--border); }
.ba-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.ba-label.before { color: var(--red); }
.ba-label.after  { color: var(--green); }
.ba-content { font-size: 13px; line-height: 1.5; }

.design-info { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-top: 24px; }
.design-info h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 12px; }
.design-row { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid #F0EDE8; font-size: 13px; }
.design-row:last-child { border-bottom: none; }
.design-key { color: var(--text-dim); min-width: 100px; flex-shrink: 0; font-weight: 600; font-size: 12px; }
</style>
</head>
<body>

<header class="header">
  <div class="header-left">
    <h1>${esc(practiceName)} — Site Audit</h1>
    <div class="sub">${esc(url)} &nbsp;·&nbsp; ${esc(runDate)}</div>
  </div>
  <div class="header-badge">
    <div class="gw-mark">Groundwork Builder</div>
    <div style="color:#9E9990;font-size:12px;margin-top:4px">groundwork.build</div>
  </div>
</header>

${hero}

<nav class="tab-nav">
  <button class="tab-btn active" data-tab="scorecard">Scorecard</button>
  <button class="tab-btn" data-tab="findings">${esc(findingsTabLabel)} ${findingsTabBadgeCount > 0 ? `<span class="${findingsTabBadgeClass}">${findingsTabBadgeCount}</span>` : ''}</button>
  <button class="tab-btn" data-tab="content">Your Messaging</button>
  <button class="tab-btn" data-tab="build">What We'd Fix</button>
</nav>

<main class="main">

  <!-- ═══ TAB: Scorecard ═══════════════════════════════════════════════════ -->
  <div class="tab-panel active" id="tab-scorecard">
    ${buildScorecardTab(mobile, desktop)}
  </div>

  <!-- ═══ TAB: What We Found / Before → After ════════════════════════════ -->
  <div class="tab-panel" id="tab-findings">
    ${findingsTabContent}
  </div>

  <!-- ═══ TAB: Your Messaging ════════════════════════════════════════════ -->
  <div class="tab-panel" id="tab-content">
    ${buildAiAuditTab(aiAudit)}
  </div>

  <!-- ═══ TAB: What We'd Fix ══════════════════════════════════════════════ -->
  <div class="tab-panel" id="tab-build">
    ${buildWhatWedbuildTab(techAudit, aiAudit, scraped, previewUrl)}
  </div>

</main>

<script>
  const btns   = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      btns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + target)?.classList.add('active');
    });
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Tab: Scorecard
// ---------------------------------------------------------------------------

function buildScorecardTab(mobile, desktop) {
  const categories = [
    {
      key: 'performance',
      label: 'Mobile Speed',
      subtitle: 'How fast your site loads on a phone',
    },
    {
      key: 'seo',
      label: 'Google Visibility',
      subtitle: 'How easily patients can find you',
    },
    {
      key: 'accessibility',
      label: 'Ease of Use',
      subtitle: 'Works for all patients, all devices',
    },
    {
      key: 'bestPractices',
      label: 'Technical Health',
      subtitle: 'Security & modern standards',
    },
  ];

  // Big score circles — use mobile as primary
  const scoreCircles = categories.map(cat => {
    const score = mobile?.[cat.key] ?? null;
    const color = scoreColor(score);
    const bg    = scoreBg(score);
    return `<div class="score-cell">
      <div class="score-circle" style="background:${esc(bg)};color:${esc(color)};border-color:${esc(color)}">
        <span class="score-num">${score != null ? score : '—'}</span>
        <span class="score-lbl">${esc(scoreLabel(score))}</span>
      </div>
      <div class="score-name">${esc(cat.label)}</div>
      <div class="score-subtitle">${esc(cat.subtitle)}</div>
    </div>`;
  }).join('');

  // Mobile vs Desktop comparison table
  const rows = categories.map(cat => {
    const m = mobile?.[cat.key]  ?? null;
    const d = desktop?.[cat.key] ?? null;
    return `<tr>
      <td>
        <strong>${esc(cat.label)}</strong><br>
        <span class="score-desc">${esc(cat.subtitle)}</span>
      </td>
      <td><span class="score-pill" style="background:${esc(scoreBg(m))};color:${esc(scoreColor(m))}">${m != null ? m : '—'}</span></td>
      <td><span class="score-pill" style="background:${esc(scoreBg(d))};color:${esc(scoreColor(d))}">${d != null ? d : '—'}</span></td>
    </tr>`;
  }).join('');

  // Key metrics — plain language names
  const mMetrics = mobile?.metrics || {};
  const metricDefs = [
    { key: 'lcp', label: 'Time to See Your Page',     sublabel: 'LCP', threshold: 'Goal: under 2.5 sec' },
    { key: 'fcp', label: 'Time to First Content',     sublabel: 'FCP', threshold: 'Goal: under 1.8 sec' },
    { key: 'tbt', label: 'Page Responsiveness',       sublabel: 'TBT', threshold: 'Goal: under 200ms' },
    { key: 'cls', label: 'Visual Stability',          sublabel: 'CLS — does content jump around', threshold: 'Goal: under 0.1' },
    { key: 'si',  label: 'How Fast It Looks Loaded',  sublabel: 'SI',  threshold: 'Goal: under 3.4 sec' },
    { key: 'tti', label: 'Time Until Fully Interactive', sublabel: 'TTI', threshold: 'Goal: under 3.8 sec' },
  ];

  const metricCards = metricDefs.map(m => {
    const val    = mMetrics[m.key] ?? null;
    const status = metricStatus(val, m.key);
    const color  = { pass: 'var(--green)', warn: 'var(--amber)', fail: 'var(--red)', na: 'var(--text-dim)' }[status];
    return `<div class="metric-card">
      <div class="metric-label">${esc(m.label)}</div>
      <div class="metric-sublabel">${esc(m.sublabel)}</div>
      <div class="metric-value metric-status-${esc(status)}" style="color:${esc(color)}">${esc(formatMetric(val, m.key))}</div>
      <div class="metric-threshold">${esc(m.threshold)}</div>
    </div>`;
  }).join('');

  const noData = !mobile && !desktop;

  return `
  <div class="section-header">
    <h2>Your Site Scores</h2>
    <span class="section-note">${noData ? 'PageSpeed not run' : 'Mobile scores shown · measured by Google'}</span>
  </div>

  ${noData ? `<div class="empty-state"><p>PageSpeed Insights was not run for this audit.<br>Re-run without <code>--skip-pagespeed</code> to see scores.</p></div>` : `

  <div class="lighthouse-callout">
    <strong>Where these scores come from:</strong> These scores are measured by Google Lighthouse — the same tool Google uses to evaluate sites for search ranking. They are objective measurements, not our opinion. You can verify any score yourself at <a href="https://pagespeed.web.dev" target="_blank">pagespeed.web.dev</a>.
  </div>

  <div class="score-strip">${scoreCircles}</div>

  <table class="compare-table">
    <thead>
      <tr>
        <th>Score</th>
        <th>Mobile (primary)</th>
        <th>Desktop</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--ink)">Mobile speed breakdown <span style="font-size:11px;font-weight:400;color:var(--text-dim)">— measured by Google Lighthouse on a simulated phone</span></div>
  <div class="metrics-grid">${metricCards}</div>

  <p class="source-note">All metrics sourced from Google PageSpeed Insights API v5. Mobile scores are the primary signal Google uses for search ranking.</p>
  `}`;
}

// ---------------------------------------------------------------------------
// Tab: What We Found (Technical Findings)
// ---------------------------------------------------------------------------

function buildFindingsTab(techAudit) {
  if (!techAudit) {
    return `<div class="empty-state"><p>Tech audit data not available.</p></div>`;
  }

  const { findings = [], summary = {} } = techAudit;
  const criticals = findings.filter(f => f.severity === 'critical');
  const warnings  = findings.filter(f => f.severity === 'warning');
  const passed    = findings.filter(f => f.severity === 'passed');

  const renderFinding = (f) => {
    const isCritical = f.severity === 'critical';
    // Determine source citation based on category
    const isPerf = f.category === 'Performance' || f.id?.startsWith('low-') || f.id === 'high-cls';
    const sourceText = isPerf
      ? '(Measured by Google Lighthouse)'
      : '(Detected by crawling your site)';

    // For criticals, show affected pages inline; for warnings use disclosure
    const pagesHtml = f.affectedPages?.length > 0
      ? isCritical
        ? `<div class="finding-pages-inline">
            <div class="pages-label">Affected pages (${f.affectedPages.length})</div>
            <ul>${f.affectedPages.slice(0, 10).map(u => `<li>${esc(u)}</li>`).join('')}${f.affectedPages.length > 10 ? `<li style="color:var(--text-dim)">… and ${f.affectedPages.length - 10} more</li>` : ''}</ul>
           </div>`
        : `<details class="finding-pages">
            <summary>${f.affectedPages.length} affected page${f.affectedPages.length !== 1 ? 's' : ''} (click to expand)</summary>
            <ul>${f.affectedPages.map(u => `<li>${esc(u)}</li>`).join('')}</ul>
           </details>`
      : '';

    return `
  <div class="finding-card ${esc(f.severity)}">
    <div class="finding-header">
      <div class="finding-icon ${esc(f.severity)}">${esc(severityIcon(f.severity))}</div>
      <div>
        <div class="finding-title">${esc(findingDisplayTitle(f))}</div>
        <div class="finding-meta">${esc(f.category)}</div>
      </div>
    </div>
    <div class="finding-evidence">${esc(f.detail)}</div>
    ${f.benefit ? `<div class="finding-impact">Why this matters to patients: ${esc(f.benefit)}</div>` : ''}
    <div class="finding-source">${esc(sourceText)}</div>
    ${pagesHtml}
  </div>`;
  };

  return `
  <div class="section-header">
    <h2>What We Found</h2>
    <span class="section-note">Based on crawling your site + Google Lighthouse</span>
  </div>

  <div class="findings-summary">
    <div class="fs-stat"><span class="fs-num critical">${summary.critical || 0}</span><span class="fs-label">Critical issues</span></div>
    <div class="fs-stat"><span class="fs-num warning">${summary.warnings || 0}</span><span class="fs-label">Warnings</span></div>
  </div>

  ${criticals.length > 0 ? `
  <div class="findings-group">
    <div class="findings-group-title critical">Critical Issues (${criticals.length})</div>
    <div class="findings-list">${criticals.map(renderFinding).join('')}</div>
  </div>` : ''}

  ${warnings.length > 0 ? `
  <div class="findings-group">
    <div class="findings-group-title warning">Warnings (${warnings.length})</div>
    <div class="findings-list">${warnings.map(renderFinding).join('')}</div>
  </div>` : ''}

  ${passed.length > 0 ? `
  <div class="findings-group">
    <div class="findings-group-title passed">What's Working (${passed.length})</div>
    <div class="passed-checklist">
      ${passed.map(f => `<div class="passed-item"><span class="passed-check">✓</span><span>${esc(findingDisplayTitle(f))}</span></div>`).join('')}
    </div>
  </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Tab: Your Messaging (AI Audit)
// ---------------------------------------------------------------------------

function buildAiAuditTab(aiAudit) {
  if (!aiAudit) {
    return `<div class="empty-state"><p>AI content audit was not run.<br>Ensure <code>ANTHROPIC_API_KEY</code> is set to generate positioning recommendations.</p></div>`;
  }

  const pos  = aiAudit.positioning   || {};
  const tone = aiAudit.tone          || {};
  const svc  = aiAudit.serviceEmphasis || {};
  const pageCount = aiAudit.pageCount || '';

  return `
  <div class="section-header">
    <h2>Your Messaging</h2>
    <span class="section-note">Analysis by Claude AI</span>
  </div>

  <div class="ai-source-note">
    <strong>How this analysis works:</strong> We read ${pageCount ? `all ${pageCount} pages of your site` : 'every page of your site'} and analyzed how you're positioned compared to what patients in your area are searching for. This section is <strong>analysis by Claude AI</strong> — not a mechanical score, but a read of your actual content and how it lands on a new visitor.
  </div>

  <div class="ai-grid">

    <div class="ai-block">
      <h4>Positioning</h4>
      <div class="current-tag">Current</div>
      <p style="font-size:13px;line-height:1.55">${esc(pos.current || '—')}</p>
      <div class="rec-tag">Recommended</div>
      <p class="rec-text">${esc(pos.recommended || '—')}</p>
      <p class="rationale">${esc(pos.rationale || '')}</p>
    </div>

    <div class="ai-block">
      <h4>Brand Tone</h4>
      <div class="current-tag">Current</div>
      <p style="font-size:13px;line-height:1.55">${esc(tone.current || '—')}</p>
      <div class="rec-tag">Recommended</div>
      <p class="rec-text">${esc(tone.recommended || '—')}</p>
      <p class="rationale">${esc(tone.rationale || '')}</p>
    </div>

    <div class="ai-block">
      <h4>Service Emphasis</h4>
      <div class="tag-row">
        ${svc.primary ? `<span class="tag-primary">${esc(svc.primary)}</span>` : ''}
        ${(svc.secondary || []).map(s => `<span class="tag-secondary">${esc(s)}</span>`).join('')}
      </div>
      <p class="rationale" style="margin-top:10px">${esc(svc.rationale || '')}</p>
    </div>

    <div class="ai-block">
      <h4>Differentiators Found on Your Site</h4>
      <ul class="bullet-list">
        ${(aiAudit.differentiators || []).map(d => `<li>${esc(d)}</li>`).join('') || '<li style="color:var(--text-dim)">None identified</li>'}
      </ul>
    </div>

    <div class="ai-block">
      <h4>Content Gaps — What's Missing</h4>
      <ul class="bullet-list">
        ${(aiAudit.contentGaps || []).map(g => `<li>${esc(g)}</li>`).join('') || '<li style="color:var(--text-dim)">None identified</li>'}
      </ul>
    </div>

    <div class="ai-block">
      <h4>Search Opportunities</h4>
      <ul class="bullet-list">
        ${(aiAudit.seoOpportunities || []).map(o => `<li>${esc(o)}</li>`).join('') || '<li style="color:var(--text-dim)">None identified</li>'}
      </ul>
    </div>

  </div>`;
}

// ---------------------------------------------------------------------------
// Tab: What We'd Fix
// ---------------------------------------------------------------------------

function buildWhatWedbuildTab(techAudit, aiAudit, scraped, previewUrl) {
  const improvements = deriveImprovements(techAudit, aiAudit);

  // Pull top 3 for Before/After framing
  const topThree = improvements.slice(0, 3);
  const rest     = improvements.slice(3);

  const beforeAfterItems = topThree.map(item => {
    // Generate a before/after based on the finding ID
    const beforeAfterMap = {
      'missing-meta':      { before: 'Search results show just the URL — no description to convince a patient to click.', after: 'Each page has a tailored description in Google results that speaks to what patients are searching for.' },
      'missing-title':     { before: 'Google has no title to show for this page — it falls out of search results entirely.', after: 'Every page has a keyword-rich title that shows up clearly in Google.' },
      'duplicate-titles':  { before: 'Multiple pages have the same title — Google can\'t tell them apart, so none of them rank.', after: 'Every page targets a different search term and competes on its own terms.' },
      'thin-content':      { before: 'Service pages with 100 words — not enough for Google to understand (or rank) what you offer.', after: 'Expanded service pages that answer the questions patients are actually asking.' },
      'low-performance':   { before: 'Your site takes 10+ seconds to load on a phone. Most visitors leave in 3.', after: 'Loads in under 2 seconds on mobile — patients stay long enough to read and book.' },
      'low-lcp':           { before: 'The main content takes 4+ seconds to appear — a blank screen on the most important moment.', after: 'The hero image and headline load instantly, making a strong first impression.' },
      'no-testimonials':   { before: 'No patient reviews on the site — new patients have no social proof to build trust.', after: 'Real patient testimonials woven throughout the site where trust matters most.' },
      'no-faq':            { before: 'No FAQ section — patients can\'t find answers and either call or leave.', after: 'An FAQ section that captures question-based searches and reduces front-desk calls.' },
    };
    const ba = beforeAfterMap[item.id];
    if (!ba) return null;
    return `
    <div class="before-after-block">
      <div class="ba-header">${esc(item.findingTitle || item.id)}</div>
      <div class="ba-row">
        <div class="ba-col">
          <div class="ba-label before">Before</div>
          <div class="ba-content">${esc(ba.before)}</div>
        </div>
        <div class="ba-col">
          <div class="ba-label after">After</div>
          <div class="ba-content">${esc(ba.after)}</div>
        </div>
      </div>
    </div>`;
  }).filter(Boolean).join('');

  const restItems = rest.map(item => `
  <div class="improvement-item">
    <div class="impr-finding-ref ${esc(item.severity)}">${esc(item.severity === 'critical' ? 'Critical fix' : item.severity === 'warning' ? 'Improvement' : 'Enhancement')}${item.findingTitle ? ` — ${item.findingTitle}` : ''}</div>
    <div class="impr-text">${esc(item.msg)}</div>
  </div>`).join('');

  const previewSection = previewUrl ? `
  <div class="preview-block">
    <h3>Your Redesign Preview</h3>
    <p>Here's what your new site could look like — built by Groundwork.</p>
    <a class="preview-btn" href="${esc(previewUrl)}" target="_blank" rel="noopener">
      View Preview →
    </a>
  </div>` : `
  <div class="preview-block">
    <h3>Your Redesign</h3>
    <p>Groundwork builds a custom, SEO-optimized site from your existing content in under 24 hours.</p>
    <a class="preview-btn" href="https://groundwork.build" target="_blank" rel="noopener">
      Get Started →
    </a>
  </div>`;

  return `
  <div class="section-header">
    <h2>What We'd Fix</h2>
    <span class="section-note">Every item below is tied to a specific finding above</span>
  </div>

  ${previewSection}

  ${topThree.length > 0 && beforeAfterItems ? `
  <div style="margin-bottom:28px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:14px">Top 3 changes — before and after</div>
    ${beforeAfterItems}
  </div>` : ''}

  ${rest.length > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:14px">Additional improvements</div>
    <div class="improvements-list">${restItems}</div>
  </div>` : ''}

  ${improvements.length === 0 ? `<div class="empty-state"><p>Run with a URL to generate personalized improvement recommendations.</p></div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Summary page builder (audit-summary.html)
// ---------------------------------------------------------------------------

function buildSummaryReport({ url, practiceName, pagespeed, techAudit, aiAudit, previewUrl }) {
  const runDate = formatDate(new Date().toISOString());
  const mobile  = pagespeed?.mobile || null;

  const categories = [
    { key: 'performance',   label: 'Mobile Speed',        subtitle: 'How fast your site loads on a phone' },
    { key: 'seo',           label: 'Google Visibility',   subtitle: 'How easily patients can find you' },
    { key: 'accessibility', label: 'Ease of Use',         subtitle: 'Works for all patients, all devices' },
    { key: 'bestPractices', label: 'Technical Health',    subtitle: 'Security & modern standards' },
  ];

  // Score circles (compact, 72px)
  const scoreCircles = categories.map(cat => {
    const score = mobile?.[cat.key] ?? null;
    const color = scoreColor(score);
    const bg    = scoreBg(score);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:120px">
      <div style="
        width:72px;height:72px;border-radius:50%;
        background:${bg};color:${color};border:3px solid ${color};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        flex-shrink:0;
      ">
        <span style="font-size:20px;font-weight:800;line-height:1">${score != null ? score : '—'}</span>
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;margin-top:2px">${esc(scoreLabel(score))}</span>
      </div>
      <span style="font-size:11px;font-weight:700;color:var(--ink);text-align:center;line-height:1.3">${esc(cat.label)}</span>
      <span style="font-size:10px;color:var(--text-dim);text-align:center;line-height:1.3;max-width:100px">${esc(cat.subtitle)}</span>
    </div>`;
  }).join('');

  // Top 5 findings — with specific evidence front and center
  const findings = techAudit?.findings || [];
  const topFindings = [
    ...findings.filter(f => f.severity === 'critical'),
    ...findings.filter(f => f.severity === 'warning'),
  ].slice(0, 5);

  const findingRows = topFindings.map(f => {
    const colors = {
      critical: { icon: '✕', bg: '#FDDCDC', color: 'var(--red)' },
      warning:  { icon: '!', bg: '#FEF3CD', color: 'var(--amber)' },
    };
    const c = colors[f.severity] || { icon: '✓', bg: '#D4EDD9', color: 'var(--green)' };
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #F0EDE8">
      <div style="
        width:20px;height:20px;border-radius:50%;background:${c.bg};color:${c.color};
        display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;
        flex-shrink:0;margin-top:1px;
      ">${esc(c.icon)}</div>
      <div>
        <div style="font-size:13px;font-weight:700;line-height:1.3">${esc(findingDisplayTitle(f))}</div>
        <div style="font-size:12px;font-weight:600;color:var(--ink);margin-top:3px;line-height:1.4">${esc(f.detail)}</div>
        ${f.benefit ? `<div style="font-size:11px;color:var(--sage);margin-top:3px;line-height:1.4;font-style:italic">${esc(f.benefit)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // What We'd Change — patient/practice outcome framing
  const improvements = deriveImprovements(techAudit, aiAudit).slice(0, 5);
  const improvementRows = improvements.map(item => `
  <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #F0EDE8">
    <div style="color:var(--terracotta);font-weight:800;flex-shrink:0;margin-top:2px;font-size:13px">→</div>
    <div style="font-size:13px;line-height:1.5">${esc(item.msg)}</div>
  </div>`).join('');

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount  = findings.filter(f => f.severity === 'warning').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audit Summary — ${esc(practiceName)}</title>
<style>
${sharedCss()}

@page { size: A4; margin: 15mm; }

body {
  background: white;
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 32px 48px;
}

.report-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding-bottom: 20px; border-bottom: 3px solid var(--ink); margin-bottom: 24px;
}
.report-title { font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.3px; }
.report-sub   { font-size: 13px; color: var(--text-dim); margin-top: 4px; line-height: 1.5; }
.gw-logo { text-align: right; }
.gw-logo .mark { font-size: 13px; font-weight: 800; color: var(--terracotta); letter-spacing: 1px; text-transform: uppercase; }
.gw-logo .domain { font-size: 11px; color: var(--text-dim); }

.scores-section { background: #FAF8F5; border-radius: var(--radius); padding: 20px 24px; margin-bottom: 24px; }
.scores-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.scores-headline { font-size: 14px; font-weight: 700; color: var(--ink); }
.scores-attribution { font-size: 11px; color: var(--text-dim); }
.scores-attribution a { color: var(--blue); }
.score-strip { display: flex; gap: 12px; flex-wrap: wrap; }

.severity-bar { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.sev-badge { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
.sev-badge.critical { background: #FDDCDC; color: var(--red); }
.sev-badge.warning  { background: #FEF3CD; color: var(--amber); }

.section-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
  color: var(--text-dim); margin-bottom: 12px;
  display: flex; align-items: center; gap: 8px;
}
.section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 560px) { .two-col { grid-template-columns: 1fr; } }

.block { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }

.cta-block {
  background: var(--ink); border-radius: var(--radius); padding: 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin-top: 28px;
}
.cta-left h3 { font-size: 16px; font-weight: 700; color: white; margin-bottom: 4px; }
.cta-left p  { font-size: 13px; color: #9E9990; }
.cta-btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--terracotta); color: white; text-decoration: none;
  font-size: 14px; font-weight: 700; padding: 12px 22px; border-radius: var(--radius);
  white-space: nowrap; flex-shrink: 0;
}
.cta-btn:hover { opacity: 0.9; }

.report-footer {
  margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; color: var(--text-dim);
}

@media print {
  body { padding: 0; }
  .cta-block { display: none; }
  a { text-decoration: none; }
}
</style>
</head>
<body>

<!-- Header -->
<div class="report-header">
  <div>
    <div class="report-title">${esc(practiceName)}</div>
    <div class="report-sub">${esc(url)}<br>Audit generated ${esc(runDate)}</div>
  </div>
  <div class="gw-logo">
    <div class="mark">Groundwork</div>
    <div class="domain">groundwork.build</div>
  </div>
</div>

<!-- Scores -->
${!mobile ? '' : `
<div class="scores-section">
  <div class="scores-top">
    <div class="scores-headline">Your Site Scores</div>
    <div class="scores-attribution">
      Scores measured by Google Lighthouse — an objective tool built into Google Chrome.
      <a href="https://pagespeed.web.dev" target="_blank">Test it yourself →</a>
    </div>
  </div>
  <div class="score-strip">${scoreCircles}</div>
</div>
`}

<!-- Issue count -->
${(criticalCount > 0 || warningCount > 0) ? `
<div class="severity-bar">
  ${criticalCount > 0 ? `<div class="sev-badge critical">✕ ${criticalCount} critical issue${criticalCount !== 1 ? 's' : ''}</div>` : ''}
  ${warningCount > 0  ? `<div class="sev-badge warning">! ${warningCount} warning${warningCount !== 1 ? 's' : ''}</div>` : ''}
</div>` : ''}

<!-- Two Column: What We Found + What We'd Change -->
<div class="two-col">

  <div class="block">
    <div class="section-title" style="margin-bottom:10px">What We Found</div>
    ${topFindings.length > 0 ? findingRows : `<p style="font-size:13px;color:var(--text-dim)">No critical issues found — the site is in good shape.</p>`}
  </div>

  <div class="block">
    <div class="section-title" style="margin-bottom:10px">What We'd Change</div>
    ${improvementRows || `<p style="font-size:13px;color:var(--text-dim)">Run a full audit with a URL to see specific recommendations.</p>`}
    ${aiAudit?.positioning?.recommended ? `
    <div style="margin-top:14px;padding:10px 12px;background:var(--cream);border-left:3px solid var(--terracotta);border-radius:0 6px 6px 0;font-size:12px;line-height:1.5;color:var(--ink)">
      <strong style="color:var(--terracotta)">New positioning:</strong> ${esc(aiAudit.positioning.recommended.slice(0, 120))}${aiAudit.positioning.recommended.length > 120 ? '…' : ''}
    </div>` : ''}
  </div>

</div>

<!-- Preview CTA -->
${previewUrl ? `
<div class="cta-block">
  <div class="cta-left">
    <h3>See your redesign</h3>
    <p>Built from your existing content — no intake form needed.</p>
  </div>
  <a class="cta-btn" href="${esc(previewUrl)}" target="_blank" rel="noopener">
    View Preview →
  </a>
</div>` : `
<div class="cta-block">
  <div class="cta-left">
    <h3>Ready for a new site?</h3>
    <p>Groundwork builds fully custom, SEO-optimized sites in under 24 hours.</p>
  </div>
  <a class="cta-btn" href="https://groundwork.build" target="_blank" rel="noopener">
    Get Started →
  </a>
</div>`}

<!-- Footer -->
<div class="report-footer">
  <span>Generated by Groundwork Builder · groundwork.build</span>
  <span>${esc(runDate)}</span>
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate both audit reports and write them to outputDir.
 *
 * @param {string} outputDir
 * @param {object} opts
 * @param {string}        opts.url
 * @param {string}        opts.practiceName
 * @param {object|null}   opts.pagespeed    - { mobile, desktop } from runPageSpeed
 * @param {object|null}   opts.techAudit    - from runTechAudit
 * @param {object|null}   opts.aiAudit      - from runSiteAudit
 * @param {object|null}   opts.scraped      - silver data
 * @param {string|null}   opts.previewUrl   - URL to preview (if any)
 */
export async function generateAuditReports(outputDir, {
  url = '',
  practiceName = 'Site Audit',
  pagespeed = null,
  techAudit = null,
  aiAudit = null,
  scraped = null,
  previewUrl = null,
  growthScore = null,
  gbpMeta = null,
  diff = null,
  outputFilename = null,
} = {}) {
  await mkdir(outputDir, { recursive: true });

  const shared = { url, practiceName, pagespeed, techAudit, aiAudit, scraped, previewUrl, growthScore, gbpMeta, diff };

  const fullHtml    = buildFullReport(shared);
  const summaryHtml = buildSummaryReport(shared);

  const baseName = outputFilename || (diff ? 'audit-report-after' : 'audit-report');
  const fullPath    = resolve(outputDir, `${baseName}.html`);
  const summaryPath = resolve(outputDir, `${baseName === 'audit-report' ? 'audit-summary' : baseName + '-summary'}.html`);

  await Promise.all([
    writeFile(fullPath, fullHtml, 'utf-8'),
    writeFile(summaryPath, summaryHtml, 'utf-8'),
  ]);

  console.log(`[AuditReport] Written: ${fullPath}`);
  console.log(`[AuditReport] Written: ${summaryPath}`);

  return { fullPath, summaryPath };
}
