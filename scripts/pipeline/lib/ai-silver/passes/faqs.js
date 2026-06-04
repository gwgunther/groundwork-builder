/**
 * Pass: faqs — every Q+A pair from dedicated FAQ pages, with full body text.
 */

import { loadPrompt, fillTemplate, runPassCall, renderPagesAsContext, pagesMatching, MODELS } from '../shared.js';

export const name = 'faqs';

const PATTERNS = [
  /faq/i, /\/common[-_]?(questions?|orthodontic)/i, /\/questions?/i,
  /\/(orthodontic|pediatric|dental)[-_]?(faqs?|questions?)/i,
  /\/(what[-_]?to[-_]?expect|first[-_]?visit|new[-_]?patient)/i,
];

export function selectPages(bronze) {
  const matched = new Set(pagesMatching(bronze.pages, PATTERNS));
  // Fallback: any page where >= 3 H2/H3 headings end with `?` is an FAQ-bearing
  // page (very common on service pages that have embedded FAQ sections).
  for (const p of bronze.pages) {
    if (matched.has(p)) continue;
    const qHeadings = (p.headings || []).filter(h => (h.level === 2 || h.level === 3) && /\?\s*$/.test(h.text));
    if (qHeadings.length >= 3) matched.add(p);
  }
  // Also: pages titled "Patient Resources" or with "FAQ" in headings/title
  for (const p of bronze.pages) {
    if (matched.has(p)) continue;
    if (/\bFAQ|frequently\s+asked|patient\s+resources/i.test(p.title || '')) matched.add(p);
    if ((p.headings || []).some(h => /\bFAQ|frequently\s+asked\s+questions/i.test(h.text))) matched.add(p);
  }
  return Array.from(matched);
}

export async function run({ bronze, pages }) {
  if (pages.length === 0) return { content: { faqs: [] } };
  const tmpl = await loadPrompt('faqs');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    // FAQs need EVERYTHING — no truncation
    pageContext: renderPagesAsContext(pages, { bodyChars: 18000, paragraphs: 200, images: 5, includeJsonLd: false }),
  });
  const { slice } = await runPassCall({ name, model: MODELS.default, prompt, maxTokens: 16000, rootArrayKey: 'faqs' });
  if (slice.faqs && !slice.content) return { content: { faqs: slice.faqs } };
  return slice;
}
