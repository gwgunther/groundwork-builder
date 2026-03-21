/**
 * Blog generator — create markdown blog post stubs for detected services.
 *
 * Pulls from authority article rules (preset) and generates
 * draft .md files in src/content/blog/ with frontmatter, target keywords,
 * and a structural outline for each article.
 */

import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Generate blog post stubs based on the practice's detected services.
 *
 * @param {object} data      - Merged practice data (schema shape from schema.js)
 * @param {string} outputDir - Root of the generated Astro project
 * @param {object} [preset]  - Loaded vertical preset (from preset-loader).
 * @returns {number} Number of blog stubs created
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

  // Collect articles for detected individual services
  const articles = [];
  for (const service of data.services.offered) {
    const rules = articleRules[service.slug];
    if (rules) articles.push(...rules);
  }

  // Also collect articles matched by hub slugs (may overlap — deduped below)
  const hubs = (data.services.hubs || []).map(h => typeof h === 'string' ? h : h.slug);
  for (const hubSlug of hubs) {
    const rules = articleRules[hubSlug];
    if (rules && !articles.some((a) => rules.some((r) => r.slug === a.slug))) {
      articles.push(...rules);
    }
  }

  // Deduplicate by slug and cap at 8 stubs
  const unique = [...new Map(articles.map((a) => [a.slug, a])).values()].slice(0, 8);

  if (unique.length === 0) {
    console.log('  No matching article rules — skipping blog stub generation.');
    return 0;
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

    // Build description, enforce 160-char Zod max
    let description = `Learn about ${keyword} at ${practiceName} in ${city}. Expert guidance from ${doctorName}.`;
    if (description.length > 160) {
      description = `Learn about ${keyword} at ${practiceName}. Expert guidance from ${doctorName}.`;
    }
    if (description.length > 160) {
      description = `${keyword} — expert guidance from ${practiceName}.`;
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
draft: true
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

  console.log(`  Generated ${unique.length} blog stub(s).`);
  return unique.length;
}

