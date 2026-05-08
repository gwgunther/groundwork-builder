---
tier: L1
maturity: working
phase: Generate
section: doctor-intro
source: scripts/pipeline/skills/skill-generate.js
function: doctorContentBrief
model: claude-sonnet-4-6
---

# Skill: Doctor Intro Content Generation

## Responsibility

Produce the content JSON for the homepage Doctor Introduction block. Most
fields are LOCKED (variant, name, credentials, hasPortrait) and must be copied
verbatim from the input — the AI only writes the eyebrow, bio, and CTA label.
This locking pattern was added because the AI had been overwriting the
canonical doctor name with shortened forms.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `recommended` | string | `dna.designTokens.aboutLayout` | Locked layout |
| `practice.name` | string | merged | Practice name |
| `practice.city` | string | merged | City for grounding |
| `cityOrFallback` | string | derived | `practice.city || 'this community'` |
| `displayName` | string | derived | `content.nameNoTitle || content.name || practice.doctor || 'our doctor'` |
| `credentials` | string | derived | `content.credentials || 'DDS'` |
| `lastName` | string | derived | last token of displayName |
| `bioBlock` | string | derived | If bio present: "Bio source material — ...{bio first 800 chars}". Else: "No bio on file — write 2–3 warm sentences specific to {city} ..." |
| `additionalContentBlock` | string | derived | Empty string if no rescued content; otherwise a numbered list of pull-quotes / philosophy / welcome statements from `content.additionalContent`, filtered for doctor-relevant types or items mentioning this doctor by name. The AI uses these to ground the bio in real practice voice. |

## Output schema

```json
{
  "variant": "string — must equal {{recommended}}",
  "eyebrow": "string — 2–4 words, NOT just 'Meet Your Doctor' if better available",
  "name": "string — must equal {{displayName}}",
  "credentials": "string — must equal {{credentials}}",
  "bio": "string — 2-3 paragraphs separated by \\n\\n",
  "ctaLabel": "string — verb + name, e.g. 'Meet Dr. {{lastName}}'",
  "ctaHref": "/about",
  "hasPortrait": true
}
```

## Evaluation criteria

- **Locked fields are byte-identical** — variant, name, credentials, hasPortrait must equal the locked input values
- **Bio is grounded** — uses provided bio source if present, never fabricates schools/years/credentials
- **Voice match** — when `additionalContent` rescued blocks exist (philosophy paragraphs, pull-quotes), the bio echoes their phrasing/tone, not generic "compassionate care" filler
- **Eyebrow adds meaning** — not just "Meet Your Doctor" if a better hook is available
- **CTA label uses the verb + name pattern** with last name (e.g. "Meet Dr. Hoang")
- **2-3 paragraphs** in bio, separated by `\n\n`
- **Returns only JSON**

## Known gaps

- AI was previously ignoring locked values (overwriting `name` with a shorter form) — the LOCKED FIELDS section was added to fix this; needs ongoing validation
- No automatic enforcement that the output's locked fields match input — caller should validate post-hoc
- Eyebrow can still default to generic "Meet Our Doctor" when source bio is sparse
- No explicit handling of multi-doctor practices (this is the homepage primary slot only)

## Improvement levers

1. **Easy (L1):** Tighten the LOCKED FIELDS instruction with an example of what "verbatim" means
2. **Easy (caller-side):** Validator that overwrites the locked fields back to input values post-call
3. **Medium:** Pass practice differentiators (technology, awards) into the bio brief so generated bios reference them
4. **Medium:** Per-archetype eyebrow style guidance (warm/family vs. clinical/specialist)

## Test fixtures

_None yet. Future: regression test that the AI never alters the locked `name` field._

---

## PROMPT

Generate copy for the Doctor Introduction section of {{practice.name}}.

Layout variant: "{{recommended}}" — locked from archetype, do NOT change it.
Layout reference (for context only):
- "split-photo":      portrait left (or right), bio text opposite — warm and personal
- "full-width-card":  large portrait fills left half, floating content card on right — editorial premium
- "editorial-full":   portrait fills entire section background; content card overlay on right
- "minimal-text":     no portrait at all; pure typographic — name as design element, bio in 2 columns
- "two-col-brief":    compact split — small avatar + name on left, short bio on right

CRITICAL — LOCKED FIELDS (copy these values EXACTLY into the output — do NOT change them):
  variant   = "{{recommended}}"
  name      = "{{displayName}}"
  credentials = "{{credentials}}"
  hasPortrait = true

FILL IN only the fields marked <...> below. Do not change the locked fields.

Return ONLY this JSON object:
{
  "variant": "{{recommended}}",
  "eyebrow": "<2–4 words — adds meaning beyond the heading, NOT just 'Meet Your Doctor' if you can do better>",
  "name": "{{displayName}}",
  "credentials": "{{credentials}}",
  "bio": "<2–3 paragraphs separated by \\n\\n — warm, specific to this practice and city, never fabricated credentials>",
  "ctaLabel": "<verb + name, e.g. 'Meet Dr. {{lastName}}' or 'Our Team'>",
  "ctaHref": "/about",
  "hasPortrait": true
}

{{bioBlock}}
{{additionalContentBlock}}

Return ONLY the JSON object. No prose, no markdown.
