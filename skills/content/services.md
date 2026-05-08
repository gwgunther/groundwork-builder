---
tier: L1
maturity: working
phase: Generate
section: services
source: scripts/pipeline/skills/skill-generate.js
function: servicesContentBrief
model: claude-sonnet-4-6
---

# Skill: Services Content Generation

## Responsibility

Produce content JSON for the homepage Services section: heading, optional
eyebrow + subheading, and a per-service descriptions list. The service items
themselves come pre-scraped — the AI's job is the wrapper copy (heading,
subheading) and a one-sentence patient-benefit description for each item if
not already present. Layout variant is locked from the archetype.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.servicesLayout` | Locked layout |
| `practice.name` | string | merged | Practice name |
| `servicesJson` | string (JSON) | content.list | Pre-formatted JSON array of `{name, slug, desc}` items, max 8 |

## Output schema

```json
{
  "variant": "card-grid | alternating-rows | accordion | two-col-feature | numbered-list",
  "eyebrow": "string | null",
  "heading": "string — specific, NOT 'Our Services'",
  "subheading": "string | null",
  "items": [{ "name": "string", "slug": "string", "desc": "string ≤20 words" }],
  "ctaLabel": "View All Services"
}
```

## Evaluation criteria

- **Items used verbatim** — no invented service names, no dropped items
- **Heading is specific** — "Our Services" is rejected
- **Each desc ≤20 words**, patient-benefit focused
- **Variant matches locked recommendation**
- **Returns only JSON**

## Known gaps

- No deduplication if the items array has near-synonyms ("Whitening" + "Teeth Whitening")
- No category-aware ordering (cosmetic/general/orthodontic clusters not grouped)
- desc rewrites can drift from the source description

## Improvement levers

1. **Easy (L1):** Add "preserve original desc when present and ≤20 words" instruction
2. **Medium:** Pre-deduplicate the items array in the caller before injecting
3. **Medium:** Pass service categories so heading can reference them ("Specialty Care", "Family Dentistry")

## Test fixtures

_None yet._

---

## PROMPT

Generate content JSON for the Services section of {{practice.name}}.

Layout variant: "{{recommended}}" — locked from archetype, do NOT change it.
Layout reference (for context only):
- "card-grid":        3-col cards with icon, name, description, link
- "alternating-rows": editorial list rows — large name + description + arrow link
- "accordion":        expandable list (Alpine.js); first item open by default
- "two-col-feature":  1 large featured service + 3-4 compact items in side list
- "numbered-list":    full-width 01/02/03 numbered rows, dramatic display numbers

Return ONLY this JSON:
{
  "variant": "{{recommended}}",
  "eyebrow": "<short label, e.g. 'What We Offer' or null>",
  "heading": "<section heading — specific to {{practice.name}}'s service focus>",
  "subheading": "<1 sentence — optional, null if nothing adds meaning>",
  "items": {{servicesJson}},
  "ctaLabel": "View All Services"
}

Rules:
- Use the provided items array verbatim — do NOT invent services
- heading must be specific, not generic ("Our Services" is not acceptable)
- desc for each item: 1 sentence, patient-benefit focused, ≤20 words
- Return ONLY the JSON object
