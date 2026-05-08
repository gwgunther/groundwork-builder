---
tier: L1
maturity: working
phase: Silver
source: scripts/pipeline/lib/ai-image-roles.js
function: classifyOne
model: claude-haiku-4-5
---

# Skill: Image Role Classification

## Responsibility

Classifies one downloaded image at a time using Claude Haiku Vision. Picks a
single category from a fixed taxonomy (hero-office / interior /
doctor-portrait / team-group / patient-smile / logo / decorative / unknown)
and — when the image is a doctor portrait — extracts the person's name from
the filename or alt text so the assigner can pair photos with the right
doctor in multi-doctor practices. Outputs collected by `assignRoles()` into
the final `image-roles.json` manifest.

## Inputs

Per image, multimodal message with:

| Field | Type | Source | Notes |
|---|---|---|---|
| `imageBase64` | binary | image file | Encoded as Anthropic vision content block |
| `mediaType` | string | file ext | image/jpeg / image/png / image/webp |
| `rel` (Local filename) | string | derived | Path relative to images dir |
| `orig` (Original URL filename) | string \| empty | image-source.json sidecar | Filename from source URL — strongest doctor-name signal |
| `alt` (Alt text from source HTML) | string \| empty | image-source.json sidecar | Alt attribute from HTML — second-strongest signal |
| `hintLines` | string | derived | Pre-formatted block joining the above 3 lines |

## Output schema

```json
{
  "category": "hero-office | interior | doctor-portrait | team-group | patient-smile | logo | decorative | unknown",
  "confidence": "0.0-1.0",
  "reason": "string ≤12 words",
  "personName": "string | null — full name like 'Dr. Melissa Ven Dange' if visible in filename/alt"
}
```

## Evaluation criteria

- **Single-category** — exactly one category from the enum, never a custom value
- **personName populated** when category is `doctor-portrait` AND filename/alt contains a name (multi-doctor pairing depends on this)
- **personName is null** for non-portrait categories (don't extract names from team-group photos)
- **reason ≤12 words**
- **confidence calibrated** — high (0.9+) for unambiguous shots, low (≤0.5) for unclear
- **Returns only JSON**

## Known gaps

- No detection of multiple people in a single shot beyond the team-group fallback (a 3-doctor portrait might be tagged `team-group` instead of yielding 3 personName extractions)
- personName extraction relies entirely on filename/alt; an unnamed doctor photo can never be paired
- 4MB-per-image cap silently drops oversized files (returns `skipped-too-large`)
- Hero-vs-interior call is judgment-based; small interiors sometimes promoted to hero erroneously
- "patient-smile" can be ambiguous with stock dental photography vs. real patients

## Improvement levers

1. **Easy (L1):** Add explicit examples in the prompt of valid `personName` formats vs. cases to leave null
2. **Medium:** When category is team-group, ask model to return `personNames: string[]` so multi-person shots can yield multiple pairings
3. **Medium:** Pass the known list of doctor names from silver and ask the model to pick from the list rather than free-form extracting
4. **Hard:** Two-pass classification — first detect "is this a portrait?", then a separate face/text extraction step

## Test fixtures

_None yet. Future: `skills/extraction/image-roles.fixtures/{portraits,interiors,team,decorative}/*.jpg` with expected categories._

---

## PROMPT

Classify this image from a dental practice website.

{{hintLines}}

Pick ONE category from:
- hero-office         (wide interior shot, suitable for a homepage hero banner)
- interior            (office interior, not wide enough for hero)
- doctor-portrait     (single person, head-and-shoulders, clearly a clinician)
- team-group          (multiple staff together, or a single staff candid)
- patient-smile       (patient-facing smile photo / before-after / treatment result)
- logo                (brand mark, transparent or flat graphic)
- decorative          (abstract texture, illustration, icon)
- unknown

If this is a doctor-portrait AND the filename or alt text contains a person's name, return that name in personName so we can pair the photo with the right doctor in the rebuild.

Return ONLY JSON:
{
  "category": "<above>",
  "confidence": 0.0-1.0,
  "reason": "<≤12 words>",
  "personName": "<full name like 'Dr. Melissa Ven Dange' if visible in filename/alt; otherwise null>"
}
