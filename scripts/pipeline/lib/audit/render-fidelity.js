/**
 * Deterministic render-fidelity check (production gate) — no API.
 *
 * Confirms the VERBATIM content the content-plan placed actually survives into
 * the built HTML. For each verbatim section it checks the heading or a
 * distinctive body shingle appears somewhere in dist/. Summary-placeholder
 * section types (testimonials/stats/team — bodies are counts/JSON, real content
 * renders in its own section) are excluded from the verbatim denominator.
 *
 *   checkRenderFidelity(contentPlan, distDir) → { verbatim:{found,total,pct}, optimizable:{...}, misses[] }
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function allHtmlText(dir, acc = { t: '' }) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) allHtmlText(p, acc);
    else if (e.endsWith('.html')) acc.t += ' ' + readFileSync(p, 'utf-8');
  }
  return acc;
}

const norm = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const SUMMARY_TYPES = new Set(['testimonials', 'stats', 'team']);

export function checkRenderFidelity(contentPlan, distDir) {
  const haystack = norm(allHtmlText(distDir).t);
  const present = (s) => { const n = norm(s); return n.length >= 3 && haystack.includes(n); };
  const shingle = (s) => norm(s).split(' ').filter(Boolean).slice(0, 6).join(' ');

  let vTotal = 0, vFound = 0, oTotal = 0, oFound = 0;
  const misses = [];
  for (const page of contentPlan?.pages || []) {
    for (const sec of page.sections || []) {
      if (SUMMARY_TYPES.has(sec.type)) continue;
      const probe = sec.body || sec.heading;
      if (!probe || probe.length < 4) continue;
      const ok = present(sec.heading) || (sec.body && present(shingle(sec.body)));
      if (sec.source === 'verbatim') {
        vTotal++; if (ok) vFound++; else misses.push(`${page.slug} :: ${sec.type} :: ${(sec.heading || sec.body).slice(0, 50)}`);
      } else { oTotal++; if (ok) oFound++; }
    }
  }
  const pct = (f, t) => (t ? +(f / t * 100).toFixed(1) : 100);
  return {
    verbatim: { found: vFound, total: vTotal, pct: pct(vFound, vTotal) },
    optimizable: { found: oFound, total: oTotal, pct: pct(oFound, oTotal) },
    misses,
  };
}

export default checkRenderFidelity;
