// ops-dashboard — Cloudflare Worker
// Served at ops.groundworkdental.com, protected by Cloudflare Access (no auth logic here).
// D1 binding: env.DB  (database_name = "groundwork-ops")

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(url, env);
    return serveUI(env);
  },
};

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleApi(url, env) {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  try {
    const path = url.pathname;

    if (path === '/api/stats') {
      const [totals, successes, practices, week] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE build_success = 1').first(),
        env.DB.prepare('SELECT COUNT(DISTINCT client_slug) AS n FROM runs').first(),
        env.DB.prepare(
          "SELECT COUNT(*) AS n FROM runs WHERE created_at >= datetime('now', '-7 days')"
        ).first(),
      ]);
      return json({
        totalBuilds: totals?.n ?? 0,
        successRate:
          totals?.n > 0 ? Math.round(((successes?.n ?? 0) / totals.n) * 100) : 0,
        practices: practices?.n ?? 0,
        weekRuns: week?.n ?? 0,
      });
    }

    if (path === '/api/runs') {
      const { results } = await env.DB.prepare(
        `SELECT
           id, created_at, client_slug, practice_name, city,
           archetype, font_heading, font_body,
           build_success, duration_ms, gcs_prefix
         FROM runs
         ORDER BY created_at DESC
         LIMIT 200`
      ).all();
      return json(results ?? []);
    }

    if (path === '/api/accounts') {
      const { results } = await env.DB.prepare(
        `SELECT a.slug, a.practice_name, a.city, a.state,
           a.practice_url AS url, a.lifecycle_stage,
           (SELECT MAX(r.created_at) FROM runs r WHERE r.client_slug = a.slug) AS last_build_at
         FROM accounts a
         ORDER BY a.practice_name ASC`
      ).all();
      return json(results ?? []);
    }

    if (path === '/api/practices') {
      const { results } = await env.DB.prepare(
        `SELECT p.slug, COALESCE(r.practice_name, p.slug) AS practice_name,
           r.city, p.archetype, p.font_heading, p.font_body,
           p.palette_primary, p.adjectives, MAX(r.created_at) AS last_run
         FROM practices p
         LEFT JOIN runs r ON r.client_slug = p.slug
         GROUP BY p.slug
         ORDER BY last_run DESC`
      ).all();
      return json(results ?? []);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// Inline UI  (all data fetched server-side — no client XHR, CF Access safe)
// ---------------------------------------------------------------------------

async function serveUI(env) {
  // Fetch everything in parallel before rendering
  let stats = { totalBuilds: 0, successRate: 0, practices: 0, weekRuns: 0 };
  let runs = [], accounts = [], practices = [];
  let dbError = null;
  try {
    const [totals, successes, practiceCount, week, runsRows, accountRows, practiceRows] =
      await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE build_success = 1').first(),
        env.DB.prepare('SELECT COUNT(DISTINCT client_slug) AS n FROM runs').first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE created_at >= datetime('now', '-7 days')").first(),
        env.DB.prepare(`SELECT id, created_at, client_slug, practice_name, city,
           archetype, font_heading, font_body, build_success, duration_ms, gcs_prefix
           FROM runs ORDER BY created_at DESC LIMIT 200`).all(),
        env.DB.prepare(`SELECT a.slug, a.practice_name, a.city, a.state,
           a.practice_url AS url, a.lifecycle_stage,
           (SELECT MAX(r.created_at) FROM runs r WHERE r.client_slug = a.slug) AS last_build_at
           FROM accounts a ORDER BY a.practice_name ASC`).all(),
        env.DB.prepare(`SELECT p.slug, COALESCE(r.practice_name, p.slug) AS practice_name,
           r.city, p.archetype, p.font_heading, p.font_body,
           p.palette_primary, p.adjectives, MAX(r.created_at) AS last_run
           FROM practices p
           LEFT JOIN runs r ON r.client_slug = p.slug
           GROUP BY p.slug ORDER BY last_run DESC`).all(),
      ]);
    stats = {
      totalBuilds: totals?.n ?? 0,
      successRate: totals?.n > 0 ? Math.round(((successes?.n ?? 0) / totals.n) * 100) : 0,
      practices: practiceCount?.n ?? 0,
      weekRuns: week?.n ?? 0,
    };
    runs      = runsRows?.results     ?? [];
    accounts  = accountRows?.results  ?? [];
    practices = practiceRows?.results ?? [];
  } catch (e) {
    console.error('serveUI D1 error:', e.message);
    dbError = e.message;
  }

  // Safe JSON embedding: escape </script> so it never terminates the script tag
  const safeJson = (d) => JSON.stringify(d).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Groundwork Ops</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Brand */
    --sage:         #5F7F6B;
    --sage-dark:    #4A6B55;
    --sage-darker:  #3D5A48;
    --sage-tint:    #EBF0EC;
    /* Neutrals */
    --charcoal:     #334155;
    --mid-gray:     #64748B;
    --border-light: #E0DDD5;
    /* Surfaces */
    --surface-1:    #FFFFFF;
    --surface-2:    #F8F8F3;
    /* Semantic */
    --success-text: #4A6B55;
    --success-bg:   #EBF0EC;
    --warning-text: #92400E;
    --warning-bg:   #FCF4E8;
    --pending-text: #475569;
    --pending-bg:   #F1F0EB;
    --danger-text:  #B42318;
    --danger-bg:    #FDF0EE;
    /* Type */
    --font-sans: 'Figtree', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    --font-serif: Georgia, 'Times New Roman', serif;
    --font-mono:  ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    --radius: 4px;
  }

  body {
    font-family: var(--font-sans);
    background: var(--surface-1);
    color: var(--charcoal);
    font-size: 14px;
    line-height: 1.5;
  }

  /* ---- Header ---- */
  header {
    background: var(--surface-1);
    border-bottom: 1px solid var(--border-light);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header .logo {
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--charcoal);
    text-decoration: none;
    display: flex;
    align-items: baseline;
    gap: 0;
  }
  header .logo-sub {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--sage-dark);
    margin-left: 6px;
  }
  header .divider {
    width: 1px;
    height: 16px;
    background: var(--border-light);
    margin: 0 4px;
  }
  header .env-badge {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    background: var(--sage-tint);
    color: var(--sage-dark);
    padding: 2px 8px;
    border-radius: 99px;
  }

  /* ---- Stats bar ---- */
  .stats-bar {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border-light);
    padding: 0 24px;
    display: flex;
    gap: 0;
  }
  .stat {
    padding: 14px 24px 14px 0;
    border-right: 1px solid var(--border-light);
    margin-right: 24px;
  }
  .stat:last-child { border-right: none; }
  .stat-val {
    font-family: var(--font-mono);
    font-size: 22px;
    color: var(--sage);
    line-height: 1;
  }
  .stat-label {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--mid-gray);
    margin-top: 4px;
  }

  /* ---- Tabs ---- */
  .tabs {
    border-bottom: 1px solid var(--border-light);
    padding: 0 24px;
    display: flex;
    background: var(--surface-1);
  }
  .tab-btn {
    padding: 14px 18px;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    color: var(--mid-gray);
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.2s, border-color 0.2s;
    letter-spacing: 0.01em;
  }
  .tab-btn.active { color: var(--charcoal); border-bottom-color: var(--sage); }
  .tab-btn:hover  { color: var(--charcoal); }

  /* ---- Content ---- */
  .content { padding: 24px; max-width: 1400px; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* ---- Table ---- */
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    background: var(--surface-1);
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    background: var(--surface-2);
    padding: 10px 14px;
    text-align: left;
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--mid-gray);
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
  }
  td {
    padding: 11px 14px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
    color: var(--charcoal);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface-2); }

  /* ---- Build badge ---- */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border-radius: 99px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-ok  { background: var(--success-bg); color: var(--success-text); }
  .badge-err { background: var(--danger-bg);  color: var(--danger-text);  }

  /* ---- Lifecycle badges ---- */
  .lc-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border-radius: 99px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .lc-prospect  { background: var(--pending-bg);  color: var(--pending-text); }
  .lc-audited   { background: #EEF2FF;             color: #3730A3; }
  .lc-preview   { background: #F5F0FF;             color: #5B21B6; }
  .lc-pitched   { background: var(--warning-bg);   color: var(--warning-text); }
  .lc-contacted { background: #FFF4ED;             color: #9A3412; }
  .lc-signed    { background: var(--success-bg);   color: var(--success-text); }
  .lc-live      { background: var(--sage-tint);    color: var(--sage-dark); }
  .lc-active    { background: var(--sage-tint);    color: var(--sage-darker); }
  .lc-churned   { background: var(--surface-2);    color: var(--mid-gray); }

  /* ---- Archetype label ---- */
  .archetype-tag {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--sage-dark);
    background: var(--sage-tint);
    padding: 2px 8px;
    border-radius: var(--radius);
    white-space: nowrap;
  }

  /* ---- Swatch ---- */
  .swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0,0,0,.1);
    vertical-align: middle;
    flex-shrink: 0;
  }

  /* ---- Practice cards ---- */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
    gap: 16px;
  }
  .practice-card {
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    padding: 20px;
    background: var(--surface-2);
    transition: border-color 0.2s;
  }
  .practice-card:hover { border-color: rgba(95,127,107,0.4); }
  .practice-card .card-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 12px;
  }
  .practice-card .card-name {
    font-family: var(--font-serif);
    font-size: 15px;
    color: var(--charcoal);
    line-height: 1.3;
  }
  .practice-card .card-city {
    font-size: 12px;
    color: var(--mid-gray);
    margin-top: 2px;
  }
  .practice-card .card-meta {
    font-size: 12px;
    color: var(--mid-gray);
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 10px;
  }
  .practice-card .meta-row { display: flex; align-items: baseline; gap: 6px; }
  .practice-card .meta-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--mid-gray);
    min-width: 54px;
    flex-shrink: 0;
  }
  .practice-card .meta-val { color: var(--charcoal); }
  .pills { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
  .pill {
    background: var(--surface-1);
    border: 1px solid var(--border-light);
    border-radius: 99px;
    padding: 2px 9px;
    font-size: 11px;
    color: var(--mid-gray);
  }

  /* ---- GCS link ---- */
  .gcs-link {
    color: var(--sage-dark);
    text-decoration: none;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .gcs-link:hover { text-decoration: underline; }

  /* ---- Loading / empty ---- */
  .loading-row td, .empty-row td {
    text-align: center;
    color: var(--mid-gray);
    padding: 40px;
    font-size: 13px;
    font-style: italic;
  }

  /* ---- Mobile ---- */
  @media (max-width: 640px) {
    .stats-bar { flex-wrap: wrap; padding: 0 16px; }
    .stat { padding: 10px 16px 10px 0; margin-right: 16px; }
    .content { padding: 16px; }
    .tab-btn { padding: 12px; font-size: 12px; }
  }
</style>
</head>
<body>

<header>
  <a class="logo" href="/">Groundwork<span class="logo-sub">ops</span></a>
  <span class="divider"></span>
  <span class="env-badge">internal</span>
</header>
${dbError ? `<div style="background:var(--danger-bg);color:var(--danger-text);padding:10px 24px;font-size:13px;font-weight:500">Database error: ${dbError.replace(/</g, '&lt;')}</div>` : ''}

<div class="stats-bar">
  <div class="stat"><div class="stat-val">${stats.totalBuilds}</div><div class="stat-label">Total Builds</div></div>
  <div class="stat"><div class="stat-val">${stats.successRate}%</div><div class="stat-label">Success Rate</div></div>
  <div class="stat"><div class="stat-val">${stats.practices}</div><div class="stat-label">Practices</div></div>
  <div class="stat"><div class="stat-val">${stats.weekRuns}</div><div class="stat-label">This Week</div></div>
</div>

<div class="tabs">
  <button class="tab-btn active" data-tab="runs">Runs</button>
  <button class="tab-btn" data-tab="practices">Practices</button>
  <button class="tab-btn" data-tab="accounts">Accounts</button>
</div>

<div class="content">

  <!-- RUNS -->
  <div class="panel active" id="tab-runs">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Practice</th>
            <th>City</th>
            <th>Archetype</th>
            <th>Fonts</th>
            <th>Build</th>
            <th>Duration</th>
            <th>Artifact</th>
          </tr>
        </thead>
        <tbody id="runs-body"></tbody>
      </table>
    </div>
  </div>

  <!-- PRACTICES -->
  <div class="panel" id="tab-practices">
    <div class="card-grid" id="practices-grid"></div>
  </div>

  <!-- ACCOUNTS -->
  <div class="panel" id="tab-accounts">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Practice</th>
            <th>Lifecycle Stage</th>
            <th>City</th>
            <th>URL</th>
            <th>Last Build</th>
          </tr>
        </thead>
        <tbody id="accounts-body"></tbody>
      </table>
    </div>
  </div>

</div>

<script>
// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------
// Data is injected server-side — no fetch calls needed
const RUNS      = ${safeJson(runs)};
const PRACTICES = ${safeJson(practices)};
const ACCOUNTS  = ${safeJson(accounts)};

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Render on load
renderRuns(RUNS);
renderPractices(PRACTICES);
renderAccounts(ACCOUNTS);

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderRuns(rows) {
  const tbody = document.getElementById('runs-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No runs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const date      = fmtDate(r.created_at);
    const name      = esc(r.practice_name || r.client_slug || '—');
    const city      = esc(r.city || '—');
    const archetype = esc(r.archetype || '—');
    const fonts     = r.font_heading
      ? esc(r.font_heading + ' / ' + (r.font_body || '…'))
      : '—';
    const badge     = r.build_success
      ? '<span class="badge badge-ok">✓</span>'
      : '<span class="badge badge-err">✗</span>';
    const dur       = r.duration_ms ? fmtDur(r.duration_ms) : '—';
    const gcs       = r.gcs_prefix
      ? '<a class="gcs-link" href="https://console.cloud.google.com/storage/browser/' +
        esc(r.gcs_prefix) + '" target="_blank" rel="noopener">GCS ↗</a>'
      : '<span style="color:var(--mid-gray)">—</span>';
    return '<tr>' +
      '<td style="white-space:nowrap;color:var(--mid-gray)">' + date + '</td>' +
      '<td style="font-weight:600;font-family:var(--font-serif)">' + name + '</td>' +
      '<td style="color:var(--mid-gray)">' + city + '</td>' +
      '<td><span class="archetype-tag">' + archetype + '</span></td>' +
      '<td style="color:var(--mid-gray);font-size:12px">' + fonts + '</td>' +
      '<td>' + badge + '</td>' +
      '<td style="color:var(--mid-gray);white-space:nowrap;font-family:var(--font-mono)">' + dur + '</td>' +
      '<td>' + gcs + '</td>' +
      '</tr>';
  }).join('');
}

function renderPractices(rows) {
  const grid = document.getElementById('practices-grid');
  if (!rows.length) {
    grid.innerHTML = '<p style="color:var(--muted);font-size:13px">No practices yet.</p>';
    return;
  }
  grid.innerHTML = rows.map(p => {
    const name      = esc(p.practice_name || p.slug);
    const city      = esc(p.city || '');
    const archetype = esc(p.archetype || '—');
    const fonts     = p.font_heading
      ? esc(p.font_heading + ' / ' + (p.font_body || '…'))
      : '—';
    const color     = p.palette_primary || '#94a3b8';
    const adjList   = parseAdj(p.adjectives);
    const pills     = adjList.length
      ? '<div class="pills">' + adjList.map(a => '<span class="pill">' + esc(a) + '</span>').join('') + '</div>'
      : '';
    return '<div class="practice-card">' +
      '<div class="card-header">' +
      '<span class="swatch" style="background:' + esc(color) + '"></span>' +
      '<div><div class="card-name">' + name + '</div>' +
      (city ? '<div class="card-city">' + city + '</div>' : '') +
      '</div></div>' +
      '<div class="card-meta">' +
      '<div class="meta-row"><span class="meta-label">Archetype</span><span class="meta-val">' + archetype + '</span></div>' +
      '<div class="meta-row"><span class="meta-label">Fonts</span><span class="meta-val" style="font-size:11px">' + fonts + '</span></div>' +
      '</div>' +
      pills +
      '</div>';
  }).join('');
}

function renderAccounts(rows) {
  const tbody = document.getElementById('accounts-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No accounts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(a => {
    const name  = esc(a.practice_name || a.slug);
    const city  = esc([a.city, a.state].filter(Boolean).join(', ') || '—');
    const stage = a.lifecycle_stage || 'Prospect';
    const url   = a.url
      ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" style="color:var(--sage-dark);text-decoration:none;font-size:12px;font-weight:500">' +
        esc(a.url.replace('https://', '').replace('http://', '')) + ' ↗</a>'
      : '<span style="color:var(--mid-gray)">—</span>';
    const lastBuild = a.last_build_at ? fmtDate(a.last_build_at) : '—';
    return '<tr>' +
      '<td style="font-weight:600;font-family:var(--font-serif)">' + name + '</td>' +
      '<td>' + lcBadge(stage) + '</td>' +
      '<td style="color:var(--mid-gray)">' + city + '</td>' +
      '<td>' + url + '</td>' +
      '<td style="color:var(--mid-gray);white-space:nowrap;font-family:var(--font-mono);font-size:12px">' + lastBuild + '</td>' +
      '</tr>';
  }).join('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function fmtDur(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  return Math.round(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

function parseAdj(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return String(raw).split(',').map(s => s.trim()).filter(Boolean); }
}

const LC_CLASS = {
  'Prospect':         'lc-prospect',
  'Audited':          'lc-audited',
  'Preview Requested':'lc-preview',
  'Pitched':          'lc-pitched',
  'Contacted':        'lc-contacted',
  'Signed':           'lc-signed',
  'Onboarding':       'lc-signed',
  'Live':             'lc-live',
  'Active':           'lc-active',
  'Churned':          'lc-churned',
};

function lcBadge(stage) {
  const cls = LC_CLASS[stage] || 'lc-prospect';
  return '<span class="lc-badge ' + cls + '">' + esc(stage) + '</span>';
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
