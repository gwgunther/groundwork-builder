/**
 * Define Brand — brand-dna (visual identity, single source of truth).
 *
 * Input:  merged.currentDesign (the OBSERVED current look) + design skills.
 * Output: { color{roles}, typography{families+scale}, shape, elevation, rationale }
 *
 * Goal: ELEVATE the practice's own existing visual identity into a coherent,
 * accessible, modern design system — refine and modernize, do NOT replace its
 * character, and do NOT inject category defaults (no "pediatric→playful" rules).
 * Motion is a fixed meta-system default (handled at build), not generated here.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAnthropic, parseJsonStrict, MODELS } from '../ai-silver/shared.js';
import { pickFontPairing } from './font-pairings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = resolve(__dirname, 'prompts', 'brand-dna.md');
const SKILL_DESIGN = resolve(__dirname, '..', '..', 'skills', 'design.md');
const SKILL_TASTE = resolve(__dirname, '..', '..', 'skills', 'taste-frontend.md');

function renderCurrentDesign(cd) {
  if (!cd) return '(no current design observed)';
  const L = [];
  if (Array.isArray(cd.palette)) { L.push('Current palette:'); for (const p of cd.palette) L.push(`  ${p.hex}${p.colorName ? ` (${p.colorName})` : ''} — ${p.role}${p.usage ? `: ${p.usage}` : ''}`); }
  if (cd.typography) L.push(`Current fonts: heading "${cd.typography.headingFont}" (${cd.typography.headingStyle}), body "${cd.typography.bodyFont}"; scale ${cd.typography.scale}, weight ${cd.typography.weight}`);
  if (cd.layoutStyle) L.push(`Layout feel: ${cd.layoutStyle}`);
  if (cd.spacingDensity) L.push(`Density: ${cd.spacingDensity}`);
  if (Array.isArray(cd.mood)) L.push(`Mood: ${cd.mood.join(', ')}`);
  if (cd.era) L.push(`Era: ${cd.era}${cd.datednessNote ? ` — ${cd.datednessNote}` : ''}`);
  if (cd.brandStrength != null) L.push(`Brand strength: ${cd.brandStrength}/5`);
  if (Array.isArray(cd.notableElements)) L.push(`Notable: ${cd.notableElements.join('; ')}`);
  return L.join('\n');
}

export async function defineBrandDna(merged) {
  const cd = merged.currentDesign;
  const [tmpl, designSkill, tasteSkill] = await Promise.all([
    readFile(PROMPT, 'utf-8'),
    readFile(SKILL_DESIGN, 'utf-8').catch(() => ''),
    readFile(SKILL_TASTE, 'utf-8').catch(() => ''),
  ]);

  const prompt = tmpl
    .replace('{{currentDesign}}', renderCurrentDesign(cd))
    .replace('{{designSkill}}', `${designSkill}\n\n${tasteSkill}`.slice(0, 12000));

  const { text } = await callAnthropic({ model: MODELS.default, prompt, maxTokens: 2000 });
  let parsed;
  try { parsed = parseJsonStrict(text); } catch { return null; }
  const dna = parsed?.brandDna ?? parsed;
  if (!dna || typeof dna !== 'object') return null;

  // CONVERGENCE FIX: the LLM font pick collapses to its priors regardless of
  // temperature (Nunito Sans 5/5, then Libre Franklin 5/5). Override it with a
  // curated, vetted pairing chosen deterministically — classify the practice's
  // type CHARACTER from the observed currentDesign, then seed a pick within that
  // bucket (per-practice, reproducible, varied). Colors stay LLM-derived (they're
  // grounded in the observed palette and DON'T collapse). Keep the LLM's scale/
  // weights/tracking. See lib/brand/font-pairings.js.
  dna.typography = dna.typography || {};
  const seedKey = merged.practice?.name || merged.practice?.domain || '';
  const pick = pickFontPairing(cd || {}, seedKey);
  dna.typography.headingFont = pick.headingFont;
  dna.typography.bodyFont = pick.bodyFont;
  dna.typography.fontProvider = pick.provider;
  dna.typography._fontBucket = pick.bucket;
  return dna;
}

/** When brand-dna AI fails, derive a minimal palette from scraped brand colors. */
export function fallbackBrandDnaFromMerged(merged) {
  const c = merged.brand?.colors || {};
  const fonts = merged.brand?.fonts || {};
  const seedKey = merged.practice?.name || merged.practice?.domain || '';
  const pick = pickFontPairing(merged.currentDesign || {}, seedKey);
  return {
    color: {
      primary: c.primary || '#1B3A5C',
      secondary: c.secondary || c.primary || '#2E6DA4',
      accent: c.accent || '#C9A84C',
      neutralDark: c.dark || '#1c1a1a',
      neutralLight: c.light || '#EBF2FA',
      background: '#ffffff',
      text: '#2e2c2c',
      border: '#d6e8ed',
    },
    typography: {
      headingFont: fonts.heading || pick.headingFont,
      bodyFont: fonts.body || pick.bodyFont,
      // provider only applies when the PICK's fonts are used — scraped brand
      // fonts (fonts.heading/body) are assumed Google-resolvable as before.
      fontProvider: (fonts.heading || fonts.body) ? 'google' : pick.provider,
      _fontBucket: pick.bucket,
    },
    shape: { cornerRadius: 'md', borderTreatment: 'standard' },
    elevation: { system: 'soft-shadow' },
    rationale: 'Fallback palette from scraped brand (brand-dna step unavailable).',
  };
}
