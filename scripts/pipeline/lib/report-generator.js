/**
 * Pipeline Report Generator
 *
 * Reads all _pipeline/*.json artifacts and generates a self-contained
 * _pipeline/index.html report viewable in any browser.
 *
 * Sections:
 *   1. Header + Pipeline Steps Bar
 *   2. AI Site Audit
 *   3. AI Design System  (new)
 *   4. AI Generated Content  (new)
 *   5. Page Inventory  (new)
 *   6. Pipeline Data cards
 *   7. What's Missing summary  (new — links to missing.html)
 *   8. Build Result + Placeholders
 *
 * Brand colors: charcoal #1A1A1A, terracotta #C45D3E, cream #FAF8F5, sage #6B7F6E
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {string} pipelineDir - Path to the _pipeline/ directory
 * @param {object} [extras]    - Extra runtime data (e.g. { scraped })
 */
export async function generateReport(pipelineDir, extras = {}) {
  const files = ['01-scrape', '02-audit', '03-content', '04-design', '06-merge', '07-inject', '08-pages', '09-build', 'missing', 'summary'];
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

  const html = buildHtml(data, extras);
  await writeFile(resolve(pipelineDir, 'index.html'), html, 'utf-8');
}

// ===========================================================================
// Main HTML builder
// ===========================================================================

function buildHtml(d, extras = {}) {
  const summary   = d['summary']   || {};
  const scrape    = d['01-scrape'] || {};
  const audit     = d['02-audit']  || {};
  const content   = d['03-content'] || {};
  const design    = d['04-design'] || {};
  const merge     = d['06-merge']  || {};
  const pages     = d['08-pages']  || {};
  const build     = d['09-build']  || {};
  const missing   = d['missing']   || {};

  const practiceName  = summary.practiceName  || scrape.output?.practice?.name || 'Unknown Practice';
  const doctorName    = summary.doctorName    || scrape.output?.doctor?.name   || '—';
  const phone         = summary.phone         || scrape.output?.practice?.phone || '—';
  const domain        = scrape.output?.practice?.domain || summary.scrapedUrl || '—';
  const city          = scrape.output?.address?.city    || '—';
  const stateAbbr     = scrape.output?.address?.state   || '';
  const timestamp     = summary.timestamp     || new Date().toISOString();
  const elapsed       = summary.elapsed_s     != null ? `${summary.elapsed_s}s` : '—';
  const buildPassed   = summary.buildSuccess;
  const buildSkipped  = summary.buildSuccess == null && !d['09-build'];

  const auditOutput   = audit.output   || null;
  const contentOutput = content.output || null;
  const designOutput  = design.output  || null;
  const missingData   = missing        || {};
  const mergeOutput   = merge.output   || {};
  const scrapeOutput  = scrape.output  || {};
  const pagesOutput   = pages.output   || {};
  const buildOutput   = build.output   || {};

  const confidenceFlags = summary.confidenceFlags || merge.confidence || [];
  const placeholders    = summary.placeholders    || buildOutput.placeholders || [];
  const errors          = summary.errors          || buildOutput.errors       || [];

  const runDate = formatDate(timestamp);

  // Page inventory from scrape artifact (if available) — fall back to extras.scraped
  const pageInventory = extras?.scraped?.pageInventory || scrapeOutput.pageInventory || [];

  // Pipeline steps
  const steps = [
    { id: '01-scrape',  label: 'Scrape',   data: d['01-scrape']  },
    { id: '02-audit',   label: 'AI Audit', data: d['02-audit']   },
    { id: '04-design',  label: 'Design',   data: d['04-design']  },
    { id: '03-content', label: 'Content',  data: d['03-content'] },
    { id: '06-merge',   label: 'Merge',    data: d['06-merge']   },
    { id: '07-inject',  label: 'Inject',   data: d['07-inject']  },
    { id: '08-pages',   label: 'Pages',    data: d['08-pages']   },
    { id: '09-build',   label: 'Build',    data: d['09-build']   },
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
  <button class="tab-btn active" data-tab="audit">AI Audit</button>
  <button class="tab-btn" data-tab="design">Design System</button>
  <button class="tab-btn" data-tab="content">Generated Content</button>
  <button class="tab-btn" data-tab="pages">Page Inventory</button>
  <button class="tab-btn" data-tab="build">Build &amp; Data</button>
  <button class="tab-btn missing-tab" data-tab="missing">What's Missing ${missingData.summary?.critical > 0 ? `<span class="badge-red">${missingData.summary.critical}</span>` : ''}</button>
</nav>

<!-- ═══ MAIN ══════════════════════════════════════════════════════════════ -->
<main class="main">

  <!-- ─── TAB: AI AUDIT ─────────────────────────────────────────────── -->
  <div class="tab-panel active" id="tab-audit">
    ${buildAuditSection(auditOutput)}
  </div>

  <!-- ─── TAB: DESIGN SYSTEM ────────────────────────────────────────── -->
  <div class="tab-panel" id="tab-design">
    ${buildDesignSection(designOutput, scrapeOutput)}
  </div>

  <!-- ─── TAB: GENERATED CONTENT ────────────────────────────────────── -->
  <div class="tab-panel" id="tab-content">
    ${buildContentSection(contentOutput)}
  </div>

  <!-- ─── TAB: PAGE INVENTORY ───────────────────────────────────────── -->
  <div class="tab-panel" id="tab-pages">
    ${buildPageInventorySection(pageInventory, scrapeOutput)}
  </div>

  <!-- ─── TAB: BUILD & DATA ─────────────────────────────────────────── -->
  <div class="tab-panel" id="tab-build">
    ${buildBuildSection(scrapeOutput, mergeOutput, pagesOutput, buildOutput, summary, confidenceFlags, placeholders, errors, buildPassed, buildSkipped)}
  </div>

  <!-- ─── TAB: WHAT'S MISSING ───────────────────────────────────────── -->
  <div class="tab-panel" id="tab-missing">
    ${buildMissingSection(missingData)}
  </div>

</main>

<script>${tabScript()}</script>
</body>
</html>`;
}

// ===========================================================================
// Section builders
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

function buildDesignSection(designOutput, scrapeOutput) {
  const oldColors = scrapeOutput.brand?.colors || scrapeOutput.colors || null;

  if (!designOutput) {
    return `<div class="empty-state">
      <div class="icon">🎨</div>
      <p>No AI design mapping — ensure <code>ANTHROPIC_API_KEY</code> is set.<br>
      Default color palette will be used.</p>
      ${oldColors ? `<p style="margin-top:12px;font-size:13px;color:#666">Existing colors detected: ${Object.entries(oldColors).map(([k,v]) => v ? `<span class="swatch-inline" style="background:${esc(v)}" title="${esc(v)}"></span>` : '').join('')}</p>` : ''}
    </div>`;
  }

  const palette = designOutput.palette || {};
  const fonts   = designOutput.fonts   || {};
  const oldPalette = oldColors || {};

  const swatches = (colors, label) => {
    const entries = Object.entries(colors).filter(([,v]) => v && /^#/.test(String(v)));
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

  return `
  <div class="design-section">
    <div class="design-header">
      <h2>AI Design System</h2>
      <span class="audit-meta">claude-sonnet-4-6 &nbsp;·&nbsp; ${designOutput._meta?.input_tokens || '?'} in / ${designOutput._meta?.output_tokens || '?'} out &nbsp;·&nbsp; ${msToSec(designOutput._meta?.duration_ms)}s</span>
    </div>

    <div class="design-body">

      <div class="design-block design-mood-block">
        <h4>Design Mood</h4>
        <div class="mood-badge">${esc(designOutput.mood || '—')}</div>
        <p class="rationale">${esc(designOutput.rationale || '')}</p>
        <p class="rationale" style="margin-top:8px;font-style:normal"><strong>Inspiration:</strong> ${esc(designOutput.sourceInspo || '—')}</p>
      </div>

      <div class="design-block design-fonts-block">
        <h4>Typography</h4>
        <div class="font-pair">
          <div class="font-item">
            <div class="font-role">Heading</div>
            <div class="font-name" style="font-size:20px">${esc(fonts.heading || 'Playfair Display')}</div>
            <div class="font-sample" style="font-size:14px;color:#666;font-family:'${esc(fonts.heading || 'Playfair Display')}',serif">The quick brown fox</div>
          </div>
          <div class="font-item">
            <div class="font-role">Body</div>
            <div class="font-name">${esc(fonts.body || 'DM Sans')}</div>
            <div class="font-sample" style="font-size:13px;color:#666;font-family:'${esc(fonts.body || 'DM Sans')}',sans-serif">Clear, readable body text for all patients</div>
          </div>
        </div>
        ${designOutput.tailwind ? `<div class="tailwind-hints">
          <span class="hint-tag">Radius: ${esc(designOutput.tailwind.borderRadius || '—')}</span>
          <span class="hint-tag">Shadows: ${esc(designOutput.tailwind.shadowStyle || '—')}</span>
        </div>` : ''}
      </div>

    </div>

    <div class="palette-compare">
      ${swatches(palette, 'New AI Palette')}
      ${swatches(oldPalette, 'Original Site Colors')}
    </div>

  </div>`;
}

function buildContentSection(contentOutput) {
  if (!contentOutput) {
    return `<div class="empty-state"><div class="icon">✍️</div><p>No AI content mapping — ensure <code>ANTHROPIC_API_KEY</code> is set.</p></div>`;
  }

  const hp = contentOutput.homepage || {};
  const ab = contentOutput.about || {};
  const svcs = contentOutput.services || {};
  const faqs = contentOutput.faqs || [];
  const blogs = contentOutput.blogTopics || [];
  const locs = contentOutput.locations || {};

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

function buildPageInventorySection(pageInventory, scrapeOutput) {
  if (!pageInventory || pageInventory.length === 0) {
    return `<div class="empty-state"><div class="icon">🗺️</div><p>No page inventory — run with a URL to scrape the existing site.</p></div>`;
  }

  const rows = pageInventory.map(page => {
    const h2Preview = (page.h2s || []).slice(0, 3).join(' · ');
    const paraPreview = (page.paragraphs || [])[0]?.slice(0, 160) || '';
    return `
    <details class="page-detail">
      <summary>
        <span class="page-path">${esc(page.path || page.url)}</span>
        <span class="page-wc">${page.wordCount || 0} words</span>
      </summary>
      <div class="page-body">
        ${page.title ? `<div class="page-row"><span class="page-key">Title</span><span>${esc(page.title)}</span></div>` : ''}
        ${page.metaDesc ? `<div class="page-row"><span class="page-key">Meta</span><span>${esc(page.metaDesc)}</span></div>` : ''}
        ${page.h1 ? `<div class="page-row"><span class="page-key">H1</span><span class="bold">${esc(page.h1)}</span></div>` : ''}
        ${h2Preview ? `<div class="page-row"><span class="page-key">H2s</span><span>${esc(h2Preview)}</span></div>` : ''}
        ${page.h3s?.length ? `<div class="page-row"><span class="page-key">H3s</span><span>${esc(page.h3s.slice(0, 4).join(' · '))}</span></div>` : ''}
        ${paraPreview ? `<div class="page-row para-row"><span class="page-key">Excerpt</span><span class="para-text">${esc(paraPreview)}${(page.paragraphs?.[0]?.length || 0) > 160 ? '…' : ''}</span></div>` : ''}
      </div>
    </details>`;
  }).join('');

  // Scraped content summary stats
  const scrapeContent = scrapeOutput.content || {};
  const testimonialCount = (scrapeContent.testimonials || []).length;
  const faqCount = (scrapeContent.faqs || []).length;
  const insuranceList = (scrapeContent.insurance || []).join(', ');
  const stats = scrapeContent.stats || {};

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
      ${stats.googleRating ? statPill('Google Rating', stats.googleRating) : ''}
      ${stats.fiveStarReviews ? statPill('5★ Reviews', stats.fiveStarReviews) : ''}
    </div>

    ${insuranceList ? `<div class="insurance-bar"><span class="inv-label">Insurance accepted:</span> ${esc(insuranceList)}</div>` : ''}

    <div class="page-list">${rows}</div>

  </div>`;
}

function buildBuildSection(scrapeOutput, mergeOutput, pagesOutput, buildOutput, summary, confidenceFlags, placeholders, errors, buildPassed, buildSkipped) {
  return `
  <div class="build-section">

    <div class="section-label">Pipeline Data</div>
    <div class="cards-grid">

      <div class="card">
        <h3><span class="dot"></span>Scrape</h3>
        ${factRow('Domain', scrapeOutput.practice?.domain || '—')}
        ${factRow('Doctor', scrapeOutput.doctor?.name || '—')}
        ${factRow('Address', scrapeOutput.address?.full || formatAddress(scrapeOutput.address) || '—')}
        ${factRow('Services detected', scrapeOutput.servicesDetected ?? '—')}
        ${factRow('Pages crawled', scrapeOutput.pagesVisited ?? '—')}
      </div>

      <div class="card">
        <h3><span class="dot"></span>Merge</h3>
        ${factRow('Service hubs', (mergeOutput.hubs || []).join(', ') || '—')}
        ${factRow('Services offered', mergeOutput.servicesOffered ?? '—')}
        ${factRow('Redirects mapped', mergeOutput.redirectCount ?? '—')}
        ${factRow('Intake data', merge?.input?.hasIntake ? 'Yes' : 'No')}
      </div>

      <div class="card">
        <h3><span class="dot"></span>Output</h3>
        ${factRow('Hubs built', (pagesOutput.hubsKept || []).length || mergeOutput.hubs?.length || summary.serviceHubs || '—')}
        ${factRow('Pages removed', pagesOutput.pagesRemoved ?? '—')}
        ${factRow('Blog stubs', pagesOutput.blogStubs ?? summary.blogStubs ?? '—')}
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
                  <td>${esc(p.file?.replace('dist/','') || '—')}</td>
                  <td>${esc(p.pattern?.replace(/\\\\/g,'') || '—')}</td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}
            ${!errors.length && !placeholders.length ? `<p class="no-issues">✓ No errors or leftover placeholders</p>` : ''}
          </div>
        </div>
      </div>
    </div>

  </div>`;
}

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
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
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
  if (/:found$/.test(flag) || flag.includes('found')) return 'ok';
  if (/:missing$/.test(flag) || flag.includes('missing')) return 'missing';
  return 'default';
}

function stepState(step) {
  if (!step.data) return 'missing';
  if (step.id === '02-audit' || step.id === '03-content' || step.id === '04-design') {
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
    --radius:     8px;
    --font:       -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono:       'SFMono-Regular', 'Consolas', monospace;
  }
  body { font-family: var(--font); background: var(--cream); color: var(--charcoal); font-size: 14px; line-height: 1.5; }

  /* ── Header ── */
  .header { background: var(--charcoal); color: white; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
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
  .tab-btn:hover { color: var(--charcoal); }
  .tab-btn.active { color: var(--terracotta); border-bottom-color: var(--terracotta); }
  .missing-tab { position: relative; }
  .badge-red { background: var(--red); color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }

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

  /* ── AI Audit ── */
  .audit-section, .design-section, .content-section, .inventory-section, .build-section, .missing-section { display: flex; flex-direction: column; gap: 24px; }
  .audit-header, .design-header, .content-header, .inv-header, .missing-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .audit-header h2, .design-header h2, .content-header h2, .inv-header h2, .missing-header h2 { font-size: 16px; font-weight: 700; }
  .audit-meta { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
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
  .tag.secondary { background: #F0EDE8; color: var(--charcoal); }
  .bullet-list { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .bullet-list li { font-size: 13px; padding-left: 16px; position: relative; line-height: 1.45; }
  .bullet-list li::before { content: '•'; position: absolute; left: 4px; color: var(--terracotta); font-weight: 700; }
  .bullet-list.warning li::before { content: '⚠'; font-size: 11px; top: 1px; color: var(--amber); }

  /* ── Design System ── */
  .design-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 700px) { .design-body { grid-template-columns: 1fr; } }
  .design-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .design-block h4 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; }
  .mood-badge { font-size: 18px; font-weight: 700; color: var(--charcoal); margin-bottom: 10px; }
  .font-pair { display: flex; gap: 20px; flex-wrap: wrap; }
  .font-item { flex: 1; min-width: 140px; }
  .font-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-dim); margin-bottom: 4px; }
  .font-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .font-sample { color: var(--text-dim); margin-top: 4px; }
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
  .swatch-hex { font-size: 10px; font-family: var(--mono); color: var(--charcoal); }
  .swatch-inline { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin: 0 2px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.1); }
  .dim { font-size: 13px; color: var(--text-dim); }

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
  .faq-answer { line-height: 1.6; color: var(--charcoal); }
  .blog-row { padding: 10px 0; border-bottom: 1px solid #F0EDE8; }
  .blog-row:last-child { border-bottom: none; }
  .blog-row strong { font-size: 13px; display: block; margin-bottom: 3px; }
  .blog-row p { font-size: 12px; color: var(--text-dim); line-height: 1.45; }

  /* ── Page Inventory ── */
  .inv-stats-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat-pill { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 6px 14px; display: flex; flex-direction: column; align-items: center; min-width: 80px; }
  .sp-val { font-size: 18px; font-weight: 700; color: var(--charcoal); }
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
  `;
}
