/**
 * Phase: AI Blog Rewrite
 *
 * Takes a scraped blog page (raw bodyText / paragraphs from bronze) and asks
 * Claude to extract just the article content, strip nav/footer/header chrome,
 * and structure the result as clean markdown (paragraphs, headings, lists).
 *
 * Returns { ok: boolean, markdown: string|null, summary: string|null, error?: string }.
 *
 * Failure mode: if anything goes wrong, returns ok:false. Caller decides what
 * to do — typically mark the post as draft (hidden) rather than shipping raw
 * bodyText to users.
 */

import { renderSkillPrompt } from './skill-loader.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

/**
 * Rewrite a single scraped blog page into clean markdown.
 *
 * @param {object} page         - Bronze page object: { path, h1, title, bodyText, paragraphs, html }
 * @param {object} practice     - { name, doctor, city }
 * @param {object} [opts]
 * @param {boolean} [opts.verbose]
 * @returns {Promise<{ ok: boolean, markdown: string|null, summary: string|null, error?: string }>}
 */
export async function rewriteBlogPost(page, practice, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, markdown: null, summary: null, error: 'ANTHROPIC_API_KEY not set' };

  const sourceText = (page.bodyText || page.body || (page.paragraphs || []).join('\n\n') || '').trim();
  if (sourceText.length < 200) {
    return { ok: false, markdown: null, summary: null, error: 'source body too short' };
  }

  const prompt = await buildPrompt(page, practice, sourceText);

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const response = await callAnthropic({
      phase:     'blog-rewrite',
      model:     MODEL,
      maxTokens: MAX_TOKENS,
      messages:  [{ role: 'user', content: prompt }],
    });

    const raw = response.text;
    const parsed = parseResponse(raw);

    if (!parsed.markdown || parsed.markdown.length < 100) {
      return { ok: false, markdown: null, summary: null, error: 'rewritten body empty or too short' };
    }

    return {
      ok: true,
      markdown: parsed.markdown,
      summary: parsed.summary,
    };
  } catch (err) {
    return { ok: false, markdown: null, summary: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

async function buildPrompt(page, practice, sourceText) {
  // Trim to a generous limit — Claude has plenty of context, but we don't
  // need the whole page if it's a 50k-character monster.
  const trimmed = sourceText.slice(0, 12000);

  return renderSkillPrompt('pages/blog-rewrite', {
    title:        page.h1 || page.title || 'Untitled',
    practiceName: practice?.name   || '',
    city:         practice?.city   || '',
    doctor:       practice?.doctor || '',
    trimmed,
  });
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseResponse(raw) {
  // Strip markdown fences if present
  let text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(text);
    return {
      markdown: typeof parsed.markdown === 'string' ? parsed.markdown.trim() : null,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : null,
    };
  } catch {
    return { markdown: null, summary: null };
  }
}
