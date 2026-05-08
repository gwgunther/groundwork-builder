---
tier: L2
maturity: polished
phase: Director
source: scripts/pipeline/lib/derive-design-tokens.js
function: deriveDesignTokens
model: deterministic
---

# Skill: Derive Design Tokens

## Responsibility

Deterministic mapping from Creative Director DNA + brand mood → concrete
design tokens. NO AI calls. Every output value is from a small enum. The
archetype is the primary signal: each archetype locks a unique combination
across 8 layout/chrome/personality dimensions, ensuring two sites with
different archetypes are visually unrecognizable as same-source. Mood drives
button + label style; density drives spacing; radius is mapped through. Also
hard-overrides chrome variants (nav/footer/gallery) deterministically so the
AI director cannot accidentally make two sites look identical by picking the
same chrome independently.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `dna.archetype` | enum | director | Primary differentiation key |
| `dna.density` | enum | director | airy / balanced / dense |
| `dna.radius` | enum | director | sharp / sm / md / lg / pill |
| `dna.heroVariant` / `servicesVariant` / `doctorVariant` / `ctaVariant` | enum | director | Used in fallback when archetype is unknown |
| `brandBrief.mood` | string | brand-direction | Drives button + label style |
| `brandBrief.spatial.density` | string | brand-direction | Overrides dna.density when present |

## Output schema

```json
{
  "cornerRadius": "sharp | moderate | rounded | full",
  "buttonTreatment": "filled | outline | soft-fill",
  "labelStyle": "badge | inline",
  "sectionSpacing": "airy | default | compact",
  "contentDensity": "default | tight",
  "layoutWidth": "standard",
  "heroLayout":         "centered | split | split-offset | poster | text-only",
  "servicesLayout":     "card-grid | alternating-rows | accordion | two-col-feature | numbered-list",
  "aboutLayout":        "split-photo | full-width-card | editorial-full | minimal-text | two-col-brief",
  "testimonialsLayout": "card-row | pull-quotes | single-featured | list-testimonials | grid-mosaic",
  "ctaLayout":          "centered-banner | split-image | inline-minimal | floating-card | two-button",
  "faqLayout":          "accordion-expandable | simple-stack | two-column | split-by-category | cards-grid",
  "navVariant":         "left-logo | centered-logo | split-logo | transparent-overlay | top-bar",
  "footerVariant":      "minimal-dark | editorial-split | classic-4col | compact-centered | bold-cta-footer",
  "galleryVariant":     "masonry-3col | editorial-2col | filmstrip | featured-grid | full-bleed-row",
  "typePersonality":    "humanist-serif | grotesque | display-serif",
  "colorFamily":        "warm | cool | neutral"
}
```

## Evaluation criteria

- **Each archetype produces a unique combination** across all 8 layout/chrome/personality dimensions
- **Editorial-family archetypes get cool/neutral palettes + grotesque/display fonts**
- **Classic-family archetypes get warm palettes + humanist-serif fonts**
- **Chrome variants are deterministic per archetype** — director's nav/footer/gallery picks are overridden
- **Mood keyword match** — recognized vocabulary maps to button/label style; unrecognized mood falls back to `filled` + `inline`
- **Unknown archetype falls back gracefully** — uses heroVariant/servicesVariant/density to derive a sensible token set

## Known gaps

- 8 archetypes is a small space — adding a 9th requires a full row of unique mappings, easy to accidentally collide with an existing row
- Mood keyword matching is naive substring-match; "warmly clinical" matches both warm and clinical, first match wins
- No way to express "this archetype usually uses X but for THIS practice should use Y" — overrides are not supported
- Density override path: brandBrief.spatial.density wins over dna.density without conflict warning
- typePersonality has only 3 values — covers the common cases but doesn't differentiate within (e.g. condensed vs expanded grotesque)

## Improvement levers

1. **Easy (L2):** Add a unit-test grid that asserts every archetype's row is unique across all dimensions
2. **Easy (L2):** Expand mood keyword vocabulary with weighted matching instead of first-hit
3. **Medium:** Add a 4th typePersonality (`monospace` or `display-sans`) for brutalist-tech archetypes
4. **Medium:** Allow per-build token overrides in DNA so director can deliberately deviate when justified

## Test fixtures

_None yet. Future: `skills/creative/derive-design-tokens.fixtures/all-archetypes.json` snapshot test._

---

## Logic

### Archetype → 11-dimension layout grid (the differentiation engine)

| archetype | hero | services | testimonials | about | cta | faq | nav | footer | gallery | type | color |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **editorial-asymmetric** | split | alternating-rows | pull-quotes | full-width-card | split-image | simple-stack | centered-logo | minimal-dark | editorial-2col | grotesque | cool |
| **magazine-split** | split-offset | two-col-feature | single-featured | editorial-full | floating-card | two-column | split-logo | editorial-split | editorial-2col | grotesque | cool |
| **poster-hero** | poster | numbered-list | pull-quotes | split-photo | centered-banner | simple-stack | transparent-overlay | minimal-dark | full-bleed-row | display-serif | cool |
| **bold-serif-driven** | split | alternating-rows | list-testimonials | full-width-card | split-image | split-by-category | left-logo | editorial-split | filmstrip | display-serif | cool |
| **minimal-brutalist** | text-only | numbered-list | single-featured | minimal-text | inline-minimal | two-column | split-logo | minimal-dark | editorial-2col | grotesque | neutral |
| **centered-classic** | centered | card-grid | card-row | split-photo | centered-banner | accordion-expandable | left-logo | classic-4col | masonry-3col | humanist-serif | warm |
| **warm-editorial** | centered | accordion | list-testimonials | two-col-brief | two-button | split-by-category | top-bar | editorial-split | masonry-3col | humanist-serif | warm |
| **card-heavy** | centered | card-grid | grid-mosaic | split-photo | two-button | cards-grid | left-logo | bold-cta-footer | featured-grid | humanist-serif | warm |

The first 5 rows are the **editorial/bold family** (cool palette, grotesque/display fonts).
The last 3 rows are the **classic/warm family** (warm palette, humanist-serif fonts).

### Fallback (unknown archetype)

If `dna.archetype` isn't in the table:
- `heroLayout`: `'split'` if heroVariant is in {split-image, full-bleed, poster, asymmetric-left, asymmetric-right}, else `'centered'`
- `servicesLayout`: `'alternating-rows'` if servicesVariant is `'editorial-list'`, else `'card-grid'`
- `aboutLayout`: `'full-width-card'` if doctorVariant is `'editorial-full'`, else `'split-photo'`
- `testimonialsLayout`: `'card-row'` if archetype is `card-heavy` or density is `dense`, else `'pull-quotes'`
- `ctaLayout`: `'split-image'` if ctaVariant is `'split-card'`, else `'centered-banner'`
- `faqLayout`: `'accordion-expandable'`
- Chrome: `left-logo` / `editorial-split` / `masonry-3col`
- Personality: `humanist-serif` / `neutral`

### Mood → style tokens (button + label)

| keywords | buttonTreatment | labelStyle |
|---|---|---|
| warm, friendly, approachable, coastal, family, welcoming, cozy, inviting | filled | badge |
| modern, clean, minimal, swiss, editorial, brutalist, stark, crisp | outline | inline |
| premium, confident, bold, luxury, refined, upscale, elegant, authority | filled | badge |
| clinical, specialist, precise, scientific, advanced, technical, expert | soft-fill | inline |
| (no match) | filled | inline |

First match wins (substring on lowercased mood string).

### Radius mapping

| dna.radius | cornerRadius |
|---|---|
| sharp / sm | sharp |
| md | moderate |
| lg | rounded |
| pill | full |

### Density mapping

| brandBrief.spatial.density (or dna.density) | sectionSpacing | contentDensity |
|---|---|---|
| airy | airy | default |
| balanced | default | default |
| dense | compact | tight |
