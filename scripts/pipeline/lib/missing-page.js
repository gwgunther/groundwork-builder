/**
 * Missing Page Generator
 *
 * Analyzes the merged practice data + pipeline artifacts to produce:
 *   1. A standalone _pipeline/missing.html for the human designer to review
 *   2. src/pages/missing.astro in the output site (accessible at /missing)
 *
 * The page categorizes everything the designer/client needs to provide
 * before the site can go live: images, copy, business info, etc.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the "What's Missing" page and JSON artifact.
 *
 * @param {object} merged      - Merged practice data
 * @param {string} outputDir   - Root of the generated Astro project
 * @param {object} [validation] - Build validation result (optional, for post-build placeholders)
 * @returns {object} missingData — the structured list of missing items
 */
export async function generateMissingPage(merged, outputDir, validation = null) {
  const missing = analyzeMissing(merged, validation);
  const pipelineDir = resolve(outputDir, '_pipeline');
  await mkdir(pipelineDir, { recursive: true });

  // Write JSON artifact
  await writeFile(
    resolve(outputDir, '_pipeline', 'missing.json'),
    JSON.stringify(missing, null, 2),
    'utf-8'
  );

  // Write standalone HTML for the pipeline report folder
  const html = buildMissingHtml(missing, merged);
  await writeFile(
    resolve(outputDir, '_pipeline', 'missing.html'),
    html,
    'utf-8'
  );

  // Write the Astro page into the output site
  const astroPage = buildAstroPage(missing, merged);
  await writeFile(
    resolve(outputDir, 'src', 'pages', 'missing.astro'),
    astroPage,
    'utf-8'
  );

  return missing;
}

// ---------------------------------------------------------------------------
// Analyzer — builds the structured missing items report
// ---------------------------------------------------------------------------

function analyzeMissing(merged, validation) {
  const practice = merged.practice || {};
  const doctor = merged.doctor || {};
  const address = merged.address || {};
  const hours = merged.hours || {};
  const content = merged.content || {};
  const images = merged.images || {};
  const brand = merged.brand || {};

  const items = {
    critical: [],     // Site cannot launch without these
    important: [],    // Should be done before launch
    optional: [],     // Nice to have
    placeholders: [], // Leftover [PLACEHOLDER] tokens from build
  };

  // ── Critical: Business Info ──────────────────────────────────────────────
  if (!practice.phone) items.critical.push({ category: 'Business Info', field: 'Phone number', hint: 'The main practice phone number (e.g. (555) 123-4567)' });
  if (!address.street) items.critical.push({ category: 'Business Info', field: 'Street address', hint: 'Full street address for the practice' });
  if (!address.city) items.critical.push({ category: 'Business Info', field: 'City', hint: 'City the practice is located in' });
  if (!address.zip) items.critical.push({ category: 'Business Info', field: 'ZIP code', hint: 'Practice ZIP / postal code' });
  if (!practice.name) items.critical.push({ category: 'Business Info', field: 'Practice name', hint: 'Official name of the dental practice' });

  // ── Critical: Doctor Info ────────────────────────────────────────────────
  if (!doctor.name && !doctor.firstName) items.critical.push({ category: 'Doctor Info', field: 'Doctor name', hint: 'Full name and credentials (e.g. Dr. Jane Smith, DDS)' });

  // ── Critical: Branding ───────────────────────────────────────────────────
  if (!images.logo) items.critical.push({ category: 'Branding', field: 'Practice logo', hint: 'PNG or SVG logo file, ideally with transparent background. Place at public/images/branding/logo.png' });

  // ── Critical: Images ─────────────────────────────────────────────────────
  if (!images.team || images.team.length === 0) {
    items.critical.push({ category: 'Photos', field: 'Doctor / team photo(s)', hint: 'Professional headshot of the doctor and any key staff. Place at public/images/team/' });
  }

  // ── Important: Business Info ─────────────────────────────────────────────
  if (!practice.email) items.important.push({ category: 'Business Info', field: 'Practice email', hint: 'Contact email address shown on the site' });
  if (!practice.googleReviewLink) items.important.push({ category: 'Business Info', field: 'Google review link', hint: 'Direct link to your Google Business Profile review page' });

  // Check hours — default hours are set so we just flag if they look like placeholders
  const hasRealHours = hours?.display && hours.display.some(h => h.time !== '9am – 5pm');
  if (!hasRealHours) items.important.push({ category: 'Business Info', field: 'Office hours', hint: 'Real opening hours — the defaults (Mon–Fri 9–5) are currently set. Update in src/config/site.ts' });

  // ── Important: Doctor Info ────────────────────────────────────────────────
  if (!doctor.bio) items.important.push({ category: 'Doctor Info', field: 'Doctor bio', hint: '2-4 paragraph bio covering training, experience, philosophy, and personal touches. Goes on the About page.' });
  if (!doctor.credentials) items.important.push({ category: 'Doctor Info', field: 'Doctor credentials', hint: 'Dental degree and any specialties (e.g. DDS, FAGD)' });
  if (!doctor.education) items.important.push({ category: 'Doctor Info', field: 'Doctor education', hint: 'Dental school and any residency / continuing education highlights' });

  // ── Important: Photos ────────────────────────────────────────────────────
  if (!images.office || images.office.length === 0) {
    items.important.push({ category: 'Photos', field: 'Office / interior photos', hint: 'Photos of the reception, treatment rooms, waiting area. Place at public/images/office/' });
  }

  const heroImages = []; // placeholder check
  items.important.push({ category: 'Photos', field: 'Hero / banner image', hint: 'A wide, high-quality photo for the homepage hero section. Place at public/images/heroes/hero-home.jpg' });

  // ── Important: Content ────────────────────────────────────────────────────
  if (!content.heroTagline && !content.heroHeadline) {
    items.important.push({ category: 'Copy', field: 'Homepage hero headline', hint: 'Main H1 for the homepage. AI-generated copy provided in the Content section of this report — review and approve or edit.' });
  }

  // ── Optional ─────────────────────────────────────────────────────────────
  if (!content.testimonials || content.testimonials.length === 0) {
    items.optional.push({ category: 'Social Proof', field: 'Patient testimonials', hint: '3-5 real patient reviews. Can be pulled from Google Reviews.' });
  }
  if (!content.stats?.yearsExperience) {
    items.optional.push({ category: 'Social Proof', field: 'Years in practice', hint: 'How many years has the practice been open? Used in the stats bar on the homepage.' });
  }
  if (!content.stats?.googleRating) {
    items.optional.push({ category: 'Social Proof', field: 'Google rating', hint: 'Current Google star rating (e.g. 4.9). Used in social proof section.' });
  }
  if (!images.gallery || images.gallery.length === 0) {
    items.optional.push({ category: 'Photos', field: 'Before & after gallery', hint: 'Treatment result photos for the gallery page. Place at public/images/gallery/' });
  }
  if (!practice.sameAs || practice.sameAs.length === 0) {
    items.optional.push({ category: 'Social / Local', field: 'Social media profiles', hint: 'Facebook, Instagram, or other social profile URLs for footer links' });
  }
  if (!content.insurance || content.insurance.length === 0) {
    items.optional.push({ category: 'Insurance', field: 'Insurance accepted', hint: 'List of dental insurance plans accepted. Shown on the homepage and contact page.' });
  }

  // Domain & deployment
  items.optional.push({ category: 'Deployment', field: 'Domain name', hint: 'The final domain (e.g. smithdental.com). Update in astro.config.mjs and .github/workflows/deploy.yml' });
  items.optional.push({ category: 'Deployment', field: 'Google Analytics ID', hint: 'GA4 Measurement ID (G-XXXXXXXXXX). Add to .env as PUBLIC_GA4_MEASUREMENT_ID' });
  items.optional.push({ category: 'Deployment', field: 'Cloudflare Pages project', hint: 'Set up Cloudflare Pages project and add CLOUDFLARE_API_TOKEN + project name to GitHub secrets' });

  // ── Leftover placeholders from build ─────────────────────────────────────
  if (validation?.placeholders) {
    items.placeholders = validation.placeholders;
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      critical: items.critical.length,
      important: items.important.length,
      optional: items.optional.length,
      placeholders: items.placeholders.length,
    },
    ...items,
  };
}

// ---------------------------------------------------------------------------
// Astro page builder
// ---------------------------------------------------------------------------

function buildAstroPage(missing, merged) {
  const practiceName = merged.practice?.name || 'Your Practice';
  const criticalCount = missing.critical.length;
  const importantCount = missing.important.length;

  return `---
// What's Missing — generated by Groundwork Builder Pipeline
// This page is for the designer's internal review only.
// Remove or restrict access before going live.
const practiceName = ${JSON.stringify(practiceName)};
const generated = ${JSON.stringify(missing.generatedAt)};
const missing = ${JSON.stringify(missing, null, 2)};
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What's Missing — {practiceName}</title>
  <style>
    ${missingPageStyles()}
  </style>
</head>
<body>
  <header class="page-header">
    <div class="header-inner">
      <div>
        <h1>What's Missing</h1>
        <p class="sub">{practiceName} &nbsp;·&nbsp; Designer review checklist</p>
      </div>
      <div class="header-stats">
        <span class="stat critical">{missing.summary.critical} Critical</span>
        <span class="stat important">{missing.summary.important} Important</span>
        <span class="stat optional">{missing.summary.optional} Optional</span>
      </div>
    </div>
  </header>

  <main class="main">
    <div class="notice">
      <strong>Internal use only.</strong> This page is generated for the designer's review. Remove or add access restrictions before sharing with the client or going live.
    </div>

    {missing.critical.length > 0 && (
      <section>
        <h2 class="section-title critical-title">🚨 Critical — Required Before Launch</h2>
        <div class="card-list">
          {missing.critical.map((item: any) => (
            <div class="item-card critical-card">
              <div class="item-meta">
                <span class="category-badge">{item.category}</span>
              </div>
              <strong class="item-field">{item.field}</strong>
              <p class="item-hint">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>
    )}

    {missing.important.length > 0 && (
      <section>
        <h2 class="section-title important-title">⚠️ Important — Should Complete Before Launch</h2>
        <div class="card-list">
          {missing.important.map((item: any) => (
            <div class="item-card important-card">
              <div class="item-meta">
                <span class="category-badge">{item.category}</span>
              </div>
              <strong class="item-field">{item.field}</strong>
              <p class="item-hint">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>
    )}

    {missing.optional.length > 0 && (
      <section>
        <h2 class="section-title optional-title">✓ Optional — Nice to Have</h2>
        <div class="card-list">
          {missing.optional.map((item: any) => (
            <div class="item-card optional-card">
              <div class="item-meta">
                <span class="category-badge">{item.category}</span>
              </div>
              <strong class="item-field">{item.field}</strong>
              <p class="item-hint">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>
    )}

    {missing.placeholders.length > 0 && (
      <section>
        <h2 class="section-title placeholder-title">🔧 Leftover Placeholders in Built Files</h2>
        <table class="ph-table">
          <thead><tr><th>File</th><th>Pattern</th></tr></thead>
          <tbody>
            {missing.placeholders.map((p: any) => (
              <tr>
                <td class="mono">{p.file?.replace('dist/', '') || '—'}</td>
                <td class="mono red">{p.pattern || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )}

    <footer class="page-footer">
      Generated by Groundwork Builder Pipeline &nbsp;·&nbsp; {new Date(generated).toLocaleString()}
    </footer>
  </main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Standalone HTML (for _pipeline/missing.html)
// ---------------------------------------------------------------------------

function buildMissingHtml(missing, merged) {
  const practiceName = merged.practice?.name || 'Your Practice';

  const renderItems = (items, cssClass) => items.map(item => `
    <div class="item-card ${cssClass}">
      <div class="item-meta"><span class="cat-badge">${esc(item.category)}</span></div>
      <strong class="item-field">${esc(item.field)}</strong>
      <p class="item-hint">${esc(item.hint)}</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>What's Missing — ${esc(practiceName)}</title>
<style>${missingPageStyles()}</style>
</head>
<body>
<header class="page-header">
  <div class="header-inner">
    <div>
      <h1>What's Missing</h1>
      <p class="sub">${esc(practiceName)} &nbsp;·&nbsp; Designer review checklist</p>
    </div>
    <div class="header-stats">
      <span class="stat critical">${missing.summary.critical} Critical</span>
      <span class="stat important">${missing.summary.important} Important</span>
      <span class="stat optional">${missing.summary.optional} Optional</span>
    </div>
  </div>
</header>

<main class="main">
  <div class="notice">
    <strong>Internal use only.</strong> This page is for the designer's review.
    Remove or add access restrictions before sharing with the client or going live.
  </div>

  ${missing.critical.length > 0 ? `
  <section>
    <h2 class="section-title critical-title">🚨 Critical — Required Before Launch</h2>
    <div class="card-list">${renderItems(missing.critical, 'critical-card')}</div>
  </section>` : ''}

  ${missing.important.length > 0 ? `
  <section>
    <h2 class="section-title important-title">⚠️ Important — Should Complete Before Launch</h2>
    <div class="card-list">${renderItems(missing.important, 'important-card')}</div>
  </section>` : ''}

  ${missing.optional.length > 0 ? `
  <section>
    <h2 class="section-title optional-title">✓ Optional — Nice to Have</h2>
    <div class="card-list">${renderItems(missing.optional, 'optional-card')}</div>
  </section>` : ''}

  ${missing.placeholders.length > 0 ? `
  <section>
    <h2 class="section-title placeholder-title">🔧 Leftover Placeholders in Built Files</h2>
    <table class="ph-table">
      <thead><tr><th>File</th><th>Pattern</th></tr></thead>
      <tbody>
        ${missing.placeholders.map(p => `<tr>
          <td class="mono">${esc(p.file?.replace('dist/', '') || '—')}</td>
          <td class="mono red">${esc(p.pattern || '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>` : ''}

  <footer class="page-footer">
    Generated by Groundwork Builder Pipeline &nbsp;·&nbsp;
    ${new Date(missing.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
  </footer>
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

function missingPageStyles() {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --charcoal: #1A1A1A;
      --cream: #FAF8F5;
      --surface: #FFFFFF;
      --border: #E5E0DA;
      --red: #C0392B;
      --amber: #C07A1A;
      --green: #2E7D4F;
      --text-dim: #666259;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mono: 'SFMono-Regular', 'Consolas', monospace;
    }
    body { font-family: var(--font); background: var(--cream); color: var(--charcoal); font-size: 14px; line-height: 1.5; }
    .page-header { background: var(--charcoal); color: white; padding: 20px 32px; }
    .header-inner { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .page-header h1 { font-size: 20px; font-weight: 700; }
    .page-header .sub { color: #9E9990; font-size: 13px; margin-top: 3px; }
    .header-stats { display: flex; gap: 10px; flex-wrap: wrap; }
    .stat { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.3px; }
    .stat.critical  { background: #FDDCDC; color: var(--red); }
    .stat.important { background: #FEF3CD; color: #7A5014; }
    .stat.optional  { background: #D4EDD9; color: var(--green); }
    .main { max-width: 1000px; margin: 0 auto; padding: 24px 32px 48px; display: flex; flex-direction: column; gap: 32px; }
    .notice { background: #FEF9ED; border: 1px solid #F0D88A; border-radius: var(--radius); padding: 12px 16px; font-size: 13px; color: #7A5014; }
    .section-title { font-size: 15px; font-weight: 700; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .critical-title  { color: var(--red); border-color: #FDDCDC; }
    .important-title { color: #C07A1A; border-color: #FEF3CD; }
    .optional-title  { color: var(--green); border-color: #D4EDD9; }
    .placeholder-title { color: #7A5014; border-color: #F0D88A; }
    .card-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .item-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
    .critical-card  { border-left: 3px solid var(--red); }
    .important-card { border-left: 3px solid #C07A1A; }
    .optional-card  { border-left: 3px solid var(--green); }
    .item-meta { margin-bottom: 6px; }
    .cat-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-dim); background: #F0EDE8; padding: 2px 7px; border-radius: 3px; }
    .item-field { font-size: 13px; font-weight: 700; display: block; margin-bottom: 5px; }
    .item-hint { font-size: 12px; color: var(--text-dim); line-height: 1.45; }
    .ph-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ph-table th { text-align: left; padding: 7px 10px; background: #F5F2EE; border: 1px solid var(--border); font-weight: 700; color: var(--text-dim); font-size: 11px; }
    .ph-table td { padding: 6px 10px; border: 1px solid var(--border); }
    .mono { font-family: var(--mono); font-size: 11px; }
    .red { color: var(--red); }
    .page-footer { text-align: center; font-size: 12px; color: var(--text-dim); padding-top: 16px; border-top: 1px solid var(--border); }
  `;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
