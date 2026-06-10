/**
 * eval-entry.mjs — evaluate a catalog entry against its source screenshot.
 *
 * Two tiers (docs/design-catalog/EVAL.md):
 *   Mechanical M1–M6 (code, free, deterministic)  — lib.mjs#mechanicalEval
 *   Judged J1–J7 (vision LLM, screenshot + entry) — this file
 *
 * Overall pass = every M passes AND every J scores ≥ 4/5.
 *
 * CLI: node scripts/design-catalog/eval-entry.mjs <entry.json> <screenshot.png>
 */
import { readFile } from 'node:fs/promises';
import { loadSchema, mechanicalEval, loadImage, parseJsonLoose, ai } from './lib.mjs';

const JUDGE_SYSTEM = `You are a strict design-extraction judge. You compare a SOURCE SCREENSHOT
against a "design catalog entry" — a de-branded, dental-translated design system extracted from it.
You do NOT judge whether the source is good design (it was curated by a human). You judge whether
the EXTRACTION is faithful, honest, and usable.

Be adversarial: default to failing a criterion when evidence is weak. A plausible-sounding entry
that would equally describe a different website MUST fail J1. Award 5 only for precise, verifiable
capture. Score 4 = passes with minor imprecision. 3 or below = fail.

Known extractor failure modes to hunt for (each has actually happened):
- NEUTRALIZATION: replacing the source's character with generic AI defaults (grotesque display,
  gray palette, eyebrow kickers, pill buttons) instead of capturing what is actually there.
- IMPORTED CONVENTIONS: describing devices the source does not use (e.g. claiming eyebrow labels
  or icon tiles that are not in the screenshot).
- "CLOSE" COLORS: reference hexes drifted from the visible pixels (wrong temperature or lightness
  family counts as drift; small tonal error is acceptable).
- SILENT FLATTENING: a signature element of the source (an unusual selector, an overlap, a
  distinctive footer) mapped to a generic variant with no novel[]/gaps entry admitting the loss.
- WRONG ACCENT ASSIGNMENT: promoting a rare accent into a workhorse role, or vice versa.`;

export const JUDGE_CRITERIA = [
  ['J1-character', 'CHARACTER CAPTURE (anti-neutralization). First, describe the source\'s design character yourself in one line (type class, temperature, materiality, emphasis device). Then: does the entry capture THAT character — correct type classification, color temperature/saturation, radius family, materiality? Would this entry clearly NOT describe a generic site or a site of the opposite character?'],
  ['J2-color', 'COLOR STRATEGY + REFERENCE ACCURACY. Does tokens.color.strategy match what is visible (theme, contrast level, saturation, how sparingly the accent is really used, surface strategy)? Are the reference hexes in the visible color families (temperature + lightness)? List any hex that is clearly wrong.'],
  ['J3-layout', 'LAYOUT FIDELITY. Are the nine variant picks the closest available enums to what the screenshot shows? Do composition.hero/nav/footer describe what is ACTUALLY visible (not invented)? If a section is not visible in the screenshot, is its pick a reasonable system-coherent inference rather than a fabricated observation?'],
  ['J4-heading-anatomy', 'HEADING ANATOMY. Does the eyebrow policy (none|sparing|every-section) match the screenshot? Is the stated emphasisDevice the device actually used (italic mix? weight shift? color word? scale only?)? Hunt specifically for imported eyebrows.'],
  ['J5-translation', 'DENTAL TRANSLATION. Is every free-text field written in dental-practice vocabulary? Are source-industry sections mapped sensibly (products→services etc.) or dropped? Does imagery.subjectTreatment describe practice subjects receiving the source\'s treatment?'],
  ['J6-honesty', 'HONESTY OF GAPS. List the source\'s 2-4 signature elements (the things that make it feel custom). For each: is it captured by a variant+composition, OR declared in novel[]/fidelity.gaps? Silent flattening of any signature element = fail.'],
  ['J7-checks', 'FIDELITY CHECKS QUALITY. Are there ≥3 fidelityChecks, each (a) verifiable from a build screenshot, (b) specific to THIS design (would fail for a generic build), (c) protecting a signature element or the eyebrow/theme policy?'],
];

export async function judgeEntry({ entry, grounding, imageBlocks, probe = null, phase = 'catalog-judge' }) {
  const res = await ai(phase, {
    system: JUDGE_SYSTEM,
    maxTokens: 4000,
    temperature: 0,
    content: [
      ...imageBlocks.slice(0, 4),
      { type: 'text', text: `Source screenshot${imageBlocks.length > 1 ? ` (${Math.min(imageBlocks.length, 4)} tiles, top-to-bottom)` : ''} above.${probe ? `\n\nComputed-style probe from the live DOM (EXACT values — treat as ground truth over your pixel estimates):\n\`\`\`json\n${JSON.stringify({ pageBackground: probe.pageBackground, backgroundsByArea: probe.backgroundsByArea, textColorsByArea: probe.textColorsByArea, fontsByArea: probe.fontsByArea, radiiHistogram: probe.radiiHistogram, headings: probe.headings, buttons: probe.buttons?.slice(0, 4), chrome: probe.chrome }, null, 1)}\n\`\`\`` : ''} The extracted catalog entry:\n\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\`\n${grounding ? `\nThe extractor's grounding notes (observed/implied/invented):\n\`\`\`json\n${JSON.stringify(grounding, null, 2)}\n\`\`\`\n` : ''}
Score each criterion 1-5 (4 = pass). Cite concrete evidence from the screenshot for every score.
For every score ≤ 3, the "fix" must be a specific, actionable edit to the entry.

Criteria:
${JUDGE_CRITERIA.map(([id, text]) => `${id}: ${text}`).join('\n\n')}

Return ONLY JSON:
{
  "criteria": { "<id>": { "score": 1-5, "evidence": "<concrete observation>", "fix": "<edit or null>" } },
  "signatureElements": ["<the 2-4 elements you identified for J6>"],
  "summary": "<one line>"
}` },
    ],
  });
  const parsed = parseJsonLoose(res.text);
  if (!parsed?.criteria) throw new Error(`judge returned unparsable output: ${res.text.slice(0, 300)}`);
  const judged = JUDGE_CRITERIA.map(([id]) => {
    const c = parsed.criteria[id] || { score: 0, evidence: 'missing from judge output', fix: 'judge omitted this criterion' };
    return { id, score: c.score, pass: c.score >= 4, evidence: c.evidence, fix: c.fix ?? null };
  });
  return { judged, signatureElements: parsed.signatureElements || [], summary: parsed.summary || '', usage: res.usage, cost: res.cost };
}

export async function runEval({ entry, grounding = null, imageBlock = null, imageBlocks = null, probe = null, phase = 'catalog-judge' }) {
  const blocks = imageBlocks || (imageBlock ? [imageBlock] : []);
  const schema = await loadSchema();
  const mech = await mechanicalEval(entry, schema, { probe });
  if (!mech.checks[0].pass) {
    return { pass: false, mechanical: mech.checks, judged: [], summary: 'schema-invalid — judge skipped' };
  }
  const j = await judgeEntry({ entry, grounding, imageBlocks: blocks, probe, phase });
  return {
    pass: mech.pass && j.judged.every(c => c.pass),
    mechanical: mech.checks,
    judged: j.judged,
    signatureElements: j.signatureElements,
    summary: j.summary,
    cost: j.cost,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [entryPath, imagePath] = process.argv.slice(2);
  if (!entryPath || !imagePath) { console.error('usage: eval-entry.mjs <entry.json> <screenshot>'); process.exit(2); }
  const entry = JSON.parse(await readFile(entryPath, 'utf8'));
  const imageBlock = await loadImage(imagePath);
  const r = await runEval({ entry, imageBlock });
  for (const c of r.mechanical) console.log(`${c.pass ? '✓' : '✗'} ${c.id}: ${c.detail}`);
  for (const c of r.judged) console.log(`${c.pass ? '✓' : '✗'} ${c.id} [${c.score}/5]: ${c.evidence}${c.fix ? `\n    fix: ${c.fix}` : ''}`);
  console.log(`\n${r.pass ? 'PASS' : 'FAIL'} — ${r.summary}`);
  process.exit(r.pass ? 0 : 1);
}
