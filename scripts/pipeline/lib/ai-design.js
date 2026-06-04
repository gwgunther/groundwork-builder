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
// Second skill — adapted from github.com/Leonxlnx/taste-skill (design-taste-frontend).
// Provides anti-AI-slop visual rules + a creative arsenal of premium patterns.
// Loaded alongside design.md and concatenated into the prompt's {{designSkill}}.
const TASTE_SKILL_PATH = resolve(__dirname, '..', 'skills', 'taste-frontend.md');

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

  // Load both design skills and concatenate. design.md = project-specific
  // (Astro stack, dental vertical). taste-frontend.md = generic premium-UI
  // rules (anti-AI-slop, typography, color, motion guardrails). Both flow
  // into the same {{designSkill}} template slot.
  const skillParts = [];
  try {
    skillParts.push(await readFile(DESIGN_SKILL_PATH, 'utf-8'));
  } catch {
    console.warn('  Warning: Could not load design.md — proceeding without it.');
  }
  try {
    skillParts.push(await readFile(TASTE_SKILL_PATH, 'utf-8'));
  } catch {
    console.warn('  Warning: Could not load taste-frontend.md — proceeding without it.');
  }
  const designSkill = skillParts.join('\n\n---\n\n');

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

    // OBSERVE vs DECIDE boundary:
    //   merged.currentDesign = the OBSERVED current look (set by synthesize) —
    //     it is the baseline this redesign reacts to and must NEVER be mutated here.
    //   merged.brand         = the DECIDED new system the build consumes — we write here.
    // We deliberately do not touch merged.currentDesign so the observed record
    // survives downstream (the design-eval / before-after both rely on it).
    const observedBefore = merged.currentDesign ? JSON.stringify(merged.currentDesign) : null;

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

    // Guarantee the observed record was not disturbed.
    if (observedBefore && JSON.stringify(merged.currentDesign) !== observedBefore) {
      console.warn('  [design] WARNING: currentDesign was mutated during redesign — restoring observed record.');
      merged.currentDesign = JSON.parse(observedBefore);
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

  // Existing design — prefer the rich OBSERVED profile (silver.currentDesign,
  // carried onto merged) so the redesign reacts to the full current look
  // (palette + roles, fonts, mood, era, brand strength) — not just hexes.
  const existingColors = renderCurrentDesign(merged.currentDesign) || (brand.colors
    ? Object.entries(brand.colors)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : 'No colors detected on current site.');

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
    .replace('{{colorExploration}}', 'let the practice\'s specialty and character decide — explore the full spectrum, do not default to teal/green')
    .replace('{{specialty}}', practice.medicalSpecialty || merged.practice?.medicalSpecialty || 'General Dentistry')
    .replace('{{positioning}}', audit?.positioning?.recommended || `${practice.medicalSpecialty || 'Dental'} practice — let its specialty and character drive the direction`)
    .replace('{{tone}}', audit?.tone?.recommended || (Array.isArray(merged.currentDesign?.mood) ? merged.currentDesign.mood.join(', ') : 'true to the practice\'s own character'))
    .replace('{{existingColors}}', existingColors)
    .replace('{{logoUrl}}', brand.logoPath || scraped?.images?.logo || 'Not found')
    .replace('{{aestheticNotes}}', aestheticNotes);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Color-family exploration seeds — break the "calm dental → teal" prior by
// rotating each practice into a different starting family (per-practice hash).
// This is an exploration starting point, NOT a decree: the prompt still lets the
// practice's character override it. Different practices → different seeds → spread.
const COLOR_FAMILIES = [
  'warm earth — terracotta, clay, ochre, warm sand',
  'cool refined — deep navy, forest green, slate, ink',
  'jewel — plum, emerald, deep teal, burgundy',
  'bold contrast — charcoal + warm amber, or near-black + a vivid accent',
  'fresh organic — sage, moss, warm stone, soft gold',
  'sunlit warm — coral, peach, marigold, soft brick',
];
function pickColorFamily(name) {
  let h = 0;
  for (const ch of String(name || 'practice')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_FAMILIES[h % COLOR_FAMILIES.length];
}

/** Render the observed currentDesign profile into a readable block for the prompt. */
function renderCurrentDesign(cd) {
  if (!cd || typeof cd !== 'object') return null;
  const lines = [];
  if (Array.isArray(cd.palette) && cd.palette.length) {
    lines.push('Current palette:');
    for (const p of cd.palette) lines.push(`  ${p.hex}${p.colorName ? ` (${p.colorName})` : ''} — ${p.role}${p.usage ? `: ${p.usage}` : ''}`);
  }
  if (cd.typography) {
    const t = cd.typography;
    lines.push(`Current fonts: heading "${t.headingFont || '?'}" (${t.headingStyle || '?'}), body "${t.bodyFont || '?'}"; scale ${t.scale || '?'}, weight ${t.weight || '?'}`);
  }
  if (cd.layoutStyle) lines.push(`Layout: ${cd.layoutStyle}`);
  if (cd.spacingDensity) lines.push(`Spacing density: ${cd.spacingDensity}`);
  if (Array.isArray(cd.mood) && cd.mood.length) lines.push(`Mood: ${cd.mood.join(', ')}`);
  if (cd.imageryStyle) lines.push(`Imagery: ${cd.imageryStyle}`);
  if (cd.era) lines.push(`Era/feel: ${cd.era}${cd.datednessNote ? ` — ${cd.datednessNote}` : ''}`);
  if (cd.brandStrength != null) lines.push(`Brand strength: ${cd.brandStrength}/5${cd.brandStrengthNote ? ` — ${cd.brandStrengthNote}` : ''}`);
  if (Array.isArray(cd.notableElements) && cd.notableElements.length) lines.push(`Notable: ${cd.notableElements.join('; ')}`);
  return lines.length ? lines.join('\n') : null;
}

function normalizeHex(val) {
  if (!val) return null;
  // Strip any trailing description text after the hex (e.g. "#1A3C5E — dominant brand color")
  const match = String(val).match(/#([0-9a-fA-F]{3,8})/);
  return match ? `#${match[1]}` : null;
}
