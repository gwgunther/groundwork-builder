/**
 * Phase 2c: AI Design Mapping
 *
 * Analyzes the practice's existing brand signals (scraped colors, logo, vibe)
 * plus the AI audit's tone/positioning recommendations and generates a modern,
 * elevated design system (color palette + fonts).
 *
 * Updates merged.brand before the injector runs so the new palette flows
 * automatically into tailwind.config.mjs and the Google Fonts link.
 *
 * Outputs saved to _pipeline/04-design.json.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'prompts', 'design-map.md');
const DESIGN_SKILL_PATH = resolve(__dirname, '..', 'skills', 'design.md');

/**
 * Run AI design mapping.
 *
 * @param {object} scraped  - Raw scraped data (includes brand.colors, images.logo)
 * @param {object} merged   - Merged practice data (brand.colors will be updated in-place)
 * @param {object} audit    - AI audit output, may be null
 * @param {object} [opts]
 * @returns {object|null} Design system output, or null if skipped
 */
export async function runDesignMapping(scraped, merged, audit, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set — skipping AI design mapping.');
    return null;
  }

  let promptTemplate;
  try {
    promptTemplate = await readFile(PROMPT_PATH, 'utf-8');
  } catch (err) {
    console.warn(`  Warning: Could not load design prompt: ${err.message}`);
    return null;
  }

  let designSkill = '';
  try {
    designSkill = await readFile(DESIGN_SKILL_PATH, 'utf-8');
  } catch {
    console.warn('  Warning: Could not load design skill — proceeding without it.');
  }

  const prompt = buildPrompt(promptTemplate, scraped, merged, audit, designSkill);

  if (opts.verbose) {
    console.log('  [design] Prompt length:', prompt.length, 'chars');
  }

  const startTime = Date.now();

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '';
    const durationMs = Date.now() - startTime;

    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(`  [design] JSON parse failed: ${parseErr.message}`);
      if (opts.verbose) console.log('  [design] Raw output:', raw.slice(0, 400));
      return null;
    }

    parsed._meta = {
      model: response.model,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      duration_ms: durationMs,
    };

    // Apply the new palette + fonts to merged.brand so the injector uses them
    if (parsed.palette) {
      merged.brand = merged.brand || {};
      merged.brand.colors = {
        primary:   normalizeHex(parsed.palette.primary)   || merged.brand.colors?.primary,
        secondary: normalizeHex(parsed.palette.secondary) || merged.brand.colors?.secondary,
        light:     normalizeHex(parsed.palette.light)     || merged.brand.colors?.light,
        accent:    normalizeHex(parsed.palette.accent)    || merged.brand.colors?.accent,
        highlight: normalizeHex(parsed.palette.highlight) || merged.brand.colors?.highlight,
      };
    }
    if (parsed.fonts) {
      merged.brand.fonts = {
        heading: parsed.fonts.heading || merged.brand.fonts?.heading || 'Playfair Display',
        body:    parsed.fonts.body    || merged.brand.fonts?.body    || 'DM Sans',
      };
    }

    return parsed;
  } catch (err) {
    console.warn(`  [design] API call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(template, scraped, merged, audit, designSkill = '') {
  const practice = merged.practice || {};
  const address = merged.address || {};
  const brand = scraped?.brand || merged.brand || {};

  // Existing colors from scrape
  const existingColors = brand.colors
    ? Object.entries(brand.colors)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : 'No colors detected on current site.';

  // Aesthetic notes from page inventory (homepage specifically)
  const homepage = (scraped?.pageInventory || []).find(p => p.path === '/');
  const aestheticNotes = homepage
    ? `Homepage H1: "${homepage.h1 || '—'}"\nHomepage meta: "${homepage.metaDesc || '—'}"\nTop headings: ${(homepage.h2s || []).slice(0, 3).join(', ')}`
    : 'No homepage data available.';

  return template
    .replace('{{designSkill}}', designSkill || '(No design skill file found — use best judgment.)')
    .replace('{{practiceName}}', practice.name || '[Practice Name]')
    .replace('{{city}}', address.city || '[City]')
    .replace('{{state}}', address.state || '[State]')
    .replace('{{positioning}}', audit?.positioning?.recommended || 'Premium neighborhood dental practice')
    .replace('{{tone}}', audit?.tone?.recommended || 'Warm, professional, reassuring')
    .replace('{{existingColors}}', existingColors)
    .replace('{{logoUrl}}', brand.logoPath || scraped?.images?.logo || 'Not found')
    .replace('{{aestheticNotes}}', aestheticNotes);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHex(val) {
  if (!val) return null;
  // Strip any trailing description text after the hex (e.g. "#1A3C5E — dominant brand color")
  const match = String(val).match(/#([0-9a-fA-F]{3,8})/);
  return match ? `#${match[1]}` : null;
}
