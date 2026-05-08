/**
 * Phase 4.6: SEO & AI-discoverability QC
 *
 * Walks the built `dist/` and scores every notable page on two lenses:
 *   - Traditional SEO   — search engines (Google, Bing)
 *   - AI / LLM SEO      — citation and surfacing in ChatGPT, Claude, Perplexity
 *
 * Two-tier scoring:
 *   1. Deterministic checks — measurable things (title length, H1 count,
 *      schema presence, alt-text coverage, internal-link quality, content
 *      depth). Run on every page, no API cost.
 *   2. AI evaluation — subjective dimensions (content-depth quality,
 *      direct-answer presence, citation-friendliness). Run on a sampled
 *      subset of pages to control token cost — homepage + one service
 *      detail + one blog post.
 *
 * Output: `_pipeline/11-seo-audit.json` with per-page scores and aggregate.
 * Findings also surface as items in the missing report.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const MODEL = 'claude-sonnet-4-6';

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

/**
 * @param {string} outputDir
 * @param {object} [opts]
 * @param {boolean} [opts.aiEvaluation] - default true; pass false to skip Claude calls
 * @param {object} [opts.merged] - merged practice data (for context)
 * @returns {Promise<object>} audit report
 */
export async function auditSeo(outputDir, opts = {}) {
  const distDir = resolve(outputDir, 'dist');
  const aiEvaluation = opts.aiEvaluation !== false && !!process.env.ANTHROPIC_API_KEY;

  const htmlFiles = await collectHtmlFiles(distDir);
  const pages = [];

  for (const file of htmlFiles) {
    const url = filePathToUrl(file, distDir);
    if (skipPage(url)) continue;

    let html;
    try { html = await readFile(file, 'utf8'); } catch { continue; }

    const pageType = inferPageType(url);
    const determ = runDeterministicChecks(html, url, pageType);
    pages.push({ url, file: relative(outputDir, file), pageType, ...determ });
  }

  // AI evaluation on a sampled subset (homepage + first detail of each
  // page-type bucket). Subjective scores merge into the deterministic scores.
  if (aiEvaluation && pages.length > 0) {
    const sampled = sampleForAiEval(pages);
    const aiScores = await runAiEvaluation(sampled, opts.merged || {}, outputDir);
    for (const aiScore of aiScores) {
      const target = pages.find(p => p.url === aiScore.url);
      if (!target) continue;
      target.checks.ai_content_depth = aiScore.content_depth;
      target.checks.ai_direct_answer = aiScore.direct_answer;
      target.checks.ai_citation_friendly = aiScore.citation_friendly;
      // Recompute overall scores including the AI dimensions
      target.overall = recomputeOverall(target.checks);
      target.lensScores = recomputeLensScores(target.checks);
    }
  }

  return summarize(pages);
}

// -----------------------------------------------------------------------
// Deterministic per-page checks
// -----------------------------------------------------------------------

/**
 * Each check returns { score (1-10), issue (string|null), value? (any),
 * lensTraditional (bool), lensAi (bool) }. Lens flags determine which
 * lens the check contributes to in the aggregate.
 */
function runDeterministicChecks(html, url, pageType) {
  const checks = {};

  // <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
  checks.title = scoreTitle(title);

  // <meta name="description">
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const desc = descMatch ? decodeEntities(descMatch[1].trim()) : '';
  checks.meta_description = scoreMetaDescription(desc);

  // <h1> count
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  checks.h1_count = scoreH1Count(h1Count);

  // Heading hierarchy — flag skips (h1 → h3 without h2, etc.)
  checks.heading_hierarchy = scoreHeadingHierarchy(html);

  // Canonical link
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  checks.canonical = {
    score: canonical ? 10 : 4,
    issue: canonical ? null : 'No canonical <link rel="canonical"> tag — duplicate-content risk.',
    value: canonical,
    lensTraditional: true,
    lensAi: false,
  };

  // Open Graph + Twitter card
  const ogTitle = /<meta[^>]+property=["']og:title["']/i.test(html);
  const ogDesc  = /<meta[^>]+property=["']og:description["']/i.test(html);
  const ogImage = /<meta[^>]+property=["']og:image["']/i.test(html);
  const ogScore = (ogTitle ? 4 : 0) + (ogDesc ? 3 : 0) + (ogImage ? 3 : 0);
  checks.open_graph = {
    score: Math.max(1, ogScore),
    issue: ogScore < 10 ? `Open Graph incomplete (title:${ogTitle} desc:${ogDesc} image:${ogImage}).` : null,
    lensTraditional: true,
    lensAi: false,
  };

  // JSON-LD schema presence + page-type-appropriate type
  checks.schema = scoreSchema(html, pageType);

  // <img alt> coverage
  checks.img_alt_coverage = scoreImgAlt(html);

  // Internal links — count + descriptive anchor text
  checks.internal_links = scoreInternalLinks(html);

  // Word count (content depth)
  checks.content_depth = scoreContentDepth(html, pageType);

  // FAQ section detection (AI lens)
  checks.faq_presence = scoreFaqPresence(html, pageType);

  // Compute overall + per-lens averages
  const overall = recomputeOverall(checks);
  const lensScores = recomputeLensScores(checks);

  return { title, description: desc, h1Count, checks, overall, lensScores };
}

function scoreTitle(title) {
  if (!title) return { score: 1, issue: 'Missing <title>.', value: '', lensTraditional: true, lensAi: true };
  const len = title.length;
  if (len < 20) return { score: 3, issue: `Title is ${len} chars — too short to describe the page.`, value: title, lensTraditional: true, lensAi: true };
  if (len < 40) return { score: 6, issue: `Title is ${len} chars — pad toward 40–60 with a descriptive subject.`, value: title, lensTraditional: true, lensAi: true };
  if (len > 70) return { score: 5, issue: `Title is ${len} chars — Google truncates around 60. Trim or move the practice name to the end.`, value: title, lensTraditional: true, lensAi: true };
  if (len > 60) return { score: 7, issue: `Title is ${len} chars — slightly over the 60-char SERP limit.`, value: title, lensTraditional: true, lensAi: true };
  return { score: 10, issue: null, value: title, lensTraditional: true, lensAi: true };
}

function scoreMetaDescription(desc) {
  if (!desc) return { score: 1, issue: 'Missing meta description.', value: '', lensTraditional: true, lensAi: true };
  const len = desc.length;
  if (len < 50) return { score: 3, issue: `Meta description is ${len} chars — too short to be useful.`, value: desc, lensTraditional: true, lensAi: true };
  if (len < 110) return { score: 6, issue: `Meta description is ${len} chars — target 120–160.`, value: desc, lensTraditional: true, lensAi: true };
  if (len > 175) return { score: 5, issue: `Meta description is ${len} chars — Google truncates around 160.`, value: desc, lensTraditional: true, lensAi: true };
  return { score: 10, issue: null, value: desc, lensTraditional: true, lensAi: true };
}

function scoreH1Count(count) {
  if (count === 0) return { score: 1, issue: 'No <h1> on the page.', value: 0, lensTraditional: true, lensAi: true };
  if (count > 1)  return { score: 4, issue: `Found ${count} <h1> elements — should be exactly 1.`, value: count, lensTraditional: true, lensAi: true };
  return { score: 10, issue: null, value: 1, lensTraditional: true, lensAi: true };
}

function scoreHeadingHierarchy(html) {
  const matches = [...html.matchAll(/<h([1-6])\b/gi)];
  const levels = matches.map(m => Number(m[1]));
  let skipped = false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) { skipped = true; break; }
  }
  return {
    score: skipped ? 5 : 10,
    issue: skipped ? 'Heading hierarchy skips levels (e.g. h1 → h3 without an h2).' : null,
    lensTraditional: true,
    lensAi: false,
  };
}

function scoreSchema(html, pageType) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) {
    return { score: 1, issue: 'No JSON-LD schema markup on the page.', value: [], lensTraditional: true, lensAi: true };
  }

  const types = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        if (node?.['@type']) {
          const t = Array.isArray(node['@type']) ? node['@type'].join('+') : node['@type'];
          types.push(t);
        }
      }
    } catch { /* invalid JSON-LD — bad but parse error means it won't help */ }
  }

  const expected = expectedSchemasForPageType(pageType);
  const missing = expected.filter(e => !types.some(t => satisfiesSchemaType(t, e)));
  if (missing.length === 0) {
    return { score: 10, issue: null, value: types, lensTraditional: true, lensAi: true };
  }
  return {
    score: 5,
    issue: `Page type "${pageType}" is missing expected schema(s): ${missing.join(', ')}. Found: ${types.join(', ') || 'none'}.`,
    value: types,
    lensTraditional: true,
    lensAi: true,
  };
}

/**
 * Schema.org type hierarchy — known subtypes that satisfy a more general
 * expected type. The audit's expectations are conservative (e.g.
 * "LocalBusiness"); a page emitting a more specific subtype like "Dentist"
 * satisfies it. Substring matching alone is too permissive elsewhere
 * ("MedicalProcedure" would match "Procedure"); this map is the precise
 * version.
 */
const SCHEMA_SUBTYPES = {
  LocalBusiness: ['LocalBusiness', 'Dentist', 'DentistOffice', 'MedicalBusiness', 'MedicalClinic', 'Pharmacy', 'Physician', 'Hospital', 'EmergencyService'],
  Person: ['Person', 'Patient'],
  MedicalProcedure: ['MedicalProcedure', 'TherapeuticProcedure', 'DiagnosticProcedure', 'SurgicalProcedure'],
  BlogPosting: ['BlogPosting', 'NewsArticle', 'Article'],
  BreadcrumbList: ['BreadcrumbList'],
  FAQPage: ['FAQPage'],
};

function satisfiesSchemaType(found, expected) {
  if (found === expected) return true;
  const subtypes = SCHEMA_SUBTYPES[expected];
  if (subtypes && subtypes.includes(found)) return true;
  // Allow combined types like "Dentist+LocalBusiness" emitted as @type arrays
  if (found.includes('+')) {
    return found.split('+').some(part => satisfiesSchemaType(part.trim(), expected));
  }
  return false;
}

function expectedSchemasForPageType(pageType) {
  // Schemas the audit requires per page type. Mirrors the recipe table in
  // `reference/seo-guidelines.md`. Note: 'Dentist' is a subtype of
  // LocalBusiness — the score function uses substring match, so requiring
  // 'LocalBusiness' is satisfied by either. Dentist-specific is preferred.
  switch (pageType) {
    case 'homepage':       return ['LocalBusiness']; // BreadcrumbList not on home
    case 'services-index': return ['BreadcrumbList'];
    case 'service-detail': return ['BreadcrumbList', 'MedicalProcedure'];
    case 'blog-index':     return ['BreadcrumbList'];
    case 'blog-post':      return ['BlogPosting', 'BreadcrumbList'];
    case 'about':          return ['Person', 'BreadcrumbList'];
    case 'contact':        return ['BreadcrumbList'];
    default:               return [];
  }
}

function scoreImgAlt(html) {
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  if (imgs.length === 0) return { score: 10, issue: null, value: { total: 0, missing: 0 }, lensTraditional: true, lensAi: true };
  let missing = 0;
  for (const img of imgs) {
    const altMatch = img.match(/\salt=["']([^"']*)["']/i);
    if (!altMatch) { missing++; continue; }
    // alt="" (empty) is ALLOWED for decorative images. Don't penalize.
  }
  const coverage = (imgs.length - missing) / imgs.length;
  if (missing === 0) return { score: 10, issue: null, value: { total: imgs.length, missing }, lensTraditional: true, lensAi: true };
  return {
    score: Math.max(1, Math.round(coverage * 10)),
    issue: `${missing} of ${imgs.length} <img> tags have no alt attribute. Add descriptive alt or alt="" for decorative.`,
    value: { total: imgs.length, missing },
    lensTraditional: true,
    lensAi: true,
  };
}

function scoreInternalLinks(html) {
  // Anchors whose href starts with / and isn't fragment/external/mailto/tel
  const anchors = [...html.matchAll(/<a\b[^>]*\shref=["'](\/[^"'#]*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  if (anchors.length < 3) {
    return { score: 5, issue: `Only ${anchors.length} internal links — pages should link to related pages on the site.`, value: anchors.length, lensTraditional: true, lensAi: false };
  }
  // Detect generic anchor text
  const generic = ['click here', 'learn more', 'read more', 'here', 'this link', 'more', 'get started'];
  let genericCount = 0;
  for (const a of anchors) {
    const text = a[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (generic.includes(text)) genericCount++;
  }
  if (genericCount > 0) {
    return {
      score: Math.max(3, 10 - genericCount * 2),
      issue: `${genericCount} internal link(s) use generic anchor text (e.g. "Learn More", "Click Here"). Use descriptive anchors that name what the link points to.`,
      value: { total: anchors.length, generic: genericCount },
      lensTraditional: true,
      lensAi: false,
    };
  }
  return { score: 10, issue: null, value: { total: anchors.length, generic: 0 }, lensTraditional: true, lensAi: false };
}

function scoreContentDepth(html, pageType) {
  // Strip scripts, styles, then count words in remaining text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean).length;

  const targets = {
    homepage:       { min: 200, full: 600 },
    'services-index': { min: 150, full: 400 },
    'service-detail': { min: 350, full: 700 },
    'blog-index':   { min: 150, full: 400 },
    'blog-post':    { min: 600, full: 1500 },
    about:          { min: 300, full: 800 },
    contact:        { min: 100, full: 300 },
    other:          { min: 150, full: 400 },
  }[pageType] || { min: 150, full: 400 };

  if (words < targets.min) {
    return { score: 3, issue: `${words} words on a ${pageType} page — too thin (target ≥ ${targets.full}).`, value: words, lensTraditional: true, lensAi: true };
  }
  if (words < targets.full) {
    const ratio = (words - targets.min) / (targets.full - targets.min);
    return { score: Math.round(6 + ratio * 3), issue: `${words} words — adequate but a ${pageType} page benefits from ≥ ${targets.full}.`, value: words, lensTraditional: true, lensAi: true };
  }
  return { score: 10, issue: null, value: words, lensTraditional: true, lensAi: true };
}

function scoreFaqPresence(html, pageType) {
  // FAQ schema indicates an FAQ block is present and structured.
  const hasFaqSchema = /["']@type["']\s*:\s*["']FAQPage["']/i.test(html);
  // For service detail and blog post pages, an FAQ block is a strong AI-citation signal.
  const benefitsFromFaq = pageType === 'service-detail' || pageType === 'blog-post' || pageType === 'homepage';
  if (!benefitsFromFaq) {
    return { score: 10, issue: null, value: hasFaqSchema, lensTraditional: false, lensAi: true };
  }
  if (hasFaqSchema) {
    return { score: 10, issue: null, value: true, lensTraditional: false, lensAi: true };
  }
  return {
    score: 5,
    issue: `No FAQPage schema or FAQ block on this ${pageType}. FAQ blocks are one of the strongest signals for LLM citation.`,
    value: false,
    lensTraditional: false,
    lensAi: true,
  };
}

// -----------------------------------------------------------------------
// AI evaluation (subjective dimensions)
// -----------------------------------------------------------------------

function sampleForAiEval(pages) {
  // Pick representative samples: homepage, one service-detail, one blog-post,
  // about (if present). Avoids per-page Claude calls on every page.
  const picked = [];
  const home = pages.find(p => p.pageType === 'homepage');
  if (home) picked.push(home);
  const serviceDetail = pages.find(p => p.pageType === 'service-detail');
  if (serviceDetail) picked.push(serviceDetail);
  const blogPost = pages.find(p => p.pageType === 'blog-post');
  if (blogPost) picked.push(blogPost);
  const about = pages.find(p => p.pageType === 'about');
  if (about) picked.push(about);
  return picked;
}

async function runAiEvaluation(samplePages, merged, outputDir) {
  if (samplePages.length === 0) return [];

  // For each sampled page, read its HTML from disk and extract a summary
  // (h1 + h2s + first 3 paragraphs). p.file is relative to outputDir.
  const summaries = await Promise.all(samplePages.map(async (p) => {
    const absPath = resolve(outputDir, p.file);
    try {
      const html = await readFile(absPath, 'utf8');
      return { url: p.url, pageType: p.pageType, content: extractPageSummary(html) };
    } catch {
      return null;
    }
  }));

  const valid = summaries.filter(Boolean);
  if (valid.length === 0) return [];

  const prompt = buildAiEvalPrompt(valid, merged);
  try {
    const { callAnthropic } = await import('./ai-call.js');
    const res = await callAnthropic({
      phase:     'seo-audit:ai-eval',
      model:     MODEL,
      maxTokens: 4096,
      messages:  [{ role: 'user', content: prompt }],
    });
    return parseAiEvalResponse(res.text);
  } catch (err) {
    console.warn(`  [seo-audit] AI evaluation failed: ${err.message}`);
    return [];
  }
}

function extractPageSummary(html) {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 5).map(m => m[1].replace(/<[^>]+>/g, '').trim());
  // Pull first ~3 paragraphs of body text
  const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .slice(0, 5)
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(p => p.length > 60);
  return { h1, h2s, paragraphs: paras.slice(0, 3) };
}

function buildAiEvalPrompt(summaries, merged) {
  const practiceName = merged.practice?.name || 'the practice';
  const city = merged.address?.city || '';

  const pageBlocks = summaries.map((s, i) => {
    return `### Page ${i + 1}: ${s.url} (${s.pageType})

**H1:** ${s.content.h1 || '(none)'}
**H2s:** ${(s.content.h2s || []).join(' | ') || '(none)'}
**Opening paragraphs:**
${(s.content.paragraphs || []).map((p, j) => `${j + 1}. ${p.slice(0, 600)}`).join('\n\n')}`;
  }).join('\n\n---\n\n');

  return `You are scoring a set of pages from ${practiceName}'s website${city ? ` in ${city}` : ''} on three subjective SEO/AI-discoverability dimensions. For each page, return a 1–10 score with one short evidence sentence.

# The pages

${pageBlocks}

# The dimensions

1. **content_depth** — does the page provide *useful, specific information* about its subject, or is it thin marketing copy? Look for: explanation of what the topic is, who it's for, how it works, what to expect. Penalize generic statements.

2. **direct_answer** — if a search user asked the obvious question this page is about (e.g. "what is X" / "how does Y work"), would they find a direct, plain-language answer in the opening paragraphs? Penalize pages that bury the lead in marketing intro.

3. **citation_friendly** — is this page citation-friendly for an LLM? Look for: factual statements over marketing claims; specific numbers, dates, locations, credentials (when present); avoidance of vague "we care", "best in town", "your trusted partner" phrasing.

# Output format

Return ONLY a single JSON object with this shape:

\`\`\`json
{
  "pages": [
    {
      "url": "<url>",
      "content_depth": { "score": <1-10>, "issue": "<one short sentence>" },
      "direct_answer": { "score": <1-10>, "issue": "<one short sentence>" },
      "citation_friendly": { "score": <1-10>, "issue": "<one short sentence>" }
    }
  ]
}
\`\`\`

Set "issue" to null if the page does well on that dimension. Be strict — a default 7 is reserved for "good but room to grow".`;
}

function parseAiEvalResponse(raw) {
  let text = (raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    const parsed = JSON.parse(text);
    return (parsed.pages || []).map(p => ({
      url: p.url,
      content_depth: { ...p.content_depth, lensTraditional: true, lensAi: true },
      direct_answer: { ...p.direct_answer, lensTraditional: false, lensAi: true },
      citation_friendly: { ...p.citation_friendly, lensTraditional: false, lensAi: true },
    }));
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------

function recomputeOverall(checks) {
  const scores = Object.values(checks).map(c => c.score).filter(n => Number.isFinite(n));
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

function recomputeLensScores(checks) {
  const trad = [], ai = [];
  for (const c of Object.values(checks)) {
    if (c.lensTraditional) trad.push(c.score);
    if (c.lensAi)          ai.push(c.score);
  }
  const avg = arr => arr.length ? Math.round((arr.reduce((a,b) => a + b, 0) / arr.length) * 10) / 10 : 0;
  return { traditional: avg(trad), ai: avg(ai) };
}

function summarize(pages) {
  if (pages.length === 0) {
    return { pageCount: 0, overall: 0, byLens: { traditional: 0, ai: 0 }, pages: [], topIssues: [] };
  }
  const overall = Math.round((pages.reduce((a, p) => a + p.overall, 0) / pages.length) * 10) / 10;
  const lensSum = pages.reduce((acc, p) => ({
    traditional: acc.traditional + (p.lensScores?.traditional || 0),
    ai: acc.ai + (p.lensScores?.ai || 0),
  }), { traditional: 0, ai: 0 });
  const byLens = {
    traditional: Math.round((lensSum.traditional / pages.length) * 10) / 10,
    ai: Math.round((lensSum.ai / pages.length) * 10) / 10,
  };

  // Top issues — collect unique non-null issues sorted by severity (low score first)
  const issues = [];
  for (const p of pages) {
    for (const [dim, c] of Object.entries(p.checks || {})) {
      if (c.issue) issues.push({ url: p.url, dimension: dim, score: c.score, issue: c.issue });
    }
  }
  issues.sort((a, b) => a.score - b.score);

  return {
    pageCount: pages.length,
    overall,
    byLens,
    pages,
    topIssues: issues.slice(0, 25),
    issueCount: issues.length,
  };
}

// -----------------------------------------------------------------------
// File walking + URL inference
// -----------------------------------------------------------------------

async function collectHtmlFiles(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.html')) out.push(p);
    }
  }
  await walk(dir);
  return out;
}

function filePathToUrl(filePath, distDir) {
  const rel = filePath.replace(distDir, '').replace(/\\/g, '/');
  // dist/index.html → /
  // dist/about/index.html → /about
  if (rel === '/index.html') return '/';
  return rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
}

function skipPage(url) {
  // Skip internal-only routes
  if (url === '/missing') return true;
  if (url === '/thank-you') return true;
  return false;
}

function inferPageType(url) {
  if (url === '/') return 'homepage';
  if (url === '/services') return 'services-index';
  if (url.startsWith('/services/')) return 'service-detail';
  if (url === '/blog') return 'blog-index';
  if (url.startsWith('/blog/')) return 'blog-post';
  if (url === '/about') return 'about';
  if (url === '/schedule' || url === '/contact') return 'contact';
  return 'other';
}

// -----------------------------------------------------------------------
// Misc
// -----------------------------------------------------------------------

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
