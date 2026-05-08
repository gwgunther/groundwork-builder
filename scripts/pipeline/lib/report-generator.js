/**
 * Pipeline Report Generator
 *
 * Reads all _pipeline/*.json artifacts and generates a self-contained
 * _pipeline/index.html report viewable in any browser.
 *
 * Tabs:
 *   1. AI Audit        — positioning, tone, differentiators, gaps, SEO
 *   2. Design System   — mood, palette, fonts + Creative Director DNA
 *                        (candidates, eval rationale, archetype, section order)
 *   3. Signals         — hybrid silver signals[] with type + confidence
 *   4. Generated Copy  — homepage, about, services, FAQs, blog
 *   5. Page Inventory  — per-page details from bronze crawl
 *   6. Build & Data    — pipeline cards, confidence flags, placeholders
 *   7. What's Missing  — critical / important / optional checklist
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function generateReport(pipelineDir, extras = {}) {
  const files = [
    '01-scrape', '01-bronze',
    '02-audit', '03-content', '04-design', '04b-brand', '05-director',
    '06-merge', '07-inject', '07-image-analysis', '08-pages', '09-build',
    '09-image-roles',
    'missing', 'summary',
  ];
  const data = {};

  await Promise.allSettled(
    files.map(async (name) => {
      try {
        const raw = await readFile(resolve(pipelineDir, `${name}.json`), 'utf-8');
        data[name] = JSON.parse(raw);
      } catch {
        data[name] = null;
      }
    }),
  );

  // Try to load full bronze for the Raw Pipeline tab (try both filenames)
  let bronzeFull = null;
  for (const fname of ['01-bronze-full.json', '01-bronze.json']) {
    try {
      const raw = await readFile(resolve(pipelineDir, fname), 'utf-8');
      bronzeFull = JSON.parse(raw);
      break;
    } catch {
      // try next
    }
  }

  let agentData = null;
  try {
    const agentRaw = await readFile(resolve(pipelineDir, '10-agent.json'), 'utf-8');
    agentData = JSON.parse(agentRaw)?.output || null;
  } catch {}

  const html = buildHtml(data, extras, bronzeFull, agentData);
  await writeFile(resolve(pipelineDir, 'index.html'), html, 'utf-8');
}

// ===========================================================================
// Main HTML builder
// ===========================================================================

function buildHtml(d, extras = {}, bronzeFull = null, agentData = null) {
  const summary    = d['summary']     || {};
  const scrape     = d['01-scrape']   || {};
  const director   = d['05-director'] || {};
  const audit      = d['02-audit']    || {};
  const content    = d['03-content']  || {};
  const design     = d['04-design']   || {};
  const brand      = d['04b-brand']   || {};
  const merge      = d['06-merge']    || {};
  const pages      = d['08-pages']    || {};
  const build      = d['09-build']    || {};
  const missing    = d['missing']     || {};
  const brandOutput = brand.output || null;

  const practiceName  = summary.practiceName  || scrape.output?.practice?.name || 'Unknown Practice';
  const doctorName    = summary.doctorName    || scrape.output?.doctor?.name   || '—';
  const phone         = summary.phone         || scrape.output?.practice?.phone || '—';
  const city          = scrape.output?.address?.city || '—';
  const stateAbbr     = scrape.output?.address?.state || '';
  const timestamp     = summary.timestamp     || new Date().toISOString();
  const elapsed       = summary.elapsed_s != null ? `${summary.elapsed_s}s` : '—';
  const buildPassed   = summary.buildSuccess;
  const buildSkipped  = summary.buildSuccess == null && !d['09-build'];

  const auditOutput    = audit.output    || null;
  const contentOutput  = content.output  || null;
  const designOutput   = design.output   || null;
  const directorDna    = director.output || null;
  const directorMeta   = director._meta  || null;
  const missingData    = missing         || {};
  const mergeOutput    = merge.output    || {};
  const scrapeOutput   = scrape.output   || {};
  const pagesOutput    = pages.output    || {};
  const buildOutput    = build.output    || {};

  const confidenceFlags = summary.confidenceFlags || merge.confidence || [];
  const placeholders    = summary.placeholders    || buildOutput.placeholders || [];
  const brokenLinks     = summary.brokenLinks     || buildOutput.brokenLinks  || [];
  const errors          = summary.errors          || buildOutput.errors       || [];

  const signals        = scrapeOutput.signals || [];
  const pageInventory  = extras?.scraped?.pageInventory || scrapeOutput.pageInventory || [];

  // Human gate issue count (imagery, distinctiveness, trust_signals scored < 7)
  const humanGateDims = ['imagery', 'distinctiveness', 'trust_signals'];
  const agentFinalDims = agentData?.finalScore?.dimensions || {};
  const humanGateIssueCount = humanGateDims.filter(dim => {
    const dimData = agentFinalDims[dim];
    const score = dimData?.score ?? dimData ?? null;
    return score !== null && score < 7;
  }).length;

  const runDate = formatDate(timestamp);

  // GCS prefix link (if available)
  const gcsPrefix = summary.gcs_prefix || directorMeta?.gcsPrefix || null;

  const steps = [
    { id: '01-scrape',  label: 'Scrape',    data: d['01-scrape']  },
    { id: '02-audit',   label: 'AI Audit',  data: d['02-audit']   },
    { id: '04-design',  label: 'Design',    data: d['04-design']  },
    { id: '04b-brand',  label: 'Brand',     data: d['04b-brand']  },
    { id: '07-image-analysis', label: 'Images', data: d['07-image-analysis'] },
    { id: '05-director',label: 'Director',  data: d['05-director'] },
    { id: '03-content', label: 'Content',   data: d['03-content'] },
    { id: '06-merge',   label: 'Merge',     data: d['06-merge']   },
    { id: '07-inject',  label: 'Inject',    data: d['07-inject']  },
    { id: '08-pages',   label: 'Pages',     data: d['08-pages']   },
    { id: '09-build',   label: 'Build',     data: d['09-build']   },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Report — ${esc(practiceName)}</title>
<style>${styles()}</style>
</head>
<body>

<!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
<header class="header">
  <div class="header-left">
    <h1>${esc(practiceName)}</h1>
    <div class="sub">${esc(doctorName)} &nbsp;·&nbsp; ${esc(phone)} &nbsp;·&nbsp; ${esc(city)}${stateAbbr ? ', ' + esc(stateAbbr) : ''}</div>
  </div>
  <div class="header-badge">
    <span class="elapsed">${esc(elapsed)}</span>
    ${esc(runDate)}<br>
    Groundwork Builder Pipeline
  </div>
</header>

<!-- ═══ STEPS BAR ════════════════════════════════════════════════════════ -->
<div class="steps-bar">
  ${steps.map(step => {
    const state = stepState(step);
    return `<div class="step-item">
    <div class="step-dot ${state}">${stepIcon(state)}</div>
    <span class="step-label ${state}">${esc(step.label)}</span>
  </div>`;
  }).join('\n  ')}
</div>

<!-- ═══ NAV TABS ══════════════════════════════════════════════════════════ -->
<nav class="tab-nav">
  <button class="tab-btn${humanGateIssueCount > 0 ? ' active' : ''} action-items-tab" data-tab="action-items">Action Items ${humanGateIssueCount > 0 ? `<span class="badge-red">${humanGateIssueCount}</span>` : ''}</button>
  <button class="tab-btn${humanGateIssueCount === 0 ? ' active' : ''}" data-tab="audit">AI Audit</button>
  <button class="tab-btn" data-tab="design">Design Extraction</button>
  <button class="tab-btn" data-tab="brand">Brand &amp; Director</button>
  <button class="tab-btn" data-tab="signals">Signals ${signals.length > 0 ? `<span class="badge-blue">${signals.length}</span>` : ''}</button>
  <button class="tab-btn" data-tab="content">Generated Copy</button>
  <button class="tab-btn" data-tab="pages">Page Inventory</button>
  <button class="tab-btn" data-tab="images">Images</button>
  <button class="tab-btn" data-tab="build">Build &amp; Data</button>
  <button class="tab-btn" data-tab="raw">Raw Pipeline</button>
  <button class="tab-btn missing-tab" data-tab="missing">What's Missing ${missingData.summary?.critical > 0 ? `<span class="badge-red">${missingData.summary.critical}</span>` : ''}</button>
</nav>

<!-- ═══ MAIN ══════════════════════════════════════════════════════════════ -->
<main class="main">

  <div class="tab-panel${humanGateIssueCount > 0 ? ' active' : ''}" id="tab-action-items">
    ${buildActionItemsSection(agentData)}
  </div>

  <div class="tab-panel${humanGateIssueCount === 0 ? ' active' : ''}" id="tab-audit">
    ${buildAuditSection(auditOutput)}
  </div>

  <div class="tab-panel" id="tab-design">
    ${buildDesignSection(designOutput, scrapeOutput, directorDna, directorMeta)}
  </div>

  <div class="tab-panel" id="tab-brand">
    ${buildBrandSection(brandOutput, directorDna, directorMeta)}
  </div>

  <div class="tab-panel" id="tab-signals">
    ${buildSignalsSection(signals, scrapeOutput)}
  </div>

  <div class="tab-panel" id="tab-content">
    ${buildContentSection(contentOutput)}
  </div>

  <div class="tab-panel" id="tab-pages">
    ${buildPageInventorySection(pageInventory, scrapeOutput)}
  </div>

  <div class="tab-panel" id="tab-images">
    ${buildImageAnalysisSection(d['07-image-analysis'])}
  </div>

  <div class="tab-panel" id="tab-build">
    ${buildBuildSection(scrapeOutput, mergeOutput, pagesOutput, buildOutput, summary, confidenceFlags, placeholders, brokenLinks, errors, buildPassed, buildSkipped)}
  </div>

  <div class="tab-panel" id="tab-raw">
    ${buildRawPipelineSection(d, bronzeFull, scrapeOutput)}
  </div>

  <div class="tab-panel" id="tab-missing">
    ${buildMissingSection(missingData)}
  </div>

</main>

<script>${tabScript()}</script>
</body>
</html>`;
}

// ===========================================================================
// Section: Action Items (human gate)
// ===========================================================================

function buildActionItemsSection(agentResult) {
  if (!agentResult) {
    return `<div class="empty-state"><div class="icon">🔍</div><p>Agent loop did not run — no QC data available.</p></div>`;
  }

  const humanDims = ['imagery', 'distinctiveness', 'trust_signals'];
  const agentDims = ['typography', 'color_contrast', 'spatial_layout', 'information_hierarchy', 'craft', 'ux_writing'];
  const finalDims = agentResult.finalScore?.dimensions || {};

  const humanLabels = {
    imagery:        'Imagery',
    distinctiveness: 'Distinctiveness',
    trust_signals:  'Trust Signals',
  };
  const humanDescriptions = {
    imagery:        'Gallery or hero images need replacement',
    distinctiveness: 'Design reads as generic — needs creative differentiation',
    trust_signals:  'Trust elements missing or not surfaced on homepage',
  };
  const humanHowToFix = {
    imagery:        'Replace stock family/model photos with authentic practice photos. Before/after photos are highest value. Check _data/image-analysis for analyzed images sorted by quality.',
    distinctiveness: 'Review CTA copy, hero headline, and section labels. Make them specific to this practice — reference the doctor name, city, or a unique differentiator.',
    trust_signals:  'Add a reviews section to the homepage using the scraped Google reviews. Surface insurance/payment info if available. Ensure phone is a tel: link.',
  };

  const issueItems = [];
  for (const dim of humanDims) {
    const dimData = finalDims[dim];
    const score = dimData?.score ?? dimData ?? null;
    if (score !== null && score < 7) {
      const gripes = dimData?.gripes || [];
      issueItems.push({ dim, score, gripes });
    }
  }

  const scoreColor = (s) => {
    if (s < 5) return 'var(--red)';
    if (s < 7) return 'var(--amber)';
    return 'var(--green)';
  };

  const allClearBlock = issueItems.length === 0 ? `
  <div class="ai-allclear">
    <div class="ai-allclear-icon">✓</div>
    <div>
      <strong>All clear — no human-gate issues.</strong>
      <p>The agent found no human-gate issues. Site is ready to handoff.</p>
    </div>
  </div>` : '';

  const issueCards = issueItems.map(item => {
    const gripeRows = item.gripes.map(g => `<li>${esc(g)}</li>`).join('');
    return `
    <div class="ai-issue-card">
      <div class="ai-issue-header">
        <span class="ai-issue-label">${esc(humanLabels[item.dim])}</span>
        <span class="ai-issue-score" style="background:${scoreColor(item.score)}">${item.score}/10</span>
      </div>
      <p class="ai-issue-desc">${esc(humanDescriptions[item.dim])}</p>
      ${item.gripes.length > 0 ? `
      <div class="ai-issue-gripes">
        <div class="ai-sub-label">Agent observations</div>
        <ul class="ai-gripe-list">${gripeRows}</ul>
      </div>` : ''}
      <div class="ai-issue-fix">
        <div class="ai-sub-label">How to fix</div>
        <p>${esc(humanHowToFix[item.dim])}</p>
      </div>
    </div>`;
  }).join('');

  // Agent dims summary card
  const agentDimCells = agentDims.map(dim => {
    const dimData = finalDims[dim];
    const score = dimData?.score ?? dimData ?? null;
    const scoreStr = score !== null ? String(score) : '—';
    const cellColor = score === null ? '#ccc' : score >= 7 ? 'var(--green)' : score >= 6 ? 'var(--amber)' : 'var(--red)';
    const label = dim.replace(/_/g, ' ');
    return `<div class="ai-dim-cell">
      <div class="ai-dim-score" style="color:${cellColor}">${esc(scoreStr)}</div>
      <div class="ai-dim-label">${esc(label)}</div>
    </div>`;
  }).join('');

  return `
  <div class="action-items-section">
    <div class="ai-section-header">
      <div>
        <h2>Action Items</h2>
        <p class="ai-subtitle">Issues the agent diagnosed but cannot fix — require your input before handoff</p>
      </div>
      <span class="audit-meta">Agent: ${agentResult.iterations || '?'} iterations · gate=${agentResult.gate_pass ?? '?'} · score=${agentResult.finalScore?.overall ?? '?'}</span>
    </div>

    ${allClearBlock}
    ${issueCards}

    <div class="ai-agent-summary">
      <div class="ai-sub-label" style="margin-bottom:12px">Agent QC — What Was Fixed Automatically</div>
      <div class="ai-dims-grid">${agentDimCells}</div>
    </div>
  </div>`;
}

// ===========================================================================
// Section: AI Audit
// ===========================================================================

function buildAuditSection(auditOutput) {
  if (!auditOutput) {
    return `<div class="empty-state"><div class="icon">🤖</div><p>No AI audit — ensure <code>ANTHROPIC_API_KEY</code> is set.</p></div>`;
  }
  return `
  <div class="audit-section">
    <div class="audit-header">
      <h2>Strategy Recommendations</h2>
      <span class="audit-meta">claude-sonnet-4-6 &nbsp;·&nbsp; ${auditOutput._meta?.input_tokens || '?'} in / ${auditOutput._meta?.output_tokens || '?'} out &nbsp;·&nbsp; ${msToSec(auditOutput._meta?.duration_ms)}s</span>
    </div>
    <div class="audit-body">

      <div class="audit-block">
        <h4>Positioning</h4>
        <div class="current-label">Current</div>
        <p>${esc(auditOutput.positioning?.current || '—')}</p>
        <div class="rec-label">Recommended</div>
        <p class="recommended">${esc(auditOutput.positioning?.recommended || '—')}</p>
        <p class="rationale">${esc(auditOutput.positioning?.rationale || '')}</p>
      </div>

      <div class="audit-block">
        <h4>Brand Tone</h4>
        <div class="current-label">Current</div>
        <p>${esc(auditOutput.tone?.current || '—')}</p>
        <div class="rec-label">Recommended</div>
        <p class="recommended">${esc(auditOutput.tone?.recommended || '—')}</p>
        <p class="rationale">${esc(auditOutput.tone?.rationale || '')}</p>
      </div>

      <div class="audit-block">
        <h4>Service Emphasis</h4>
        <div class="tag-list">
          ${auditOutput.serviceEmphasis?.primary ? `<span class="tag primary">${esc(auditOutput.serviceEmphasis.primary)}</span>` : ''}
          ${(auditOutput.serviceEmphasis?.secondary || []).map(s => `<span class="tag secondary">${esc(s)}</span>`).join(' ')}
        </div>
        <p class="rationale" style="margin-top:10px">${esc(auditOutput.serviceEmphasis?.rationale || '')}</p>
      </div>

      <div class="audit-block">
        <h4>Differentiators</h4>
        <ul class="bullet-list">
          ${(auditOutput.differentiators || []).map(d => `<li>${esc(d)}</li>`).join('')}
        </ul>
      </div>

      <div class="audit-block">
        <h4>Content Gaps</h4>
        <ul class="bullet-list">
          ${(auditOutput.contentGaps || []).map(g => `<li>${esc(g)}</li>`).join('')}
        </ul>
      </div>

      <div class="audit-block">
        <h4>SEO Opportunities</h4>
        <ul class="bullet-list">
          ${(auditOutput.seoOpportunities || []).map(o => `<li>${esc(o)}</li>`).join('')}
        </ul>
      </div>

      ${auditOutput.warnings?.length ? `
      <div class="audit-block" style="grid-column:1/-1">
        <h4>Warnings</h4>
        <ul class="bullet-list warning">
          ${auditOutput.warnings.map(w => `<li>${esc(w)}</li>`).join('')}
        </ul>
      </div>` : ''}

    </div>
  </div>`;
}

// ===========================================================================
// Section: Design System + Creative Director
// ===========================================================================

function buildDesignSection(designOutput, scrapeOutput, directorDna, directorMeta) {
  const oldColors = scrapeOutput.brand?.colors || scrapeOutput.colors || null;

  const swatches = (colors, label) => {
    const entries = Object.entries(colors).filter(([, v]) => v && /^#/.test(String(v)));
    if (entries.length === 0) return `<div class="swatch-group"><div class="swatch-label">${esc(label)}</div><p class="dim">None detected</p></div>`;
    return `<div class="swatch-group">
      <div class="swatch-label">${esc(label)}</div>
      <div class="swatch-row">
        ${entries.map(([k, v]) => {
          const hex = String(v).match(/#[0-9a-fA-F]{3,8}/)?.[0] || v;
          return `<div class="swatch-item">
            <div class="swatch-block" style="background:${esc(hex)}"></div>
            <div class="swatch-name">${esc(k)}</div>
            <div class="swatch-hex">${esc(hex)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  const palette = designOutput?.palette || {};
  const fonts   = designOutput?.fonts   || {};
  const oldPalette = oldColors || {};

  // ── Director DNA block ──────────────────────────────────────────────────
  let directorBlock = '';
  if (directorDna) {
    const candidates = Array.isArray(directorMeta?.candidates) ? directorMeta.candidates : [];
    const selectedIdx = directorMeta?.selectedCandidate ?? null;

    const sectionPills = (directorDna.sectionOrder || []).map((s, i) =>
      `<span class="section-pill" style="--i:${i}">${esc(s)}</span>`).join('');

    const candidateCards = candidates.map((c, i) => {
      const isWinner = i === selectedIdx;
      return `<div class="candidate-card ${isWinner ? 'winner' : ''}">
        <div class="candidate-header">
          ${isWinner ? '<span class="winner-badge">✓ Selected</span>' : `<span class="cand-num">Candidate ${i + 1}</span>`}
          <span class="cand-temp">temp ${c.temperature ?? '?'}</span>
        </div>
        <div class="cand-archetype">${esc(c.archetype || c.dna?.archetype || '—')}</div>
        <div class="cand-hero">Hero: ${esc(c.heroVariant || c.dna?.heroVariant || '—')}</div>
        ${c.mood || c.dna?.mood ? `<div class="cand-mood">${esc(c.mood || c.dna?.mood)}</div>` : ''}
        ${c.adjectives || c.dna?.adjectives ? `<div class="cand-adj">${(c.adjectives || c.dna?.adjectives || []).map(a => `<span class="adj-tag">${esc(a)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    directorBlock = `
    <div class="director-section">
      <div class="director-header">
        <h3>🎬 Creative Director</h3>
        <span class="audit-meta">${directorMeta?.evaluationMethod || 'multi-candidate'} &nbsp;·&nbsp; ${candidates.length || 1} candidate${candidates.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="dna-grid">
        <div class="dna-block">
          <div class="dna-label">Archetype</div>
          <div class="dna-value arch">${esc(directorDna.archetype || '—')}</div>
        </div>
        <div class="dna-block">
          <div class="dna-label">Hero Variant</div>
          <div class="dna-value">${esc(directorDna.heroVariant || '—')}</div>
        </div>
        <div class="dna-block">
          <div class="dna-label">Radius / Density</div>
          <div class="dna-value">${esc(directorDna.radius || '—')} / ${esc(directorDna.density || '—')}</div>
        </div>
        <div class="dna-block">
          <div class="dna-label">Typography Scale</div>
          <div class="dna-value">${esc(directorDna.typographyScale || '—')}</div>
        </div>
        ${directorDna.borrowedFrom ? `
        <div class="dna-block borrow-block">
          <div class="dna-label">Borrowed Trait</div>
          <div class="dna-value borrow">${esc(directorDna.borrowedTrait || '—')} <span class="borrow-from">← ${esc(directorDna.borrowedFrom)}</span></div>
        </div>` : ''}
      </div>

      <div class="section-order-block">
        <div class="dna-label">Section Order</div>
        <div class="section-pills">${sectionPills}</div>
      </div>

      ${directorMeta?.evalRationale ? `
      <div class="eval-rationale">
        <div class="dna-label">Evaluation Rationale</div>
        <p>${esc(directorMeta.evalRationale)}</p>
      </div>` : ''}

      ${candidates.length > 0 ? `
      <div class="candidates-block">
        <div class="dna-label">Candidates (${candidates.length})</div>
        <div class="candidates-grid">${candidateCards}</div>
      </div>` : ''}

    </div>`;
  }

  const designMeta = designOutput ? `
    <div class="design-header">
      <h2>Design Extraction — What's On The Existing Site</h2>
      <span class="audit-meta">claude-sonnet-4-6 &nbsp;·&nbsp; ${designOutput._meta?.input_tokens || '?'} in / ${designOutput._meta?.output_tokens || '?'} out &nbsp;·&nbsp; ${msToSec(designOutput._meta?.duration_ms)}s</span>
    </div>` : '';

  if (!designOutput) {
    return `<div class="empty-state">
      <div class="icon">🔍</div>
      <p>No design extraction artifact. Phase 2c was skipped or failed.</p>
    </div>`;
  }

  // Brand strength + signal pills
  const strengthColor = {
    strong:   '#2E7D32',
    moderate: '#F57F17',
    weak:     '#C62828',
    none:     '#616161',
  }[designOutput.brandStrength] || '#616161';
  const signalColor = designOutput.evolutionSignal === 'evolve' ? '#2E7D32' : '#C62828';

  return `
  <div class="design-section">

    ${designMeta}

    <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;font-style:italic">This step DOCUMENTS the existing brand. Creative decisions live in the Brand &amp; Director tab.</p>

    <div class="design-body">
      <div class="design-block design-mood-block">
        <h4>Existing Site Mood</h4>
        <div class="mood-badge">${esc(designOutput.mood || '—')}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <span style="background:${strengthColor};color:#fff;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Brand Strength: ${esc(designOutput.brandStrength || '—')}</span>
          <span style="background:${signalColor};color:#fff;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Strategy: ${esc(designOutput.evolutionSignal || '—')}</span>
        </div>
        <p class="rationale" style="margin-top:12px">${esc(designOutput.brandStrengthRationale || designOutput.rationale || '')}</p>
        ${designOutput.colorConsistency ? `<p class="rationale" style="margin-top:6px;font-style:normal"><strong>Color consistency:</strong> ${esc(designOutput.colorConsistency)}</p>` : ''}
      </div>

      <div class="design-block design-fonts-block">
        <h4>Fonts Detected on Existing Site</h4>
        <div class="font-pair">
          <div class="font-item">
            <div class="font-role">Heading</div>
            <div class="font-name">${esc(fonts.heading || '(none detected)')}</div>
          </div>
          <div class="font-item">
            <div class="font-role">Body</div>
            <div class="font-name">${esc(fonts.body || '(none detected)')}</div>
          </div>
        </div>
        ${fonts.detected?.length ? `<div style="font-size:11px;color:var(--text-dim);margin-top:8px">All detected: ${fonts.detected.map(f => esc(f)).join(', ')}</div>` : ''}
      </div>
    </div>

    <div class="palette-compare">
      ${swatches(palette, 'Existing Site Palette (Extracted)')}
      ${swatches(oldPalette, 'Raw Colors From CSS')}
    </div>

  </div>`;
}

// ===========================================================================
// Section: Brand Direction + Creative Director
// ===========================================================================

function buildBrandSection(brandOutput, directorDna, directorMeta) {
  const swatches = (colors, label) => {
    const entries = Object.entries(colors).filter(([k, v]) => v && /^#/.test(String(v)) && k !== 'raw');
    if (entries.length === 0) return `<div class="swatch-group"><div class="swatch-label">${esc(label)}</div><p class="dim">None</p></div>`;
    return `<div class="swatch-group">
      <div class="swatch-label">${esc(label)}</div>
      <div class="swatch-row">
        ${entries.map(([k, v]) => `<div class="swatch-item">
          <div class="swatch-block" style="background:${esc(v)}"></div>
          <div class="swatch-name">${esc(k)}</div>
          <div class="swatch-hex">${esc(v)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  };

  // ── Director DNA block ──────────────────────────────────────────────────
  let directorBlock = '';
  if (directorDna) {
    const candidates = Array.isArray(directorMeta?.candidates) ? directorMeta.candidates : [];
    const selectedIdx = directorMeta?.selectedCandidate ?? null;
    const sectionPills = (directorDna.sectionOrder || []).map((s, i) =>
      `<span class="section-pill" style="--i:${i}">${esc(s)}</span>`).join('');
    const candidateCards = candidates.map((c, i) => {
      const isWinner = i === selectedIdx;
      return `<div class="candidate-card ${isWinner ? 'winner' : ''}">
        <div class="candidate-header">
          ${isWinner ? '<span class="winner-badge">✓ Selected</span>' : `<span class="cand-num">Candidate ${i + 1}</span>`}
          <span class="cand-temp">temp ${c.temperature ?? '?'}</span>
        </div>
        <div class="cand-archetype">${esc(c.archetype || c.dna?.archetype || '—')}</div>
        <div class="cand-hero">Hero: ${esc(c.heroVariant || c.dna?.heroVariant || '—')}</div>
        ${c.mood || c.dna?.mood ? `<div class="cand-mood">${esc(c.mood || c.dna?.mood)}</div>` : ''}
      </div>`;
    }).join('');

    directorBlock = `
    <div class="director-section">
      <div class="director-header">
        <h3>🎬 Creative Director (Phase 2f)</h3>
        <span class="audit-meta">${directorMeta?.evaluationMethod || 'multi-candidate'} &nbsp;·&nbsp; ${candidates.length || 1} candidate${candidates.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="dna-grid">
        <div class="dna-block"><div class="dna-label">Archetype</div><div class="dna-value arch">${esc(directorDna.archetype || '—')}</div></div>
        <div class="dna-block"><div class="dna-label">Hero Variant</div><div class="dna-value">${esc(directorDna.heroVariant || '—')}</div></div>
        <div class="dna-block"><div class="dna-label">Radius / Density</div><div class="dna-value">${esc(directorDna.radius || '—')} / ${esc(directorDna.density || '—')}</div></div>
        <div class="dna-block"><div class="dna-label">Card Treatment</div><div class="dna-value">${esc(directorDna.cardTreatment || '—')}</div></div>
        ${directorDna.borrowedFrom ? `<div class="dna-block borrow-block"><div class="dna-label">Borrowed Trait</div><div class="dna-value borrow">${esc(directorDna.borrowedTrait || '—')} <span class="borrow-from">← ${esc(directorDna.borrowedFrom)}</span></div></div>` : ''}
      </div>
      <div class="section-order-block">
        <div class="dna-label">Section Order</div>
        <div class="section-pills">${sectionPills}</div>
      </div>
      ${directorMeta?.evalRationale ? `<div class="eval-rationale"><div class="dna-label">Evaluation Rationale</div><p>${esc(directorMeta.evalRationale)}</p></div>` : ''}
      ${candidates.length > 0 ? `<div class="candidates-block"><div class="dna-label">Candidates (${candidates.length})</div><div class="candidates-grid">${candidateCards}</div></div>` : ''}
    </div>`;
  }

  if (!brandOutput && !directorDna) {
    return `<div class="empty-state"><div class="icon">🎨</div><p>No brand direction artifact. Phase 2d skipped or failed.</p></div>`;
  }

  const brandHtml = brandOutput ? `
    <div class="design-header">
      <h2>Brand Direction (Phase 2d) — The New Brand</h2>
      <span class="audit-meta">claude-sonnet-4-6 &nbsp;·&nbsp; impeccable-grounded</span>
    </div>
    <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;font-style:italic">Creative decisions made by an AI brand designer informed by Impeccable design principles. This is what the new site uses.</p>

    <div class="design-body">
      <div class="design-block design-mood-block">
        <h4>Brand Mood</h4>
        <div class="mood-badge">${esc(brandOutput.mood || '—')}</div>
        <p class="rationale" style="margin-top:12px">${esc(brandOutput.rationale || '')}</p>
        ${brandOutput.paletteSource ? `<p class="rationale" style="margin-top:8px;font-style:normal"><strong>Palette source:</strong> ${esc(brandOutput.paletteSource)}</p>` : ''}
        ${brandOutput.contrastCheck ? `<p class="rationale" style="margin-top:6px;font-style:normal"><strong>Contrast check:</strong> ${esc(brandOutput.contrastCheck)}</p>` : ''}
      </div>

      <div class="design-block design-fonts-block">
        <h4>Typography</h4>
        <div class="font-pair">
          <div class="font-item">
            <div class="font-role">Heading</div>
            <div class="font-name">${esc(brandOutput.typography?.heading || '—').split('—')[0].trim()}</div>
          </div>
          <div class="font-item">
            <div class="font-role">Body</div>
            <div class="font-name">${esc(brandOutput.typography?.body || '—').split('—')[0].trim()}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="palette-compare">
      ${swatches(brandOutput.palette || {}, 'New Brand Palette')}
    </div>

    ${brandOutput.voice ? `
    <div class="design-block" style="margin-top:16px">
      <h4>Voice &amp; Tone</h4>
      ${brandOutput.voice.headline_style ? `<p style="font-size:13px;margin-bottom:6px"><strong>Headlines:</strong> ${esc(brandOutput.voice.headline_style)}</p>` : ''}
      ${brandOutput.voice.cta_language ? `<p style="font-size:13px;margin-bottom:6px"><strong>CTA language:</strong> ${esc(brandOutput.voice.cta_language)}</p>` : ''}
      ${brandOutput.voice.tone_notes ? `<p style="font-size:13px;color:var(--text-dim);margin-top:8px">${esc(brandOutput.voice.tone_notes)}</p>` : ''}
    </div>` : ''}
  ` : '';

  return `<div class="design-section">${brandHtml}${directorBlock}</div>`;
}

// ===========================================================================
// Section: Signals
// ===========================================================================

const SIGNAL_COLORS = {
  differentiator: '#C45D3E',
  financing:      '#2E7D4F',
  language:       '#1565C0',
  technology:     '#6A1B9A',
  award:          '#F57F17',
  membership:     '#00695C',
  unique_feature: '#37474F',
  emergency:      '#B71C1C',
  hours_note:     '#4E342E',
  staff_note:     '#1A237E',
  insurance:      '#1B5E20',
  patient_perk:   '#880E4F',
};

function buildSignalsSection(signals, scrapeOutput) {
  if (!signals || signals.length === 0) {
    return `<div class="empty-state">
      <div class="icon">📡</div>
      <p>No signals extracted. Silver extraction may have found nothing noteworthy, or the pipeline was skipped.</p>
    </div>`;
  }

  // Group by type
  const groups = {};
  for (const sig of signals) {
    const t = sig.type || 'other';
    if (!groups[t]) groups[t] = [];
    groups[t].push(sig);
  }

  const groupBlocks = Object.entries(groups).map(([type, items]) => {
    const color = SIGNAL_COLORS[type] || '#666';
    const rows = items.map(s => {
      const conf = Math.round((s.confidence || 0) * 100);
      return `<div class="signal-row">
        <div class="signal-text">${esc(s.text || s.value || JSON.stringify(s))}</div>
        <div class="signal-conf" title="confidence">${conf}%</div>
        ${s.source ? `<div class="signal-source">${esc(s.source)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="signal-group">
      <div class="signal-group-header" style="border-left-color:${esc(color)}">
        <span class="signal-type-badge" style="background:${esc(color)}">${esc(type)}</span>
        <span class="signal-count">${items.length}</span>
      </div>
      <div class="signal-rows">${rows}</div>
    </div>`;
  }).join('');

  // Summary pills
  const pills = Object.entries(groups).map(([type, items]) => {
    const color = SIGNAL_COLORS[type] || '#666';
    return `<div class="sig-pill" style="border-left-color:${esc(color)}">
      <span class="sig-pill-num" style="color:${esc(color)}">${items.length}</span>
      <span class="sig-pill-label">${esc(type.replace(/_/g, ' '))}</span>
    </div>`;
  }).join('');

  return `
  <div class="signals-section">
    <div class="signals-header">
      <h2>Practice Signals</h2>
      <span class="audit-meta">${signals.length} signal${signals.length !== 1 ? 's' : ''} extracted from silver layer</span>
    </div>

    <div class="sig-pills-row">${pills}</div>

    <div class="signal-groups">${groupBlocks}</div>
  </div>`;
}

// ===========================================================================
// Section: Generated Copy
// ===========================================================================

function buildContentSection(contentOutput) {
  if (!contentOutput) {
    return `<div class="empty-state"><div class="icon">✍️</div><p>No AI content mapping — ensure <code>ANTHROPIC_API_KEY</code> is set.</p></div>`;
  }

  const hp   = contentOutput.homepage || {};
  const ab   = contentOutput.about    || {};
  const svcs = contentOutput.services || {};
  const faqs = contentOutput.faqs     || [];
  const blogs = contentOutput.blogTopics || [];
  const locs  = contentOutput.locations  || {};

  const renderCopyBlock = (label, value) => value
    ? `<div class="copy-row"><span class="copy-label">${esc(label)}</span><span class="copy-value">${esc(value)}</span></div>`
    : '';

  const serviceBlocks = Object.entries(svcs).map(([slug, svc]) => `
    <details class="service-detail">
      <summary><strong>${esc(slug)}</strong></summary>
      <div class="service-body">
        ${renderCopyBlock('H1', svc.headline)}
        ${renderCopyBlock('Subheadline', svc.subheadline)}
        ${renderCopyBlock('Intro', svc.intro)}
        ${svc.benefits?.length ? `<div class="copy-row"><span class="copy-label">Benefits</span><ul class="copy-bullets">${svc.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''}
        ${renderCopyBlock('CTA', svc.cta)}
      </div>
    </details>`).join('');

  const faqRows = faqs.map(f => `
    <details class="faq-detail">
      <summary>${esc(f.question)}</summary>
      <p class="faq-answer">${esc(f.answer)}</p>
    </details>`).join('');

  const blogRows = blogs.map(b => `
    <div class="blog-row">
      <strong>${esc(b.title)}</strong>
      <p>${esc(b.excerpt)}</p>
    </div>`).join('');

  return `
  <div class="content-section">
    <div class="content-header">
      <h2>AI Generated Copy</h2>
      <span class="audit-meta">claude-sonnet-4-6 &nbsp;·&nbsp; ${contentOutput._meta?.input_tokens || '?'} in / ${contentOutput._meta?.output_tokens || '?'} out &nbsp;·&nbsp; ${msToSec(contentOutput._meta?.duration_ms)}s</span>
    </div>

    <div class="content-body">
      <div class="content-block">
        <h4>Homepage</h4>
        ${renderCopyBlock('Hero Headline', hp.heroHeadline)}
        ${renderCopyBlock('Hero Subheadline', hp.heroSubheadline)}
        ${renderCopyBlock('Tagline', hp.heroTagline)}
        ${renderCopyBlock('Primary CTA', hp.ctaText)}
        ${renderCopyBlock('Secondary CTA', hp.ctaSecondaryText)}
        ${renderCopyBlock('Value Prop', hp.valueProp)}
      </div>

      <div class="content-block">
        <h4>About Page</h4>
        ${renderCopyBlock('Headline', ab.headline)}
        ${renderCopyBlock('Intro Paragraph', ab.introParagraph)}
        ${renderCopyBlock('Philosophy', ab.philosophy)}
        ${renderCopyBlock('Closing CTA', ab.closingCTA)}
      </div>

      ${locs.headline ? `
      <div class="content-block">
        <h4>Locations</h4>
        ${renderCopyBlock('Headline', locs.headline)}
        ${renderCopyBlock('Intro', locs.intro)}
      </div>` : ''}
    </div>

    ${serviceBlocks ? `
    <div class="content-group">
      <h4 class="group-title">Service Pages</h4>
      <div class="service-list">${serviceBlocks}</div>
    </div>` : ''}

    ${faqRows ? `
    <div class="content-group">
      <h4 class="group-title">FAQs (${faqs.length})</h4>
      <div class="faq-list">${faqRows}</div>
    </div>` : ''}

    ${blogRows ? `
    <div class="content-group">
      <h4 class="group-title">Blog Topic Ideas</h4>
      <div class="blog-list">${blogRows}</div>
    </div>` : ''}

  </div>`;
}

// ===========================================================================
// Section: Page Inventory
// ===========================================================================

function buildPageInventorySection(pageInventory, scrapeOutput) {
  if (!pageInventory || pageInventory.length === 0) {
    return `<div class="empty-state"><div class="icon">🗺️</div><p>No page inventory — run with a URL to scrape the existing site.</p></div>`;
  }

  const rows = pageInventory.map(page => {
    const h2Preview  = (page.h2s || []).slice(0, 3).join(' · ');
    const paraPreview = (page.paragraphs || [])[0]?.slice(0, 160) || '';
    return `
    <details class="page-detail">
      <summary>
        <span class="page-path">${esc(page.path || page.url)}</span>
        <span class="page-wc">${page.wordCount || 0} words</span>
      </summary>
      <div class="page-body">
        ${page.title    ? `<div class="page-row"><span class="page-key">Title</span><span>${esc(page.title)}</span></div>` : ''}
        ${page.metaDesc ? `<div class="page-row"><span class="page-key">Meta</span><span>${esc(page.metaDesc)}</span></div>` : ''}
        ${page.h1       ? `<div class="page-row"><span class="page-key">H1</span><span class="bold">${esc(page.h1)}</span></div>` : ''}
        ${h2Preview     ? `<div class="page-row"><span class="page-key">H2s</span><span>${esc(h2Preview)}</span></div>` : ''}
        ${page.h3s?.length ? `<div class="page-row"><span class="page-key">H3s</span><span>${esc(page.h3s.slice(0, 4).join(' · '))}</span></div>` : ''}
        ${paraPreview   ? `<div class="page-row para-row"><span class="page-key">Excerpt</span><span class="para-text">${esc(paraPreview)}${(page.paragraphs?.[0]?.length || 0) > 160 ? '…' : ''}</span></div>` : ''}
      </div>
    </details>`;
  }).join('');

  const scrapeContent = scrapeOutput.content || {};
  const testimonialCount = (scrapeContent.testimonials || []).length;
  const faqCount         = (scrapeContent.faqs || []).length;
  const insuranceList    = (scrapeContent.insurance || []).join(', ');
  const stats            = scrapeContent.stats || {};

  return `
  <div class="inventory-section">
    <div class="inv-header">
      <h2>Existing Site Inventory</h2>
      <span class="audit-meta">${pageInventory.length} pages crawled</span>
    </div>

    <div class="inv-stats-row">
      ${statPill('Pages', pageInventory.length)}
      ${statPill('Testimonials', testimonialCount)}
      ${statPill('FAQs', faqCount)}
      ${stats.yearsExperience ? statPill('Years in Practice', stats.yearsExperience) : ''}
      ${stats.googleRating    ? statPill('Google Rating', stats.googleRating) : ''}
      ${stats.fiveStarReviews ? statPill('5★ Reviews', stats.fiveStarReviews) : ''}
    </div>

    ${insuranceList ? `<div class="insurance-bar"><span class="inv-label">Insurance accepted:</span> ${esc(insuranceList)}</div>` : ''}

    <div class="page-list">${rows}</div>
  </div>`;
}

// ===========================================================================
// Section: Build & Data
// ===========================================================================

function buildBuildSection(scrapeOutput, mergeOutput, pagesOutput, buildOutput, summary, confidenceFlags, placeholders, brokenLinks, errors, buildPassed, buildSkipped) {
  return `
  <div class="build-section">

    <div class="section-label">Pipeline Data</div>
    <div class="cards-grid">

      <div class="card">
        <h3><span class="dot"></span>Scrape</h3>
        ${factRow('Domain',           scrapeOutput.practice?.domain || '—')}
        ${factRow('Doctor',           scrapeOutput.doctor?.name || '—')}
        ${factRow('Address',          scrapeOutput.address?.full || formatAddress(scrapeOutput.address) || '—')}
        ${factRow('Services detected', scrapeOutput.servicesDetected ?? '—')}
        ${factRow('Pages crawled',    scrapeOutput.pagesVisited ?? '—')}
        ${factRow('Signals',          (scrapeOutput.signals?.length ?? 0))}
      </div>

      <div class="card">
        <h3><span class="dot"></span>Merge</h3>
        ${factRow('Services offered', mergeOutput.servicesOffered ?? '—')}
        ${factRow('Redirects mapped', mergeOutput.redirectCount ?? '—')}
        ${factRow('Intake data',      mergeOutput?.input?.hasIntake ? 'Yes' : 'No')}
      </div>

      <div class="card">
        <h3><span class="dot"></span>Output</h3>
        ${factRow('Pages removed',    pagesOutput.pagesRemoved ?? '—')}
        ${factRow('Blog stubs',       pagesOutput.blogStubs ?? summary.blogStubs ?? '—')}
        ${factRow('Images downloaded', summary.imagesDownloaded ?? '—')}
      </div>

    </div>

    ${confidenceFlags.length ? `
    <div>
      <div class="section-label" style="margin-top:24px">Confidence Flags</div>
      <div class="flags-list">
        ${confidenceFlags.map(f => `<span class="flag-tag ${flagClass(f)}">${esc(f)}</span>`).join(' ')}
      </div>
    </div>` : ''}

    <div style="margin-top:24px">
      <div class="section-label">Build Result</div>
      <div class="card">
        <div class="build-row">
          <div class="build-badge ${buildSkipped ? 'skipped' : buildPassed ? 'pass' : 'fail'}">
            ${buildSkipped ? 'SKIPPED' : buildPassed ? 'PASSED' : 'FAILED'}
          </div>
          <div style="flex:1">
            ${errors.length > 0 ? `<div class="error-list">${errors.map(e => `<div class="error-item">${esc(e)}</div>`).join('')}</div>` : ''}
            ${placeholders.length > 0 ? `
            <table class="placeholder-table" style="margin-top:${errors.length ? '12px' : '0'}">
              <thead><tr><th>File</th><th>Leftover Placeholder</th></tr></thead>
              <tbody>
                ${placeholders.map(p => `<tr>
                  <td>${esc(p.file?.replace('dist/', '') || '—')}</td>
                  <td>${esc(p.pattern?.replace(/\\\\/g, '') || '—')}</td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}
            ${brokenLinks.length > 0 ? `
            <table class="placeholder-table" style="margin-top:${errors.length || placeholders.length ? '12px' : '0'}">
              <thead><tr><th>Broken Link (404)</th><th>Found In</th></tr></thead>
              <tbody>
                ${brokenLinks.map(l => `<tr>
                  <td style="color:#B91C1C;font-weight:600">${esc(l.href || '—')}</td>
                  <td>${esc(l.foundIn?.replace('dist/', '') || '—')}</td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}
            ${!errors.length && !placeholders.length && !brokenLinks.length ? `<p class="no-issues">✓ No errors, broken links, or leftover placeholders</p>` : ''}
          </div>
        </div>
      </div>
    </div>

  </div>`;
}

// ===========================================================================
// Section: What's Missing
// ===========================================================================

function buildMissingSection(missingData) {
  if (!missingData || !missingData.summary) {
    return `<div class="empty-state"><div class="icon">✅</div><p>Missing page analysis not yet run.</p></div>`;
  }

  const renderGroup = (items, cssClass, title) => {
    if (!items?.length) return '';
    return `
    <div class="missing-group">
      <h4 class="missing-group-title ${cssClass}-title">${title}</h4>
      <div class="missing-cards">
        ${items.map(item => `
        <div class="missing-card ${cssClass}-card">
          <div class="missing-meta"><span class="cat-badge">${esc(item.category)}</span></div>
          <strong>${esc(item.field)}</strong>
          <p class="missing-hint">${esc(item.hint)}</p>
        </div>`).join('')}
      </div>
    </div>`;
  };

  return `
  <div class="missing-section">
    <div class="missing-header">
      <h2>What's Missing</h2>
      <a href="missing.html" target="_blank" class="missing-link">Open full page ↗</a>
    </div>

    <div class="missing-summary-row">
      <div class="ms-stat critical"><span class="ms-num">${missingData.summary.critical}</span><span class="ms-label">Critical</span></div>
      <div class="ms-stat important"><span class="ms-num">${missingData.summary.important}</span><span class="ms-label">Important</span></div>
      <div class="ms-stat optional"><span class="ms-num">${missingData.summary.optional}</span><span class="ms-label">Optional</span></div>
      <div class="ms-stat neutral"><span class="ms-num">${missingData.summary.placeholders}</span><span class="ms-label">Placeholders</span></div>
    </div>

    ${renderGroup(missingData.critical,  'critical',  '🚨 Critical — Required Before Launch')}
    ${renderGroup(missingData.important, 'important', '⚠️ Important — Should Complete Before Launch')}
    ${renderGroup(missingData.optional,  'optional',  '✓ Optional — Nice to Have')}
  </div>`;
}

// ===========================================================================
// Section: Image Analysis
// ===========================================================================

function buildImageAnalysisSection(imageAnalysisArtifact) {
  const analysisData = imageAnalysisArtifact?.output;
  if (!analysisData || Object.keys(analysisData).length === 0) {
    return `<div class="empty-state"><div class="icon">🖼️</div><p>No image analysis data available. Ensure images were downloaded and analyzed in Phase 1d.</p></div>`;
  }

  const entries = Object.entries(analysisData);
  const cards = entries.map(([url, analysis]) => {
    const score     = analysis?.quality ?? '—';
    const subject   = analysis?.subject ?? '—';
    const desc      = analysis?.description ?? '';
    const tags      = Array.isArray(analysis?.tags) ? analysis.tags : [];
    const isBefore  = subject === 'before-after' || tags.includes('before-after');
    const isStock   = subject === 'stock' || analysis?.authentic === false;
    const isLogo    = subject === 'graphic' || tags.includes('logo-visible');
    const filename  = url.split('/').pop() || url;
    const badge = isBefore
      ? `<span style="background:#E8F5E9;color:#2E7D32;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700">Before/After</span>`
      : isStock
        ? `<span style="background:#FFF3E0;color:#E65100;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700">Stock</span>`
        : isLogo
          ? `<span style="background:#E3F2FD;color:#1565C0;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700">Graphic</span>`
          : '';
    const scoreColor = typeof score === 'number' ? (score >= 7 ? '#2E7D32' : score >= 4 ? '#E65100' : '#C62828') : '#999';
    return `<div class="signal-card">
  <div style="display:flex;gap:12px;align-items:flex-start">
    <img src="${esc(url)}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#eee" loading="lazy" onerror="this.style.display='none'">
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text-dim);word-break:break-all">${esc(filename)}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap">
        <span style="font-weight:700;color:${scoreColor};font-size:15px">${score}${typeof score === 'number' ? '/10' : ''}</span>
        <span style="font-size:12px;background:#F0EDE8;padding:2px 8px;border-radius:3px">${esc(subject)}</span>
        ${badge}
      </div>
      ${desc ? `<div style="font-size:13px;color:var(--ink);margin-top:6px;line-height:1.5">${esc(desc)}</div>` : ''}
    </div>
  </div>
</div>`;
  }).join('');

  const highValue   = entries.filter(([, a]) => (a?.quality || 0) >= 7).length;
  const beforeAfter = entries.filter(([, a]) => a?.subject === 'before-after').length;
  const stockCount  = entries.filter(([, a]) => a?.subject === 'stock' || a?.authentic === false).length;

  return `
<div class="section-header"><h2>Image Analysis</h2><span class="section-meta">${entries.length} images analyzed</span></div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
  <div class="stat-chip">${entries.length} total</div>
  <div class="stat-chip" style="background:#E8F5E9;color:#2E7D32">${highValue} high quality</div>
  ${beforeAfter > 0 ? `<div class="stat-chip" style="background:#E3F2FD;color:#1565C0">${beforeAfter} before/after</div>` : ''}
  ${stockCount > 0 ? `<div class="stat-chip" style="background:#FFF3E0;color:#E65100">${stockCount} stock</div>` : ''}
</div>
<div style="display:flex;flex-direction:column;gap:8px">${cards}</div>`;
}

// Section: Raw Pipeline
// ===========================================================================

function buildRawPipelineSection(d, bronzeFull, scrapeOutput) {
  const artifactNames = [
    '01-scrape', '02-audit', '03-content', '04-design', '05-director',
    '06-merge', '07-inject', '08-pages', '09-build', 'summary',
  ];

  // ── Reviews block ──────────────────────────────────────────────────────
  const reviewsData = scrapeOutput?.reviews || null;
  let reviewsBlock = '';
  if (reviewsData) {
    const stars = (n) => {
      if (n == null) return '—';
      const full = Math.round(n);
      return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
    };
    const reviewCards = (reviewsData.reviews || []).map(r => `
      <div class="raw-review-card">
        <div class="raw-review-header">
          <span class="raw-review-author">${esc(r.author || 'Anonymous')}</span>
          <span class="raw-review-stars" title="${esc(String(r.rating))}">${stars(r.rating)}</span>
          ${r.date ? `<span class="raw-review-date">${esc(r.date)}</span>` : ''}
        </div>
        ${r.text ? `<p class="raw-review-text">${esc(r.text)}</p>` : ''}
        <span class="raw-review-source">${esc(r.source || '')}</span>
      </div>`).join('');

    reviewsBlock = `
    <div class="raw-section">
      <h3 class="raw-section-title">Reviews</h3>
      <div class="raw-review-meta">
        ${reviewsData.rating != null ? `<div class="raw-review-rating"><span class="raw-rating-num">${reviewsData.rating}</span> <span class="raw-rating-stars">${stars(reviewsData.rating)}</span></div>` : ''}
        ${reviewsData.reviewCount != null ? `<div class="raw-review-count">${reviewsData.reviewCount} reviews</div>` : ''}
        ${reviewsData.gmapsUrl ? `<div><a class="raw-link" href="${esc(reviewsData.gmapsUrl)}" target="_blank" rel="noopener">Google Maps ↗</a></div>` : ''}
        ${reviewsData.yelpUrl  ? `<div><a class="raw-link" href="${esc(reviewsData.yelpUrl)}" target="_blank" rel="noopener">Yelp ↗</a></div>` : ''}
      </div>
      ${reviewCards ? `<div class="raw-review-cards">${reviewCards}</div>` : '<p class="raw-dim">No individual reviews scraped (no API key or no schema.org reviews found).</p>'}
    </div>`;
  } else {
    reviewsBlock = `
    <div class="raw-section">
      <h3 class="raw-section-title">Reviews</h3>
      <p class="raw-dim">No review data in 01-scrape artifact.</p>
    </div>`;
  }

  // ── Bronze page explorer ───────────────────────────────────────────────
  let bronzeBlock = '';
  if (bronzeFull && Array.isArray(bronzeFull.pages) && bronzeFull.pages.length > 0) {
    const pageItems = bronzeFull.pages.map((page, i) => {
      const url    = page.url || page.path || `page-${i}`;
      const title  = page.title  || '';
      const h1     = page.h1     || '';
      const h2s    = (page.h2s || []).join(', ');
      const wc     = page.wordCount || 0;
      const body   = page.bodyText || page.text || '';
      return `<details class="raw-page-detail">
        <summary>
          <span class="raw-page-url">${esc(url)}</span>
          <span class="raw-page-wc">${wc} words</span>
        </summary>
        <div class="raw-page-body">
          ${title ? `<div class="raw-page-row"><span class="raw-page-key">Title</span><span>${esc(title)}</span></div>` : ''}
          ${h1    ? `<div class="raw-page-row"><span class="raw-page-key">H1</span><span class="raw-bold">${esc(h1)}</span></div>` : ''}
          ${h2s   ? `<div class="raw-page-row"><span class="raw-page-key">H2s</span><span>${esc(h2s)}</span></div>` : ''}
          ${body  ? `<div class="raw-page-row raw-page-row--body"><span class="raw-page-key">Body Text</span><pre class="raw-pre">${esc(body)}</pre></div>` : ''}
        </div>
      </details>`;
    }).join('');

    bronzeBlock = `
    <div class="raw-section">
      <h3 class="raw-section-title">Bronze Page Explorer <span class="raw-section-count">${bronzeFull.pages.length} pages</span></h3>
      <div class="raw-page-list">${pageItems}</div>
    </div>`;
  } else {
    bronzeBlock = `
    <div class="raw-section">
      <h3 class="raw-section-title">Bronze Page Explorer</h3>
      <p class="raw-dim">01-bronze.json not found or empty. The full bronze artifact is saved separately from the report pipeline.</p>
    </div>`;
  }

  // ── Artifact JSON dump ─────────────────────────────────────────────────
  const artifactBlocks = artifactNames.map(name => {
    const artifact = d[name];
    if (!artifact) {
      return `<details class="raw-artifact-detail">
        <summary><span class="raw-artifact-name">${esc(name)}.json</span><span class="raw-artifact-missing">not found</span></summary>
      </details>`;
    }
    const json = JSON.stringify(artifact, null, 2);
    return `<details class="raw-artifact-detail">
      <summary><span class="raw-artifact-name">${esc(name)}.json</span><span class="raw-artifact-size">${(json.length / 1024).toFixed(1)} KB</span></summary>
      <pre class="raw-pre raw-pre--artifact">${esc(json)}</pre>
    </details>`;
  }).join('');

  return `
  <div class="raw-pipeline-section">
    <div class="raw-header">
      <h2>Raw Pipeline</h2>
      <span class="audit-meta">Unfiltered artifacts and bronze data</span>
    </div>

    ${reviewsBlock}

    ${bronzeBlock}

    <div class="raw-section">
      <h3 class="raw-section-title">Artifact JSON</h3>
      <div class="raw-artifact-list">${artifactBlocks}</div>
    </div>
  </div>`;
}

// ===========================================================================
// Helpers
// ===========================================================================

function statPill(label, value) {
  return `<div class="stat-pill"><span class="sp-val">${esc(String(value))}</span><span class="sp-label">${esc(label)}</span></div>`;
}

function factRow(key, val) {
  return `<div class="fact-row">
    <span class="fact-key">${esc(key)}</span>
    <span class="fact-val">${esc(String(val ?? '—'))}</span>
  </div>`;
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

function msToSec(ms) {
  if (!ms) return '?';
  return (ms / 1000).toFixed(1);
}

function formatAddress(addr) {
  if (!addr) return null;
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') || null;
}

function flagClass(flag) {
  if (/:found$/.test(flag) || flag.includes('found'))   return 'ok';
  if (/:missing$/.test(flag) || flag.includes('missing')) return 'missing';
  return 'default';
}

function stepState(step) {
  if (!step.data) return 'missing';
  if (['02-audit', '03-content', '04-design', '05-director'].includes(step.id)) {
    return step.data.output ? 'pass' : 'skip';
  }
  if (step.id === '09-build') return step.data.output?.buildSuccess ? 'pass' : 'fail';
  return 'pass';
}

function stepIcon(state) {
  if (state === 'pass')    return '✓';
  if (state === 'skip')    return '–';
  if (state === 'fail')    return '✗';
  if (state === 'missing') return '·';
  return '·';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===========================================================================
// Tab script
// ===========================================================================

function tabScript() {
  return `
    const btns = document.querySelectorAll('.tab-btn');
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
  `;
}

// ===========================================================================
// CSS
// ===========================================================================

function styles() {
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

  /* ── Header ── */
  .header { background: var(--ink); color: white; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .header-left h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  .header-left .sub { color: #9E9990; font-size: 13px; margin-top: 2px; }
  .header-badge { font-size: 12px; color: #9E9990; text-align: right; line-height: 1.6; }
  .header-badge .elapsed { font-size: 20px; font-family: var(--mono); color: var(--terracotta); font-weight: 700; display: block; }

  /* ── Steps Bar ── */
  .steps-bar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 32px; display: flex; align-items: center; overflow-x: auto; gap: 0; }
  .step-item { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .step-item + .step-item::before { content: '→'; color: var(--border); font-size: 14px; margin: 0 8px; flex-shrink: 0; }
  .step-dot { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .step-dot.pass    { background: #D4EDD9; color: var(--green); }
  .step-dot.skip    { background: #EDE8E0; color: #999; }
  .step-dot.fail    { background: #FDDCDC; color: var(--red); }
  .step-dot.missing { background: #EDE8E0; color: #bbb; border: 1px dashed #ccc; }
  .step-label { font-size: 11px; font-weight: 600; color: var(--text-dim); }
  .step-label.pass { color: var(--green); }
  .step-label.skip { color: #aaa; }
  .step-label.fail { color: var(--red); }

  /* ── Tab Nav ── */
  .tab-nav { background: var(--surface); border-bottom: 2px solid var(--border); padding: 0 32px; display: flex; gap: 0; overflow-x: auto; }
  .tab-btn { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; padding: 13px 18px; font-size: 13px; font-weight: 600; color: var(--text-dim); cursor: pointer; white-space: nowrap; transition: color 0.15s, border-color 0.15s; }
  .tab-btn:hover { color: var(--ink); }
  .tab-btn.active { color: var(--terracotta); border-bottom-color: var(--terracotta); }
  .missing-tab { position: relative; }
  .badge-red  { background: var(--red);  color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
  .badge-blue { background: var(--blue); color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }

  /* ── Tab Panels ── */
  .main { max-width: 1100px; margin: 0 auto; padding: 28px 32px 60px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* ── Empty state ── */
  .empty-state { text-align: center; padding: 48px 24px; color: var(--text-dim); }
  .empty-state .icon { font-size: 36px; margin-bottom: 12px; }
  .empty-state p { font-size: 14px; line-height: 1.6; }
  .empty-state code { background: #F0EDE8; padding: 1px 5px; border-radius: 3px; font-family: var(--mono); font-size: 12px; }

  /* ── Section labels ── */
  .section-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; }

  /* ── Card ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .card h3 { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card h3 .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--terracotta); flex-shrink: 0; }
  .cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 800px) { .cards-grid { grid-template-columns: 1fr 1fr; } }

  /* ── Fact row ── */
  .fact-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px solid #F0EDE8; gap: 8px; }
  .fact-row:last-child { border-bottom: none; }
  .fact-key { color: var(--text-dim); font-size: 12px; flex-shrink: 0; }
  .fact-val { font-weight: 600; font-size: 13px; text-align: right; word-break: break-word; }

  /* ── Shared section layout ── */
  .audit-section, .design-section, .content-section, .inventory-section, .build-section, .missing-section, .signals-section { display: flex; flex-direction: column; gap: 24px; }
  .audit-header, .design-header, .content-header, .inv-header, .missing-header, .signals-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .audit-header h2, .design-header h2, .content-header h2, .inv-header h2, .missing-header h2, .signals-header h2 { font-size: 16px; font-weight: 700; }
  .audit-meta { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }

  /* ── AI Audit ── */
  .audit-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .audit-body { grid-template-columns: 1fr; } }
  .audit-block h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; }
  .audit-block p { font-size: 13px; line-height: 1.55; }
  .current-label, .rec-label { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
  .current-label { color: var(--text-dim); }
  .rec-label { color: var(--terracotta); margin-top: 10px; }
  .recommended { font-weight: 700; color: var(--terracotta); }
  .rationale { color: var(--text-dim); font-size: 12px; margin-top: 4px; font-style: italic; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .tag { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 500; }
  .tag.primary   { background: var(--terracotta); color: white; }
  .tag.secondary { background: #F0EDE8; color: var(--ink); }
  .bullet-list { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .bullet-list li { font-size: 13px; padding-left: 16px; position: relative; line-height: 1.45; }
  .bullet-list li::before { content: '•'; position: absolute; left: 4px; color: var(--terracotta); font-weight: 700; }
  .bullet-list.warning li::before { content: '⚠'; font-size: 11px; top: 1px; color: var(--amber); }

  /* ── Design System ── */
  .design-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .design-body { grid-template-columns: 1fr; } }
  .design-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .design-block h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; }
  .mood-badge { font-size: 18px; font-weight: 700; color: var(--ink); margin-bottom: 10px; }
  .font-pair { display: flex; gap: 20px; flex-wrap: wrap; }
  .font-item { flex: 1; min-width: 140px; }
  .font-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 4px; }
  .font-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .font-pair-badge { display: inline-block; margin-top: 10px; font-size: 12px; font-family: var(--mono); background: #F0EDE8; padding: 3px 10px; border-radius: 4px; color: var(--text-dim); }
  .tailwind-hints { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .hint-tag { font-size: 11px; background: #F0EDE8; border-radius: 4px; padding: 3px 8px; color: var(--text-dim); font-family: var(--mono); }
  .palette-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 600px) { .palette-compare { grid-template-columns: 1fr; } }
  .swatch-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .swatch-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 12px; }
  .swatch-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .swatch-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .swatch-block { width: 52px; height: 52px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); }
  .swatch-name { font-size: 10px; color: var(--text-dim); font-weight: 600; }
  .swatch-hex { font-size: 10px; font-family: var(--mono); color: var(--ink); }
  .swatch-inline { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin: 0 2px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.1); }
  .dim { font-size: 13px; color: var(--text-dim); }

  /* ── Director ── */
  .director-section { background: #FAFAF8; border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; display: flex; flex-direction: column; gap: 20px; }
  .director-header { display: flex; align-items: center; justify-content: space-between; }
  .director-header h3 { font-size: 14px; font-weight: 700; }
  .dna-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
  .dna-block { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; }
  .borrow-block { grid-column: 1 / -1; }
  .dna-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 5px; }
  .dna-value { font-size: 14px; font-weight: 700; }
  .dna-value.arch { color: var(--terracotta); }
  .dna-value.borrow { color: var(--ink); }
  .borrow-from { font-size: 12px; font-weight: 500; color: var(--sage); }
  .section-order-block { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 14px; }
  .section-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .section-pill { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; background: var(--cream); border: 1px solid var(--border); color: var(--ink); position: relative; }
  .section-pill::before { content: attr(style); display: none; }
  .eval-rationale { background: var(--surface); border-left: 3px solid var(--terracotta); border-radius: 0 6px 6px 0; padding: 12px 16px; }
  .eval-rationale p { font-size: 13px; line-height: 1.6; color: var(--ink); }
  .candidates-block { display: flex; flex-direction: column; gap: 10px; }
  .candidates-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 700px) { .candidates-grid { grid-template-columns: 1fr; } }
  .candidate-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 14px; }
  .candidate-card.winner { border-color: var(--terracotta); border-width: 2px; }
  .candidate-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .winner-badge { font-size: 11px; font-weight: 700; color: var(--terracotta); }
  .cand-num { font-size: 11px; font-weight: 600; color: var(--text-dim); }
  .cand-temp { font-size: 10px; font-family: var(--mono); color: var(--text-dim); background: #F0EDE8; padding: 2px 6px; border-radius: 3px; }
  .cand-archetype { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .cand-hero { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
  .cand-mood { font-size: 11px; color: var(--sage); margin-bottom: 6px; font-style: italic; }
  .cand-adj { display: flex; flex-wrap: wrap; gap: 4px; }
  .adj-tag { font-size: 10px; padding: 2px 7px; background: #F0EDE8; border-radius: 3px; color: var(--ink); }

  /* ── Signals ── */
  .sig-pills-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .sig-pill { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid #ccc; border-radius: 6px; padding: 8px 14px; display: flex; align-items: center; gap: 8px; min-width: 120px; }
  .sig-pill-num { font-size: 18px; font-weight: 800; line-height: 1; }
  .sig-pill-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
  .signal-groups { display: flex; flex-direction: column; gap: 16px; }
  .signal-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .signal-group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #FAFAF8; border-bottom: 1px solid var(--border); border-left: 4px solid #ccc; }
  .signal-type-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: white; padding: 3px 10px; border-radius: 4px; }
  .signal-count { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
  .signal-rows { display: flex; flex-direction: column; }
  .signal-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #F5F2EE; }
  .signal-row:last-child { border-bottom: none; }
  .signal-text { flex: 1; font-size: 13px; line-height: 1.5; }
  .signal-conf { font-size: 11px; font-family: var(--mono); font-weight: 700; color: var(--green); flex-shrink: 0; padding-top: 1px; }
  .signal-source { font-size: 11px; color: var(--text-dim); flex-shrink: 0; font-style: italic; }

  /* ── Content ── */
  .content-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .content-body { grid-template-columns: 1fr; } }
  .content-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
  .content-block h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; }
  .copy-row { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #F5F2EE; align-items: flex-start; }
  .copy-row:last-child { border-bottom: none; }
  .copy-label { font-size: 11px; font-weight: 700; color: var(--text-dim); min-width: 100px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.3px; padding-top: 1px; }
  .copy-value { font-size: 13px; line-height: 1.5; }
  .copy-bullets { padding-left: 16px; font-size: 13px; line-height: 1.6; }
  .content-group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
  .group-title { font-size: 13px; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .service-list, .faq-list, .blog-list { display: flex; flex-direction: column; gap: 6px; }
  .service-detail, .faq-detail { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .service-detail summary, .faq-detail summary { padding: 10px 14px; cursor: pointer; font-size: 13px; font-weight: 600; user-select: none; background: #FAFAF8; display: flex; justify-content: space-between; align-items: center; }
  .service-detail summary:hover, .faq-detail summary:hover { background: #F5F2EE; }
  .service-body, .faq-answer { padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); font-size: 13px; }
  .faq-answer { line-height: 1.6; color: var(--ink); }
  .blog-row { padding: 10px 0; border-bottom: 1px solid #F0EDE8; }
  .blog-row:last-child { border-bottom: none; }
  .blog-row strong { font-size: 13px; display: block; margin-bottom: 3px; }
  .blog-row p { font-size: 12px; color: var(--text-dim); line-height: 1.45; }

  /* ── Page Inventory ── */
  .inv-stats-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat-pill { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 6px 14px; display: flex; flex-direction: column; align-items: center; min-width: 80px; }
  .sp-val { font-size: 18px; font-weight: 700; color: var(--ink); }
  .sp-label { font-size: 10px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .insurance-bar { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; font-size: 13px; }
  .inv-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); }
  .page-list { display: flex; flex-direction: column; gap: 6px; }
  .page-detail { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .page-detail summary { padding: 10px 14px; cursor: pointer; font-size: 13px; user-select: none; background: #FAFAF8; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .page-detail summary:hover { background: #F5F2EE; }
  .page-path { font-weight: 700; font-family: var(--mono); font-size: 12px; }
  .page-wc { font-size: 11px; color: var(--text-dim); flex-shrink: 0; }
  .page-body { padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 7px; }
  .page-row { display: flex; gap: 12px; font-size: 13px; align-items: flex-start; }
  .page-key { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-dim); min-width: 70px; flex-shrink: 0; padding-top: 1px; }
  .bold { font-weight: 700; }
  .para-row { align-items: flex-start; }
  .para-text { font-size: 12px; color: #444; line-height: 1.5; font-style: italic; }

  /* ── Build ── */
  .flags-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .flag-tag { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 4px; font-family: var(--mono); }
  .flag-tag.ok      { background: #D4EDD9; color: #1D5C35; }
  .flag-tag.missing { background: #FEF3CD; color: #7A5014; }
  .flag-tag.default { background: #E8EDE9; color: var(--sage); }
  .build-row { display: flex; align-items: flex-start; gap: 24px; }
  .build-badge { font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; padding: 10px 20px; border-radius: var(--radius); flex-shrink: 0; font-family: var(--mono); }
  .build-badge.pass    { background: #D4EDD9; color: var(--green); }
  .build-badge.fail    { background: #FDDCDC; color: var(--red); }
  .build-badge.skipped { background: #EDE8E0; color: #888; }
  .placeholder-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .placeholder-table th { text-align: left; font-weight: 700; padding: 6px 8px; background: #F5F2EE; border: 1px solid var(--border); color: var(--text-dim); font-size: 11px; }
  .placeholder-table td { padding: 6px 8px; border: 1px solid var(--border); font-family: var(--mono); font-size: 11px; }
  .error-list { display: flex; flex-direction: column; gap: 4px; }
  .error-item { background: #FEE8E8; color: var(--red); font-size: 12px; padding: 6px 10px; border-radius: 4px; font-family: var(--mono); }
  .no-issues { color: var(--sage); font-size: 13px; font-weight: 500; }

  /* ── What's Missing ── */
  .missing-link { font-size: 12px; color: var(--terracotta); text-decoration: none; font-weight: 600; }
  .missing-link:hover { text-decoration: underline; }
  .missing-summary-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .ms-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px; display: flex; flex-direction: column; align-items: center; min-width: 100px; }
  .ms-stat.critical  { border-left: 3px solid var(--red); }
  .ms-stat.important { border-left: 3px solid var(--amber); }
  .ms-stat.optional  { border-left: 3px solid var(--green); }
  .ms-stat.neutral   { border-left: 3px solid #bbb; }
  .ms-num { font-size: 28px; font-weight: 800; line-height: 1; }
  .ms-stat.critical  .ms-num { color: var(--red); }
  .ms-stat.important .ms-num { color: var(--amber); }
  .ms-stat.optional  .ms-num { color: var(--green); }
  .ms-stat.neutral   .ms-num { color: var(--text-dim); }
  .ms-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: var(--text-dim); margin-top: 4px; }
  .missing-group { display: flex; flex-direction: column; gap: 10px; }
  .missing-group-title { font-size: 14px; font-weight: 700; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
  .critical-title  { color: var(--red);   border-color: #FDDCDC; }
  .important-title { color: var(--amber); border-color: #FEF3CD; }
  .optional-title  { color: var(--green); border-color: #D4EDD9; }
  .missing-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .missing-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .critical-card  { border-left: 3px solid var(--red); }
  .important-card { border-left: 3px solid var(--amber); }
  .optional-card  { border-left: 3px solid var(--green); }
  .missing-meta { margin-bottom: 6px; }
  .cat-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); background: #F0EDE8; padding: 2px 7px; border-radius: 3px; }
  .missing-hint { font-size: 12px; color: var(--text-dim); margin-top: 5px; line-height: 1.45; }

  /* ── Action Items ── */
  .action-items-section { display: flex; flex-direction: column; gap: 20px; }
  .ai-section-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--border); gap: 16px; flex-wrap: wrap; }
  .ai-section-header h2 { font-size: 16px; font-weight: 700; }
  .ai-subtitle { font-size: 13px; color: var(--text-dim); margin-top: 4px; }
  .ai-allclear { background: #D4EDD9; border: 1px solid #A8D5B5; border-radius: var(--radius); padding: 18px 20px; display: flex; align-items: center; gap: 16px; }
  .ai-allclear-icon { font-size: 28px; color: var(--green); flex-shrink: 0; font-weight: 700; }
  .ai-allclear strong { font-size: 14px; font-weight: 700; color: #1D5C35; }
  .ai-allclear p { font-size: 13px; color: #2E7D4F; margin-top: 3px; }
  .ai-issue-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--amber); border-radius: var(--radius); padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .ai-issue-header { display: flex; align-items: center; gap: 12px; }
  .ai-issue-label { font-size: 15px; font-weight: 700; }
  .ai-issue-score { font-size: 12px; font-weight: 800; color: white; padding: 3px 10px; border-radius: 20px; font-family: var(--mono); }
  .ai-issue-desc { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .ai-sub-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 6px; }
  .ai-issue-gripes { background: #FAFAF8; border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; }
  .ai-gripe-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .ai-gripe-list li { font-size: 13px; line-height: 1.5; padding-left: 16px; position: relative; }
  .ai-gripe-list li::before { content: '·'; position: absolute; left: 4px; font-weight: 700; color: var(--terracotta); }
  .ai-issue-fix { background: #F0F7FF; border: 1px solid #C8DCF0; border-radius: 6px; padding: 12px 14px; }
  .ai-issue-fix p { font-size: 13px; line-height: 1.55; color: #1A3A5C; }
  .ai-agent-summary { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .ai-dims-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .ai-dim-cell { background: #FAFAF8; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; text-align: center; }
  .ai-dim-score { font-size: 22px; font-weight: 800; line-height: 1; font-family: var(--mono); }
  .ai-dim-label { font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: capitalize; margin-top: 4px; }

  /* ── Raw Pipeline ── */
  .raw-pipeline-section { display: flex; flex-direction: column; gap: 28px; }
  .raw-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .raw-header h2 { font-size: 16px; font-weight: 700; }
  .raw-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .raw-section-title { font-size: 13px; font-weight: 700; letter-spacing: 0.2px; display: flex; align-items: center; gap: 10px; }
  .raw-section-count { font-size: 11px; font-weight: 600; color: var(--text-dim); background: #F0EDE8; padding: 2px 8px; border-radius: 10px; }
  .raw-dim { font-size: 13px; color: var(--text-dim); font-style: italic; }
  .raw-link { color: var(--terracotta); text-decoration: none; font-size: 12px; font-weight: 600; }
  .raw-link:hover { text-decoration: underline; }
  .raw-bold { font-weight: 700; }
  .raw-pre { font-family: var(--mono); font-size: 12px; line-height: 1.55; background: #F8F6F3; border: 1px solid var(--border); border-radius: 4px; padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; margin-top: 4px; }
  .raw-pre--artifact { max-height: 600px; }

  /* Bronze page explorer */
  .raw-page-list { display: flex; flex-direction: column; gap: 6px; }
  .raw-page-detail { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .raw-page-detail summary { padding: 10px 14px; cursor: pointer; font-size: 13px; user-select: none; background: #FAFAF8; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .raw-page-detail summary:hover { background: #F5F2EE; }
  .raw-page-url { font-weight: 700; font-family: var(--mono); font-size: 12px; word-break: break-all; }
  .raw-page-wc { font-size: 11px; color: var(--text-dim); flex-shrink: 0; }
  .raw-page-body { padding: 12px 14px; background: var(--surface); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 7px; }
  .raw-page-row { display: flex; gap: 12px; font-size: 13px; align-items: flex-start; }
  .raw-page-row--body { flex-direction: column; }
  .raw-page-key { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-dim); min-width: 70px; flex-shrink: 0; padding-top: 2px; }

  /* Artifact JSON */
  .raw-artifact-list { display: flex; flex-direction: column; gap: 6px; }
  .raw-artifact-detail { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .raw-artifact-detail summary { padding: 10px 14px; cursor: pointer; font-size: 13px; user-select: none; background: #FAFAF8; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .raw-artifact-detail summary:hover { background: #F5F2EE; }
  .raw-artifact-name { font-family: var(--mono); font-size: 12px; font-weight: 700; }
  .raw-artifact-size { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
  .raw-artifact-missing { font-size: 11px; color: #aaa; font-style: italic; }

  /* Reviews */
  .raw-review-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .raw-review-rating { display: flex; align-items: center; gap: 8px; }
  .raw-rating-num { font-size: 28px; font-weight: 800; line-height: 1; color: var(--ink); }
  .raw-rating-stars { font-size: 20px; color: #F5A623; letter-spacing: 2px; }
  .raw-review-count { font-size: 13px; color: var(--text-dim); font-weight: 600; }
  .raw-review-cards { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .raw-review-card { background: #FAFAF8; border: 1px solid var(--border); border-radius: 6px; padding: 14px; }
  .raw-review-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .raw-review-author { font-size: 13px; font-weight: 700; }
  .raw-review-stars { font-size: 14px; color: #F5A623; letter-spacing: 1px; }
  .raw-review-date { font-size: 11px; color: var(--text-dim); margin-left: auto; }
  .raw-review-text { font-size: 13px; line-height: 1.6; color: var(--ink); }
  .raw-review-source { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: var(--text-dim); background: #F0EDE8; padding: 2px 6px; border-radius: 3px; margin-top: 6px; display: inline-block; }
  `;
}
