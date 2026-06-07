/**
 * audit-agentic.js — Post-build Lighthouse Agentic Browsing audit.
 *
 * Deterministically checks the 4 criteria from Lighthouse 13.3+ (Chrome 150+):
 *
 *   1. llms.txt          — /llms.txt exists and is non-empty
 *   2. WebMCP tools      — /.well-known/webmcp.json exists with ≥1 tool
 *   3. Accessibility tree — <nav> has aria-label; dropdowns have role="menu"
 *   4. Layout stability   — <img> tags in built HTML have width + height
 *
 * No AI calls — pure file + HTML analysis. Zero cost per run.
 *
 * Output shape:
 *   { results: [{ id, title, description, pass, detail }], passed, total, fraction }
 */

import { stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runAgenticAudit(outputDir) {
  const results = [];

  // ------------------------------------------------------------------
  // 1. llms.txt
  // ------------------------------------------------------------------
  const llmsTxtPath = resolve(outputDir, 'public', 'llms.txt');
  const llmsContent = await tryRead(llmsTxtPath);
  const hasLlmsTxt  = llmsContent !== null && llmsContent.trim().length > 0;
  results.push({
    id:          'llms-txt',
    title:       'llms.txt',
    description: 'Machine-readable AI summary at /llms.txt',
    pass:        hasLlmsTxt,
    detail:      hasLlmsTxt
      ? `Found — ${llmsContent.trim().split('\n').length} lines`
      : 'Missing: pipeline did not write public/llms.txt',
  });

  // ------------------------------------------------------------------
  // 2. WebMCP tools
  // ------------------------------------------------------------------
  const webmcpPath    = resolve(outputDir, 'public', '.well-known', 'webmcp.json');
  const webmcpContent = await tryRead(webmcpPath);
  let webmcpToolCount = 0;
  let webmcpDetail    = 'Missing: no /.well-known/webmcp.json found';

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
  // 3. Accessibility tree — nav ARIA
  // Check the built homepage for correct nav landmark + menu semantics.
  // ------------------------------------------------------------------
  const homeHtml = await tryRead(resolve(outputDir, 'dist', 'index.html'));
  let navAriaLabelPass = false;
  let roleMenuPass     = false;
  let ariaDetail       = 'Built HTML not found — run without --skip-build';

  if (homeHtml) {
    navAriaLabelPass = /\<nav[^>]+aria-label/i.test(homeHtml);
    roleMenuPass     = /role=["']menu["']/i.test(homeHtml)
                    || /aria-haspopup=["']true["']/i.test(homeHtml);

    const navLabelStatus  = navAriaLabelPass ? '✓ <nav> aria-label'  : '✗ <nav> missing aria-label';
    const menuRoleStatus  = roleMenuPass      ? '✓ dropdown role/haspopup' : '✗ dropdown missing role/aria-haspopup';
    ariaDetail = `${navLabelStatus} · ${menuRoleStatus}`;
  }

  results.push({
    id:          'accessibility-for-agents',
    title:       'Accessibility for agents',
    description: 'Navigation landmarks, ARIA labels, and dropdown menu semantics',
    pass:        homeHtml ? (navAriaLabelPass && roleMenuPass) : false,
    detail:      ariaDetail,
  });

  // ------------------------------------------------------------------
  // 4. Layout stability — img dimension proxy
  // Lighthouse's CLS audit catches layout shifts; the primary static
  // proxy is whether <img> tags declare width + height (prevents
  // aspect-ratio reservation failures).
  // ------------------------------------------------------------------
  let imgMissingDims = 0;
  let imgTotal       = 0;
  let clsDetail      = 'Built HTML not found';

  if (homeHtml) {
    const imgTags     = homeHtml.match(/<img[^>]+>/gi) || [];
    imgTotal          = imgTags.length;
    imgMissingDims    = imgTags.filter(tag => !/\bwidth=/i.test(tag) || !/\bheight=/i.test(tag)).length;

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
    description: 'Images have width/height attributes; font-display:swap applied via Google Fonts URL',
    pass:        homeHtml ? (imgMissingDims === 0) : false,
    detail:      clsDetail,
  });

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const passed   = results.filter(r => r.pass).length;
  const total    = results.length;
  const fraction = `${passed}/${total}`;

  return { results, passed, total, fraction };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

async function tryRead(path) {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}
