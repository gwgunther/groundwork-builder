/**
 * SEO Optimizer — applies fixes based on the SEO audit's findings.
 *
 * Tier 1 (deterministic auto-fixes):
 *   - Missing/short meta description: derive from page H1 + first paragraph.
 *
 * Tier 2 (AI rewrites, more expensive but higher-leverage):
 *   - Thin service-detail pages: expand body via ai-content-expand.
 *   - Thin blog posts: expand body via ai-content-expand.
 *
 * Returns { applied: Array<{ url, fix, status, detail? }> }.
 *
 * The optimizer does NOT rebuild the site or re-run the audit — those are
 * orchestrated by build-site.js so the optimizer can be re-used in tests
 * and one-off runs.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expandContent } from './ai-content-expand.js';

/**
 * @param {object} args
 * @param {string} args.outputDir   - root of the generated Astro project
 * @param {object} args.seoReport   - output from auditSeo (Phase 4.6)
 * @param {object} args.merged      - merged practice data
 * @param {object} [opts]
 * @param {boolean} [opts.aiRewrites] - default true; pass false to do only auto-fixes
 * @param {number} [opts.maxBlogExpansions] - default 4; cap on AI calls per run
 * @param {number} [opts.maxServiceExpansions] - default 4
 * @returns {Promise<{ applied: Array }>}
 */
export async function optimizeSeo({ outputDir, seoReport, merged }, opts = {}) {
  const aiRewrites = opts.aiRewrites !== false && !!process.env.ANTHROPIC_API_KEY;
  const maxBlog = opts.maxBlogExpansions ?? 4;
  const maxService = opts.maxServiceExpansions ?? 4;
  const applied = [];

  if (!seoReport?.pages?.length) {
    return { applied };
  }

  // Group issues by url + dimension for fast lookup
  const issuesByPage = new Map();
  for (const page of seoReport.pages) {
    issuesByPage.set(page.url, page);
  }

  // ------------------------------------------------------------------
  // Tier 1: deterministic auto-fixes
  // ------------------------------------------------------------------

  for (const page of seoReport.pages) {
    const metaCheck = page.checks?.meta_description;
    if (metaCheck?.score && metaCheck.score < 6) {
      const fix = await fixMetaDescription({ outputDir, page, merged });
      applied.push({ url: page.url, fix: 'meta-description', ...fix });
    }
  }

  // ------------------------------------------------------------------
  // Tier 2: AI rewrites for thin content
  // ------------------------------------------------------------------

  if (aiRewrites) {
    const thinBlog = seoReport.pages
      .filter(p => p.pageType === 'blog-post' && p.checks?.content_depth?.score && p.checks.content_depth.score < 6)
      .sort((a, b) => a.checks.content_depth.score - b.checks.content_depth.score)
      .slice(0, maxBlog);

    const thinService = seoReport.pages
      .filter(p => p.pageType === 'service-detail' && p.checks?.content_depth?.score && p.checks.content_depth.score < 6)
      .sort((a, b) => a.checks.content_depth.score - b.checks.content_depth.score)
      .slice(0, maxService);

    // Run blog expansions in parallel — one Claude call per post
    if (thinBlog.length > 0) {
      const results = await Promise.allSettled(
        thinBlog.map(p => expandBlogPost({ outputDir, page: p, merged }))
      );
      for (let i = 0; i < thinBlog.length; i++) {
        const r = results[i];
        applied.push({
          url: thinBlog[i].url,
          fix: 'blog-expand',
          ...(r.status === 'fulfilled' ? r.value : { status: 'error', detail: r.reason?.message }),
        });
      }
    }

    if (thinService.length > 0) {
      const results = await Promise.allSettled(
        thinService.map(p => expandServicePage({ outputDir, page: p, merged }))
      );
      for (let i = 0; i < thinService.length; i++) {
        const r = results[i];
        applied.push({
          url: thinService[i].url,
          fix: 'service-expand',
          ...(r.status === 'fulfilled' ? r.value : { status: 'error', detail: r.reason?.message }),
        });
      }
    }
  }

  return { applied };
}

// ---------------------------------------------------------------------------
// Tier 1: meta description auto-fix
// ---------------------------------------------------------------------------

/**
 * Read the page's source file, extract H1 + first paragraph, compose a
 * 130-160-char meta description, and patch the BaseLayout `description=`
 * prop in the source file.
 */
async function fixMetaDescription({ outputDir, page, merged }) {
  const sourceFile = mapUrlToSourceFile(page.url);
  if (!sourceFile) return { status: 'skipped', detail: `No source file mapping for ${page.url}` };

  const absPath = resolve(outputDir, sourceFile);
  let src;
  try {
    src = await readFile(absPath, 'utf8');
  } catch {
    return { status: 'skipped', detail: `Could not read ${sourceFile}` };
  }

  // Extract the page H1 from the source — supports both Astro template
  // syntax (`<h1>{...}</h1>`) and plain text H1s.
  const h1Match = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1Match ? stripTags(h1Match[1]).trim() : '';

  // Extract first <p> as the seed for the description body.
  const pMatch = src.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const firstP = pMatch ? stripTags(pMatch[1]).trim() : '';

  const practiceName = merged?.practice?.name || '';
  const city = merged?.address?.city || '';

  // Compose: ideal target 120-160 chars. Compose deterministically from H1+intro.
  let composed = composeMetaDescription({ h1: h1Text, intro: firstP, practice: practiceName, city });
  if (!composed) return { status: 'skipped', detail: 'Could not compose a meaningful description' };

  // Patch the description= prop in BaseLayout invocation. Multiple template
  // forms exist (single-quote, double-quote, template literal). Match all.
  const before = src;
  const newDescAttr = `description="${escAttr(composed)}"`;
  // Replace the first description="..." or description={`...`} prop after <BaseLayout
  let patched = src.replace(
    /(<BaseLayout[\s\S]*?\sdescription=)(["'])([\s\S]*?)\2/,
    `$1"${escAttr(composed)}"`
  );
  if (patched === before) {
    // Try template literal form
    patched = src.replace(
      /(<BaseLayout[\s\S]*?\sdescription=)\{`([\s\S]*?)`\}/,
      `$1"${escAttr(composed)}"`
    );
  }

  if (patched === before) {
    return { status: 'skipped', detail: 'Could not find description prop to patch' };
  }

  await writeFile(absPath, patched, 'utf8');
  return { status: 'fixed', detail: `Wrote ${composed.length}-char description to ${sourceFile}` };
}

function composeMetaDescription({ h1, intro, practice, city }) {
  // Prefer using the page's actual content (intro paragraph, trimmed)
  // over composing from the H1. Falls through to a safe template-free
  // composition if no intro is available.
  if (intro && intro.length >= 80) {
    let d = intro.replace(/\s+/g, ' ').trim();
    if (d.length > 158) d = d.slice(0, 155).replace(/\s+\S*$/, '') + '…';
    return d;
  }
  if (h1) {
    const tail = practice ? ` at ${practice}` : '';
    const loc  = city ? ` in ${city}` : '';
    const candidate = `${h1}${tail}${loc}.`;
    if (candidate.length >= 80 && candidate.length <= 160) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tier 2: blog post / service page expansion
// ---------------------------------------------------------------------------

async function expandBlogPost({ outputDir, page, merged }) {
  const slug = page.url.replace(/^\/blog\/?/, '').replace(/\/$/, '');
  if (!slug) return { status: 'skipped', detail: 'No slug from URL' };

  const mdPath = resolve(outputDir, 'src/content/blog', `${slug}.md`);
  let raw;
  try {
    raw = await readFile(mdPath, 'utf8');
  } catch {
    return { status: 'skipped', detail: `Could not read ${mdPath}` };
  }

  // Split frontmatter from body
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { status: 'skipped', detail: 'No frontmatter in markdown' };

  const frontmatter = fmMatch[1];
  const existingBody = fmMatch[2].trim();
  const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/^["']|["']$/g, '').trim() : slug;

  const result = await expandContent({
    kind: 'blog-post',
    url: page.url,
    existingBody,
    title,
    practice: {
      name: merged?.practice?.name || '',
      doctor: merged?.doctor?.name || '',
      city: merged?.address?.city || '',
    },
    targetWords: 1500,
  });

  if (!result.ok) return { status: 'error', detail: result.error };

  const newRaw = `---\n${frontmatter}\n---\n\n${result.body}\n`;
  await writeFile(mdPath, newRaw, 'utf8');
  const newWords = wordCount(result.body);
  return { status: 'fixed', detail: `Expanded blog post body to ~${newWords} words` };
}

async function expandServicePage({ outputDir, page, merged }) {
  const slug = page.url.replace(/^\/services\/?/, '').replace(/\/$/, '');
  if (!slug) return { status: 'skipped', detail: 'No slug from URL' };

  const astroPath = resolve(outputDir, 'src/pages/services', `${slug}.astro`);
  let src;
  try {
    src = await readFile(astroPath, 'utf8');
  } catch {
    return { status: 'skipped', detail: `Could not read ${astroPath}` };
  }

  // Find the prose container — page-generator wraps body in <div class="prose ...">
  const proseMatch = src.match(/(<div class="prose[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<div class="mt-10)/);
  if (!proseMatch) return { status: 'skipped', detail: 'Could not find prose body block' };

  const existingBody = stripTags(proseMatch[2]).replace(/\s+/g, ' ').trim();
  if (!existingBody) return { status: 'skipped', detail: 'Empty prose body' };

  // Find the H1 for context
  const h1Match = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1Match ? stripTags(h1Match[1]).trim() : slug.replace(/-/g, ' ');

  const result = await expandContent({
    kind: 'service-detail',
    url: page.url,
    existingBody,
    title,
    practice: {
      name: merged?.practice?.name || '',
      doctor: merged?.doctor?.name || '',
      city: merged?.address?.city || '',
    },
    service: { name: title, slug },
    targetWords: 700,
  });

  if (!result.ok) return { status: 'error', detail: result.error };

  // Convert markdown body to inline HTML for the .astro file (paragraphs + h2 + lists)
  const bodyHtml = markdownToHtml(result.body);
  const newSrc = src.replace(
    /(<div class="prose[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<div class="mt-10)/,
    `$1\n${bodyHtml}\n    $3`
  );
  await writeFile(astroPath, newSrc, 'utf8');
  const newWords = wordCount(result.body);
  return { status: 'fixed', detail: `Expanded service page body to ~${newWords} words` };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapUrlToSourceFile(url) {
  if (url === '/') return 'src/pages/index.astro';
  if (url === '/about') return 'src/pages/about.astro';
  if (url === '/services') return 'src/pages/services.astro';
  if (url === '/blog') return 'src/pages/blog/index.astro';
  if (url === '/schedule') return 'src/pages/schedule.astro';
  if (url === '/financing') return 'src/pages/financing.astro';
  if (url === '/gallery') return 'src/pages/gallery.astro';
  if (url === '/faq') return 'src/pages/faq.astro';
  if (url.startsWith('/services/')) return `src/pages${url}.astro`;
  // Blog posts have a different shape — frontmatter description in .md, not .astro
  if (url.startsWith('/blog/')) return null;
  return null;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function wordCount(s) {
  return String(s || '').split(/\s+/).filter(Boolean).length;
}

/**
 * Minimal markdown → HTML converter for service-page bodies.
 * Handles: H2/H3 headings, paragraphs, unordered lists.
 */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  let para = [];

  function flushPara() {
    if (para.length) {
      out.push(`      <p class="mb-4">${escapeHtmlText(para.join(' ').trim())}</p>`);
      para = [];
    }
  }
  function flushList() {
    if (inList) {
      out.push('      </ul>');
      inList = false;
    }
  }

  for (const raw of lines) {
    const line = raw;
    if (/^#{2}\s+/.test(line)) {
      flushPara(); flushList();
      out.push(`      <h2 class="font-serif text-2xl font-semibold text-neutral-dark mt-8 mb-4">${escapeHtmlText(line.replace(/^#{2}\s+/, ''))}</h2>`);
    } else if (/^#{3}\s+/.test(line)) {
      flushPara(); flushList();
      out.push(`      <h3 class="font-serif text-xl font-semibold text-neutral-dark mt-6 mb-3">${escapeHtmlText(line.replace(/^#{3}\s+/, ''))}</h3>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push('      <ul class="list-disc pl-6 my-4 space-y-2">'); inList = true; }
      out.push(`        <li>${escapeHtmlText(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
    } else if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return out.join('\n');
}

function escapeHtmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
