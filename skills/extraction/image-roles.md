---
tier: L1
maturity: polished
phase: Assemble
source: scripts/pipeline/lib/assemble/binding-to-image-roles.js
function: bindingToImageRoles
---

# Skill: Image Role Binding

## Responsibility

Bridges the deterministic image binding (silver `images.items[]` roles +
sourcePages joins) into the `image-roles.json` shape Astro components consume.
Replaces the old Vision classifier (`ai-image-roles.js`) — roles and portraits
already live in the normalized items[] from the silver images pass, so there
is nothing left to re-classify with AI.

Also attaches an `alts` map (localPath → description) using sidecar alt text
when present, otherwise role-based fallbacks from `ensure-image-alts.js`.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `binding` | object | `bindImages()` | `{ globals, portraits, byPage, unused, diagnostics }` |
| `sidecar` | object | `public/images/image-source.json` | localPath → `{ sourceUrl, alt, category }` |
| `baseUrl` | string \| null | practice domain | Resolves relative silver srcs to absolute for sidecar lookup |
| `ctx` | object | practice name/city | Used only for alt fallbacks when sidecar alt is empty |

## Output schema

```json
{
  "hero": "heroes/hero-1.webp | null",
  "doctorPortrait": "team/team-1-dr-jane.webp | null",
  "doctorPortraits": { "Dr. Jane Doe": "team/..." },
  "team": ["team/..."],
  "interior": ["gallery/..."],
  "gallery": ["gallery/..."],
  "beforeAfter": ["gallery/..."],
  "badges": ["branding/..."],
  "unused": [],
  "byPage": { "dental-implants": "gallery/..." },
  "alts": { "heroes/hero-1.webp": "Smile Studio dental practice in Phoenix" }
}
```

Paths are relative to `public/images/` (no leading slash). Components call
`imagePath()` to prefix `/images/`.

## Evaluation criteria

- **Deterministic** — same binding + sidecar → identical JSON (no LLM)
- **Never invents matches** — service pages only bind images whose `sourcePages` overlapped the original service URL
- **Preserves portraits** — `doctorPortraits` keyed by provider name from binding
- **Alt coverage** — every content-bearing local path in `alts` has a non-empty string (scrape alt preferred; role fallback otherwise)
- **No Vision cost** — this skill makes zero AI calls

## Known gaps

- Legacy Vision classifier moved to `scripts/pipeline/lib/_legacy/ai-image-roles.js` — do not import
- Gallery page population is handled by `a11y-optimize.js` (Phase 3f), not this skill
- Decorative roles (`unused`) intentionally get empty alt

## Improvement levers

1. **Done:** Components read `alts[path]` via `imageAlt()` (hero / doctor / CTA variants)
2. **Medium:** Persist unused-image list into missing-page report for operator review
3. **Hard:** Face-recognition pairing when filename/alt/bio-page join all fail

## Test fixtures

Covered indirectly by assemble / binding unit paths. Alt fallbacks:
`scripts/pipeline/_test/test-ensure-image-alts.js`.
