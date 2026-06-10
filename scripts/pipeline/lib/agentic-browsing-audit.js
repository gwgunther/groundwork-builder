/**
 * Agentic Browsing audit — runs Google Lighthouse CLI (agentic-browsing category).
 *
 * PSI / PageSpeed Insights API does not expose this category yet; Lighthouse CLI
 * is the supported path for automation (Lighthouse 12.4+, default in 13.3+).
 *
 * Export:
 *   runAgenticBrowsingAudit(url) → normalized result
 *   runAgenticBrowsingAuditOnProject(outputDir) → audits local preview of dist/
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { auditLlmsTxt, resolveLlmsTxtStatus } from './llms-txt-analyzer.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const PREVIEW_PORT = 4812;

/**
 * @param {string} url - Full URL to audit (live site or local preview)
 * @param {object} [opts]
 * @param {'mobile'|'desktop'} [opts.device]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<object>}
 */
export async function runAgenticBrowsingAudit(url, { device = 'mobile', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'lh-agentic-'));
  const outPath = join(tmpDir, 'report.json');

  try {
    const args = [
      'lighthouse', url,
      '--only-categories=agentic-browsing',
      '--output=json',
      `--output-path=${outPath}`,
      '--chrome-flags=--headless --no-sandbox --disable-gpu',
      `--form-factor=${device}`,
      '--quiet',
    ];

    await runCli('npx', args, timeoutMs);
    const raw = JSON.parse(await readFile(outPath, 'utf-8'));
    return parseLighthouseReport(raw, url);
  } catch (err) {
    console.warn(`[agentic-browsing] audit failed for ${url}: ${err.message}`);
    return {
      ok: false,
      url,
      error: err.message,
      llmsTxtStatus: null,
      llmsTxtPresent: null,
      llmsTxtLighthousePass: null,
      passRatio: null,
      fractionalScore: null,
      audits: {},
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Start astro preview against outputDir and audit the homepage.
 *
 * @param {string} outputDir - Client project root (contains dist/)
 * @returns {Promise<object>}
 */
export async function runAgenticBrowsingAuditOnProject(outputDir) {
  const preview = await startPreview(outputDir);
  if (!preview) {
    return {
      ok: false,
      error: 'Could not start astro preview for agentic-browsing audit',
      llmsTxtStatus: null,
      llmsTxtPresent: null,
      llmsTxtLighthousePass: null,
      passRatio: null,
      fractionalScore: null,
      audits: {},
    };
  }

  try {
    const baseUrl = `${preview.baseUrl}/`;
    const result = await runAgenticBrowsingAudit(baseUrl);
    // Fetch llms.txt while the preview server is still running — build-site
    // used to audit after preview teardown, which always looked "absent".
    const llmsHttp = await auditLlmsTxt(baseUrl);
    result.llms = llmsHttp;
    result.llmsTxtStatus = resolveLlmsTxtStatus(llmsHttp, result);
    result.llmsTxtPresent = result.llmsTxtStatus === 'good';
    return result;
  } finally {
    preview.kill?.();
  }
}

/**
 * @param {object} lhr - Lighthouse JSON report (LHR)
 * @param {string} url
 */
export function parseLighthouseReport(lhr, url = '') {
  const cats = lhr.categories || {};
  const agentic = cats['agentic-browsing'] || null;
  const audits = lhr.audits || {};

  const llmsQualityAudit = audits['llms-txt'] || audits['llms-txt-present'];
  const llmsTxtLighthousePass = llmsQualityAudit?.score == null ? null : llmsQualityAudit.score === 1;
  const llmsTxtLighthouseTitle = llmsQualityAudit?.title || null;

  const auditRefs = agentic?.auditRefs || [];
  let passed = 0;
  const auditSummary = {};

  for (const ref of auditRefs) {
    const a = audits[ref.id];
    if (!a) continue;
    if (a.score === 1) passed += 1;
    auditSummary[ref.id] = {
      title: a.title || ref.id,
      score: a.score ?? null,
      displayValue: a.displayValue || null,
      notApplicable: a.notApplicable === true,
      explanation: a.explanation || null,
    };
  }

  const total = auditRefs.length;

  return {
    ok: true,
    url: lhr.finalUrl || lhr.requestedUrl || url,
    llmsTxtLighthousePass,
    llmsTxtLighthouseTitle,
    // Deprecated boolean — use llmsTxtStatus from scanner (HTTP + Lighthouse).
    llmsTxtPresent: llmsTxtLighthousePass,
    passRatio: total > 0 ? { passed, total } : null,
    fractionalScore: agentic?.score ?? null,
    audits: auditSummary,
    lighthouseVersion: lhr.lighthouseVersion || null,
  };
}

function runCli(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Lighthouse timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-400) || `Lighthouse exited ${code}`));
    });
  });
}

async function startPreview(projectDir) {
  const port = PREVIEW_PORT;
  const proc = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: resolve(projectDir),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  proc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes(`localhost:${port}`) || s.includes(`127.0.0.1:${port}`)) ready = true;
  });
  proc.stderr.on('data', () => {});

  const start = Date.now();
  while (!ready && Date.now() - start < 15_000) {
    await new Promise(r => setTimeout(r, 200));
    if (proc.exitCode != null) return null;
  }
  if (!ready) {
    proc.kill();
    return null;
  }
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    kill: () => { try { proc.kill(); } catch {} },
  };
}
