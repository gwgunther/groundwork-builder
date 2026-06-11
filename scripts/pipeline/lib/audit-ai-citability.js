/**
 * audit-ai-citability.js — Phase 4.67 AI Citability audit.
 *
 * Prompts Claude (always), OpenAI GPT-4o-mini (if OPENAI_API_KEY set),
 * and Google Gemini Flash (if GOOGLE_GEMINI_API_KEY set) with:
 *   "I'm looking for a dentist in [city, state] for [top service].
 *    Which practices do you recommend?"
 *
 * Parses each response for the practice name. Returns:
 *   {
 *     practiceName, city, topService, prompt,
 *     results: [{ model, mentioned, response_excerpt, error? }],
 *     mentioned, total, fraction
 *   }
 *
 * Cost: ~1–3 Claude Haiku input+output tokens per run (negligible).
 * OpenAI and Gemini calls are skipped when their keys are absent.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * @param {object} merged - Merged practice data
 * @returns {Promise<object>} Citability audit result
 */
export async function runAiCitabilityAudit(merged) {
  const practice = merged.practice || {};
  const address  = merged.address  || {};
  const services = merged.services?.offered || [];

  const practiceName = practice.name || '';
  const city  = address.city  || '';
  const state = address.state || '';
  const topService = services[0]?.name || 'dental care';

  if (!practiceName || !city) {
    return {
      results:  [],
      fraction: '0/0',
      skipped:  true,
      reason:   'No practice name or city available — skipping AI citability audit',
    };
  }

  const prompt =
    `I'm looking for a dentist in ${city}${state ? `, ${state}` : ''} for ${topService}. ` +
    `Which dental practices do you recommend and why?`;

  const results = [];

  // ------------------------------------------------------------------
  // 1. Claude (always — uses the same SDK key as the rest of the pipeline)
  // ------------------------------------------------------------------
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }],
    });
    const text      = msg.content[0]?.text || '';
    const mentioned = isMentioned(text, practiceName);
    results.push({ model: 'claude', mentioned, response_excerpt: text.slice(0, 400) });
  } catch (err) {
    results.push({ model: 'claude', mentioned: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // 2. OpenAI GPT-4o-mini (optional)
  // ------------------------------------------------------------------
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body:    JSON.stringify({
          model:      'gpt-4o-mini',
          max_tokens: 400,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content || '';
      results.push({ model: 'openai', mentioned: isMentioned(text, practiceName), response_excerpt: text.slice(0, 400) });
    } catch (err) {
      results.push({ model: 'openai', mentioned: false, error: err.message });
    }
  }

  // ------------------------------------------------------------------
  // 3. Google Gemini Flash (optional)
  // ------------------------------------------------------------------
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400 },
        }),
      });
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      results.push({ model: 'gemini', mentioned: isMentioned(text, practiceName), response_excerpt: text.slice(0, 400) });
    } catch (err) {
      results.push({ model: 'gemini', mentioned: false, error: err.message });
    }
  }

  const mentioned = results.filter(r => r.mentioned).length;
  const total     = results.length;

  return {
    practiceName,
    city,
    state,
    topService,
    prompt,
    results,
    mentioned,
    total,
    fraction: `${mentioned}/${total}`,
    ...buildPhase(mentioned, total),
  };
}

/**
 * Earned-vs-owned sequencing signal. AI systems learn to trust a business
 * from what *others* say about it before its own site content matters.
 * The diagnostic result determines the right first move:
 *   - trust_building:    no model mentions the practice — earned signals
 *                        (reviews, directories, third-party mentions) come first
 *   - trust_compounding: at least one model cites it — owned content
 *                        (accuracy, schema depth, FAQ coverage) compounds that trust
 */
function buildPhase(mentioned, total) {
  if (total === 0) return { phase: null, phaseRecommendation: null };
  if (mentioned === 0) {
    return {
      phase: 'trust_building',
      phaseRecommendation:
        'AI assistants don’t yet mention this practice. Prioritize earned signals first — ' +
        'Google reviews, directory listings (Healthgrades, Yelp), and third-party mentions — ' +
        'before deeper content optimization. AI learns to trust a practice from what others say about it.',
    };
  }
  return {
    phase: 'trust_compounding',
    phaseRecommendation:
      `AI assistants already cite this practice (${mentioned}/${total} models). ` +
      'Focus on owned content: accurate facts on every page, schema depth, FAQ coverage, ' +
      'and answer-first service pages so the citations stay accurate and favorable.',
  };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Returns true if the practice name (or its meaningful parts) appears
 * in the LLM response text. Case-insensitive.
 */
function isMentioned(text, practiceName) {
  if (!practiceName || !text) return false;
  const normalized = text.toLowerCase();
  const name       = practiceName.toLowerCase();

  if (normalized.includes(name)) return true;

  // Multi-word name: check that at least two consecutive meaningful words appear
  const parts = name.split(/\s+/).filter(w => w.length > 3 && !/^(and|the|for|dental|dentistry|family|care|center|clinic|group|practice|associates)$/.test(w));
  if (parts.length >= 2) {
    for (let i = 0; i < parts.length - 1; i++) {
      if (normalized.includes(parts[i]) && normalized.includes(parts[i + 1])) return true;
    }
  }

  return false;
}
