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
    return serveUI();
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
        `SELECT
           slug, practice_name, city, state, url,
           lifecycle_stage, last_build_at
         FROM accounts
         ORDER BY practice_name ASC`
      ).all();
      return json(results ?? []);
    }

    if (path === '/api/practices') {
      const { results } = await env.DB.prepare(
        `SELECT
           slug, practice_name, city,
           archetype, font_heading, font_body,
           palette_primary, adjectives,
           MAX(created_at) AS last_run
         FROM runs
         WHERE practice_name IS NOT NULL
         GROUP BY client_slug
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
// Inline UI
// ---------------------------------------------------------------------------

function serveUI() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Groundwork Ops</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --navy:   #0f172a;
    --navy2:  #1e293b;
    --navy3:  #334155;
    --teal:   #14b8a6;
    --teal-d: #0d9488;
    --text:   #f1f5f9;
    --muted:  #94a3b8;
    --bg:     #ffffff;
    --border: #e2e8f0;
    --row-alt:#f8fafc;
    --font:   system-ui, -apple-system, 'Segoe UI', sans-serif;
    --radius: 6px;
  }

  body { font-family: var(--font); background: var(--bg); color: #1e293b; font-size: 14px; }

  /* ---- Layout ---- */
  header {
    background: var(--navy);
    color: var(--text);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header .logo {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -.3px;
    color: #fff;
    text-decoration: none;
  }
  header .logo span { color: var(--teal); }
  header .env-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .6px;
    background: var(--navy3);
    color: var(--muted);
    padding: 2px 7px;
    border-radius: 99px;
  }

  /* ---- Stats bar ---- */
  .stats-bar {
    background: var(--navy2);
    padding: 0 24px;
    display: flex;
    gap: 0;
  }
  .stat {
    padding: 12px 20px 12px 0;
    border-right: 1px solid var(--navy3);
    margin-right: 20px;
  }
  .stat:last-child { border-right: none; }
  .stat-val {
    font-size: 22px;
    font-weight: 700;
    color: var(--teal);
    line-height: 1;
  }
  .stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--muted);
    margin-top: 3px;
  }

  /* ---- Tabs ---- */
  .tabs {
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    display: flex;
    gap: 0;
    background: #fff;
  }
  .tab-btn {
    padding: 14px 18px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color .15s, border-color .15s;
  }
  .tab-btn.active { color: var(--navy); border-bottom-color: var(--teal); }
  .tab-btn:hover { color: var(--navy); }

  /* ---- Content ---- */
  .content { padding: 24px; max-width: 1400px; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* ---- Table ---- */
  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    background: var(--row-alt);
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }

  /* ---- Badges ---- */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-ok  { background: #dcfce7; color: #166534; }
  .badge-err { background: #fee2e2; color: #991b1b; }

  .lc-badge {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .lc-prospect  { background: #f1f5f9; color: #475569; }
  .lc-audited   { background: #dbeafe; color: #1d4ed8; }
  .lc-preview   { background: #ede9fe; color: #6d28d9; }
  .lc-pitched   { background: #fef9c3; color: #854d0e; }
  .lc-contacted { background: #ffedd5; color: #c2410c; }
  .lc-signed    { background: #d1fae5; color: #065f46; }
  .lc-live      { background: #14b8a620; color: #0d9488; }
  .lc-active    { background: #14b8a640; color: #0f766e; }
  .lc-churned   { background: #f1f5f9; color: #94a3b8; }

  /* ---- Swatch ---- */
  .swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0,0,0,.12);
    vertical-align: middle;
    margin-right: 5px;
    flex-shrink: 0;
  }

  /* ---- Practice cards ---- */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }
  .practice-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    background: #fff;
  }
  .practice-card .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .practice-card .card-name {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.3;
  }
  .practice-card .card-city {
    font-size: 11px;
    color: var(--muted);
    margin-top: 1px;
  }
  .practice-card .card-meta {
    font-size: 12px;
    color: #475569;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .practice-card .meta-row { display: flex; align-items: center; gap: 4px; }
  .practice-card .meta-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .4px;
    color: var(--muted);
    min-width: 52px;
  }
  .pills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .pill {
    background: var(--row-alt);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 2px 8px;
    font-size: 10px;
    color: #475569;
  }

  /* ---- GCS link ---- */
  .gcs-link {
    color: var(--teal-d);
    text-decoration: none;
    font-size: 11px;
    white-space: nowrap;
  }
  .gcs-link:hover { text-decoration: underline; }

  /* ---- Loading / empty ---- */
  .loading-row td, .empty-row td {
    text-align: center;
    color: var(--muted);
    padding: 32px;
    font-size: 13px;
  }

  /* ---- Mobile ---- */
  @media (max-width: 640px) {
    .stats-bar { flex-wrap: wrap; padding: 0 16px; }
    .stat { padding: 10px 12px 10px 0; margin-right: 12px; }
    .content { padding: 16px; }
    .tab-btn { padding: 12px 12px; font-size: 12px; }
  }
</style>
</head>
<body>

<header>
  <a class="logo" href="/"><span>Groundwork</span> Ops</a>
  <span class="env-badge">internal</span>
</header>

<div class="stats-bar" id="stats-bar">
  <div class="stat"><div class="stat-val" id="s-total">—</div><div class="stat-label">Total Builds</div></div>
  <div class="stat"><div class="stat-val" id="s-rate">—</div><div class="stat-label">Success Rate</div></div>
  <div class="stat"><div class="stat-val" id="s-practices">—</div><div class="stat-label">Practices</div></div>
  <div class="stat"><div class="stat-val" id="s-week">—</div><div class="stat-label">This Week</div></div>
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
        <tbody id="runs-body">
          <tr class="loading-row"><td colspan="8">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- PRACTICES -->
  <div class="panel" id="tab-practices">
    <div class="card-grid" id="practices-grid">
      <p style="color:var(--muted);font-size:13px">Loading…</p>
    </div>
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
        <tbody id="accounts-body">
          <tr class="loading-row"><td colspan="5">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>

</div>

<script>
// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------
const panels = { runs: null, practices: null, accounts: null };
let loaded   = { runs: false, practices: false, accounts: false };

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    if (!loaded[tab]) fetchTab(tab);
  });
});

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function apiFetch(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// Load stats + first tab on mount
Promise.all([
  apiFetch('/api/stats').then(renderStats).catch(console.error),
  apiFetch('/api/runs').then(renderRuns).catch(e => {
    document.getElementById('runs-body').innerHTML =
      '<tr class="empty-row"><td colspan="8">Error loading runs: ' + e.message + '</td></tr>';
  }),
]);
loaded.runs = true;

function fetchTab(tab) {
  loaded[tab] = true;
  if (tab === 'practices') {
    apiFetch('/api/practices').then(renderPractices).catch(e => {
      document.getElementById('practices-grid').innerHTML =
        '<p style="color:#ef4444;font-size:13px">Error: ' + e.message + '</p>';
    });
  } else if (tab === 'accounts') {
    apiFetch('/api/accounts').then(renderAccounts).catch(e => {
      document.getElementById('accounts-body').innerHTML =
        '<tr class="empty-row"><td colspan="5">Error: ' + e.message + '</td></tr>';
    });
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStats(d) {
  document.getElementById('s-total').textContent     = fmt(d.totalBuilds);
  document.getElementById('s-rate').textContent      = d.successRate + '%';
  document.getElementById('s-practices').textContent = fmt(d.practices);
  document.getElementById('s-week').textContent      = fmt(d.weekRuns);
}

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
      : '<span style="color:var(--muted)">—</span>';
    return '<tr>' +
      '<td style="white-space:nowrap;color:var(--muted)">' + date + '</td>' +
      '<td style="font-weight:500">' + name + '</td>' +
      '<td>' + city + '</td>' +
      '<td><code style="font-size:11px;color:#6366f1">' + archetype + '</code></td>' +
      '<td style="color:#475569">' + fonts + '</td>' +
      '<td>' + badge + '</td>' +
      '<td style="color:var(--muted);white-space:nowrap">' + dur + '</td>' +
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
      '<div class="meta-row"><span class="meta-label">Archetype</span><span>' + archetype + '</span></div>' +
      '<div class="meta-row"><span class="meta-label">Fonts</span><span style="font-size:11px">' + fonts + '</span></div>' +
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
      ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" style="color:var(--teal-d);text-decoration:none;font-size:12px">' +
        esc(a.url.replace(/^https?:\/\//, '')) + ' ↗</a>'
      : '<span style="color:var(--muted)">—</span>';
    const lastBuild = a.last_build_at ? fmtDate(a.last_build_at) : '—';
    return '<tr>' +
      '<td style="font-weight:500">' + name + '</td>' +
      '<td>' + lcBadge(stage) + '</td>' +
      '<td>' + city + '</td>' +
      '<td>' + url + '</td>' +
      '<td style="color:var(--muted);white-space:nowrap">' + lastBuild + '</td>' +
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
