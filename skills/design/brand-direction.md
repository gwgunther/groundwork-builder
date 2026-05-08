---
tier: L1
maturity: polished
phase: Brand Direction
source: scripts/pipeline/lib/ai-brand-direction.js
function: runBrandDirection
model: claude-sonnet-4-6
---

# Skill: Brand Direction

## Responsibility

Produces deliberate brand guidelines (palette, typography, spatial, motion,
voice, mood) for the NEW site. Takes the existing-site design extraction
(colors, fonts, mood detected from the original) plus practice signals plus
the AI audit output, and synthesizes a strategy: evolve the existing brand or
start fresh. Output is the primary anchor consumed by the Creative Director —
the director then orchestrates LAYOUT around this brand brief, not the other
way around.

Recently added: color-temperature signal (warm vs cool palette pre-bias) and
typography personality signal (humanist serif for warm/family practices,
grotesque/display for specialist/premium) both derived from the audit's
positioning + tone fields. These prevent palette/font choices that are
tonally wrong for the practice personality (e.g. cold navy on a community
family practice).

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `practice` | string | merged.practice.name | |
| `doctor` | string | merged.doctor.name | "(not specified)" fallback |
| `city`, `state` | string | merged.address | |
| `positioning` | string | audit.positioning.recommended | Drives color-temp + typography personality cues |
| `tone` | string | audit.tone.recommended | |

**Two differentiator-related template vars (don't confuse them):**

| Template var | Type | Source | Notes |
|---|---|---|---|
| `auditDifferentiators` | string | `audit.differentiators[]` (high-level audit positioning) | Bulleted list — what makes them stand out vs. competitors per audit phase |
| `differentiatorBullets` | string | `merged.differentiators[]` (silver field — was `merged.signals`, both accepted) | Bulleted list of `• type: label` — technology, awards, languages, financing |

**Other inputs:**

| Template var | Type | JS source field | Notes |
|---|---|---|---|
| `existingColors` | string | `design.existingPalette` (fallback: `design.palette`) | Pre-formatted "primary: #hex, secondary: #hex" string |
| `existingFonts` | string | `design.existingFonts` (fallback: `design.fonts`) | Pre-formatted "heading: X, body: Y" string |
| `currentMood` | string | `design.mood` | "Generic Corporate Dental" etc. |
| `brandStrength` | string | `design.brandStrength` | "distinctive" \| "competent" \| "weak" \| "inconsistent" |
| `strategyInstruction` | string | derived | "EVOLVE" or "START FRESH" paragraph |
| `colorTempGuidance` | string | derived | Warm/cool/neutral block based on positioning regex |
| `typographyPersonalityLine` | string | derived | Specialist/family/neutral guidance |
| `paletteBlock` | string | palette-library | 6 mood-matched palette options |
| `fontCands` | string | google-fonts | Mood-matched font candidates excluding recently-used pairs |
| `impeccableContext` | string | impeccable.js | Hero/CTA/services/doctor design principles |

## Output schema

```json
{
  "palette": { "primary", "secondary", "light", "accent", "dark", "muted" },
  "typography": {
    "heading", "body",
    "scale": { "h1", "h2", "h3", "body", "small" },
    "tracking"
  },
  "spatial":  { "sectionPadding", "containerWidth", "cardRadius", "density": "airy|balanced|dense" },
  "motion":   { "transitions", "hoverElevation", "pageEntrance" },
  "voice":    { "headline_style", "cta_language", "tone_notes" },
  "mood":     "2-3 word label",
  "rationale": "3-4 sentences",
  "paletteSource": "string",
  "contrastCheck": "string"
}
```

## Evaluation criteria

- **WCAG AA contrast** — primary/dark on light must pass; explicit `contrastCheck` field confirms it
- **Color temperature matches signal** — warm palette for family/community practices; cool palette for specialist/premium; neutral when unclear
- **Typography personality matches signal** — humanist serif for warm/family; grotesque/display for specialist; never Inter/Roboto/Open Sans/Lato/Montserrat default
- **Font diversity** — does not repeat any pair in `usedFontPairs` (recently used by other practices in the library)
- **60/30/10 color application** — primary/secondary/accent roles distinct, not three of the same hue
- **Voice fields describe approach, not copy** — headline_style and cta_language describe the approach in their own words; do NOT include specific copy examples
- **Mood is a 2-3 word label** — e.g. "Warm Coastal Trust", "Modern Clinical Confidence"
- **Rationale references this specific practice** — explains why these choices fit *this* practice, not just any dental site
- **Returns only JSON**

## Known gaps

- Color-temp signal is regex-based on positioning text — misses nuance (e.g. "luxury family" should be warm-but-elevated)
- No automatic contrast verification — relies on the model's `contrastCheck` self-attestation
- Typography personality is binary (warm/family vs specialist) — no third option for neutral/balanced practices
- Voice fields can still leak example copy despite the explicit "describe approach" instruction
- Strategy instruction (evolve vs start fresh) hinges on `brandStrength` from extraction, which is itself a soft AI judgment
- No regression testing across recently-built practices to detect drift toward generic palettes

## Improvement levers

1. **Easy (L1):** Add concrete contrast ratio numbers (WCAG AA 4.5:1) to the prompt instead of just "WCAG AA"
2. **Easy (caller-side):** Run a real WCAG calculator on the output palette and re-roll if it fails
3. **Medium:** Sharpen the color-temp signal — pass more context (services, doctor specialty) instead of just regex on positioning
4. **Medium:** Auto-reject voice fields that contain quoted phrases (heuristic: any string with `"..."` is example copy)
5. **Hard:** A/B history — track which mood/palette combos produced the best human-rated builds and bias toward winners

## Test fixtures

**References (5 fixtures, all pass WCAG AA on dark/light + primary/light + light/dark pairs):**
- `lbpds-pediatric/brand.json` — `#2a5298` cool blue, balanced
- `chang-orthodontics/brand.json` — `#1B3A5C` navy, balanced
- `orange-county-dental-care/brand.json` — `#2e6b3e` forest green, balanced
- `oc-healthy-smiles/brand.json` — `#1a4d6e` coastal navy, balanced
- `elements-dentistry/brand.json` — `#c4704a` **warm terracotta** (the only warm-family palette), balanced

Run `node scripts/pipeline/test-fixtures.js` for shape validation including WCAG AA contrast checks.

**Future:** evolve-existing + start-fresh fixtures to exercise the strategy branches; airy/dense density variants.

---

## PROMPT

You are a senior brand designer creating guidelines for a dental practice website redesign.

Your decisions must be grounded in the design principles provided — not generic AI taste.
Produce brand guidelines that feel SPECIFIC to this practice, not interchangeable with any other dental site.

## Practice
- Name: {{practice}}
- Doctor: {{doctor}}
- Location: {{city}}{{stateSuffix}}
- Positioning: {{positioning}}
- Tone: {{tone}}

## Practice Differentiators (from audit positioning)
{{auditDifferentiators}}

## Silver-extracted Differentiators (technology, awards, languages, etc.)
{{differentiatorBullets}}

## Existing Brand Assessment (from extraction phase)
- Colors found: {{existingColors}}
- Fonts found: {{existingFonts}}
- Current mood: {{currentMood}}
- Brand strength: {{brandStrength}}

## Your Strategy
{{strategyInstruction}}

{{colorTempGuidance}}

## Curated Palette Options
Select one of these as your foundation. Adapt it using the existing brand colors where appropriate.

{{paletteBlock}}

## Font Candidates
{{fontCands}}

Avoid any font pair already used recently by other practices in your library.
Choose a pairing that fits the mood AND stands out — no Inter+Roboto defaults.

Typography personality to match:
{{typographyPersonalityLine}}

{{impeccableContext}}

## Your Task

Produce brand guidelines for this practice's NEW website.
Think like a senior designer who has read the Impeccable principles above.

Apply them concretely:
- WCAG AA contrast — concrete ratios required:
  - `dark` on `light`: ≥ 4.5:1 (this is body text on alternating-section backgrounds)
  - `primary` on `light`: ≥ 4.5:1 (this is CTAs and headings on light backgrounds)
  - `light` on `dark`: ≥ 4.5:1 (this is text on dark surfaces — the inverse case)
  Note: a real WCAG calculator runs on your output palette in the caller; if any of these pairs fail, your `contrastCheck` self-attestation will be overridden and the failure logged. Pick colors that actually meet 4.5:1 — don't pair a `#777` mid-gray with `#fff` and call it AA.
- Typography scale with clear hierarchy (not just two font sizes)
- Spatial rhythm that fits the density of a dental site (not too sparse, not cluttered)
- Color application: 60/30/10 rule — which color is dominant, which is structural, which is accent?
- Emotional direction: what should a patient FEEL in the first 3 seconds on this site?

Return ONLY valid JSON:
{
  "palette": {
    "primary":   "#hex — dominant brand color (CTAs, headings, key UI elements)",
    "secondary": "#hex — structural color (borders, secondary headings)",
    "light":     "#hex — near-white background tint for alternating sections",
    "accent":    "#hex — warm highlight (icons, small details, hover states)",
    "dark":      "#hex — the darkest tone in the system, used for body text and dark surfaces (not pure #000000; tint toward the primary hue)",
    "muted":     "#hex — a mid-tone neutral used for supporting/secondary text"
  },
  "typography": {
    "heading": "Google Font name — match the personality guidance above (grotesque for specialist, humanist serif for warm/family)",
    "body":    "Google Font name — highly readable sans-serif for body copy",
    "scale": {
      "h1": "text-4xl md:text-6xl font-bold",
      "h2": "text-3xl md:text-4xl font-semibold",
      "h3": "text-xl md:text-2xl font-semibold",
      "body": "text-base md:text-lg leading-relaxed",
      "small": "text-sm"
    },
    "tracking": "tight for headings, normal for body"
  },
  "spatial": {
    "sectionPadding": "py-16 md:py-24",
    "containerWidth": "max-w-7xl",
    "cardRadius": "rounded-xl or rounded-2xl",
    "density": "airy|balanced|dense"
  },
  "motion": {
    "transitions": "duration-200 ease-out",
    "hoverElevation": "hover:shadow-md or hover:-translate-y-1",
    "pageEntrance": "brief and functional — no animation for its own sake"
  },
  "voice": {
    "headline_style": "Describe the headline approach this brand should take (outcome-led vs feature-led, formal vs conversational, etc.) — describe the approach in your own words; do NOT include any specific copy examples.",
    "cta_language": "Describe the CTA voice this brand should take (active vs passive, specific vs generic, etc.) — describe the approach; do NOT include any specific copy examples.",
    "tone_notes": "1-2 sentences on how copy should read"
  },
  "mood": "2-3 word label (e.g. 'Warm Coastal Trust', 'Modern Clinical Confidence')",
  "rationale": "3-4 sentences explaining the brand direction: what we kept from existing brand, what we evolved, why these specific choices fit this practice and not just any dental site",
  "paletteSource": "which curated palette you selected as foundation and why",
  "contrastCheck": "Brief note confirming primary/dark on light AND light on dark each pass 4.5:1 (caller validates this with a real WCAG calculator and overrides this field if any pair fails)."
}
