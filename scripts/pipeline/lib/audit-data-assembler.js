/**
 * Assembles groundwork-audit/v1 JSON — single source of truth for audit renders.
 */

import { getCatalogEntry } from '../findings-catalog.js';
import {
  CATEGORY_LABELS,
  WORKSTREAMS,
  SUMMARY_EXCLUDE,
  CUSTOMER_IMPACT,
  CONSUMER_COPY,
  BUILD_HINTS,
} from './audit-data-copy.js';

const SCHEMA = 'groundwork-audit/v1';
const MAX_SUMMARY = 5;
const EVIDENCE_ROW_CAP = 200;

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {object|null} opts.bronze
 * @param {object|null} opts.pagespeed
 * @param {object[]} opts.findings - enriched findings (all severities)
 * @param {object|null} opts.scraped - silver / merged practice data
 * @param {object|null} opts.aiAudit
 * @param {object|null} opts.findingsSummary
 */
export function assembleAuditData(opts) {
  const {
    url,
    slug = '',
    bronze = null,
    pagespeed = null,
    findings = [],
    scraped = null,
    aiAudit = null,
    findingsSummary = null,
  } = opts;

  const practiceName = scraped?.practice?.name || hostnameLabel(url);
  const city = scraped?.address?.city || '';
  const audienceNoun = 'patients';
  const domain = normalizeDomain(url);

  const issueFindings = findings.filter(
    f => f.severity === 'critical' || f.severity === 'warning',
  );
  const summaryIds = pickSummaryIds(issueFindings, pagespeed);

  const assembledFindings = findings.map(f =>
    transformFinding(f, {
      bronze,
      pagespeed,
      url,
      city,
      audienceNoun,
      inSummary: summaryIds.has(f.id),
      summaryRank: summaryIds.get(f.id) ?? null,
    }),
  );

  const critical = findings.filter(f => f.severity === 'critical').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const issuesFound = issueFindings.length;
  const checksPassing = findingsSummary?.passed
    ?? findings.filter(f => f.severity === 'passed').length;

  const crawlStats = deriveCrawlStats(bronze, findings);

  return {
    $schema: SCHEMA,
    _doc: 'SOURCE OF TRUTH. Scanners emit facts; renderers read this file only. LLM may rewrite consumer.now/good for tone, never numbers, scores, or evidence rows.',

    meta: {
      business_name: practiceName,
      url: domain,
      slug: slug || domain.replace(/\./g, '-'),
      vertical: 'dental',
      audience_noun: audienceNoun,
      city,
      generated_at: new Date().toISOString().slice(0, 10),
      target_stack: ['Astro', 'Tailwind', 'Cloudflare Pages'],
      source_url: url,
    },

    scan: {
      pages_crawled: crawlStats.pages_crawled,
      images_checked: crawlStats.images_checked,
      issues_found: issuesFound,
      severity_counts: { critical, warning: warnings },
      checks_passing: checksPassing,
    },

    lighthouse: buildLighthouse(pagespeed, assembledFindings),

    findings: assembledFindings,

    strategy_bridge: buildStrategyBridge(aiAudit, scraped),
  };
}

function pickSummaryIds(issueFindings, pagespeed) {
  const hasLcpIssue = issueFindings.some(f => f.id === 'low-lcp');
  const candidates = issueFindings.filter(f => {
    if (SUMMARY_EXCLUDE.has(f.id)) return false;
    if (!CONSUMER_COPY[f.id]) return false;
    if (f.id === 'low-performance' && hasLcpIssue) return false;
    return true;
  });

  const scored = candidates.map(f => {
    const entry = getCatalogEntry(f.id);
    const sevMult = f.severity === 'critical' ? 3 : 2;
    const impact = CUSTOMER_IMPACT[f.id] ?? 1;
    return { id: f.id, score: (entry.weight ?? 1) * sevMult * impact };
  });
  scored.sort((a, b) => b.score - a.score);

  const rankMap = new Map();
  scored.slice(0, MAX_SUMMARY).forEach((item, i) => {
    rankMap.set(item.id, i + 1);
  });
  return rankMap;
}

function transformFinding(f, ctx) {
  const { bronze, pagespeed, city, audienceNoun, inSummary, summaryRank } = ctx;
  const entry = getCatalogEntry(f.id);
  const workstream = WORKSTREAMS[f.id] || categoryToWorkstream(f.category);
  const category = CATEGORY_LABELS[f.id] || f.title;

  const measurement = buildMeasurement(f, pagespeed, bronze);
  const technical = buildTechnical(f, entry, bronze);
  const evidence_rows = buildEvidenceRows(f, bronze);
  const consumer = inSummary
    ? buildConsumer(f, { city, audienceNoun, pagespeed, measurement })
    : null;

  return {
    id: f.id,
    category,
    workstream,
    severity: f.severity === 'passed' ? 'passed' : f.severity,
    impact: f.severity === 'critical' ? 'high' : f.severity === 'warning' ? 'med' : 'low',
    effort: entry.fix_action?.kind === 'manual' ? 'med' : 'low',
    show_in_summary: inSummary,
    summary_rank: inSummary ? summaryRank : null,
    measurement,
    consumer,
    technical,
    evidence_rows,
  };
}

function duplicateTitlePageCount(bronze) {
  const pages = bronze?.pages || [];
  const titleMap = {};
  for (const p of pages) {
    const t = p.title?.trim();
    if (!t) continue;
    if (!titleMap[t]) titleMap[t] = 0;
    titleMap[t] += 1;
  }
  return Object.values(titleMap).filter(n => n > 1).reduce((sum, n) => sum + n, 0);
}

function buildMeasurement(f, pagespeed, bronze) {
  const tone = f.severity === 'critical' ? 'danger' : 'warning';

  if (f.id === 'duplicate-titles' && bronze?.pages?.length) {
    const n = duplicateTitlePageCount(bronze);
    if (n > 0) {
      return { type: 'metric', value: String(n), label: 'pages, same title', tone };
    }
  }

  if (f.id === 'low-lcp' && pagespeed?.mobile?.metrics?.lcp != null) {
    const sec = (pagespeed.mobile.metrics.lcp / 1000).toFixed(1);
    return { type: 'metric', value: `${sec}s`, label: 'load time', target: '2.5s', tone };
  }

  if (f.id === 'low-performance' && pagespeed?.mobile?.performance != null) {
    return {
      type: 'metric',
      value: String(pagespeed.mobile.performance),
      label: 'mobile score',
      target: '90',
      tone,
    };
  }

  if (f.id === 'high-cls' && pagespeed?.mobile?.metrics?.cls != null) {
    return {
      type: 'metric',
      value: String(pagespeed.mobile.metrics.cls.toFixed(3)),
      label: 'layout shift',
      target: '0.1',
      tone,
    };
  }

  if (f.id === 'gbp-incomplete-profile' && f.detail) {
    const m = f.detail.match(/(\d+)%/);
    if (m) {
      return { type: 'metric', value: `${m[1]}%`, label: 'profile complete', tone };
    }
  }

  const statusIds = new Set([
    'no-faq', 'no-testimonials', 'no-phone-click-tracking', 'no-ga4-configured',
    'no-phone-on-site', 'no-address-on-site', 'no-hours-on-site', 'no-social-links',
    'missing-schema', 'gbp-no-description', 'gbp-no-title', 'gbp-no-phone', 'gbp-no-hours',
    'gbp-no-website-linked', 'using-third-party-domain', 'fractured-web-presence',
  ]);
  if (statusIds.has(f.id) && f.count > 0) {
    return { type: 'status', value: 'Missing', tone };
  }

  if (f.count > 0) {
    const label = measurementLabel(f.id, f, bronze);
    return { type: 'metric', value: String(f.count), label, tone };
  }

  return { type: 'status', value: f.severity === 'passed' ? 'OK' : 'Issue', tone };
}

function measurementLabel(id, f, bronze) {
  const labels = {
    'duplicate-titles': 'pages, same title',
    'missing-alt': 'photos, no alt text',
    'missing-meta': 'pages, no description',
    'missing-canonical': 'pages, no canonical',
    'missing-h1': 'pages, no H1',
    'multiple-h1': 'pages, multiple H1',
    'thin-content': 'pages under 200 words',
    'title-no-city': 'titles missing city',
    'gbp-low-review-count': 'reviews',
  };
  if (labels[id]) return labels[id];
  if (id === 'duplicate-titles' && f.affectedPages?.length) {
    return 'pages, same title';
  }
  return 'affected';
}

function buildTechnical(f, entry, bronze) {
  const target = entry.fix_action?.target;
  const build = target ? (BUILD_HINTS[target] || `${entry.fix_action.kind}: ${target}`) : null;
  return {
    evidence: f.detail || f.title,
    root_cause: f.benefit ? null : undefined,
    build: build || (f.benefit ? `See fix worklist for ${f.id}.` : null),
  };
}

function buildConsumer(f, ctx) {
  const template = CONSUMER_COPY[f.id];
  if (!template) return null;

  const lcpSec = ctx.pagespeed?.mobile?.metrics?.lcp != null
    ? Math.round(ctx.pagespeed.mobile.metrics.lcp / 1000)
    : null;
  const perfScore = ctx.pagespeed?.mobile?.performance ?? null;

  const vars = {
    city: ctx.city || 'your area',
    audience: ctx.audienceNoun,
    count: String(f.count || ctx.measurement?.value || ''),
    lcpSec: lcpSec != null ? String(lcpSec) : '10+',
    perfScore: perfScore != null ? String(perfScore) : '—',
  };

  return {
    now: interpolate(template.now, vars),
    good: interpolate(template.good, vars),
  };
}

function buildEvidenceRows(f, bronze) {
  const pages = bronze?.pages || [];

  if (f.id === 'duplicate-titles') {
    const titleMap = {};
    for (const p of pages) {
      const t = p.title?.trim();
      if (!t) continue;
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
    const dupUrls = [...new Set(
      Object.values(titleMap).filter(urls => urls.length > 1).flat(),
    )];
    if (dupUrls.length === 0) return null;

    const rows = dupUrls.slice(0, EVIDENCE_ROW_CAP).map(url => {
      const page = pages.find(p => p.url === url);
      return { url, title: page?.title?.trim() || '' };
    });
    return {
      columns: ['url', 'title'],
      total: dupUrls.length,
      rows,
      note: rows.length < dupUrls.length
        ? `${rows.length} of ${dupUrls.length} shown. Full set in audit-data.json.`
        : undefined,
    };
  }

  if (f.id === 'missing-alt') {
    const byPage = [];
    for (const p of pages) {
      const missing = (p.images || []).filter(img => !img.alt?.trim()).length;
      if (missing > 0) {
        byPage.push({
          url: p.url,
          unlabeled: `${missing} photo${missing === 1 ? '' : 's'}`,
        });
      }
    }
    if (byPage.length === 0) return null;
    return {
      columns: ['url', 'unlabeled'],
      total: byPage.length,
      rows: byPage.slice(0, EVIDENCE_ROW_CAP),
    };
  }

  if (f.id === 'thin-content') {
    const thin = pages
      .filter(p => (p.wordCount || 0) < 200 && p.url)
      .map(p => ({ url: p.url, words: `${p.wordCount || 0} words` }));
    if (thin.length === 0) return null;
    return { columns: ['url', 'words'], total: thin.length, rows: thin };
  }

  if (f.affectedPages?.length) {
    const col = evidenceValueColumn(f.id);
    const rows = f.affectedPages.slice(0, EVIDENCE_ROW_CAP).map(url => {
      const page = pages.find(p => p.url === url);
      const row = { url };
      if (col === 'title') row.title = page?.title?.trim() || '(no title)';
      if (col === 'meta') row.meta = page?.metaDescription?.trim() || '(missing)';
      return row;
    });
    return {
      columns: ['url', col],
      total: f.affectedPages.length,
      rows,
      note: f.affectedPages.length > rows.length
        ? `${rows.length} of ${f.affectedPages.length} shown.`
        : undefined,
    };
  }

  return null;
}

function evidenceValueColumn(id) {
  if (id === 'missing-meta') return 'meta';
  if (id === 'duplicate-titles' || id === 'missing-title' || id === 'title-no-city') return 'title';
  return 'detail';
}

function buildLighthouse(pagespeed, findings) {
  const mobile = pagespeed?.mobile;
  const m = mobile?.metrics || {};

  const raw_metrics = [
    metricRow('LCP', 'Largest Contentful Paint', m.lcp, 2500, 's'),
    metricRow('FCP', 'First Contentful Paint', m.fcp, 1800, 's'),
    metricRow('SI', 'Speed Index', m.si, 3400, 's'),
    metricRow('TTI', 'Time to Interactive', m.tti, 3800, 's'),
    metricRow('TBT', 'Total Blocking Time', m.tbt, 200, 'ms'),
    metricRow('CLS', 'Cumulative Layout Shift', m.cls, 0.1, '', false),
  ].filter(Boolean);

  const issueIds = new Set(
    findings.filter(f => f.show_in_summary || f.severity !== 'passed').map(f => f.id),
  );

  const seoRelated = ['duplicate-titles', 'missing-meta', 'missing-schema', 'no-faq', 'title-no-city', 'thin-content'];
  const perfRelated = ['low-lcp', 'low-performance', 'high-cls'];
  const a11yRelated = ['missing-alt', 'no-viewport'];

  const consumer_scores = [
    {
      key: 'mobile_speed',
      label: 'Mobile Speed',
      desc: 'How fast it loads on a phone',
      score: mobile?.performance ?? null,
      status: scoreStatus(mobile?.performance),
      derived_from: perfRelated.filter(id => issueIds.has(id) || findings.some(x => x.id === id && x.severity !== 'passed')),
    },
    {
      key: 'google_visibility',
      label: 'Google Visibility',
      desc: 'How easily patients find you',
      score: mobile?.seo ?? null,
      status: scoreStatus(mobile?.seo),
      derived_from: seoRelated.filter(id => findings.some(x => x.id === id && (x.severity === 'critical' || x.severity === 'warning'))),
    },
    {
      key: 'ease_of_use',
      label: 'Ease of Use',
      desc: 'Works on all devices',
      score: mobile?.accessibility ?? null,
      status: scoreStatus(mobile?.accessibility),
      derived_from: a11yRelated.filter(id => findings.some(x => x.id === id && (x.severity === 'critical' || x.severity === 'warning'))),
    },
    {
      key: 'technical_health',
      label: 'Technical Health',
      desc: 'Security & standards',
      score: mobile?.bestPractices ?? null,
      status: scoreStatus(mobile?.bestPractices),
      derived_from: [],
    },
  ];

  return {
    profile: 'mobile',
    source: 'PageSpeed Insights API v5',
    verify_url: 'https://pagespeed.web.dev',
    raw_metrics,
    consumer_scores,
  };
}

function metricRow(id, name, valueMs, target, unit, isMs = true) {
  if (valueMs == null) return null;
  const value = isMs && unit === 's' ? +(valueMs / 1000).toFixed(2) : +Number(valueMs).toFixed(3);
  const targetVal = isMs && unit === 's' ? target / 1000 : target;
  let status = 'pass';
  if (id === 'CLS') status = value <= target ? 'pass' : value <= 0.25 ? 'warn' : 'fail';
  else if (unit === 'ms') status = value <= target ? 'pass' : 'fail';
  else status = value <= targetVal ? 'pass' : 'fail';

  return { id, name, value, unit, target: isMs && unit === 's' ? targetVal : target, status };
}

function scoreStatus(score) {
  if (score == null) return 'warn';
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'warn';
}

function buildStrategyBridge(aiAudit, scraped) {
  const bridge = [];
  for (const gap of (aiAudit?.contentGaps || []).slice(0, 6)) {
    bridge.push({ gap, build: 'Address in rebuilt site content and navigation.' });
  }
  for (const opp of (aiAudit?.seoOpportunities || []).slice(0, 4)) {
    bridge.push({ gap: opp, build: 'Incorporate into service pages and local SEO structure.' });
  }
  if (bridge.length === 0 && scraped?.services?.offered?.length) {
    bridge.push({
      gap: 'Service coverage vs. site structure',
      build: 'Align navigation and dedicated pages with offered services from intake data.',
    });
  }
  return bridge;
}

function categoryToWorkstream(category) {
  if (category === 'performance' || category === 'accessibility') return 'performance';
  if (category === 'content') return 'content';
  if (category === 'seo' || category === 'hosting') return 'foundation';
  return 'conversion';
}

function interpolate(s, vars) {
  return String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function normalizeDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return String(url).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function hostnameLabel(url) {
  const d = normalizeDomain(url);
  return d.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Site Audit';
}

function deriveCrawlStats(bronze, findings) {
  let pages_crawled = bronze?.pageCount ?? bronze?.pages?.length ?? 0;
  let images_checked = 0;
  for (const p of bronze?.pages || []) {
    images_checked += (p.images || []).length;
  }

  if (!pages_crawled) {
    for (const f of findings || []) {
      const m = String(f.detail || '').match(/(\d+) of (\d+) pages/);
      if (m) pages_crawled = Math.max(pages_crawled, parseInt(m[2], 10));
    }
  }

  if (!images_checked) {
    const alt = findings?.find(f => f.id === 'missing-alt');
    if (alt?.count) {
      images_checked = alt.count;
    }
  }

  return { pages_crawled, images_checked };
}
