/**
 * Blog generator — creates blog post files from either:
 *   1. Real scraped content from bronze (preferred — genuine practice voice)
 *   2. Keyword-targeted stubs from preset article rules (fallback)
 *
 * Rule: if bronze has a /blog/[slug] page with ≥200 chars of body content,
 *       use it. Only fall back to stubs for services with no real content.
 */

import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rewriteBlogPost } from './ai-blog-rewrite.js';

/**
 * Generate blog posts — from real bronze content or keyword stubs.
 *
 * @param {object} data      - Merged practice data (schema shape from schema.js)
 * @param {string} outputDir - Root of the generated Astro project
 * @param {object} [preset]  - Loaded vertical preset (from preset-loader).
 * @returns {number} Number of blog posts created
 */
export async function generateBlogStubs(data, outputDir, preset = null) {
  const blogDir = resolve(outputDir, 'src/content/blog');
  const articleRules = preset?.articleRules?.rules || {};
  const deriveCategoryFn = preset?.articleRules?.deriveCategory || (() => 'general-dentistry');

  // Remove sample post shipped with the starter template
  try {
    await unlink(resolve(blogDir, 'sample-post.md'));
    console.log('  Removed sample-post.md.');
  } catch {
    // Already gone or never existed
  }

  // ------------------------------------------------------------------
  // Phase A: Use real scraped blog posts from bronze if available
  // ------------------------------------------------------------------
  const bronzePages = data?.bronze?.pages || [];
  const candidatePosts = bronzePages
    .filter(p => {
      const path = p.path || p.url || '';
      return /^\/blog\//i.test(path) || /^\/articles?\//i.test(path) || /^\/news\//i.test(path);
    })
    .filter(p => {
      const body = p.bodyText || p.body || (p.paragraphs || []).join('\n') || '';
      return body.trim().length >= 200;
    });

  // Fallback: silver's additionalContent[] may have rescued blog posts that
  // got filtered out of bronze.pages (or were never in bronze if pipeline ran
  // with --skip-scrape). Add any `type: "blog-post"` items as bronze-shaped
  // pseudo-pages so the same dedup + rewrite path can consume them.
  // X2: top-level additionalContent; legacy nested location supported
  const additionalBlogPosts = (data?.additionalContent || data?.content?.additionalContent || [])
    .filter(item => {
      const type = String(item.type || '').toLowerCase();
      return /^blog|^post|article/.test(type);
    })
    .filter(item => (item.content || '').trim().length >= 200)
    .map(item => ({
      path:     item.source || `/blog/${(item.title || 'post').toLowerCase().replace(/\s+/g, '-')}`,
      url:      item.source || null,
      h1:       item.title || null,
      title:    item.title || null,
      bodyText: item.content,
      _fromAdditionalContent: true,
    }));

  // Merge — bronze takes precedence; only add additionalContent posts whose path
  // isn't already covered by a bronze candidate.
  const bronzePaths = new Set(candidatePosts.map(p => (p.path || '').toLowerCase()));
  for (const extra of additionalBlogPosts) {
    if (!bronzePaths.has((extra.path || '').toLowerCase())) {
      candidatePosts.push(extra);
    }
  }

  // Dedupe by normalized title — many sites have multiple URLs for the same
  // article (e.g., a slug variant per location keyword). Keep the version with
  // the longest body, since duplicates are usually thin/auto-generated copies.
  const normalizeTitle = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const bodyLen = (p) => (p.bodyText || p.body || '').length;
  const byTitle = new Map();
  for (const p of candidatePosts) {
    const key = normalizeTitle(p.h1 || p.title || p.path || p.url);
    if (!key) continue;
    const existing = byTitle.get(key);
    if (!existing || bodyLen(p) > bodyLen(existing)) byTitle.set(key, p);
  }
  const realPosts = [...byTitle.values()].slice(0, 6); // cap at 6 real posts

  let realCount = 0;
  let draftCount = 0;
  if (realPosts.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const practiceName = data.practice.name || '';
    const practiceCtx = {
      name: practiceName,
      doctor: data.doctor?.name || '',
      city: data.address?.city || '',
    };

    // Run all rewrites in parallel — Claude per-post takes 10–40s, so serial
    // would dominate runtime for sites with several real posts.
    const rewrites = await Promise.allSettled(
      realPosts.map(page => rewriteBlogPost(page, practiceCtx))
    );

    for (let i = 0; i < realPosts.length; i++) {
      const page = realPosts[i];
      const result = rewrites[i];

      const path  = page.path || page.url || '';
      const slug  = path.replace(/^\/(?:blog|articles?|news)\//, '').replace(/\/$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'post';
      const title = page.h1 || page.title || slug.replace(/-/g, ' ');

      // Best-guess category from slug/title
      const categoryGuess = /implant/i.test(slug + title) ? 'implants'
        : /cosmetic|whiten|veneer|invisalign/i.test(slug + title) ? 'cosmetic'
        : /crown|bridge|filling|restor/i.test(slug + title) ? 'restorative'
        : /gum|perio|hygiene|clean/i.test(slug + title) ? 'oral-health'
        : 'general-dentistry';

      const aiOk = result.status === 'fulfilled' && result.value?.ok;
      let body, description, draft;

      if (aiOk) {
        body = result.value.markdown;
        description = (result.value.summary || '').slice(0, 157);
        draft = false;
        realCount++;
      } else {
        // AI rewrite failed — never ship raw bodyText (full of nav chrome).
        // Mark the post draft (hidden from index/sitemap) so it doesn't go live
        // looking broken. The raw scrape is preserved as a placeholder for
        // a human to revisit.
        const rawBody = (page.bodyText || page.body || '').slice(0, 2000).trimEnd();
        body = rawBody
          ? `> Draft — AI rewrite did not run for this post. The raw scraped text is preserved below for editing.\n\n${rawBody}`
          : '> Draft — original article body could not be extracted.';
        description = title;
        draft = true;
        draftCount++;
        const reason = result.status === 'rejected'
          ? result.reason?.message || String(result.reason)
          : result.value?.error || 'unknown';
        console.warn(`  [blog-rewrite] Marked ${slug} as draft — ${reason}`);
      }

      const mdContent = `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description || title)}
publishDate: ${today}
targetKeyword: ${JSON.stringify(slug.replace(/-/g, ' '))}
category: ${JSON.stringify(categoryGuess)}
author: ${JSON.stringify(practiceName)}
draft: ${draft}
---

${body}
`;
      await writeFile(resolve(blogDir, `${slug}.md`), mdContent, 'utf8');
    }

    if (realCount > 0) console.log(`  Used ${realCount} real blog post(s) from original site (AI-rewritten).`);
    if (draftCount > 0) console.log(`  Marked ${draftCount} post(s) as draft (AI rewrite failed; needs manual review).`);
  }

  // ------------------------------------------------------------------
  // Phase B: Generate keyword stubs for services not covered by real posts
  // ------------------------------------------------------------------
  // Source preference (most practice-specific → most generic):
  //   1. AI content map's blogTopics — practice-aware suggestions tailored
  //      to this doctor's services and city. Best when present.
  //   2. Preset articleRules — keyword-targeted SEO templates per service.
  //      Falls back here when the AI didn't run or didn't produce topics.
  const articles = [];
  const aiTopics = data?.content?.generated?.blogTopics
    || data?.content?.blogTopics
    || [];

  if (aiTopics.length > 0) {
    // Prefer AI-generated topics when available — these are practice-specific
    // and reference real services/locations from the brief.
    for (const t of aiTopics) {
      if (!t.title) continue;
      const slug = t.slug || t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
      articles.push({
        slug,
        title: t.title,
        excerpt: t.excerpt || '',
        keywords: [slug.replace(/-/g, ' ')],
        category: t.category || null,
        source: 'ai-blog-topic',
      });
    }
  } else {
    // Fall back to preset articleRules (keyword-stub templates).
    for (const service of data.services.offered) {
      const rules = articleRules[service.slug];
      if (rules) articles.push(...rules.map(r => ({ ...r, source: 'preset-rule' })));
    }
    const hubs = (data.services.hubs || []).map(h => typeof h === 'string' ? h : h.slug);
    for (const hubSlug of hubs) {
      const rules = articleRules[hubSlug];
      if (rules && !articles.some((a) => rules.some((r) => r.slug === a.slug))) {
        articles.push(...rules.map(r => ({ ...r, source: 'preset-rule' })));
      }
    }
  }

  // Deduplicate by slug; reduce stub cap if real posts already written
  const stubCap = Math.max(0, 8 - realCount);
  const unique = [...new Map(articles.map((a) => [a.slug, a])).values()].slice(0, stubCap);

  if (unique.length === 0) {
    if (realCount > 0) console.log('  No stub articles needed — real posts cover the blog.');
    else console.log('  No matching article rules — skipping blog stub generation.');
    return realCount;
  }

  const practiceName = data.practice.name || 'Our Practice';
  // Sanitize city — scraper may produce garbled text from footers
  let city = data.address?.city || '';
  if (city.length > 40 || /\d{3}/.test(city)) city = '';
  city = city || 'your area';
  const doctorName = data.doctor?.name
    || (data.doctor?.firstName
      ? `Dr. ${data.doctor.firstName} ${data.doctor.lastName}`
      : 'our team');
  const phone = data.practice?.phone || '[PHONE]';
  const today = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  for (const article of unique) {
    // Resolve {year} tokens in the title
    const title = article.title.replace(/\{year\}/g, String(year));
    const keyword = article.keywords?.[0] || article.slug.replace(/-/g, ' ');
    const category = article.category || deriveCategoryFn(article);

    // Description — prefer the AI's excerpt when present (already
    // practice-specific). Otherwise compose from keyword + practice name.
    let description = article.excerpt?.trim();
    if (!description) {
      description = `Learn about ${keyword} at ${practiceName} in ${city}. Expert guidance from ${doctorName}.`;
      if (description.length > 160) {
        description = `Learn about ${keyword} at ${practiceName}. Expert guidance from ${doctorName}.`;
      }
      if (description.length > 160) {
        description = `${keyword} — expert guidance from ${practiceName}.`;
      }
    }
    if (description.length > 160) {
      description = description.substring(0, 157) + '...';
    }

    const content = `---
title: "${title}"
description: "${description}"
publishDate: ${today}
targetKeyword: "${keyword}"
category: "${category}"
author: "${practiceName}"
draft: false
---

# ${title}

<!-- TODO: Write this article. Target keyword: "${keyword}" -->
<!-- Target length: 1200-1800 words -->

## Introduction

[Write an introduction addressing why patients search for this topic.]

## [Section 2]

[Core information about ${keyword}.]

## [Section 3]

[Practical advice or comparison.]

## What to Expect at ${practiceName}

[How our practice specifically handles this topic.]

## Next Steps

Ready to learn more? [Schedule a consultation](/schedule) or call us at ${phone}.
`;

    await writeFile(resolve(blogDir, `${article.slug}.md`), content);
  }

  console.log(`  Generated ${unique.length} blog stub(s) (${realCount} real + ${unique.length} stub = ${realCount + unique.length} total).`);
  return realCount + unique.length;
}

