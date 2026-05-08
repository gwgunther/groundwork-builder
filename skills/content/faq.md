---
tier: L1
maturity: working
phase: Generate
section: faq
source: scripts/pipeline/skills/skill-generate.js
function: faqContentBrief
model: claude-sonnet-4-6
---

# Skill: FAQ Content Generation

## Responsibility

Produce 6–8 frequently-asked questions (with answers) for the homepage FAQ
section. Synthesizes from THREE sources, in priority order:

1. **Scraped FAQs** (from the original site) — used verbatim
2. **Service-derived questions** — for each service offered, generate a
   natural patient question (cost, candidacy, duration, before/after)
3. **Practice-level questions** — referral, insurance, first visit,
   emergency, scheduling

Each FAQ is tagged with a category (`Scheduling`, `Insurance & Payment`,
`First Visit`, `Treatment`, `Aftercare`) so the `split-by-category` variant
can group them.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.faqLayout` | Layout variant (locked from archetype) |
| `practice.name` | string | merged | Practice name |
| `practice.city` | string | merged | City |
| `practice.phone` | string | merged | Phone |
| `practice.doctor` | string | merged | Primary doctor name |
| `scrapedFaqsJson` | string (JSON) | merged.content.faqs | Verbatim scraped Q/A pairs |
| `servicesText` | string | merged.services.offered | Bullet list of services |
| `specialty` | string | derived | "general dentistry" / "orthodontics" / etc |
| `lastName` | string | derived | doctor's last name for natural references |
| `additionalContentBlock` | string | derived | Empty when no relevant rescued items; otherwise a "Source 4" block listing rescued content of types: financing, insurance, emergency, accessibility, multilingual, approach, first-visit, patient-experience, community, technology. Used to ground FAQ answers in real practice voice. |

## Output schema

```json
{
  "variant": "accordion-expandable | two-column | simple-stack | cards-grid | split-by-category",
  "eyebrow": "string | null",
  "heading": "string — practice-specific, NOT 'FAQ'",
  "subheading": "string | null",
  "items": [
    {
      "q": "string — the question",
      "a": "string — 2-4 sentence answer",
      "category": "Scheduling | Insurance & Payment | First Visit | Treatment | Aftercare"
    }
  ]
}
```

## Evaluation criteria

These are the criteria the output should be graded against. They are also
the rules the prompt enforces.

- **6–8 items** — fewer feels thin, more is overwhelming
- **Source 1 first** — if scraped FAQs exist, they appear verbatim (no rephrasing)
- **Service coverage** — at least 1 question per most-asked-about service when service list is provided
- **Practice basics covered** — must include at least one question each on:
  insurance/payment, first visit, scheduling/referral, emergency
- **No fabrication** — no invented prices, hours, years-in-business, credentials
- **Specificity** — references practice name, doctor name, or city when natural; never generic dental copy
- **Answer length** — 2–4 sentences each; concise + scannable
- **Categorized** — every item has a category from the allowed taxonomy
- **Order** — by patient journey: scheduling → insurance → first visit → treatment → aftercare
- **Heading specificity** — never just "FAQ" or "Frequently Asked Questions"; should reference practice/city

## Known gaps

- No deduplication when scraped FAQs and service-derived FAQs ask the same question
- Doesn't cross-check answers against scraped content for accuracy (could fabricate plausible-but-wrong answers about insurance specifics)
- Category taxonomy is fixed — can't yet add custom categories per practice (e.g. "Pediatric" for kid-focused practices)
- No tone calibration — same prompt for warm-family practice and clinical-specialist practice

## Improvement levers

1. **Easy (L1, edit this prompt):** Add tone-calibration phrases tied to archetype family — warm/family vs. clinical/specialist
2. **Easy (L1):** Add an explicit "duplicate check" step in the prompt
3. **Medium:** Output validator that scores each FAQ against the criteria above and flags low-quality answers for re-roll
4. **Medium:** Per-specialty FAQ topic priorities (orthodontics → "what age?", periodontics → "is it painful?")

## Test fixtures

_None yet. Future: `skills/content/faq.fixtures/{good,bad}/*.json`_

---

## PROMPT

Generate the FAQ content for {{practice.name}} in {{practice.cityOrFallback}}.

## Layout variant — locked: "{{recommended}}"
Layout reference (for context only):
- "accordion-expandable": Alpine accordion, first item open
- "two-column":           questions left, answers right (no accordion)
- "simple-stack":         editorial typography, no accordion
- "cards-grid":           each FAQ in its own card, 2-col grid
- "split-by-category":    grouped by category (insurance / treatment / visits / aftercare)

## Source 1 — Scraped FAQs (use VERBATIM if any)
{{scrapedFaqsBlock}}

## Source 2 — Services offered (each implies natural questions)
{{servicesText}}

## Source 3 — Practice context
- Practice: {{practice.name}}
- Doctor:   {{practice.doctorOrFallback}}
- City:     {{practice.city}}
- Phone:    {{practice.phone}}
- Specialty: {{specialty}}
{{additionalContentBlock}}

## Your task
Produce 6–8 FAQs that:
1. **Use scraped FAQs first** — if Source 1 had real Q/A pairs, include them verbatim (do NOT rephrase real answers).
2. **Fill gaps from services** — generate 1–2 service-specific Qs for the most asked-about services (cost, age, duration, before/after, candidacy).
3. **Cover practice basics** — at least 1 each for: insurance/payment, first visit, scheduling/referral, emergency/same-day. Be specific to {{practice.cityOrFallback}} and the practice when relevant.
4. **Order by patient journey**: first-time / scheduling → insurance → first visit → treatment specifics → aftercare.
5. **Categorize** each FAQ — use one of: "Scheduling", "Insurance & Payment", "First Visit", "Treatment", "Aftercare". This is used by the split-by-category variant.

## CRITICAL rules
- NEVER fabricate specific facts — no fake "We've been in business since 1995", no fake pricing, no fake hours
- Answer length: 2–4 sentences each (concise, scannable)
- Reference the practice/doctor by name when natural ("Dr. {{lastName}} will...")
- {{cityReferenceLine}}
- Plain language — no jargon unless explained

## Return ONLY this JSON (no markdown, no prose):
{
  "variant": "{{recommended}}",
  "eyebrow": "<short label, e.g. 'Frequently Asked' or 'What Patients Ask Us'>",
  "heading": "<specific heading — NEVER generic 'FAQ' or 'Frequently Asked Questions'>",
  "subheading": "<optional 1-sentence subheading, or null>",
  "items": [
    { "q": "<question>", "a": "<answer in 2-4 sentences>", "category": "Scheduling|Insurance & Payment|First Visit|Treatment|Aftercare" }
  ]
}
