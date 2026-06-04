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
  return parsed.brandDna || parsed;
}
