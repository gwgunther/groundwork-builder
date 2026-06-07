/**
 * audit-agentic-existing.js — Pre-build Agentic Browsing check on the
 * client's EXISTING site.
 *
 * Mirrors the same 4 checks as audit-agentic.js but runs against the
 * live URL instead of the built dist/:
 *
 *   1. llms.txt          — HTTP GET /llms.txt, check non-empty
 *   2. WebMCP tools      — HTTP GET /.well-known/webmcp.json, check ≥1 tool
 *   3. Accessibility tree — HTTP GET homepage HTML, check nav aria-label + dropdowns
 *   4. Layout stability   — same homepage HTML, check <img> width + height
 *
 * Existing dental sites are expected to score 0/4 or 1/4 on these checks.
 * The result is surfaced in the audit report and pitch as a before-state,
 * paired with the post-build score (typically 4/4) to show the delta.
 *
 * Non-fatal — all fetches have a 6-second timeout and fail silently.
 *
 * @param {string} siteUrl — The practice's existing site URL (e.g. "https://example.com")
 * @returns {Promise<{ results, passed, total, fraction }>}
 */

const FETCH_TIMEOUT_MS = 6_000;

export async function runExistingAgentAudit(siteUrl) {
  const base = normalizeBase(siteUrl);
  if (!base) {
    return {
      results:  [],
      passed:   0,
      total:    0,
      fraction: '0/0',
      skipped:  true,
      reason:   'Invalid or missing site URL',
    };
  }

  const results = [];

  // ------------------------------------------------------------------
  // 1. llms.txt
  // ------------------------------------------------------------------
  const llmsContent = await tryFetch(`${base}/llms.txt`);
  const hasLlmsTxt  = llmsContent !== null && llmsContent.trim().length > 0;
  results.push({
    id:          'llms-txt',
    title:       'llms.txt',
    description: 'Machine-readable AI summary at /llms.txt',
    pass:        hasLlmsTxt,
    detail:      hasLlmsTxt
      ? `Found — ${llmsContent.trim().split('\n').length} lines`
      : 'Missing: /llms.txt not found on existing site',
  });

  // ------------------------------------------------------------------
  // 2. WebMCP tools
  // ------------------------------------------------------------------
  const webmcpContent = await tryFetch(`${base}/.well-known/webmcp.json`);
  let webmcpToolCount = 0;
  let webmcpDetail    = 'Missing: /.well-known/webmcp.json not found on existing site';

  if (webmcpContent !== null) {
    try {
      const data      = JSON.parse(webmcpContent);
      webmcpToolCount = data.tools?.length || 0;
      const names     = (data.tools || []).map(t => t.name).join(', ');
      webmcpDetail    = webmcpToolCount > 0
        ? `${webmcpToolCount} tool(s): ${names}`
        : 'File found but contains 0 tools';
    } catch {
      webmcpDetail = 'File found but invalid JSON';
    }
  }

  results.push({
    id:          'webmcp-registered-tools',
    title:       'Registered WebMCP tools',
    description: 'Agent-callable action declarations at /.well-known/webmcp.json',
    pass:        webmcpToolCount > 0,
    detail:      webmcpDetail,
  });

  // ------------------------------------------------------------------
  // 3 + 4. Fetch homepage HTML once — use for both ARIA and CLS checks
  // ------------------------------------------------------------------
  const homeHtml = await tryFetch(base);

  // 3. Accessibility tree
  let navAriaLabelPass = false;
  let roleMenuPass     = false;
  let ariaDetail       = 'Could not fetch homepage HTML';

  if (homeHtml) {
    navAriaLabelPass = /\<nav[^>]+aria-label/i.test(homeHtml);
    roleMenuPass     = /role=["']menu["']/i.test(homeHtml)
                    || /aria-haspopup=["']true["']/i.test(homeHtml);
    const navLabelStatus = navAriaLabelPass ? '✓ <nav> aria-label'        : '✗ <nav> missing aria-label';
    const menuRoleStatus = roleMenuPass      ? '✓ dropdown role/haspopup' : '✗ dropdown missing role/aria-haspopup';
    ariaDetail = `${navLabelStatus} · ${menuRoleStatus}`;
  }

  results.push({
    id:          'accessibility-for-agents',
    title:       'Accessibility for agents',
    description: 'Navigation landmarks, ARIA labels, and dropdown menu semantics',
    pass:        homeHtml ? (navAriaLabelPass && roleMenuPass) : false,
    detail:      ariaDetail,
  });

  // 4. Layout stability
  let imgMissingDims = 0;
  let imgTotal       = 0;
  let clsDetail      = 'Could not fetch homepage HTML';

  if (homeHtml) {
    const imgTags  = homeHtml.match(/<img[^>]+>/gi) || [];
    imgTotal       = imgTags.length;
    imgMissingDims = imgTags.filter(tag => !/\bwidth=/i.test(tag) || !/\bheight=/i.test(tag)).length;

    if (imgTotal === 0) {
      clsDetail = 'No <img> tags in homepage';
    } else if (imgMissingDims === 0) {
      clsDetail = `✓ All ${imgTotal} image(s) have width + height`;
    } else {
      clsDetail = `✗ ${imgMissingDims}/${imgTotal} image(s) missing width or height`;
    }
  }

  results.push({
    id:          'layout-stability',
    title:       'Layout stability (CLS)',
    description: 'Images have width/height attributes to prevent layout shift',
    pass:        homeHtml ? (imgMissingDims === 0) : false,
    detail:      clsDetail,
  });

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const passed   = results.filter(r => r.pass).length;
  const total    = results.length;

  return { results, passed, total, fraction: `${passed}/${total}` };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function normalizeBase(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'GroundworkAudit/1.0 (+https://groundworkdental.com)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
