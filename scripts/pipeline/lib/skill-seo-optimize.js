/**
 * SEO Optimizer — applies fixes based on the SEO audit's findings.
 *
 * Each fixer is a registry entry that owns one catalog target. The main loop
 * walks the registry and runs each fixer whose target is in the worklist
 * (or all fixers, if no worklist is provided). Adding a new fix is a one-
 * entry registry change; the dispatch loop doesn't need to grow.
 *
 * Current fixers:
 *   - meta-descriptions  (tier 1, deterministic) — fixMetaDescription
 *   - canonical-tags     (tier 1, deterministic) — fixCanonicalSite (site URL)
 *   - content-expand     (tier 2, AI)            — expandThinContent
 *
 * Tier 2 fixers additionally require ANTHROPIC_API_KEY (opts.aiRewrites).
 *
 * Returns { applied, gated: { ran, skipped } }.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expandContent } from './ai-content-expand.js';
import { isTargetInWorklist } from './fix-worklist.js';

// ---------------------------------------------------------------------------
// Fixer registry — one entry per catalog target the optimizer knows how to fix
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Fixer
 * @property {string} target       - catalog target id (e.g. 'meta-descriptions')
 * @property {1 | 2} tier          - 1 = deterministic, 2 = needs ANTHROPIC_API_KEY
 * @property {string} description  - human-readable summary (for logs/docs)
 * @property {(ctx: FixerCtx) => Promise<object[]>} run - returns applied[] entries
 *
 * @typedef {object} FixerCtx
 * @property {string} outputDir
 * @property {object} seoReport
 * @property {object} merged
 * @property {object} opts
 */

/** @type {Fixer[]} */
const FIXERS = [
  {
    target: 'meta-descriptions',
    tier: 1,
    description: 'Auto-fix missing/short meta descriptions from page H1 + intro',
    async run({ outputDir, seoReport, merged }) {
      const applied = [];
      for (const page of seoReport.pages) {
        const metaCheck = page.checks?.meta_description;
        if (metaCheck?.score && metaCheck.score < 6) {
          const fix = await fixMetaDescription({ outputDir, page, merged });
          applied.push({ url: page.url, fix: 'meta-description', ...fix });
        }
      }
      return applied;
    },
  },
  {
    target: 'canonical-tags',
    tier: 1,
    description: "Set astro.config.mjs `site` to the practice domain so BaseLayout's auto-canonical resolves correctly",
    async run({ outputDir, merged }) {
      const result = await fixCanonicalSite({ outputDir, merged });
      // One file change resolves the finding for every affected page; report as
      // a single applied entry with a config-sentinel URL.
      return [{ url: '(astro.config.mjs)', fix: 'canonical-site', ...result }];
    },
  },
  {
    target: 'content-expand',
    tier: 2,
    description: 'AI-expand thin blog posts and service-detail pages',
    async run({ outputDir, seoReport, merged, opts }) {
      const applied = [];
      const maxBlog    = opts.maxBlogExpansions ?? 4;
      const maxService = opts.maxServiceExpansions ?? 4;

      const thinBlog = seoReport.pages
        .filter(p => p.pageType === 'blog-post' && p.checks?.content_depth?.score && p.checks.content_depth.score < 6)
        .sort((a, b) => a.checks.content_depth.score - b.checks.content_depth.score)
        .slice(0, maxBlog);

      const thinService = seoReport.pages
        .filter(p => p.pageType === 'service-detail' && p.checks?.content_depth?.score && p.checks.content_depth.score < 6)
        .sort((a, b) => a.checks.content_depth.score - b.checks.content_depth.score)
        .slice(0, maxService);

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

      return applied;
    },
  },
];

/**
 * @param {object} args
 * @param {string} args.outputDir   - root of the generated Astro project
 * @param {object} args.seoReport   - output from auditSeo (Phase 4.6)
 * @param {object} args.merged      - merged practice data
 * @param {object[]} [args.fixWorklist] - optional grader-emitted worklist. When
 *   present, a fixer only runs if its catalog target is in the worklist. When
 *   absent, all fixers run (legacy behavior).
 * @param {object} [opts]
 * @param {boolean} [opts.aiRewrites] - default true; false → skip tier-2 fixers
 * @param {number} [opts.maxBlogExpansions] - default 4; cap on AI calls per run
 * @param {number} [opts.maxServiceExpansions] - default 4
 * @returns {Promise<{ applied: Array, gated: { ran: string[], skipped: string[] } }>}
 */
export async function optimizeSeo({ outputDir, seoReport, merged, fixWorklist = null }, opts = {}) {
  const aiRewrites = opts.aiRewrites !== false && !!process.env.ANTHROPIC_API_KEY;
  const applied = [];
  const ran = [];
  const skipped = [];

  if (!seoReport?.pages?.length) {
    return { applied, gated: { ran, skipped } };
  }

  for (const fixer of FIXERS) {
    // Tier 2 fixers require AI; skip silently if disabled or no key.
    if (fixer.tier === 2 && !aiRewrites) {
      skipped.push(fixer.target);
      continue;
    }
    // Worklist gate: skip if target isn't listed (null worklist = always run)
    if (!isTargetInWorklist(fixWorklist, fixer.target)) {
      skipped.push(fixer.target);
      continue;
    }
    ran.push(fixer.target);
    const fixerApplied = await fixer.run({ outputDir, seoReport, merged, opts });
    applied.push(...fixerApplied);
  }

  if (fixWorklist) {
    console.log(`  [seo-optimize] worklist gates → ran:[${ran.join(', ') || 'none'}] · skipped:[${skipped.join(', ') || 'none'}]`);
  }

  return { applied, gated: { ran, skipped } };
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
// Tier 1: canonical site URL fix
// ---------------------------------------------------------------------------

/**
 * Patch astro.config.mjs so BaseLayout's auto-canonical resolves to the real
 * practice domain instead of the template's `https://example.com` default.
 *
 * BaseLayout already emits `<link rel="canonical">` on every page (via
 * `new URL(Astro.url.pathname, Astro.site).href`), so once `site` is correct,
 * every page's canonical is correct in the next rebuild. No per-page edits.
 */
async function fixCanonicalSite({ outputDir, merged }) {
  const configPath = resolve(outputDir, 'astro.config.mjs');
  let src;
  try {
    src = await readFile(configPath, 'utf8');
  } catch {
    return { status: 'skipped', detail: 'astro.config.mjs not found in build output' };
  }

  const domain = merged?.practice?.domain
    || merged?.practice?.url
    || merged?.url;
  if (!domain) {
    return { status: 'skipped', detail: 'No practice domain available in merged data' };
  }

  const target = normalizeSiteUrl(domain);
  if (!isValidSiteUrl(target)) {
    // Silver sometimes returns placeholder strings like '[Unknown]', 'undefined',
    // or whitespace. Writing those into the config silently corrupts every
    // page's canonical URL — strictly worse than the example.com default. Bail.
    return { status: 'skipped', detail: `Domain "${domain}" does not look valid (resolved to ${target || '<empty>'})` };
  }

  // Match `site: 'whatever'` or `site: "whatever"`, single capture group on the value.
  const siteRe = /(\bsite\s*:\s*)(['"])([^'"]*)\2/;
  const match = src.match(siteRe);
  if (!match) {
    return { status: 'skipped', detail: 'Could not locate `site:` key in astro.config.mjs' };
  }
  const current = match[3];
  if (current === target) {
    return { status: 'noop', detail: `Already set to ${target}` };
  }

  const patched = src.replace(siteRe, `$1'${target}'`);
  await writeFile(configPath, patched, 'utf8');
  return { status: 'fixed', detail: `Set site = ${target} (was ${current})` };
}

function normalizeSiteUrl(raw) {
  let s = String(raw).trim();
  if (!s) return s;
  // Strip trailing slash(es) and any path/query — we want only the origin.
  s = s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s;
  }
}

/**
 * Reject sentinel/junk values that would corrupt the config if written.
 * Silver sometimes emits literal '[Unknown]', 'undefined', whitespace, etc.
 * A valid site URL needs a real hostname (a label + a TLD, no spaces/brackets).
 */
function isValidSiteUrl(s) {
  if (!s || typeof s !== 'string') return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  // Hostname must look domain-ish: letters/digits/hyphens/dots only, at least
  // one dot, TLD of 2+ alpha chars. Rejects 'undefined', 'null', '[Unknown]',
  // empty, single-label, etc.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(u.hostname);
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
