/**
 * AI Site Audit — uses Claude to analyze scraped data and produce
 * positioning/strategy recommendations for the redesign.
 *
 * Gracefully skips if ANTHROPIC_API_KEY is not set.
 */

import { renderSkillPrompt } from './skill-loader.js';

/**
 * Run the AI site audit on scraped + merged data.
 *
 * @param {object} scraped  - Raw scraped data from phase 1
 * @param {object} merged   - Merged data from phase 2
 * @param {object} preset   - Loaded vertical preset
 * @param {object} [opts]   - Options
 * @param {boolean} [opts.verbose] - Log extra detail
 * @returns {object|null} Audit recommendations, or null if skipped
 */
export async function runSiteAudit(scraped, merged, preset, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set — skipping AI audit.');
    return null;
  }

  if (!scraped) {
    console.log('  No scrape data available — skipping AI audit.');
    return null;
  }

  // Migrated to skill-loader: prompt now lives in skills/audit/site-audit.md
  let prompt;
  try {
    prompt = await interpolatePrompt(scraped, merged, preset);
  } catch (err) {
    console.warn(`  Warning: Could not render audit prompt: ${err.message}`);
    return null;
  }

  if (opts.verbose) {
    console.log('  [audit] Prompt length:', prompt.length, 'chars');
  }

  // Call Claude API
  console.log('  Calling Claude API (claude-sonnet-4-6)...');
  const startTime = Date.now();

  try {
    const { callAnthropic } = await import('./ai-call.js');

    const response = await callAnthropic({
      phase:     'audit',
      model:     'claude-sonnet-4-6',
      maxTokens: 4096,
      messages:  [{ role: 'user', content: prompt }],
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  AI audit complete (${elapsed}s).`);

    const text = response.text;
    let audit = parseJsonResponse(text);

    // Retry once with a nudge if parse failed (semantic retry, not the
    // transient-error retry that ai-call.js handles automatically).
    if (!audit) {
      console.warn('  Warning: Could not parse AI audit response — retrying with a nudge...');
      const retry = await callAnthropic({
        phase:     'audit:retry-parse',
        model:     'claude-sonnet-4-6',
        maxTokens: 2048,
        messages:  [
          { role: 'user', content: prompt },
          { role: 'assistant', content: text },
          { role: 'user', content: 'Please return ONLY the raw JSON object with no prose or code fences.' },
        ],
      });
      audit = parseJsonResponse(retry.text);
      if (!audit) {
        console.warn('  Warning: Retry also failed to parse. Skipping AI audit.');
        return null;
      }
      console.log('  Retry parse succeeded.');
    }

    return {
      ...audit,
      _meta: {
        model: 'claude-sonnet-4-6',
        duration_ms: Date.now() - startTime,
        input_tokens: response.usage?.input_tokens || null,
        output_tokens: response.usage?.output_tokens || null,
      },
    };
  } catch (err) {
    console.error(`  AI audit failed: ${err.message}`);
    return null;
  }
}

/**
 * Interpolate {{placeholders}} in the prompt template.
 */
async function interpolatePrompt(scraped, merged, preset) {
  const services = merged.services?.offered || [];
  const hubs = merged.services?.hubs || [];
  const taxonomy = preset?.taxonomy?.services || [];

  return renderSkillPrompt('audit/site-audit', {
    verticalName: preset?.schema?.verticalName || 'Practice',
    practiceName: merged.practice?.name || '[Unknown]',
    domain: merged.practice?.domain || '[Unknown]',
    doctorName: merged.doctor?.name
      || (merged.doctor?.firstName
        ? `Dr. ${merged.doctor.firstName} ${merged.doctor.lastName}`
        : '[Unknown]'),
    credentials: merged.doctor?.credentials || '[Unknown]',
    city: merged.address?.city || '[Unknown]',
    state: merged.address?.state || '[Unknown]',
    phone: merged.practice?.phone || '[Unknown]',
    servicesList: services.length > 0
      ? services.map(s => `- ${s.canonical || s.name || s.slug} (${s.slug})`).join('\n')
      : '(none detected)',
    hubsList: hubs.length > 0
      ? hubs.map(h => `- ${h.label || h.slug} → /services/${h.slug}`).join('\n')
      : '(none)',
    taxonomyList: taxonomy.map(t => `- ${t.canonical} [${t.category}]`).join('\n'),
    pageCount: String(scraped.migration?.oldUrls?.length || 0),
    hasBio: merged.doctor?.bio ? 'Yes' : 'No',
    hasTestimonials: (merged.content?.testimonials?.length || 0) > 0 ? 'Yes' : 'No',
    hasFaqs: (merged.content?.faqs?.length || 0) > 0 ? 'Yes' : 'No',
    socialsCount: String((merged.practice?.sameAs || []).filter(Boolean).length),
    imageCount: String(
      (merged.images?.team?.length || 0) +
      (merged.images?.office?.length || 0) +
      (merged.images?.gallery?.length || 0),
    ),
    confidenceFlags: (merged.meta?.confidenceFlags || []).join(', ') || '(none)',
  });
}

/**
 * Parse JSON from a Claude response, handling code fences.
 */
function parseJsonResponse(text) {
  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Try extracting from code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {}
    }
    // Last-ditch: find outermost balanced braces
    const first = text.indexOf('{');
    if (first !== -1) {
      let depth = 0, last = -1;
      for (let i = first; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { last = i; break; } }
      }
      if (last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
      }
    }
    return null;
  }
}
