---
tier: L1
maturity: working
phase: Design Extract
source: scripts/pipeline/lib/ai-design.js
function: runDesignMapping
model: claude-sonnet-4-6
---

# Skill: Design Extraction

## Responsibility

Reads the **existing** site's current design and extracts what's actually
there: the colors actually used, the fonts actually loaded, the visual mood,
and an assessment of brand strength. Pure extraction — no creative direction
happens here. The output feeds Brand Direction so the rebuild can decide
whether to evolve the existing brand or start fresh.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `bronze.pages` | array | scrape | All scraped pages with their detected stylesheets, colors, fonts |
| `bronze.siteAssets` | object | scrape | CSS files, font URLs, computed styles |
| `merged.practice` | object | merge | Practice name (for sanity context only) |

## Output schema

```json
{
  "existingPalette": {
    "primary":   "#hex — most-used non-white/black brand color",
    "secondary": "#hex — second most prominent",
    "accent":    "#hex — small/icon accent or null",
    "dark":      "#hex — body-text dark",
    "muted":     "#hex — supporting/secondary text"
  },
  "existingFonts": {
    "heading": "Font name as actually loaded",
    "body":    "Font name as actually loaded",
    "display": "Font name or null"
  },
  "mood": "2-3 word label (e.g. 'Warm Coastal Trust', 'Modern Clinical Confidence', 'Generic Corporate Dental')",
  "brandStrength": "distinctive | competent | weak | inconsistent",
  "brandStrengthRationale": "1-2 sentences on why",
  "evolutionSignal": "evolve | rebuild",
  "rationale": "Why evolve vs rebuild — what's worth keeping if anything"
}
```

## Evaluation criteria

- **Colors are real hex codes**, not guesses — must be present in bronze CSS / inline styles
- **Fonts are real font-family names** as loaded by the source site's stylesheets
- **brandStrength uses one of the 4 allowed values** — never null/missing
- **evolutionSignal aligns with brandStrength** — distinctive → evolve, weak → rebuild
- **No fabrication** — if the source site has no consistent palette, return whatever colors are most-used, NOT an invented "what would look good"
- **Returns only JSON**

## Known gaps

- CSS parsing is shallow — relies on declared color values; computed/runtime CSS variables can be missed
- No analysis of color USE (a color in the stylesheet isn't necessarily a brand color — could be a button accent on one page)
- Mood label is single-AI-pass — no validation against the audit's positioning
- Font detection misses webfonts loaded via JS (rare but happens)
- evolutionSignal is binary — no "partial evolve" option for sites with one good color but bad typography

## Improvement levers

1. **Easy (L1):** Add explicit "color frequency" reasoning to the prompt — count occurrences before naming a primary
2. **Easy (caller-side):** Cross-validate `existingPalette.primary` against bronze CSS by frequency
3. **Medium:** Add a "preserve" array — specific design elements (logo color, signature font) the rebuild should retain even if doing a `rebuild`
4. **Medium:** Per-page mood scoring — homepage mood vs about-page mood often differ; could surface that signal

## Test fixtures

**References (5 fixtures):**
- `lbpds-pediatric/design.json`
- `chang-orthodontics/design.json`
- `orange-county-dental-care/design.json`
- `oc-healthy-smiles/design.json`
- `elements-dentistry/design.json`

Run `node scripts/pipeline/test-fixtures.js` for shape validation.

**Future:** distinctive-brand + weak-brand + inconsistent-brand fixtures to exercise the brand-strength heuristic.

---

## PROMPT

You are a brand analyst auditing an existing {{verticalName}} practice website BEFORE a redesign.

Your job is NOT to design anything. Your job is to DOCUMENT what currently exists and assess its quality.
The output of this step feeds a dedicated Brand Direction step that will make all creative decisions.

Be honest and specific. If the brand is weak or generic, say so. If it's strong, say so. Do not soften either assessment.

## Practice Profile

**Practice Name:** {{practiceName}}
**Location:** {{city}}, {{state}}

## Existing Site Signals

**Colors found on current site:**
{{existingColors}}

**Logo URL:** {{logoUrl}}

**Current site aesthetic notes:**
{{aestheticNotes}}

## Instructions

Analyze the existing brand signals and return a single JSON object. Focus on WHAT EXISTS, not what should change.

```json
{
  "existingPalette": {
    "primary":   "#hex or null — the most dominant color found",
    "secondary": "#hex or null — the second most prominent color",
    "accent":    "#hex or null — any highlight or warm accent found",
    "light":     "#hex or null — background/near-white found",
    "raw":       ["#hex", "#hex"]
  },
  "existingFonts": {
    "heading": "font name detected or null",
    "body":    "font name detected or null",
    "detected": ["font1", "font2"]
  },
  "mood": "2-3 word label for the current site's feel (e.g. 'Outdated Clinical Blue', 'Generic Dental White', 'Warm Family Practice')",
  "brandStrength": "strong | moderate | weak | none",
  "brandStrengthRationale": "1-2 sentences: why is it strong or weak? Be specific.",
  "colorConsistency": "consistent | inconsistent | minimal — was a real palette applied or random colors?",
  "evolutionSignal": "evolve | rebuild — should we evolve this brand or start fresh? Brief justification.",
  "rationale": "2-3 sentences summarizing the current brand state that the Brand Direction step should use as input"
}
```

Rules:
- If no colors were detected, set `brandStrength` to `none` and `evolutionSignal` to `rebuild`
- If only 1-2 inconsistent colors found, `brandStrength` is `weak`
- Do NOT recommend a new palette or fonts — that is not your job
- Return ONLY the JSON object. No markdown, no explanation before or after.
