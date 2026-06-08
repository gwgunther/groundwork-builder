/**
 * Agentic scanner — prospect-site findings from Lighthouse + llms.txt HTTP fetch.
 *
 * Export:
 *   runAgenticScan(url) → { findings, summary, meta }
 */

import { enrichFindings } from './findings.js';
import { runAgenticBrowsingAudit } from './agentic-browsing-audit.js';
import { auditLlmsTxt, resolveLlmsTxtStatus } from './llms-txt-analyzer.js';

/**
 * Lighthouse + HTTP llms.txt fetch. No findings — for publish gates and build QC.
 *
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function auditAgenticUrl(url) {
  const [lighthouseMeta, llmsHttp] = await Promise.all([
    runAgenticBrowsingAudit(url),
    auditLlmsTxt(url),
  ]);

  const llmsTxtStatus = lighthouseMeta.ok
    ? resolveLlmsTxtStatus(llmsHttp, lighthouseMeta)
    : (llmsHttp.status === 'absent' ? 'absent' : llmsHttp.status);

  return {
    ...lighthouseMeta,
    llms: llmsHttp,
    llmsTxtStatus,
    llmsTxtPresent: llmsTxtStatus === 'good',
  };
}

/**
 * @param {string} url
 * @returns {Promise<{ findings: object[], summary: object, meta: object }>}
 */
export async function runAgenticScan(url) {
  console.log('[agentic-scan] Running Lighthouse agentic-browsing + llms.txt fetch...');

  const meta = await auditAgenticUrl(url);
  const raw = [];

  if (!meta.ok) {
    raw.push({
      id: 'agentic-browsing-unchecked',
      category: 'agentic',
      severity: 'warning',
      title: 'AI agent readiness not checked',
      detail: meta.error || 'Lighthouse agentic-browsing audit could not complete.',
      benefit: 'Google Lighthouse now measures how well AI assistants can read and navigate your site.',
      affectedPages: [],
      count: 0,
    });
    // Still emit llms finding from HTTP when Lighthouse failed.
    raw.push(...llmsFindings(meta));
    return { findings: enrichFindings(raw), summary: summarize(raw), meta };
  }

  const ratio = meta.passRatio;
  const ratioLabel = ratio ? `${ratio.passed}/${ratio.total}` : '—';
  const llmsLabel = meta.llmsTxtStatus === 'good' ? 'good'
    : meta.llmsTxtStatus === 'poor' ? 'present but subpar'
      : meta.llmsTxtStatus === 'absent' ? 'missing' : 'unknown';
  console.log(`[agentic-scan] llms.txt: ${llmsLabel} · agentic checks ${ratioLabel}`);

  raw.push(...llmsFindings(meta));

  const a11yAudit = meta.audits?.['agent-accessibility-tree'];
  if (a11yAudit?.score === 0) {
    raw.push({
      id: 'agent-accessibility-tree-poor',
      category: 'agentic',
      severity: 'warning',
      title: 'Accessibility tree for AI agents',
      detail: a11yAudit.title || 'Accessibility tree is not well-formed for machine navigation.',
      benefit: 'AI assistants read your site through the accessibility tree. Broken structure means they cannot reliably find buttons, forms, or key content.',
      affectedPages: [],
      count: 1,
    });
  }

  return { findings: enrichFindings(raw), summary: summarize(raw), meta };
}

function llmsFindings(meta) {
  const status = meta.llmsTxtStatus;
  const llms = meta.llms || {};
  const lhTitle = meta.llmsTxtLighthouseTitle;
  const findings = [];

  if (status === 'absent') {
    findings.push({
      id: 'no-llms-txt',
      category: 'agentic',
      severity: 'warning',
      title: 'llms.txt for AI agents',
      detail: 'No llms.txt at the site root. AI assistants use this file to discover and cite your content.',
      benefit: 'As AI assistants become a discovery channel, llms.txt tells them what your practice offers and which pages matter.',
      affectedPages: [],
      count: 1,
      llmsEvidence: buildLlmsEvidence(meta),
    });
    return findings;
  }

  if (status === 'poor') {
    const lhNote = lhTitle && meta.llmsTxtLighthousePass === false
      ? ` Lighthouse: "${lhTitle}".`
      : '';
    findings.push({
      id: 'llms-txt-poor',
      category: 'agentic',
      severity: 'warning',
      title: 'llms.txt quality for AI agents',
      detail: `llms.txt exists but does not follow best practices.${lhNote}`,
      benefit: 'A curated llms.txt helps ChatGPT, Gemini, and Perplexity surface your services accurately instead of CMS noise.',
      affectedPages: [],
      count: 1,
      llmsEvidence: buildLlmsEvidence(meta),
    });
    return findings;
  }

  return findings;
}

function buildLlmsEvidence(meta) {
  const llms = meta.llms || {};
  return {
    status: meta.llmsTxtStatus,
    url: llms.url || llms.verifyUrl,
    http_status: llms.httpStatus,
    generator: llms.generator,
    issues: llms.issues || [],
    flagged_lines: llms.flaggedLines || [],
    current_excerpt: llms.excerpt || null,
    lighthouse_note: meta.llmsTxtLighthouseTitle || meta.audits?.['llms-txt']?.title || null,
    verify_url: llms.verifyUrl || llms.url,
  };
}

function summarize(findings) {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };
}
