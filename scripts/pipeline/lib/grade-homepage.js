/**
 * grade-homepage.js — lightweight self-serve "Grade My Site" engine.
 *
 * Homepage fetch + HTML checks (+ optional PageSpeed). No Playwright.
 * Used by: scripts/pipeline/grade-site.js CLI and workers/grade-my-site.
 *
 * Output shape:
 *   {
 *     url, fetchedAt, growthScore, summary, findings[],
 *     pagespeed: { mobile } | null,
 *     meta: { title, hasSchema, h1Count, ... }
 *   }
 */
import { enrichFindings, computeGrowthScore } from './findings.js';

const FETCH_TIMEOUT_MS = 20_000;

function absUrl(base, href) {
  try { return new URL(href, base).href; } catch { return null; }
}

function countRe(html, re) {
  const m = html.match(re);
  return m ? m.length : 0;
}

function extractMeta(html, url) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]
    || '';
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    || '';
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  const hasSchema = /application\/ld\+json/i.test(html) || /itemtype=["']https?:\/\/schema\.org/i.test(html);
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t) || /\balt\s*=\s*["']\s*["']/i.test(t)).length;
  const hasFaq = /\bfaq\b|frequently asked/i.test(html) || /FAQPage/i.test(html);
  const hasTestimonials = /testimonial|patient review|google.?review|\"reviewRating\"/i.test(html);
  const wordish = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const words = wordish.trim().split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    metaDescription: metaDesc.trim(),
    canonical: canonical ? absUrl(url, canonical) : '',
    viewport,
    h1Count: h1s.length,
    h1Text: h1s[0] || '',
    hasSchema,
    imageCount: imgTags.length,
    missingAlt,
    hasFaq,
    hasTestimonials,
    wordCount: words,
  };
}

function homepageFindings(meta, pagespeedMobile) {
  const findings = [];

  findings.push({
    id: 'missing-title',
    category: 'seo',
    severity: meta.title ? 'passed' : 'critical',
    title: 'Homepage title tag',
    detail: meta.title ? `Title: “${meta.title.slice(0, 80)}”` : 'Homepage is missing a <title> tag.',
    benefit: 'Title tags are the primary SERP headline and AI citation hook.',
    count: meta.title ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'missing-meta',
    category: 'seo',
    severity: meta.metaDescription ? 'passed' : 'critical',
    title: 'Homepage meta description',
    detail: meta.metaDescription
      ? `Meta description present (${meta.metaDescription.length} chars).`
      : 'Homepage is missing a meta description.',
    benefit: 'Meta descriptions drive click-through from search and AI overviews.',
    count: meta.metaDescription ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'missing-h1',
    category: 'seo',
    severity: meta.h1Count >= 1 ? 'passed' : 'critical',
    title: 'Homepage H1',
    detail: meta.h1Count >= 1 ? `H1: “${meta.h1Text.slice(0, 80)}”` : 'Homepage is missing an H1 heading.',
    benefit: 'A clear H1 anchors topical relevance for patients and crawlers.',
    count: meta.h1Count >= 1 ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'multiple-h1',
    category: 'seo',
    severity: meta.h1Count <= 1 ? 'passed' : 'warning',
    title: 'Single H1 on homepage',
    detail: meta.h1Count <= 1 ? 'Homepage has a single H1.' : `Homepage has ${meta.h1Count} H1 headings.`,
    benefit: 'One H1 keeps the page topic unambiguous.',
    count: meta.h1Count > 1 ? meta.h1Count : 0,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'missing-schema',
    category: 'seo',
    severity: meta.hasSchema ? 'passed' : 'warning',
    title: 'Structured data (JSON-LD)',
    detail: meta.hasSchema ? 'Structured data detected on the homepage.' : 'No JSON-LD / schema.org markup found on the homepage.',
    benefit: 'LocalBusiness schema helps Google and AI assistants understand the practice.',
    count: meta.hasSchema ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'missing-canonical',
    category: 'seo',
    severity: meta.canonical ? 'passed' : 'warning',
    title: 'Canonical URL',
    detail: meta.canonical ? `Canonical: ${meta.canonical}` : 'Homepage is missing a canonical link.',
    benefit: 'Canonicals prevent duplicate-URL dilution in local search.',
    count: meta.canonical ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'no-viewport',
    category: 'mobile',
    severity: meta.viewport ? 'passed' : 'critical',
    title: 'Mobile viewport meta',
    detail: meta.viewport ? 'Viewport meta tag present.' : 'Homepage is missing a viewport meta tag.',
    benefit: 'Without a viewport tag, the site renders poorly on phones — where most patients search.',
    count: meta.viewport ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'missing-alt',
    category: 'accessibility',
    severity: meta.missingAlt === 0 ? 'passed' : (meta.missingAlt >= 3 ? 'critical' : 'warning'),
    title: 'Image alt text (homepage)',
    detail: meta.missingAlt === 0
      ? `All ${meta.imageCount} homepage images have alt text.`
      : `${meta.missingAlt} of ${meta.imageCount} homepage images are missing alt text.`,
    benefit: 'Alt text is required for accessibility and helps image search / AI understanding.',
    count: meta.missingAlt,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'no-faq',
    category: 'content',
    severity: meta.hasFaq ? 'passed' : 'warning',
    title: 'FAQ content',
    detail: meta.hasFaq ? 'FAQ content detected.' : 'No FAQ content detected on the homepage.',
    benefit: 'FAQs capture long-tail queries and feed AI answer engines.',
    count: meta.hasFaq ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'no-testimonials',
    category: 'content',
    severity: meta.hasTestimonials ? 'passed' : 'warning',
    title: 'Testimonials / reviews on site',
    detail: meta.hasTestimonials ? 'Testimonials or review markup detected.' : 'No testimonials / review content detected on the homepage.',
    benefit: 'On-site social proof converts cold search traffic into booked visits.',
    count: meta.hasTestimonials ? 0 : 1,
    affectedPages: ['/'],
  });

  findings.push({
    id: 'thin-content',
    category: 'content',
    severity: meta.wordCount >= 200 ? 'passed' : 'warning',
    title: 'Homepage content depth',
    detail: meta.wordCount >= 200
      ? `Homepage has ~${meta.wordCount} words.`
      : `Homepage looks thin (~${meta.wordCount} words).`,
    benefit: 'Thin homepages under-serve both SEO and patient trust.',
    count: meta.wordCount >= 200 ? 0 : 1,
    affectedPages: ['/'],
  });

  if (pagespeedMobile && typeof pagespeedMobile.performance === 'number') {
    const score = pagespeedMobile.performance;
    findings.push({
      id: 'low-performance',
      category: 'performance',
      severity: score >= 70 ? 'passed' : (score >= 50 ? 'warning' : 'critical'),
      title: 'Mobile PageSpeed',
      detail: `Mobile performance score is ${score}/100.`,
      benefit: 'Slow mobile sites lose local patients before the phone rings.',
      count: score >= 70 ? 0 : 1,
      affectedPages: ['/'],
      thresholds: { score },
    });

    const lcp = pagespeedMobile.metrics?.lcp;
    if (typeof lcp === 'number') {
      findings.push({
        id: 'low-lcp',
        category: 'performance',
        severity: lcp <= 2500 ? 'passed' : (lcp <= 4000 ? 'warning' : 'critical'),
        title: 'Largest Contentful Paint',
        detail: `LCP is ${(lcp / 1000).toFixed(1)}s.`,
        benefit: 'LCP is a Core Web Vital Google uses in ranking.',
        count: lcp <= 2500 ? 0 : 1,
        affectedPages: ['/'],
        thresholds: { lcp },
      });
    }

    const cls = pagespeedMobile.metrics?.cls;
    if (typeof cls === 'number') {
      findings.push({
        id: 'high-cls',
        category: 'performance',
        severity: cls <= 0.1 ? 'passed' : (cls <= 0.25 ? 'warning' : 'critical'),
        title: 'Cumulative Layout Shift',
        detail: `CLS is ${cls.toFixed(3)}.`,
        benefit: 'Layout shift frustrates patients and hurts Core Web Vitals.',
        count: cls <= 0.1 ? 0 : 1,
        affectedPages: ['/'],
        thresholds: { cls },
      });
    }
  }

  return findings;
}

export async function fetchHomepage(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'GroundworkGradeBot/1.0 (+https://groundworkdental.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const html = await res.text();
    const finalUrl = res.url || url;
    return { html, finalUrl, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} url
 * @param {{ pagespeed?: boolean, pagespeedResult?: object|null }} [opts]
 */
export async function gradeHomepage(url, opts = {}) {
  const started = Date.now();
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const { html, finalUrl } = await fetchHomepage(normalized);
  const meta = extractMeta(html, finalUrl);

  let pagespeed = null;
  if (opts.pagespeedResult) {
    pagespeed = opts.pagespeedResult;
  } else if (opts.pagespeed !== false) {
    try {
      const { runPageSpeed } = await import('./pagespeed.js');
      pagespeed = await runPageSpeed(finalUrl);
    } catch (err) {
      console.warn(`[grade] PageSpeed skipped: ${err.message}`);
    }
  }

  const raw = homepageFindings(meta, pagespeed?.mobile || null);
  const findings = enrichFindings(raw);
  const { score, summary, maxWeight, earnedWeight } = computeGrowthScore(findings);

  return {
    url: finalUrl,
    inputUrl: normalized,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    growthScore: score,
    maxWeight,
    earnedWeight,
    summary,
    findings,
    meta,
    pagespeed: pagespeed
      ? {
          mobile: pagespeed.mobile
            ? {
                performance: pagespeed.mobile.performance,
                seo: pagespeed.mobile.seo,
                accessibility: pagespeed.mobile.accessibility,
                metrics: pagespeed.mobile.metrics,
              }
            : null,
        }
      : null,
    grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F',
  };
}

export default { gradeHomepage, fetchHomepage, extractMeta };
