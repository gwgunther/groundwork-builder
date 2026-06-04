/**
 * Deterministic anti-slop scan (production gate) — no API.
 *
 * Scans a built site's DESIGN SURFACE (rendered HTML + authored global.css) for
 * high-confidence "AI slop" tells from design-principles-core.md. Does NOT scan
 * the Tailwind framework CSS bundle (its utility class definitions are all false
 * positives). Low-false-positive rules only; fuzzy ones (gray-on-color,
 * card-in-card depth) are left to the vision judge.
 *
 *   scanAntiSlop(distDir, authoredCssPath?) → { total, hits: { id: {count, desc, sample} }, files }
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function collectHtml(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) collectHtml(p, acc);
    else if (e.endsWith('.html')) acc.push(p);
  }
  return acc;
}

// True pictographic emoji only (🦷😀🚀…) — NOT typographic glyphs (→ ★ ✓), which
// are acceptable UI and a vision-judge nit at most.
const EMOJI = /[\u{1F300}-\u{1FAFF}]/u;

export const ANTI_SLOP_RULES = [
  { id: 'pure-black', desc: 'pure #000 / black (use charcoal)', re: /\b(?:bg|text|border)-black\b|#000000\b|#000\b(?![0-9a-f])|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi },
  { id: 'inter-font', desc: 'Inter font (overused AI default)', re: /\bInter\b(?!\s*Tight)/g },
  { id: 'neon-purple-gradient', desc: 'purple/neon gradient', re: /(?:from|to|via)-(?:purple|violet|fuchsia)-\d|linear-gradient[^;}'"]*(?:#a855f7|#8b5cf6|#d946ef|rebeccapurple)/gi },
  { id: 'emoji', desc: 'pictographic emoji in output', re: new RegExp(EMOJI, 'gu') },
  { id: 'bounce-easing', desc: 'bounce/overshoot easing (dated)', re: /cubic-bezier\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*(?:1\.[1-9]|[2-9])/g },
  { id: 'placeholder-leak', desc: 'TODO/Lorem/[X] leak in markup', re: /\bLorem ipsum\b|<!--[^>]*TODO|>\s*TODO\b|\[X\]/gi },
];

export function scanAntiSlop(distDir, authoredCssPath = null) {
  const files = collectHtml(distDir);
  if (authoredCssPath && existsSync(authoredCssPath)) files.push(authoredCssPath);
  const blob = files.map((f) => readFileSync(f, 'utf-8')).join('\n');
  const hits = {};
  let total = 0;
  for (const r of ANTI_SLOP_RULES) {
    const m = blob.match(r.re);
    const n = m ? m.length : 0;
    if (n) { hits[r.id] = { count: n, desc: r.desc, sample: m.slice(0, 3) }; total += n; }
  }
  return { total, hits, files: files.length };
}

export default scanAntiSlop;
