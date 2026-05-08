/**
 * Phase: AI Service Page (structured)
 *
 * Replaces ai-service-rewrite.js's paragraph-only output with a richer
 * structured-section schema. The scraped bodyText for a service page is
 * decomposed by the AI into named sections (highlight, subsection,
 * callout-list, process, faq, etc.) which the page generator then renders
 * with appropriate visual treatments.
 *
 * Output schema:
 *   {
 *     ok: boolean,
 *     page: {
 *       headline:       string,
 *       subheadline:    string | null,
 *       intro:          string,           // 1-2 paragraphs
 *       primaryCta:     string,           // CTA label
 *       sections: Array<
 *         | { type: 'highlight',     label?: string, headline: string, body?: string }
 *         | { type: 'subsection',    heading: string, body: string }
 *         | { type: 'callout-list',  heading: string, items: Array<{ label: string, body: string }> }
 *         | { type: 'process',       heading: string, steps: Array<{ title: string, body: string }> }
 *         | { type: 'benefits',      heading: string, items: string[] }
 *         | { type: 'faq',           heading?: string, items: Array<{ q: string, a: string }> }
 *       >,
 *       ctaSection: { headline: string, body?: string, primaryCta: string }
 *     },
 *     error?: string
 *   }
 */

import { renderSkillPrompt } from './skill-loader.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4000;

/**
 * @param {object} bronzePage - { path, h1, title, bodyText, paragraphs, headings }
 * @param {object} service    - { name, slug, category, description }
 * @param {object} practice   - { name, doctor, city, phone }
 * @param {Array}  [additionalContent] - silver.content.additionalContent[] — relevant rescued content
 */
export async function generateServicePage(bronzePage, service, practice, additionalContent = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, page: null, error: 'ANTHROPIC_API_KEY not set' };

  const sourceText = (bronzePage?.bodyText || bronzePage?.body || (bronzePage?.paragraphs || []).join('\n\n') || '').trim();
  if (sourceText.length < 200) {
    return { ok: false, page: null, error: 'source body too short to decompose' };
  }

  const prompt = await buildPrompt(bronzePage, service, practice, sourceText, additionalContent);

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const response = await callAnthropic({
      phase:     'service-page',
      model:     MODEL,
      maxTokens: MAX_TOKENS,
      messages:  [{ role: 'user', content: prompt }],
    });

    const page = parseResponse(response.text);
    if (!page || !page.headline || !Array.isArray(page.sections)) {
      return { ok: false, page: null, error: 'invalid structured page output' };
    }
    return { ok: true, page };
  } catch (err) {
    return { ok: false, page: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

async function buildPrompt(page, service, practice, sourceText, additionalContent = []) {
  const trimmed     = sourceText.slice(0, 9000);
  const serviceName = service?.name || 'this service';

  // Pass scraped headings if available — helps the AI preserve original section structure
  const headings = (page?.headings || []).filter(h => h && h.length < 100).slice(0, 12);
  const headingsContext = headings.length > 0
    ? `\n# Original page headings (preserve these as section anchors when relevant)\n${headings.map(h => `- ${h}`).join('\n')}`
    : '';

  // Rescued voice content from elsewhere on the source site that could enrich this page
  // (technology paragraphs, pull-quotes, philosophy that frames why this service matters).
  // Already filtered upstream by source-path or type relevance.
  const additionalBlock = additionalContent.length > 0
    ? `\n# Voice content from elsewhere on the original site (use phrasing/tone if it fits — do NOT fabricate facts not present)\n${additionalContent.map((it, i) => {
        const heading = it.title ? `[${it.type}] ${it.title}` : `[${it.type}]`;
        return `${i + 1}. ${heading} (from ${it.source || 'unknown'}):\n   "${(it.content || '').slice(0, 500)}"`;
      }).join('\n\n')}`
    : '';

  return renderSkillPrompt('pages/service-page', {
    serviceName,
    practiceName: practice?.name   || '',
    doctor:       practice?.doctor || '(not specified)',
    city:         practice?.city   || '(not specified)',
    phone:        practice?.phone  || '(not specified)',
    trimmed,
    headingsContext,
    additionalBlock,
  });
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseResponse(raw) {
  let text = (raw || '').trim();
  // Strip code fences
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) text = fence[1].trim();
  // Find JSON braces
  const f = text.indexOf('{');
  const l = text.lastIndexOf('}');
  if (f === -1 || l <= f) return null;
  try {
    return JSON.parse(text.slice(f, l + 1));
  } catch {
    return null;
  }
}
