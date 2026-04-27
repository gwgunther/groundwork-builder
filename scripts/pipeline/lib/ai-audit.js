/**
 * AI Site Audit — uses Claude to analyze scraped data and produce
 * positioning/strategy recommendations for the redesign.
 *
 * Gracefully skips if ANTHROPIC_API_KEY is not set.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'prompts', 'site-audit.md');
const POSITIONING_SKILL_PATH = resolve(__dirname, '..', 'skills', 'positioning.md');

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

  // Load and interpolate prompt template
  let promptTemplate;
  try {
    promptTemplate = await readFile(PROMPT_PATH, 'utf-8');
  } catch (err) {
    console.warn(`  Warning: Could not load audit prompt: ${err.message}`);
    return null;
  }

  let positioningSkill = '';
  try {
    positioningSkill = await readFile(POSITIONING_SKILL_PATH, 'utf-8');
  } catch {
    console.warn('  Warning: Could not load positioning skill — proceeding without it.');
  }

  const prompt = interpolatePrompt(promptTemplate, scraped, merged, preset, positioningSkill);

  if (opts.verbose) {
    console.log('  [audit] Prompt length:', prompt.length, 'chars');
  }

  // Call Claude API
  console.log('  Calling Claude API (claude-sonnet-4-6)...');
  const startTime = Date.now();

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  AI audit complete (${elapsed}s).`);

    // Extract text from response
    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    // Parse JSON from response (handles code fences)
    const audit = parseJsonResponse(text);

    if (!audit) {
      console.warn('  Warning: Could not parse AI audit response as JSON.');
      if (opts.verbose) {
        console.log('  Raw response:', text.substring(0, 500));
      }
      return null;
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
function interpolatePrompt(template, scraped, merged, preset, positioningSkill = '') {
  const services = merged.services?.offered || [];
  const hubs = merged.services?.hubs || [];
  const taxonomy = preset?.taxonomy?.services || [];

  const replacements = {
    positioningSkill: positioningSkill || '(No positioning skill file found — use best judgment.)',
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
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
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
      } catch {
        return null;
      }
    }
    return null;
  }
}
