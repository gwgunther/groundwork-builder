# Ingest Agent — Eval Criteria

How a generated catalog entry is judged. Two tiers; **overall pass = all M pass AND all J ≥ 4/5**.
Code: `scripts/design-catalog/lib.mjs` (M) + `eval-entry.mjs` (J). Agent loop: `ingest-reference.mjs`.

## Tier 1 — Mechanical (code, deterministic, free)

| Id | Criterion | Catches |
|---|---|---|
| **M1** schema | Validates against `schema.json` v1.2 | structure, enums, all-9 variants, required composition/atoms |
| **M2** hex residue | No literal hex outside `*.reference` / `source` | identity leaking into transferable fields |
| **M3** industry residue | No commerce vocabulary (cart, checkout, SKU, "shop now"…) in free text | failed industry translation |
| **M4** coverage depth | hero/nav/footer composition ≥ 40 chars; ≥ 3 fidelityChecks; ≥ 3 adjectives | stub fields that validate but carry nothing |
| **M5** linkage | gradient-accent sanctioned → token gap; dark theme → needs-dark-support; novel[] → layout ≠ full + variant gaps; phase A iff (full ∧ light-native ∧ no gaps) | internally inconsistent honesty |
| **M6** eyebrow policy | every-section → pattern sanctioned; none → kicker-ban fidelityCheck; field present | incoherent eyebrow handling |
| **M7** color accuracy (URL mode) | every `tokens.color.reference` hex within RGB tolerance of a color the live DOM actually used (computed-style probe) | hallucinated/drifted reference hexes |

## Tier 2 — Judged (adversarial vision LLM: screenshot + entry + grounding notes)

Judge instruction: *default to fail when evidence is weak; an entry that would equally describe a
different site fails J1.* Seeded with the known drift failure modes (neutralization, imported
conventions, "close" colors, silent flattening, wrong accent assignment).

| Id | Criterion | The question |
|---|---|---|
| **J1** character | Anti-neutralization | Judge first describes the source's character itself, then checks the entry captures *that* — type class, temperature, materiality, emphasis device |
| **J2** color | Strategy + reference accuracy | Strategy matches visible theme/saturation/accent-ratio; reference hexes in the right color families |
| **J3** layout | Variant + composition fidelity | Picks are the closest enums; hero/nav/footer prose describes what's visible; non-visible sections inferred, not fabricated |
| **J4** heading anatomy | Eyebrow + emphasis device | Matches the screenshot; hunts imported eyebrows specifically |
| **J5** translation | Dental vocabulary | Free text practice-native; industry sections mapped or dropped |
| **J6** honesty | Signature elements | Judge lists the source's 2–4 signature elements; each is captured OR declared in novel/gaps. Silent flattening fails |
| **J7** checks | FidelityChecks quality | ≥3, screenshot-verifiable, specific to this design, protecting signature elements |

## The loop

```
screenshot(s)  — or —  --url <site>
  → 0. capture (URL mode): playwright real-Chrome channel, overlay dismissal, lazy-load
       scroll, TILED full-page screenshots (≤4000px segments, ≤5 tiles), and a
       COMPUTED-STYLE PROBE: exact hexes/fonts/radii/shadows/chrome geometry from
       getComputedStyle — programmatic ground truth that beats pixel estimation
  → A. source audit (grounding doc: located hexes, type anatomy, geometry, motifs, chrome, voice, visibility map; probe is binding when present)
  → B. extract (entry + observed/implied/invented grounding notes; audit is binding)
  → C. mechanical gate (M1–M6; ≤2 repair calls for failures)
  → D. judge (J1–J7)
  → pass? done : feed failures+fixes back to B (≤ --max-iters, default 4)
```

Artifacts per run in `docs/design-catalog/runs/<id>-<ts>/`: `audit.json`, `iter-N.entry.json`,
`iter-N.eval.json`, final `entry.json`, `report.md` (score trajectory table).

## Known limitations

- **Screenshot-only mode has no programmatic grounding** — reference hexes are vision-estimated,
  cross-checked by the judge at color-family precision. **Prefer `--url`**: the computed-style
  probe supplies exact values and unlocks M7. Case in point (Aesop): vision-only classified the
  display face `editorial-serif` and the dark chrome "forest green" — the probe showed Suisse Intl
  (grotesque, the serif is a 0.1%-by-area italic accent) and neutral `#252525`. Both extractor and
  judge made the same vision error; the probe is the only thing that catches that class of mistake.
- **Bot protection** — some sites block headless capture; the tool retries headed, then asks for
  manual screenshots.
- **Same model judges and extracts** (sonnet) — mitigated by adversarial judge framing + separate
  prompts; option: upgrade judge to opus for calibration runs.
- **Judge variance** — J-scores are LLM-judged; treat 4/5 threshold as a gate, not a metric.
  For eval-harness work, run the judge 3× and take the median.
