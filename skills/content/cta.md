---
tier: L1
maturity: working
phase: Generate
section: cta
source: scripts/pipeline/skills/skill-generate.js
function: ctaContentBrief
model: claude-sonnet-4-6
---

# Skill: CTA Block Content Generation

## Responsibility

Produce content JSON for the closing call-to-action block: a compelling
headline, soft subheadline, primary CTA, and phone. Layout variant is locked
from the archetype. Tone should be invitational ("come visit") rather than
hard-sell.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.ctaLayout` | Locked layout |
| `practice.name` | string | merged | Practice name |
| `practice.city` | string | merged | City |
| `practice.cityOrFallback` | string | derived | `practice.city || 'this area'` |
| `practice.cityForCta` | string | derived | `practice.city || 'Minutes'` |
| `practice.phone` | string | merged | Phone for CTA panel |

## Output schema

```json
{
  "variant": "centered-banner | split-image | inline-minimal | floating-card | two-button",
  "headline": "string — ≤10 words, outcome-focused",
  "subheadline": "string — 1-2 sentences, low-stakes invitation",
  "primaryCta": { "label": "string — verb + specific noun", "href": "/schedule" },
  "phone": "string",
  "hasImage": true
}
```

## Evaluation criteria

- **Headline ≤10 words** and outcome-focused (what the patient walks toward)
- **Subheadline is invitational** — not "Don't miss out!" hard-sell
- **primaryCta.label** uses verb + specific noun ("Schedule Your Free Consultation"); never "Contact Us" or "Learn More"
- **References practice name or city** in headline when natural
- **Variant matches locked recommendation**
- **Returns only JSON**

## Known gaps

- Tone calibration is uniform — same prompt for warm-family vs. clinical-specialist
- Doesn't pull differentiators from the audit (e.g. "same-day", "free consultation") to specialize the CTA copy
- Subheadline can drift toward generic "We can't wait to meet you"

## Improvement levers

1. **Easy (L1):** Add specific anti-patterns ("don't open with 'Don't wait!'")
2. **Medium:** Inject 1-2 audit differentiators into the brief so the headline can reference them
3. **Medium:** Per-archetype tone calibration

## Test fixtures

_None yet._

---

## PROMPT

Generate content JSON for the CTA (call-to-action) section of {{practice.name}}.

Layout variant: "{{recommended}}" — locked from archetype, do NOT change it.
Layout reference (for context only):
- "centered-banner": full-width dark background, centered headline + CTA + phone
- "split-image":     brand-color panel left with CTA, real image right
- "inline-minimal":  no image; horizontal strip with vertical accent bar — elegant
- "floating-card":   full-bleed image background, white card floats centered over it
- "two-button":      twin equal CTAs (book + call), phone displayed prominently

Return ONLY this JSON:
{
  "variant": "{{recommended}}",
  "headline": "<compelling CTA headline — specific to {{practice.name}} or {{practice.cityOrFallback}}, ≤10 words>",
  "subheadline": "<1-2 sentences — low-stakes invitation, not a hard sell>",
  "primaryCta": { "label": "<specific action — NOT 'Contact Us' or 'Learn More'>", "href": "/schedule" },
  "phone": "{{practice.phone}}",
  "hasImage": true
}

Rules:
- headline: outcome-focused (what the patient walks toward), not process-focused
- primaryCta.label: verb + specific noun (e.g. "Schedule Your Free Consultation", "Book in {{practice.cityForCta}}")
- Return ONLY the JSON object
