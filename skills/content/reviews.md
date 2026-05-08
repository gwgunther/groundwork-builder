---
tier: L1
maturity: working
phase: Generate
section: reviews
source: scripts/pipeline/skills/skill-generate.js
function: reviewsContentBrief
model: claude-sonnet-4-6
---

# Skill: Reviews Content Generation

## Responsibility

Produce content JSON for the homepage Reviews/Testimonials section. The
testimonial items themselves come from real scraped reviews (or fall back to a
generic placeholder when none exist) — the AI only writes the wrapper copy
(eyebrow, heading) and assembles the structured object. Layout variant is
locked from the archetype.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.testimonialsLayout` | Locked layout |
| `practice.name` | string | merged | Used in heading |
| `reviewsJson` | string (JSON) | derived from content.testimonials | Up to 3 items: `{quote, author, rating}` |
| `aggregateRating` | number | content.aggregateRating | Defaults to 5 |
| `reviewCount` | number \| null | content.reviewCount | Optional review count |
| `googleUrl` | string \| null | derived | `content.gmapsUrl || content.googleReviewsUrl || practice.googleReviewsUrl` |
| `reviewsGuidance` | string | derived | "Use the provided review quotes verbatim..." OR "No real reviews available — note: use the placeholder above only." |

## Output schema

```json
{
  "variant": "card-row | pull-quotes | single-featured | list-testimonials | grid-mosaic",
  "eyebrow": "string | null",
  "heading": "string — references practice name",
  "items": [{ "quote": "string verbatim", "author": "string", "rating": 1-5 }],
  "aggregateRating": "number",
  "reviewCount": "number | null",
  "googleUrl": "string | null"
}
```

## Evaluation criteria

- **Quotes verbatim** — never paraphrased or fabricated
- **No invented authors** — if author missing in source, use "Verified Patient" or similar
- **Heading references practice name** — not just "What Our Patients Say"
- **Variant matches locked recommendation**
- **Returns only JSON**

## Known gaps

- No verification that quote text actually appears in scraped data (trust-based)
- Placeholder review when no real reviews exist is generic — could be smarter ("show fewer items" vs. "show one fake")
- No star-rating sanity check (real reviews often have varying ratings; placeholder defaults to 5)
- Doesn't surface aggregate rating sources separately from individual quotes

## Improvement levers

1. **Easy (L1):** Strengthen "do not modify quote text" instruction and add example of acceptable trim (ellipsis only)
2. **Easy (caller-side):** Validator that compares output quote substrings against scraped raw text
3. **Medium:** When no reviews exist, return `null` instead of a generic placeholder so the section can be omitted upstream

## Test fixtures

_None yet._

---

## PROMPT

Generate content JSON for the Reviews/Testimonials section of {{practice.name}}.

Layout variant: "{{recommended}}" — locked from archetype, do NOT change it.
Layout reference (for context only):
- "card-row":          3 cards side by side, each with stars + quote + author
- "pull-quotes":       one large featured quote + 2 smaller supporting quotes
- "single-featured":   one big centered hero quote, dramatic with decorative quotation mark
- "list-testimonials": stacked review listings — avatar + name + stars + quote
- "grid-mosaic":       mixed-size cards, 1 large + small cards in mosaic grid

Return ONLY this JSON:
{
  "variant": "{{recommended}}",
  "eyebrow": "<short label, e.g. 'Patient Stories' or null>",
  "heading": "<section heading — e.g. 'What Our Patients Say About {{practice.name}}'>",
  "items": {{reviewsJson}},
  "aggregateRating": {{aggregateRating}},
  "reviewCount": {{reviewCount}},
  "googleUrl": {{googleUrl}}
}

{{reviewsGuidance}}

Return ONLY the JSON object
