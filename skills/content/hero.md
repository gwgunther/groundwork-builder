---
tier: L1
maturity: working
phase: Generate
section: hero
source: scripts/pipeline/skills/skill-generate.js
function: heroContentBrief
model: claude-sonnet-4-6
---

# Skill: Hero Content Generation

## Responsibility

Produce the content JSON for the homepage hero section: headline, subheadline,
eyebrow, CTAs, and phone. Layout variant is locked in by the archetype (via
`dna.designTokens.heroLayout`); this skill only writes copy. Output is consumed
by the variant component in `src/components/variants/hero/<variant>.astro`.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.heroLayout` | Locked layout variant |
| `practice.name` | string | merged | Practice name |
| `practice.city` | string | merged | City for local copy |
| `practice.cityOrFallback` | string | derived | `practice.city || 'the local area'` |
| `practice.cityForCta` | string | derived | `practice.city || 'Minutes'` |
| `practice.phone` | string | merged | Phone for the CTA panel |
| `tagline` | string \| null | content.tagline | Existing scraped tagline |

## Output schema

```json
{
  "variant": "centered | split | split-offset | poster | text-only",
  "eyebrow": "string | null",
  "headline": "string — ≤10 words, specific to practice",
  "subheadline": "string — 1-2 sentences",
  "primaryCta": { "label": "string — verb + noun", "href": "/schedule" },
  "secondaryCta": { "label": "string", "href": "/services" },
  "phone": "string",
  "hasImage": true
}
```

## Evaluation criteria

- **Headline ≤10 words** and references practice name, doctor, or city — never generic
- **Variant matches the locked layout** — does not deviate from the recommended value
- **primaryCta.label** is action-oriented (verb + noun); never "Learn More" / "Get Started"
- **Eyebrow** uses tagline if provided, else `null` (no filler)
- **No fabricated facts** — claims, numbers, or credentials must be grounded
- **Returns only JSON**, no markdown fences or commentary

## Known gaps

- No tone calibration — same prompt for warm-family vs. clinical-specialist practices
- Doesn't use the existing scraped hero copy as a stylistic reference (only the tagline field)
- No length validator — caller doesn't enforce ≤10 words
- Subheadline can drift into restating the headline

## Improvement levers

1. **Easy (L1):** Add an explicit "do not repeat the headline's words" instruction
2. **Easy (L1):** Inject mood/personality from brand brief into the tone guidance
3. **Medium:** Output validator that re-rolls if headline length > 10 words
4. **Medium:** Pass scraped existing hero copy as stylistic reference (not for verbatim reuse)

## Test fixtures

_None yet. Future: `skills/content/hero.fixtures/{good,bad}/*.json`_

---

## PROMPT

Generate content JSON for the Hero section of {{practice.name}} in {{practice.cityOrFallback}}.

The hero layout variant will be: "{{recommended}}" — locked from archetype, do NOT change it.
Layout reference (for context only):
- "centered":     full-bleed image with centered text overlay
- "split":        balanced 50/50 text panel + image
- "split-offset": text 40% / image 60%, image bleeds edge — cinematic
- "poster":       full-bleed image, NO overlay; text in floating card pinned bottom-left
- "text-only":    no image; pure typographic dark-bg display poster

Return ONLY this JSON (no markdown, no prose):
{
  "variant": "{{recommended}}",
  "eyebrow": "{{tagline}}",
  "headline": "<main h1 — ≤10 words, specific to {{practice.name}} or {{practice.cityOrFallback}}>",
  "subheadline": "<1-2 sentences — what patients gain, specific to this practice>",
  "primaryCta": { "label": "<verb + noun, NOT 'Learn More' or 'Get Started'>", "href": "/schedule" },
  "secondaryCta": { "label": "<secondary action>", "href": "/services" },
  "phone": "{{practice.phone}}",
  "hasImage": true
}

Rules:
- headline must reference the specific practice, doctor, or city — never generic dental copy
- eyebrow: use the tagline if provided; set to null if it adds no meaning
- primaryCta.label must be action-oriented and specific (e.g. "Book Your Consultation", "Schedule in {{practice.cityForCta}}")
- Return ONLY the JSON object, no backticks, no explanation
