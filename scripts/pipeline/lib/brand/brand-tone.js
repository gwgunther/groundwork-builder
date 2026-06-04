/**
 * Define Brand — brand-tone (verbal identity, lightweight reference).
 *
 * Input:  scraped copy (headlines, about, testimonials, body).
 * Output: { voice[], notes, examples[] }
 *
 * This is a small SUMMARY used only as a fallback when net-new copy must be
 * written — the primary strategy is reusing the practice's existing copy
 * verbatim. `examples` are real verbatim lines that anchor the voice.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAnthropic, parseJsonStrict, MODELS } from '../ai-silver/shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = resolve(__dirname, 'prompts', 'brand-tone.md');

function collectCopy(merged) {
  const c = merged.content || {};
  const lines = [];
  if (c.heroTagline) lines.push(c.heroTagline);
  if (c.heroSubheadline) lines.push(c.heroSubheadline);
  if (c.aboutText) lines.push(c.aboutText);
  if (c.philosophy) lines.push(c.philosophy);
  if (c.valueProp) lines.push(c.valueProp);
  for (const t of (c.testimonials || []).slice(0, 4)) if (t.text) lines.push(`"${t.text}"`);
  for (const a of (c.additionalContent || []).slice(0, 6)) if (a.content) lines.push(a.content);
  for (const tg of (c.taglines || []).slice(0, 6)) lines.push(tg);
  return lines.join('\n\n').slice(0, 9000);
}

export async function defineBrandTone(merged) {
  const copy = collectCopy(merged);
  if (!copy.trim()) return { voice: [], notes: 'No copy available', examples: [] };
  const tmpl = await readFile(PROMPT, 'utf-8');
  const prompt = tmpl.replace('{{copy}}', copy);
  const { text } = await callAnthropic({ model: MODELS.default, prompt, maxTokens: 1200 });
  let parsed;
  try { parsed = parseJsonStrict(text); } catch { return null; }
  return parsed.brandTone || parsed;
}
