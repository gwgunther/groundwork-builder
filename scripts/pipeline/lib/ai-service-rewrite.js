/**
 * Phase: AI Service Page Rewrite
 *
 * For each service the practice offers, the AI content map (Phase 2e) is the
 * preferred source of clean intro copy. When that's missing for a particular
 * service, we previously fell back to raw bronze paragraphs — which dragged
 * in the source site's footer/nav chrome ("© 2026 Practice Name | Privacy
 * Statement | …"). This rewriter is the second-tier source: takes scraped
 * service-page text and asks Claude to extract just the article body and
 * structure it as clean markdown, mirroring the blog rewriter.
 *
 * Returns { ok: boolean, intro: string|null, error?: string }.
 *
 * On failure the caller should mark the service page as draft (or skip it)
 * rather than shipping raw text.
 */

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

/**
 * @param {object} bronzePage  - { path, h1, title, bodyText, paragraphs }
 * @param {object} service     - { name, slug, category }
 * @param {object} practice    - { name, doctor, city }
 * @returns {Promise<{ ok: boolean, intro: string|null, error?: string }>}
 */
export async function rewriteServiceIntro(bronzePage, service, practice) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, intro: null, error: 'ANTHROPIC_API_KEY not set' };

  const sourceText = (bronzePage?.bodyText || bronzePage?.body || (bronzePage?.paragraphs || []).join('\n\n') || '').trim();
  if (sourceText.length < 200) {
    return { ok: false, intro: null, error: 'source body too short to rewrite' };
  }

  const prompt = buildPrompt(bronzePage, service, practice, sourceText);

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const response = await callAnthropic({
      phase:     'service-rewrite',
      model:     MODEL,
      maxTokens: MAX_TOKENS,
      messages:  [{ role: 'user', content: prompt }],
    });

    const raw = response.text;
    const intro = parseResponse(raw);

    if (!intro || intro.length < 80) {
      return { ok: false, intro: null, error: 'rewritten body empty or too short' };
    }
    return { ok: true, intro };
  } catch (err) {
    return { ok: false, intro: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(page, service, practice, sourceText) {
  const trimmed = sourceText.slice(0, 8000);
  const serviceName = service?.name || 'this service';
  const practiceName = practice?.name || '';
  const city = practice?.city || '';
  const doctor = practice?.doctor || '';

  return `You are extracting the article body from a service detail page that was scraped from a dental practice website. The scraped text below is the raw page content — it includes navigation menu items, header/footer chrome, repeated titles, copyright notices, "Privacy Statement | Terms of Use" footer links, and other non-article content. Your job is to isolate the actual service-page body and return it as clean, well-structured markdown.

# Service metadata
- Service: ${serviceName}
- Practice: ${practiceName}
- City: ${city}
- Doctor: ${doctor}

# Scraped raw text
"""
${trimmed}
"""

# Instructions

1. Identify the article body within the noise — the explanatory paragraphs that describe the service, how it works, and what the patient should expect.

2. Strip out everything that is not body content:
   - Navigation menus, header/menu items
   - Repeated titles (the H1 often appears 2–3 times in scraped text)
   - Phone numbers, addresses, "Book Now" / "Schedule" / "Request Appointment" buttons
   - Copyright lines, "© Year Practice", "Privacy Statement", "Terms of Use", "Web Accessibility", "Website Design by ..." — these are ALWAYS footer chrome
   - Bare lists of unrelated services or page links

3. Structure the body as clean markdown paragraphs, separated by blank lines:
   - Multiple paragraphs broken at natural sentence boundaries — never one giant wall of text
   - If the source text has list-like enumerations ("benefits include: X, Y, Z"), keep them as inline prose unless the structure clearly warrants a markdown bullet list
   - Preserve the practice's terminology and voice — do not paraphrase substantively

4. Do not invent information. If the article is short or generic in the source, your output is short or generic — do not pad with filler. If the article ends mid-sentence (because the scrape was truncated), end your output at the last complete sentence.

5. Do not use generic copy or template phrases. The output must read like a human at this specific practice wrote it. Do not introduce any phrasing that wasn't already in the source.

# Output format

Return ONLY the cleaned markdown body. No frontmatter, no title heading, no horizontal rules — just paragraphs of body copy. Start with the opening paragraph.`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseResponse(raw) {
  let text = (raw || '').trim();
  // Strip markdown code fences if the model wrapped its output
  const fence = text.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/);
  if (fence) text = fence[1].trim();
  // Drop anything that looks like a residual title heading at the very top
  text = text.replace(/^#\s+[^\n]+\n+/, '').trim();
  return text || null;
}
