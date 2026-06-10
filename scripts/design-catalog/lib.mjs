/**
 * lib.mjs — shared helpers for the design-catalog ingest agent.
 *
 * - loadSchema / validateAgainstSchema: the mechanical contract check (draft-07 subset)
 * - mechanicalEval: code-enforced eval criteria (residue greps, coverage, linkage rules)
 * - image + JSON helpers
 *
 * Eval criteria are documented in docs/design-catalog/EVAL.md — keep in sync.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

const __dir = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dir, '..', '..');
export const CATALOG_DIR = join(ROOT, 'docs', 'design-catalog');

dotenvConfig({ path: join(ROOT, '.env'), override: true });

export const MODEL = 'claude-sonnet-4-6';

// ── Schema validation (draft-07 subset: type/enum/const/required/pattern/items/additionalProperties) ──

export async function loadSchema() {
  return JSON.parse(await readFile(join(CATALOG_DIR, 'schema.json'), 'utf8'));
}

export function validateAgainstSchema(schema, data, path = 'entry', errs = []) {
  const s = schema, d = data, p = path;
  if (s.const !== undefined && d !== s.const) errs.push(`${p}: expected ${JSON.stringify(s.const)}, got ${JSON.stringify(d)}`);
  if (s.enum && !s.enum.includes(d)) errs.push(`${p}: ${JSON.stringify(d)} not in enum [${s.enum.join(', ')}]`);
  if (s.pattern && typeof d === 'string' && !new RegExp(s.pattern).test(d)) errs.push(`${p}: "${d}" fails pattern ${s.pattern}`);
  if (s.type) {
    const ok = s.type === 'array' ? Array.isArray(d)
      : s.type === 'object' ? (d && typeof d === 'object' && !Array.isArray(d))
      : typeof d === s.type;
    if (!ok) { errs.push(`${p}: expected ${s.type}, got ${Array.isArray(d) ? 'array' : typeof d}`); return errs; }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    for (const r of (s.required || [])) if (!(r in d)) errs.push(`${p}: missing required "${r}"`);
    if (s.additionalProperties === false)
      for (const k of Object.keys(d)) if (!(s.properties && k in s.properties)) errs.push(`${p}: unexpected property "${k}"`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in d) validateAgainstSchema(sub, d[k], `${p}.${k}`, errs);
    if (s.additionalProperties && typeof s.additionalProperties === 'object')
      for (const k of Object.keys(d)) if (!(s.properties && k in s.properties)) validateAgainstSchema(s.additionalProperties, d[k], `${p}.${k}`, errs);
  }
  if (Array.isArray(d)) {
    if (s.minItems && d.length < s.minItems) errs.push(`${p}: needs ≥${s.minItems} items`);
    if (s.items) d.forEach((it, i) => validateAgainstSchema(s.items, it, `${p}[${i}]`, errs));
  }
  return errs;
}

// ── Mechanical eval (criteria M1–M6; see EVAL.md) ──────────────────────────

/** Walk all string values with their dotted paths. */
function* walkStrings(obj, path = '') {
  if (typeof obj === 'string') { yield [path, obj]; return; }
  if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) yield* walkStrings(obj[i], `${path}[${i}]`); return; }
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) yield* walkStrings(v, path ? `${path}.${k}` : k);
}

const REFERENCE_PATHS = /(^|\.)(source\.|tokens\.color\.reference|tokens\.type\.reference)/;
const INDUSTRY_RESIDUE = /\b(add to cart|cart|checkout|sku|e-?commerce|webshop|storefront|wishlist|basket|best ?seller|free shipping|order now|product (page|grid|detail)|shop now|our (products|menu)|pricing plans?|subscription tiers?)\b/i;

/** RGB euclidean distance between two #rrggbb hexes. */
function hexDist(a, b) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** All hexes a style probe observed (palette census + buttons + chrome). */
export function probeHexes(probe) {
  const out = new Set();
  const add = h => { if (/^#[0-9a-f]{6}$/i.test(h || '')) out.add(h.toLowerCase()); };
  add(probe.pageBackground);
  for (const x of probe.backgroundsByArea || []) add(x.value);
  for (const x of probe.textColorsByArea || []) add(x.value);
  for (const b of probe.buttons || []) { add(b.background); add(b.color); }
  for (const h of probe.headings || []) add(h.color);
  add(probe.chrome?.nav?.background); add(probe.chrome?.footer?.background); add(probe.chrome?.footer?.color);
  return [...out];
}

export async function mechanicalEval(entry, schema, { probe = null } = {}) {
  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, pass, detail });

  // M1 — schema validity
  const errs = validateAgainstSchema(schema, entry);
  add('M1-schema', errs.length === 0, errs.length ? errs.join('; ') : 'valid');
  if (errs.length) return { pass: false, checks }; // structural failure — other checks unreliable

  // M2 — hex residue: literal colors may live ONLY in reference fields / source
  const hexLeaks = [];
  for (const [p, s] of walkStrings(entry)) {
    if (REFERENCE_PATHS.test(p)) continue;
    if (/#[0-9a-fA-F]{3,8}\b/.test(s)) hexLeaks.push(p);
  }
  add('M2-hex-residue', hexLeaks.length === 0, hexLeaks.length ? `literal hex outside reference fields: ${hexLeaks.join(', ')}` : 'clean');

  // M3 — industry residue in free text
  const industryLeaks = [];
  for (const [p, s] of walkStrings(entry)) {
    if (REFERENCE_PATHS.test(p)) continue;
    const m = s.match(INDUSTRY_RESIDUE);
    if (m) industryLeaks.push(`${p} ("${m[0]}")`);
  }
  add('M3-industry-residue', industryLeaks.length === 0, industryLeaks.length ? industryLeaks.join(', ') : 'clean');

  // M4 — coverage depth (schema guarantees presence; this guards against stubs)
  const comp = entry.layout?.composition || {};
  const thin = ['hero', 'nav', 'footer'].filter(k => (comp[k] || '').length < 40);
  const fcs = entry.audit?.fidelityChecks || [];
  add('M4-coverage-depth',
    thin.length === 0 && fcs.length >= 3 && (entry.selection?.adjectives || []).length >= 3,
    thin.length ? `composition too thin (<40 chars): ${thin.join(', ')}`
      : fcs.length < 3 ? `only ${fcs.length} fidelityChecks (need ≥3)` : 'ok');

  // M5 — linkage + internal consistency rules
  const gaps = entry.fidelity?.gaps || [];
  const sanc = entry.audit?.sanctionedPatterns || [];
  const novel = entry.layout?.novel || [];
  const m5 = [];
  if (sanc.includes('gradient-accent') && !gaps.some(g => g.type === 'token' && /gradient/i.test(g.detail)))
    m5.push('gradient-accent sanctioned but no token gap for gradient rendering');
  if (entry.tokens?.color?.strategy?.theme === 'dark' && entry.fidelity?.theme !== 'needs-dark-support')
    m5.push('dark theme but fidelity.theme !== needs-dark-support');
  if (novel.length && entry.fidelity?.layout === 'full')
    m5.push('novel[] sections present but fidelity.layout claims "full"');
  for (const n of novel) {
    // Word-overlap match: a variant gap "covers" a novel entry when it shares ≥2
    // significant words with the novel's name/section (exact-substring proved brittle).
    const words = `${n.section || ''} ${n.name || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const covered = gaps.some(g => g.type === 'variant'
      && words.filter(w => g.detail.toLowerCase().includes(w)).length >= Math.min(2, words.length));
    if (!covered)
      m5.push(`novel "${n.name}" (${n.section}) has no matching variant gap (a gap of type "variant" must describe it)`);
  }
  const isA = entry.fidelity?.phase === 'A';
  const shouldBeA = entry.fidelity?.layout === 'full' && entry.fidelity?.theme === 'light-native' && gaps.length === 0;
  if (isA !== shouldBeA) m5.push(`phase ${entry.fidelity?.phase} inconsistent with layout=${entry.fidelity?.layout}, theme=${entry.fidelity?.theme}, gaps=${gaps.length}`);
  add('M5-linkage', m5.length === 0, m5.length ? m5.join('; ') : 'consistent');

  // M6 — eyebrow policy consistency (the reference decides; the entry must be coherent about it)
  const eyebrow = entry.tokens?.type?.heading?.eyebrow;
  const m6 = [];
  if (eyebrow === 'every-section' && !sanc.includes('eyebrow-above-heading'))
    m6.push('eyebrow=every-section but eyebrow-above-heading not sanctioned');
  if (eyebrow === 'none' && !fcs.some(c => /eyebrow|kicker/i.test(c)))
    m6.push('eyebrow=none but no fidelityCheck banning kickers');
  if (!eyebrow) m6.push('tokens.type.heading.eyebrow missing (none|sparing|every-section)');
  add('M6-eyebrow-policy', m6.length === 0, m6.length ? m6.join('; ') : 'coherent');

  // M7 — reference-hex accuracy vs the computed-style probe (URL mode only).
  // Every tokens.color.reference hex must be near a color the live DOM actually used.
  if (probe) {
    const observed = probeHexes(probe);
    const drifted = [];
    for (const [role, hex] of Object.entries(entry.tokens?.color?.reference || {})) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) { drifted.push(`${role}: "${hex}" not a 6-digit hex`); continue; }
      const nearest = Math.min(...observed.map(o => hexDist(hex.toLowerCase(), o)));
      if (nearest > 70) drifted.push(`${role}: ${hex} is ${Math.round(nearest)} RGB-units from any observed color`);
    }
    add('M7-color-accuracy', drifted.length === 0, drifted.length ? drifted.join('; ') : `all reference hexes within tolerance of ${observed.length} observed colors`);
  }

  return { pass: checks.every(c => c.pass), checks };
}

// ── Image + JSON helpers ────────────────────────────────────────────────────

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

export async function loadImage(path) {
  const mediaType = MEDIA[extname(path).toLowerCase()];
  if (!mediaType) throw new Error(`Unsupported image type: ${path}`);
  const data = (await readFile(path)).toString('base64');
  if (data.length > 5_000_000) throw new Error(`Image too large for API (${(data.length / 1e6).toFixed(1)}MB base64): ${path}`);
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

export function parseJsonLoose(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const f = text.indexOf('{'), l = text.lastIndexOf('}');
  if (f !== -1 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch {} }
  return null;
}

export async function ai(phase, { system, content, maxTokens = 8192, temperature = 0.2 }) {
  const { callAnthropic } = await import(join(ROOT, 'scripts', 'pipeline', 'lib', 'ai-call.js'));
  const res = await callAnthropic({
    phase, model: MODEL, maxTokens, temperature, system,
    messages: [{ role: 'user', content }],
  });
  return res;
}
