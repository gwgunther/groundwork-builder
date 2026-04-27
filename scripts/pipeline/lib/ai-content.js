/**
 * Phase 2d: AI Content Mapping
 *
 * Analyzes the scraped page inventory + AI audit recommendations and uses
 * Claude to generate elevated, modern copy for the new website.
 *
 * Outputs a structured content map saved to _pipeline/03-content.json.
 * Also updates merged.content.generated so downstream steps can inject copy.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'prompts', 'content-map.md');
const GUIDELINES_PATH = resolve(__dirname, '..', 'prompts', 'copywriting-guidelines.md');

/**
 * Run AI content mapping.
 *
 * @param {object} scraped  - Raw scraped data (includes pageInventory)
 * @param {object} merged   - Merged practice data
 * @param {object} audit    - AI audit output (from ai-audit.js), may be null
 * @param {object} preset   - Loaded vertical preset
 * @param {object} [opts]
 * @returns {object|null} Generated content map, or null if skipped
 */
export async function runContentMapping(scraped, merged, audit, preset, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set — skipping AI content mapping.');
    return null;
  }

  if (!scraped) {
    console.log('  No scrape data — skipping AI content mapping.');
    return null;
  }

  let promptTemplate;
  try {
    promptTemplate = await readFile(PROMPT_PATH, 'utf-8');
  } catch (err) {
    console.warn(`  Warning: Could not load content prompt: ${err.message}`);
    return null;
  }

  let copywritingGuidelines = '';
  try {
    copywritingGuidelines = await readFile(GUIDELINES_PATH, 'utf-8');
  } catch {
    console.warn('  Warning: Could not load copywriting guidelines — proceeding without them.');
  }

  const prompt = buildPrompt(promptTemplate, scraped, merged, audit, preset, copywritingGuidelines);

  if (opts.verbose) {
    console.log('  [content] Prompt length:', prompt.length, 'chars');
  }

  const startTime = Date.now();

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '';
    const durationMs = Date.now() - startTime;

    // Parse JSON — strip any markdown fences
    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(`  [content] JSON parse failed: ${parseErr.message}`);
      if (opts.verbose) console.log('  [content] Raw output:', raw.slice(0, 500));
      return null;
    }

    parsed._meta = {
      model: response.model,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      duration_ms: durationMs,
    };

    return parsed;
  } catch (err) {
    console.warn(`  [content] API call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(template, scraped, merged, audit, preset, copywritingGuidelines = '') {
  const practice = merged.practice || {};
  const doctor = merged.doctor || {};
  const services = merged.services || {};
  const content = merged.content || {};

  // Page inventory — condensed for prompt efficiency
  const pageInventory = buildPageInventorySummary(scraped.pageInventory || []);

  // Services list
  const servicesList = (services.offered || []).map(s => s.canonical || s.slug).join(', ') || 'General dentistry';

  // Hub slugs
  const hubSlugs = (services.hubs || []).map(h => typeof h === 'string' ? h : h.slug).join(', ') || 'general-dentistry';

  // Testimonials
  const testimonials = (content.testimonials || []).length > 0
    ? content.testimonials.map(t => `"${t.text}"${t.author ? ` — ${t.author}` : ''}`).join('\n')
    : 'None found on current site.';

  // Existing FAQs
  const existingFAQs = (content.faqs || []).length > 0
    ? content.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
    : 'None found on current site.';

  // Stats
  const stats = content.stats || {};
  const statsStr = [
    stats.yearsExperience ? `${stats.yearsExperience} years in practice` : null,
    stats.happyPatients ? `${stats.happyPatients} patients served` : null,
    stats.googleRating ? `${stats.googleRating} Google rating` : null,
    stats.fiveStarReviews ? `${stats.fiveStarReviews} five-star reviews` : null,
  ].filter(Boolean).join(', ') || 'None detected.';

  // Audit signals
  const positioning = audit?.positioning?.recommended || 'Premium neighborhood dental practice';
  const tone = audit?.tone?.recommended || 'Warm, professional, reassuring';
  const differentiators = (audit?.differentiators || []).join('; ') || 'None specified.';
  const primaryService = audit?.serviceEmphasis?.primary || hubSlugs.split(',')[0]?.trim() || 'general-dentistry';

  return template
    .replace('{{copywritingGuidelines}}', copywritingGuidelines || '(No guidelines file found — use best judgment.)')
    .replace('{{practiceName}}', practice.name || '[Practice Name]')
    .replace('{{domain}}', practice.domain || '[domain]')
    .replace('{{doctorName}}', doctor.name || '[Doctor Name]')
    .replace('{{credentials}}', doctor.credentials || 'DDS')
    .replace('{{city}}', merged.address?.city || '[City]')
    .replace('{{state}}', merged.address?.state || '[State]')
    .replace('{{phone}}', practice.phone || '[Phone]')
    .replace('{{servicesList}}', servicesList)
    .replace('{{hubSlugs}}', hubSlugs)
    .replace('{{positioning}}', positioning)
    .replace('{{tone}}', tone)
    .replace('{{differentiators}}', differentiators)
    .replace('{{primaryService}}', primaryService)
    .replace('{{pageInventory}}', pageInventory)
    .replace('{{testimonials}}', testimonials)
    .replace('{{existingFAQs}}', existingFAQs)
    .replace('{{stats}}', statsStr);
}

function buildPageInventorySummary(inventory) {
  if (!inventory || inventory.length === 0) return 'No pages crawled.';

  return inventory.map(page => {
    const lines = [`### ${page.path || page.url}`];
    if (page.title) lines.push(`Title: ${page.title}`);
    if (page.h1) lines.push(`H1: ${page.h1}`);
    if (page.h2s?.length) lines.push(`H2s: ${page.h2s.join(' | ')}`);
    if (page.metaDesc) lines.push(`Meta: ${page.metaDesc}`);
    if (page.paragraphs?.length) {
      lines.push(`Content excerpts:`);
      page.paragraphs.slice(0, 3).forEach(p => lines.push(`  • ${p.slice(0, 200)}`));
    }
    lines.push(`Word count: ~${page.wordCount}`);
    return lines.join('\n');
  }).join('\n\n');
}
