/**
 * Pre-call brief — slim sales prep doc (PageSpeed + vendor + TCO + top findings).
 * Output: precall-brief.html
 */

import { vendorDisplayName } from './vendor-tco.js';

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8f8f3; color: #334155; font-size: 15px; line-height: 1.5; padding: 32px 20px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e0ddd5; border-radius: 4px; padding: 36px 40px; }
  h1 { font-size: 26px; font-weight: 600; margin-bottom: 4px; }
  .url { color: #64748b; font-size: 14px; margin-bottom: 24px; }
  .meta { font-size: 12px; color: #64748b; margin-bottom: 28px; }
  .section { margin-bottom: 28px; }
  .section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #5f7f6b; margin-bottom: 10px; }
  .scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .score { border: 1px solid #e0ddd5; border-radius: 4px; padding: 12px; text-align: center; }
  .score .n { font-size: 28px; font-weight: 700; line-height: 1; }
  .score .l { font-size: 11px; color: #64748b; margin-top: 6px; }
  .score.good .n { color: #2e7d4f; }
  .score.warn .n { color: #92400e; }
  .score.bad .n { color: #b42318; }
  .vendor-box { background: #f8f8f3; border: 1px solid #e0ddd5; border-radius: 4px; padding: 16px 18px; }
  .vendor-box strong { display: block; font-size: 16px; margin-bottom: 6px; }
  .tco { margin-top: 8px; font-size: 14px; color: #334155; }
  .finding { padding: 14px 0; border-bottom: 1px solid #e0ddd5; }
  .finding:last-child { border-bottom: 0; }
  .finding .cat { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #5f7f6b; }
  .finding .title { font-weight: 600; margin: 4px 0; }
  .finding .now { font-size: 13px; color: #64748b; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e0ddd5; font-size: 12px; color: #64748b; }
  @media (max-width: 560px) { .scores { grid-template-columns: 1fr 1fr; } .sheet { padding: 24px 20px; } }
`;

function scoreClass(n) {
  if (n == null) return '';
  if (n >= 90) return 'good';
  if (n >= 50) return 'warn';
  return 'bad';
}

/**
 * @param {object} data - groundwork-audit/v1
 */
export function renderPrecallBrief(data) {
  const meta = data.meta || {};
  const lh = data.lighthouse || {};
  const vendor = data.vendor || {};
  const tco = vendor.subscription_tco;
  const siteUrl = meta.source_url || `https://${meta.url}`;

  const scores = (lh.consumer_scores || []).slice(0, 4);
  const topFindings = (data.findings || [])
    .filter(f => f.show_in_summary)
    .sort((a, b) => (a.summary_rank || 99) - (b.summary_rank || 99))
    .slice(0, 5);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pre-call brief — ${esc(meta.business_name)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="sheet">
  <div class="meta">Pre-call brief · Groundwork Dental · ${esc(meta.generated_at || '')}</div>
  <h1>${esc(meta.business_name)}</h1>
  <div class="url"><a href="${esc(siteUrl)}">${esc(meta.url)}</a></div>

  <div class="section">
    <h2>PageSpeed (mobile)</h2>
    <div class="scores">
      ${scores.map(s => `
      <div class="score ${scoreClass(s.score)}">
        <div class="n">${s.score != null ? esc(s.score) : '—'}</div>
        <div class="l">${esc(s.label)}</div>
      </div>`).join('')}
    </div>
  </div>

  <div class="section">
    <h2>Current provider</h2>
    <div class="vendor-box">
      <strong>${esc(vendor.display_name || vendorDisplayName(vendor.id))}</strong>
      <div>Category: ${esc((vendor.category || 'unknown').replace(/-/g, ' '))}</div>
      ${tco ? `<div class="tco">${esc(tco.copy)}</div>` : '<div class="tco">No subscription lock-in signal detected — custom or unknown stack.</div>'}
    </div>
  </div>

  <div class="section">
    <h2>Top issues (${topFindings.length})</h2>
    ${topFindings.map((f, i) => `
    <div class="finding">
      <div class="cat">${esc(f.category_label || f.category)}</div>
      <div class="title">${i + 1}. ${esc(f.title)}</div>
      ${f.consumer?.now ? `<div class="now">${esc(f.consumer.now)}</div>` : ''}
    </div>`).join('')}
  </div>

  <div class="footer">
    Full audit: <code>_audits/${esc(meta.slug)}/audit-summary.html</code> ·
    Run: <code>npm run audit:precall -- --url ${esc(siteUrl)}</code>
  </div>
</div>
</body>
</html>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
