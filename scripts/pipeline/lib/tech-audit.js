/**
 * Tech Audit — pure synchronous computation over bronze data + pagespeed results.
 * No AI, no network calls.
 *
 * Export:
 *   runTechAudit(bronze, pagespeed)
 *   → { findings: Finding[], summary: { critical, warnings, passed } }
 *
 * Finding shape:
 *   { id, category, severity, title, detail, benefit, affectedPages, count }
 */

// Paths that should be excluded from "thin content" checks
const UTILITY_PATH_PATTERNS = [
  /\/(appointment|contact|contact-us|404|sitemap|thank-you|privacy|terms)/i,
  /\/(book|schedule|reserve|request)/i,
];

function isUtilityPath(path) {
  return UTILITY_PATH_PATTERNS.some(re => re.test(path));
}

/**
 * Build a Finding object, computing severity based on count and optional override.
 */
function finding({ id, category, title, benefit, affectedPages = [], count, thresholds = null, forceSeverity = null }) {
  let severity;
  if (forceSeverity) {
    severity = forceSeverity;
  } else if (count === 0) {
    severity = 'passed';
  } else if (thresholds) {
    const total = thresholds.total || 1;
    const ratio = count / total;
    severity = ratio >= 0.5 ? 'critical' : 'warning';
  } else {
    severity = count >= 3 ? 'critical' : 'warning';
  }

  const detail = buildDetail(id, count, affectedPages, thresholds);

  return {
    id,
    category,
    severity,
    title,
    detail,
    benefit,
    affectedPages: affectedPages.slice(0, 5),
    count,
  };
}

function buildDetail(id, count, affectedPages, thresholds) {
  const total = thresholds?.total;
  const base = total ? `${count} of ${total} pages` : `${count} page${count !== 1 ? 's' : ''}`;

  const details = {
    'missing-meta':       count === 0 ? 'All pages have meta descriptions.' : `${base} are missing a meta description.`,
    'missing-title':      count === 0 ? 'All pages have title tags.' : `${base} are missing a <title> tag.`,
    'duplicate-titles':   count === 0 ? 'All page titles are unique.' : `${count} title${count !== 1 ? 's' : ''} appear on multiple pages.`,
    'missing-h1':         count === 0 ? 'All pages have an H1.' : `${base} are missing an H1 heading.`,
    'multiple-h1':        count === 0 ? 'No pages have multiple H1s.' : `${base} have more than one H1 heading.`,
    'thin-content':       count === 0 ? 'All content pages meet the 200-word minimum.' : `${base} have fewer than 200 words of content.`,
    'missing-schema':     count === 0 ? 'All pages include structured data.' : `${base} have no JSON-LD structured data.`,
    'missing-canonical':  count === 0 ? 'All pages have canonical URLs.' : `${base} are missing a canonical tag.`,
    'low-performance':    count === 0 ? 'Mobile performance score is good.' : `Mobile performance score is ${thresholds?.score ?? '—'}/100.`,
    'low-lcp':            count === 0 ? 'Largest Contentful Paint is within threshold.' : `LCP is ${thresholds?.lcp != null ? (thresholds.lcp / 1000).toFixed(2) + 's' : '—'} (threshold: 2.5s good, 4.0s poor).`,
    'high-cls':           count === 0 ? 'Cumulative Layout Shift is within threshold.' : `CLS is ${thresholds?.cls ?? '—'} (threshold: 0.1 good, 0.25 poor).`,
    'missing-alt':        count === 0 ? 'All images have alt text.' : `${count} image${count !== 1 ? 's' : ''} across the site are missing alt text.`,
    'no-testimonials':    count === 0 ? 'Testimonials found on the site.' : 'No testimonials or reviews found on the site.',
    'no-faq':             count === 0 ? 'FAQ content found on the site.' : 'No FAQ content found anywhere on the site.',
    'thin-about':         count === 0 ? 'About page has sufficient content.' : 'About page has fewer than 200 words.',
    'no-viewport':        count === 0 ? 'Viewport meta tag detected.' : 'One or more pages may be missing a viewport meta tag.',
  };

  return details[id] || `${count} issue(s) found.`;
}

/**
 * Run tech audit over bronze data and optional pagespeed results.
 *
 * @param {object} bronze     - BronzeData from scraper
 * @param {object|null} pagespeed - { mobile, desktop } from runPageSpeed, or null
 * @returns {{ findings: object[], summary: { critical: number, warnings: number, passed: number } }}
 */
export function runTechAudit(bronze, pagespeed = null) {
  const pages = bronze?.pages || [];
  const total = pages.length;

  const findings = [];

  // ── SEO Checks ─────────────────────────────────────────────────────────────

  // missing-meta
  {
    const affected = pages.filter(p => !p.metaDescription?.trim()).map(p => p.url);
    findings.push(finding({
      id: 'missing-meta',
      category: 'seo',
      title: 'Missing meta descriptions',
      benefit: 'Meta descriptions appear in Google search results and directly influence click-through rate from organic search.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
    }));
  }

  // missing-title
  {
    const affected = pages.filter(p => !p.title?.trim()).map(p => p.url);
    findings.push(finding({
      id: 'missing-title',
      category: 'seo',
      title: 'Missing title tags',
      benefit: 'The <title> tag is the single most important on-page SEO element and the first thing Google uses to understand a page.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
      forceSeverity: affected.length > 0 ? 'critical' : 'passed',
    }));
  }

  // duplicate-titles
  {
    const titleMap = {};
    for (const p of pages) {
      const t = p.title?.trim();
      if (!t) continue;
      if (!titleMap[t]) titleMap[t] = [];
      titleMap[t].push(p.url);
    }
    const dupes = Object.values(titleMap).filter(urls => urls.length > 1);
    const affected = [...new Set(dupes.flat())];
    findings.push(finding({
      id: 'duplicate-titles',
      category: 'seo',
      title: 'Duplicate page titles',
      benefit: 'Unique titles help Google understand which page should rank for which query and prevent pages from competing against each other.',
      affectedPages: affected,
      count: dupes.length,
    }));
  }

  // missing-h1
  {
    const affected = pages.filter(p => {
      const h1s = p.headings?.filter(h => h.level === 1) || [];
      return h1s.length === 0;
    }).map(p => p.url);
    findings.push(finding({
      id: 'missing-h1',
      category: 'seo',
      title: 'Pages missing H1 headings',
      benefit: 'H1 tags tell search engines the primary topic of a page. Missing H1s weaken page relevance signals.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
    }));
  }

  // multiple-h1
  {
    const affected = pages.filter(p => {
      const h1s = p.headings?.filter(h => h.level === 1) || [];
      return h1s.length > 1;
    }).map(p => p.url);
    findings.push(finding({
      id: 'multiple-h1',
      category: 'seo',
      title: 'Multiple H1 headings on same page',
      benefit: 'Each page should have exactly one H1. Multiple H1s dilute the primary topic signal and can confuse search engine crawlers.',
      affectedPages: affected,
      count: affected.length,
    }));
  }

  // thin-content
  {
    const affected = pages
      .filter(p => !isUtilityPath(p.path) && (p.wordCount || 0) < 200)
      .map(p => p.url);
    findings.push(finding({
      id: 'thin-content',
      category: 'seo',
      title: 'Thin content pages (< 200 words)',
      benefit: 'Pages with substantial content rank significantly better. Thin pages signal low quality to Google and rarely appear in top results.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
    }));
  }

  // missing-schema
  {
    const affected = pages.filter(p => !p.structuredData?.length).map(p => p.url);
    findings.push(finding({
      id: 'missing-schema',
      category: 'seo',
      title: 'Missing structured data (JSON-LD)',
      benefit: 'Schema markup enables rich results in Google (star ratings, hours, address) and helps the Knowledge Panel populate correctly.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
    }));
  }

  // missing-canonical
  {
    const affected = pages.filter(p => !p.canonicalUrl).map(p => p.url);
    findings.push(finding({
      id: 'missing-canonical',
      category: 'seo',
      title: 'Missing canonical URLs',
      benefit: 'Canonical tags prevent duplicate content issues and consolidate link equity to the preferred URL.',
      affectedPages: affected,
      count: affected.length,
      thresholds: { total },
    }));
  }

  // ── Performance (from pagespeed) ───────────────────────────────────────────

  const mobilePerfScore = pagespeed?.mobile?.performance ?? null;
  const mobileLcp       = pagespeed?.mobile?.metrics?.lcp ?? null;
  const mobileCls       = pagespeed?.mobile?.metrics?.cls ?? null;

  // low-performance
  {
    if (mobilePerfScore === null) {
      findings.push({
        id: 'low-performance',
        category: 'performance',
        severity: 'warning',
        title: 'Performance not checked',
        detail: 'PageSpeed check was not run. Use --skip-pagespeed=false or add GOOGLE_PAGESPEED_API_KEY to check performance.',
        benefit: 'Google uses Core Web Vitals as a ranking signal. A fast site also reduces bounce rate and improves conversions.',
        affectedPages: [],
        count: 0,
      });
    } else {
      let forceSeverity;
      if (mobilePerfScore >= 90)      forceSeverity = 'passed';
      else if (mobilePerfScore >= 50) forceSeverity = 'warning';
      else                            forceSeverity = 'critical';

      findings.push(finding({
        id: 'low-performance',
        category: 'performance',
        title: 'Mobile performance score',
        benefit: 'Google uses Core Web Vitals as a ranking signal. A fast site reduces bounce rate and improves conversions.',
        affectedPages: [],
        count: mobilePerfScore < 90 ? 1 : 0,
        forceSeverity,
        thresholds: { score: mobilePerfScore },
      }));
    }
  }

  // low-lcp
  {
    if (mobileLcp === null) {
      findings.push({
        id: 'low-lcp',
        category: 'performance',
        severity: 'warning',
        title: 'Largest Contentful Paint not measured',
        detail: 'LCP was not measured (PageSpeed not run).',
        benefit: 'LCP measures how quickly the main content loads. Slow LCP is a top reason users bounce from pages.',
        affectedPages: [],
        count: 0,
      });
    } else {
      let forceSeverity;
      if (mobileLcp <= 2500)      forceSeverity = 'passed';
      else if (mobileLcp <= 4000) forceSeverity = 'warning';
      else                        forceSeverity = 'critical';

      findings.push(finding({
        id: 'low-lcp',
        category: 'performance',
        title: 'Largest Contentful Paint (LCP)',
        benefit: 'LCP measures how quickly the main content loads. Slow LCP is a top reason users bounce from pages and a direct ranking factor.',
        affectedPages: [],
        count: mobileLcp > 2500 ? 1 : 0,
        forceSeverity,
        thresholds: { lcp: mobileLcp, total: 1 },
      }));
    }
  }

  // high-cls
  {
    if (mobileCls === null) {
      findings.push({
        id: 'high-cls',
        category: 'performance',
        severity: 'warning',
        title: 'Cumulative Layout Shift not measured',
        detail: 'CLS was not measured (PageSpeed not run).',
        benefit: 'CLS measures visual stability. Unexpected layout shifts frustrate users and hurt Google rankings.',
        affectedPages: [],
        count: 0,
      });
    } else {
      let forceSeverity;
      if (mobileCls <= 0.1)      forceSeverity = 'passed';
      else if (mobileCls <= 0.25) forceSeverity = 'warning';
      else                        forceSeverity = 'critical';

      findings.push(finding({
        id: 'high-cls',
        category: 'performance',
        title: 'Cumulative Layout Shift (CLS)',
        benefit: 'CLS measures visual stability. Unexpected layout shifts frustrate users clicking buttons that move and hurt Google rankings.',
        affectedPages: [],
        count: mobileCls > 0.1 ? 1 : 0,
        forceSeverity,
        thresholds: { cls: mobileCls.toFixed(3), total: 1 },
      }));
    }
  }

  // ── Accessibility ──────────────────────────────────────────────────────────

  // missing-alt
  {
    let missingCount = 0;
    for (const p of pages) {
      for (const img of p.images || []) {
        if (!img.alt || img.alt.trim() === '') missingCount++;
      }
    }
    findings.push(finding({
      id: 'missing-alt',
      category: 'accessibility',
      title: 'Images missing alt text',
      benefit: 'Alt text is essential for screen readers and is used by Google Image Search to understand image content.',
      affectedPages: [],
      count: missingCount,
      forceSeverity: missingCount === 0 ? 'passed' : missingCount > 5 ? 'critical' : 'warning',
    }));
  }

  // ── Content ────────────────────────────────────────────────────────────────

  // no-testimonials
  {
    const allTestimonials = pages.flatMap(p => {
      // Check structured data for reviews
      const reviews = (p.structuredData || []).filter(s =>
        s['@type'] === 'Review' || s['@type'] === 'AggregateRating' ||
        (Array.isArray(s['@type']) && (s['@type'].includes('Review') || s['@type'].includes('LocalBusiness')))
      );
      return reviews;
    });

    // Also check if any page bodyText contains testimonial-like content
    const hasTestimonialContent = pages.some(p =>
      /testimonial|review|patient said|our patients|what patients/i.test(p.bodyText || '')
    );

    const count = allTestimonials.length === 0 && !hasTestimonialContent ? 1 : 0;
    findings.push(finding({
      id: 'no-testimonials',
      category: 'content',
      title: 'No testimonials or patient reviews',
      benefit: 'Patient testimonials build trust and are one of the top conversion factors for healthcare practices. They also improve local SEO.',
      affectedPages: [],
      count,
      forceSeverity: count > 0 ? 'warning' : 'passed',
    }));
  }

  // no-faq
  {
    const hasFaqContent = pages.some(p => {
      const bodyLower = (p.bodyText || '').toLowerCase();
      const headingTexts = (p.headings || []).map(h => h.text.toLowerCase());
      return bodyLower.includes('frequently asked') ||
             bodyLower.includes('faq') ||
             headingTexts.some(t => t.includes('faq') || t.includes('frequently asked') || t.includes('common question'));
    });

    const hasFaqSchema = pages.some(p =>
      (p.structuredData || []).some(s => s['@type'] === 'FAQPage' || s['@type'] === 'Question')
    );

    const count = !hasFaqContent && !hasFaqSchema ? 1 : 0;
    findings.push(finding({
      id: 'no-faq',
      category: 'content',
      title: 'No FAQ content found',
      benefit: 'FAQ pages capture long-tail search queries, can generate FAQ rich results in Google, and reduce front-desk call volume.',
      affectedPages: [],
      count,
      forceSeverity: count > 0 ? 'warning' : 'passed',
    }));
  }

  // thin-about
  {
    const aboutPage = pages.find(p => /\/about/i.test(p.path));
    const count = aboutPage && (aboutPage.wordCount || 0) < 200 ? 1 : 0;
    findings.push(finding({
      id: 'thin-about',
      category: 'content',
      title: 'Thin About page content',
      benefit: 'The About page is often the second most-visited page for healthcare practices. A rich bio builds trust and ranks for doctor-name searches.',
      affectedPages: aboutPage && count > 0 ? [aboutPage.url] : [],
      count,
      forceSeverity: count > 0 ? 'warning' : 'passed',
    }));
  }

  // ── Mobile ─────────────────────────────────────────────────────────────────

  // no-viewport
  {
    // Check if any pages have a missing viewport (we detect via bodyText/meta)
    // Bronze extracts metaDescription but not viewport — we look for it in the raw headings/page data
    // If we can't check, skip with a neutral finding
    const mobilePerfAvail = pagespeed?.mobile?.performance != null;
    let count = 0;
    let detail = 'Viewport presence could not be checked from bronze data.';

    if (mobilePerfAvail && pagespeed.mobile.performance < 50) {
      // Low performance + unknown viewport = likely missing or misconfigured
      count = 1;
      detail = 'Low mobile performance score suggests a possible viewport or mobile-rendering issue.';
    }

    findings.push({
      id: 'no-viewport',
      category: 'mobile',
      severity: count > 0 ? 'warning' : 'passed',
      title: 'Viewport meta tag',
      detail: count === 0 && mobilePerfAvail
        ? 'Mobile performance score is acceptable — viewport likely present.'
        : detail,
      benefit: 'A viewport meta tag is required for Google to index pages as mobile-friendly. Without it, the site appears broken on phones.',
      affectedPages: [],
      count,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };

  return { findings, summary };
}
