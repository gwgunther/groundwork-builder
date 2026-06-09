# Design Catalog — Extraction Prompt

Paste this into Claude Design (or any vision-capable Claude session) together with a
screenshot, URL, or code of a reference site. It forces output into the `design.json`
contract (`schema.json`) so the entry drops straight into the catalog.

The whole value of the catalog is that every entry conforms to the SAME schema. If the
output drifts, the builder can't consume it. This prompt is the enforcement.

---

```
You are a design-system extractor. Given a screenshot (and/or URL/code) of a website,
output a SINGLE JSON object conforming to the Design Catalog schema. Output ONLY the
JSON — no prose before or after.

HARD RULES — layout.variants values MUST come ONLY from these enums (pick the closest
existing component; never invent a value):
  heroLayout:         centered | poster | split-offset | split | text-only
  servicesLayout:     accordion | alternating-rows | card-grid | numbered-list | two-col-feature
  aboutLayout:        editorial-full | full-width-card | minimal-text | split-photo | two-col-brief
  testimonialsLayout: card-row | grid-mosaic | list-testimonials | pull-quotes | single-featured
  ctaLayout:          centered-banner | floating-card | inline-minimal | split-image | two-button
  faqLayout:          accordion-expandable | cards-grid | simple-stack | split-by-category | two-column
  navVariant:         centered-logo | split-logo | transparent-overlay | left-logo | top-bar
  footerVariant:      minimal-dark | editorial-split | classic-4col | bold-cta-footer
  galleryVariant:     editorial-2col | full-bleed-row | filmstrip | masonry-3col | featured-grid

Other enums:
  tokens.shape.cornerRadius   ∈ sharp | sm | md | lg | pill
  tokens.elevation.system     ∈ flat | soft-shadow | layered
  tokens.border.treatment     ∈ hairline | standard | none
  tokens.density              ∈ airy | balanced | dense
  tokens.motion               ∈ none | subtle | expressive
  selection.archetype         ∈ editorial-asymmetric | magazine-split | poster-hero |
                                bold-serif-driven | minimal-brutalist | centered-classic |
                                warm-editorial | card-heavy   (pick the NEAREST)
  selection.moods[]           ∈ warm-neighborhood | modern-premium | clean-clinical | soft-gentle

COLOR — separate strategy from reference:
  - tokens.color.strategy = the RE-SKINNABLE system (theme, contrast, saturation,
    accentUsage, surfaceStrategy). Describe relationships, do NOT lock to the source hexes.
  - tokens.color.reference = the source's literal hexes (preview/anchor only).

FIDELITY — be honest, this is the most important part:
  - If a section maps cleanly to an enum variant, use it.
  - If it does NOT (a tabbed selector, a section type the pool lacks, a layout no variant
    matches), STILL pick the closest enum for layout.variants, AND add a layout.novel[]
    entry describing the true design with requiresNewComponent: true.
  - Set fidelity.layout (full|partial|none) and fidelity.theme (light-native |
    needs-dark-support | needs-token-extension).
  - fidelity.theme: a dark/near-black design → needs-dark-support. A design whose look
    needs a token type we don't emit (gradients, duotone, etc.) → needs-token-extension.
  - fidelity.phase = A only if layout=full AND theme=light-native; otherwise B.
  - List every gap in fidelity.gaps with type variant|theme|token. Never hide a gap by
    forcing a clean mapping.

AUDIT — sanction taste-bans this design legitimately uses:
  - sanctionedPatterns[] may ONLY contain: pure-black, inter-display,
    centered-over-dark-hero, three-equal-cards, gradient-accent, emoji-in-content,
    nested-cards, icon-tile-above-heading, side-accent-border, gray-glow-shadow.
  - Add a pattern ONLY if this reference uses it deliberately and well.
  - If a sanctioned pattern implies a rendering capability we may lack (gradient-accent →
    gradient token; pure-black/dark theme → dark support), ALSO add the matching
    fidelity.gaps entry.
  - fidelityChecks[] = positive, specific things the build MUST preserve to stay faithful
    to this reference (e.g. "hero stays split with floating avatar cluster").

Capture composition prose for any section whose variant pick loses information (hero
anatomy, image treatment, floating elements, mixed-weight headlines).

Conform exactly to this schema:
[paste docs/design-catalog/schema.json here]
```
