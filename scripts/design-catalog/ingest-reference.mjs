/**
 * ingest-reference.mjs — the design-system ingest agent.
 *
 * Screenshot(s) in → validated, judged catalog entry out.
 *
 * Pipeline (gates between stages, adapted from the Claude Design agent spec's
 * grounding discipline + our extraction contract):
 *
 *   A. SOURCE AUDIT  — vision pass producing a grounding document (palette w/
 *      locations, type anatomy, geometry, motifs, chrome, voice verbatims,
 *      visibility map). Nothing downstream may contradict it.
 *   B. EXTRACT       — vision + audit → { entry, grounding } per schema v1.2,
 *      every decision classed observed | implied | invented.
 *   C. VALIDATE      — mechanical M1–M6; schema errors fed back for repair (≤2).
 *   D. JUDGE         — adversarial vision judge J1–J7 (eval-entry.mjs).
 *   E. REVISE        — failed criteria + fixes fed back; loop to C. (≤ --max-iters)
 *
 * Artifacts per run: docs/design-catalog/runs/<slug>-<ts>/
 *   audit.json, iter-N.entry.json, iter-N.eval.json, entry.json (final), report.md
 *
 * CLI: node scripts/design-catalog/ingest-reference.mjs <screenshot...> \
 *        [--id <slug>] [--max-iters 4] [--out <dir>]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { CATALOG_DIR, loadSchema, validateAgainstSchema, mechanicalEval, loadImage, parseJsonLoose, ai } from './lib.mjs';
import { runEval } from './eval-entry.mjs';

// ── Stage A: source audit ───────────────────────────────────────────────────

const AUDIT_SYSTEM = `You are a meticulous design auditor. You study screenshots of a website and
produce a grounding document — raw observations only, no design-system output yet. Everything a
later extraction step claims must trace back to this audit.

Discipline (each rule exists because its violation was observed in practice):
- SAMPLE, DON'T REMEMBER. Report colors as the hexes you actually perceive in the image, located
  ("primary button fill", "page background", "heading text"). Never substitute a remembered palette.
- The source's own system always wins. If a convention exists in your general knowledge but NOT in
  this screenshot (eyebrow labels, icon tiles, pill navbars, left-logo), DO NOT report it.
- Audit each element's shape separately (buttons can be pills while cards are squares).
- For every accent color, list exactly which elements use it.
- Typographic DEVICES are motifs: italic mixes, weight shifts, parenthetical marks, small-caps.
- Mark what is NOT visible. Never describe a footer you cannot see.`;

async function stageAudit(imageBlocks) {
  const res = await ai('catalog-audit', {
    system: AUDIT_SYSTEM,
    maxTokens: 4000,
    temperature: 0.1,
    content: [
      ...imageBlocks,
      { type: 'text', text: `Audit the screenshot(s) above. Return ONLY JSON:
{
  "brand": { "apparentName": "...", "industry": "...", "oneLineLanguage": "<the design language in one sentence>" },
  "palette": [ { "hex": "#...", "role": "page background|card surface|primary button|heading text|body text|border|accent|...", "where": "<located in image>", "usageShare": "dominant|secondary|sparing" } ],
  "typography": {
    "displayClassification": "serif|grotesque|geometric|humanist|mono", "displayEvidence": "<letterform observations>",
    "weightsObserved": [..], "italicUsage": "<none | decorative | semantic — where>",
    "casing": "<sentence|title|uppercase — where>",
    "eyebrow": "none|sparing|every-section", "eyebrowEvidence": "<where, or why none>",
    "emphasisDevice": "<the actual device: italic phrase / weight mix / color word / scale only>"
  },
  "geometry": { "radii": [ { "element": "button|card|image|chip", "estimate": "sharp|sm|md|lg|pill" } ], "density": "airy|balanced|dense", "borders": "<hairline/standard/none + where>", "shadows": "<character or none>" },
  "chrome": {
    "nav": "<logo position, link treatment, CTA, shape — or 'not visible'>",
    "footer": "<structure, ground, links — or 'not visible'>"
  },
  "motifs": [ "<recurring device, one per line: how cards look, image framing, label treatment, badge shapes>" ],
  "sectionsVisible": [ { "sourceName": "<what it is in the source>", "visible": true } ],
  "voice": { "verbatims": ["<3-6 actual strings from the image>"], "register": "<derived: person, formality, rhythm>" },
  "notVisible": ["<sections/elements that canNOT be observed and must be inferred downstream>"]
}` },
    ],
  });
  const audit = parseJsonLoose(res.text);
  if (!audit?.palette || !audit?.typography) throw new Error(`audit stage unparsable: ${res.text.slice(0, 300)}`);
  return { audit, cost: res.cost };
}

// ── Stage B: extract ────────────────────────────────────────────────────────

async function buildExtractionPrompt() {
  const promptMd = await readFile(join(CATALOG_DIR, 'extraction-prompt.md'), 'utf8');
  const schema = (await readFile(join(CATALOG_DIR, 'schema.json'), 'utf8')).trim();
  const fence = promptMd.match(/```\n([\s\S]*?)\n```/);
  if (!fence) throw new Error('no fenced prompt in extraction-prompt.md');
  return fence[1].replace('[paste docs/design-catalog/schema.json here]', schema);
}

async function stageExtract({ imageBlocks, audit, entryId, feedback = null, priorEntry = null }) {
  const base = await buildExtractionPrompt();
  const parts = [
    `## Grounding audit (produced from the same screenshots — every claim you make must trace to it; if you contradict it, you must be correcting it against the image and say so in grounding notes)\n\`\`\`json\n${JSON.stringify(audit, null, 2)}\n\`\`\``,
    `Use "${entryId}" as the entry id.`,
    `In addition to the entry, classify your decisions (the grounding discipline):
- observed: visible in the screenshots
- implied: not visible but strongly suggested; implemented conservatively in the source's spirit
- invented: required for completeness (e.g. a section the screenshot doesn't show); flagged

Return ONLY JSON: { "entry": <the catalog entry>, "grounding": { "observed": ["<field: basis>"], "implied": ["<field: basis>"], "invented": ["<field: basis>"] } }`,
  ];
  if (feedback) parts.push(`## REVISION — your previous attempt failed evaluation. Fix EVERY item below without regressing anything else. Previous entry:\n\`\`\`json\n${JSON.stringify(priorEntry, null, 2)}\n\`\`\`\n\nFailures to fix:\n${feedback}`);

  const res = await ai('catalog-extract', {
    maxTokens: 8192,
    temperature: feedback ? 0.1 : 0.3,
    content: [...imageBlocks, { type: 'text', text: `${base}\n\n${parts.join('\n\n')}` }],
  });
  const parsed = parseJsonLoose(res.text);
  if (!parsed?.entry) throw new Error(`extract stage unparsable: ${res.text.slice(0, 300)}`);
  return { entry: parsed.entry, grounding: parsed.grounding || null, cost: res.cost };
}

// ── Stage C: schema repair (mechanical errors only) ─────────────────────────

async function repairEntry({ entry, errors, imageBlocks }) {
  const res = await ai('catalog-repair', {
    maxTokens: 8192,
    temperature: 0,
    content: [...imageBlocks, { type: 'text', text: `This catalog entry failed mechanical validation. Fix ONLY the listed problems; change nothing else. Return ONLY the corrected entry JSON (no wrapper).

Entry:
\`\`\`json
${JSON.stringify(entry, null, 2)}
\`\`\`

Problems:
${errors.map(e => `- ${e}`).join('\n')}` }],
  });
  const fixed = parseJsonLoose(res.text);
  if (!fixed) throw new Error('repair stage unparsable');
  return { entry: fixed.entry || fixed, cost: res.cost };
}

// ── Orchestration ───────────────────────────────────────────────────────────

export async function ingestReference({ images, entryId, maxIters = 4, outDir }) {
  const schema = await loadSchema();
  const imageBlocks = await Promise.all(images.map(loadImage));
  await mkdir(outDir, { recursive: true });
  const log = (m) => console.log(`[ingest] ${m}`);
  let totalCost = 0;
  const history = [];

  log(`stage A: source audit (${images.length} image(s))`);
  const { audit, cost: auditCost } = await stageAudit(imageBlocks);
  totalCost += auditCost;
  await writeFile(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));
  log(`audit: ${audit.palette.length} colors, type=${audit.typography.displayClassification}, eyebrow=${audit.typography.eyebrow}, ${audit.motifs?.length ?? 0} motifs`);

  let entry = null, grounding = null, feedback = null, finalEval = null;

  for (let iter = 1; iter <= maxIters; iter++) {
    log(`stage B: extract (iteration ${iter}/${maxIters}${feedback ? ', revising' : ''})`);
    const ext = await stageExtract({ imageBlocks, audit, entryId, feedback, priorEntry: entry });
    entry = ext.entry; grounding = ext.grounding; totalCost += ext.cost;

    // Stage C — mechanical gate with repair
    for (let r = 0; r < 2; r++) {
      const errs = validateAgainstSchema(schema, entry);
      const mech = errs.length ? null : await mechanicalEval(entry, schema);
      const problems = errs.length ? errs : (mech.pass ? [] : mech.checks.filter(c => !c.pass).map(c => `${c.id}: ${c.detail}`));
      if (!problems.length) break;
      if (r === 1) { log(`mechanical problems persist after repair: ${problems.join(' | ')}`); break; }
      log(`stage C: repairing ${problems.length} mechanical problem(s): ${problems.map(p => p.split(':')[0]).join(', ')}`);
      const rep = await repairEntry({ entry, errors: problems, imageBlocks });
      entry = rep.entry; totalCost += rep.cost;
    }
    await writeFile(join(outDir, `iter-${iter}.entry.json`), JSON.stringify(entry, null, 2));

    log(`stage D: judge`);
    const ev = await runEval({ entry, grounding, imageBlock: imageBlocks[0] });
    totalCost += ev.cost || 0;
    await writeFile(join(outDir, `iter-${iter}.eval.json`), JSON.stringify(ev, null, 2));
    const failed = [...ev.mechanical.filter(c => !c.pass).map(c => `[${c.id}] ${c.detail}`),
                    ...ev.judged.filter(c => !c.pass).map(c => `[${c.id} ${c.score}/5] ${c.evidence}${c.fix ? ` → FIX: ${c.fix}` : ''}`)];
    history.push({ iter, pass: ev.pass, failed: failed.length, scores: Object.fromEntries(ev.judged.map(c => [c.id, c.score])) });
    log(`eval: ${ev.pass ? 'PASS' : `FAIL (${failed.length} criteria)`} — ${ev.summary}`);
    finalEval = ev;

    if (ev.pass) break;
    feedback = failed.join('\n');
  }

  await writeFile(join(outDir, 'entry.json'), JSON.stringify(entry, null, 2));
  const report = [
    `# Ingest report — ${entryId}`, '',
    `Result: **${finalEval.pass ? 'PASS' : 'FAIL'}** after ${history.length} iteration(s) · est. cost $${totalCost.toFixed(2)}`, '',
    `Signature elements (judge): ${(finalEval.signatureElements || []).join(' · ') || '(none listed)'}`, '',
    '| iter | result | failed | ' + finalEval.judged.map(c => c.id.replace('J', 'J').split('-')[0]).join(' | ') + ' |',
    '|---|---|---|' + finalEval.judged.map(() => '---').join('|') + '|',
    ...history.map(h => `| ${h.iter} | ${h.pass ? 'pass' : 'fail'} | ${h.failed} | ${Object.values(h.scores).join(' | ')} |`),
    '',
    '## Final eval', '',
    ...finalEval.mechanical.map(c => `- ${c.pass ? '✓' : '✗'} **${c.id}** — ${c.detail}`),
    ...finalEval.judged.map(c => `- ${c.pass ? '✓' : '✗'} **${c.id}** (${c.score}/5) — ${c.evidence}${c.fix ? `\n  - fix: ${c.fix}` : ''}`),
  ].join('\n');
  await writeFile(join(outDir, 'report.md'), report);
  return { entry, eval: finalEval, history, totalCost, outDir };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const images = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
  if (!images.length) { console.error('usage: ingest-reference.mjs <screenshot...> [--id slug] [--max-iters 4] [--out dir]'); process.exit(2); }
  const entryId = opt('id', basename(images[0]).replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = opt('out', join(CATALOG_DIR, 'runs', `${entryId}-${ts}`));
  const r = await ingestReference({ images, entryId, maxIters: Number(opt('max-iters', 4)), outDir });
  console.log(`\n${r.eval.pass ? 'PASS' : 'FAIL'} — entry + report in ${r.outDir}`);
  process.exit(r.eval.pass ? 0 : 1);
}
