/**
 * Pass: testimonials — every patient review/testimonial on the site, verbatim.
 *
 * Testimonials commonly appear sitewide (footer carousels, home, dedicated
 * page). We sweep all pages but pass full body to dedicated testimonial pages.
 */

import { loadPrompt, fillTemplate, runPassCall, renderPagesAsContext, pagesMatching, MODELS } from '../shared.js';

export const name = 'testimonials';

const DEDICATED_PATTERNS = [
  /testimonial/i, /\/review/i, /\/patient[-_]?(stories|voices|reviews)/i, /\/what[-_]?patients?[-_]?say/i,
];

export function selectPages(bronze) {
  const dedicated = pagesMatching(bronze.pages, DEDICATED_PATTERNS);
  const home = bronze.pages.find(p => p.path === '/' || p.path === '');
  const set = new Set(dedicated);
  if (home) set.add(home);
  // Heuristic: any page where the body mentions a 5-star rating or "—" attribution
  // patterns likely contains testimonial snippets
  for (const p of bronze.pages) {
    if (set.has(p)) continue;
    const text = p.bodyText || '';
    if (/[★]{3,}|five[-\s]star|\bstars?\b/i.test(text) && text.length > 1000) set.add(p);
  }
  return Array.from(set);
}

export async function run({ bronze, pages }) {
  if (pages.length === 0) return { content: { testimonials: [] } };
  const tmpl = await loadPrompt('testimonials');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    pageContext: renderPagesAsContext(pages, { bodyChars: 14000, paragraphs: 50, images: 5, includeJsonLd: false }),
  });
  const { slice } = await runPassCall({ name, model: MODELS.default, prompt, maxTokens: 10000, rootArrayKey: 'testimonials' });
  // Normalize wrap
  if (slice.testimonials && !slice.content) return { content: { testimonials: slice.testimonials } };
  return slice;
}
