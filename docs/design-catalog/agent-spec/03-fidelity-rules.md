# 03 — Fidelity Rules & Audit

Fidelity is the product. This document encodes the grounding discipline and the
audit that catches drift before the user does. The failure modes listed below are
real — each was observed in practice.

---

## The grounding rule

> **Every creative decision must cite the source, or be explicitly justified as
> an extrapolation.**

Three classes of decision:

1. **Observed** — visible in the source. Reproduce exactly (sampled hex, measured
   radius, the actual italic mix). No citation needed beyond the audit notes.
2. **Implied** — not directly visible but strongly suggested (e.g. hover states
   when only static screens exist; a focus ring; the 150ml chip when 50/100ml are
   shown). Implement conservatively in the brand's spirit and note it.
3. **Invented** — needed but absent from source (placeholder imagery, a footer
   when none is shown, error states). Allowed ONLY when required for completeness;
   must be flagged in the README ("extrapolation: no footer appears in source").

If a convention exists in your general knowledge but NOT in the source — **do not
apply it.** The source's own system always wins.

## Known drift failure modes (check for these specifically)

Each of these has actually happened. The fix discipline follows each one.

- **Imported conventions.** Adding numbered uppercase eyebrows ("01 — FOUNDATIONS")
  because design portfolios often have them — when the source's label system was
  italic serif. → Before styling any label/heading/section device, ask: *what does
  the source use for this role?* If the source has no such role, don't create one.
- **Radius inflation/deflation.** Defaulting to a generic scale (12/16/24/32)
  instead of measuring (source was 8/12/16/24). → Measure radii against known
  element sizes in the source image; re-check the rendered output against the
  source at the same zoom.
- **"Close" colors.** Using a remembered palette rather than pixel-sampled values
  (#464D3F when buttons sample to #424A39; page #F2F2F4 vs sampled #F2F3EE).
  → Sample programmatically; copy hexes verbatim; never round.
- **Lost type treatments.** Dropping the upright+italic display mix and shipping
  bold-only headings. → Inventory *typographic devices* (italic emphasis, weight
  mixes, parenthetical wordmarks) as motifs, not just families/sizes.
- **Layout drift.** Moving the logo from center to left because left-logo is the
  web default. → The chrome layout (logo position, nav shape, utility cluster
  order) is part of the brand. Measure, don't assume.
- **Pill-ification.** Making the navbar a pill because the buttons are pills.
  → Each element's shape is audited separately.
- **Wrong accent assignment.** Promoting a rare accent (gold stars) into a
  workhorse role (sale badges) — the source used the primary green for badges.
  → For every accent token, list exactly which elements use it in the source.
- **Partial propagation.** Updating tokens but leaving old values hard-coded in
  screens/cards/docs. → Grep the whole project for stale hexes, family names, and
  copy after every palette/type change; entry HTMLs are part of the system.

## Placeholder & substitution policy

- **Fonts**: nearest Google Fonts match; comment the substitution at the
  `@font-face`/`@import` site AND in the README; ask for real files.
- **Icons**: nearest CDN set matched on stroke weight + terminal style; flag it.
- **Imagery**: if shipping a faithful brand system, crop real imagery from the
  source. If shipping a re-brandable base, generate neutral placeholder images
  (flat tone + simple glyph + "IMAGE" label) — make heroes mid/dark-toned so
  white overlay text stays legible.
- **Logo**: reproduce as styled text if the logo is typographic; otherwise use a
  clearly-placeholder lockup and ask for the asset. Never draw a fake logo mark.
- **Copy**: faithful system → verbatim source copy. Base system → transparently
  generic strings ("Product One", "Your headline, front and center.") that no one
  could mistake for real content.

## Verification protocol

- **Compiler clean**: the design-system validator reports no issues; all
  components, cards, and starting points registered.
- **Visual pass per artifact**: components (all states), each UI-kit screen, each
  route transition, the showcase top-to-bottom.
- **Trust the DOM over capture tools**: DOM-to-image screenshotters mis-render
  webfonts and CSS `gap`. When a screenshot looks broken, measure the live DOM
  (`getBoundingClientRect`, `getClientRects().length` for line counts,
  `document.fonts.check(...)`) before "fixing" phantom bugs.
- **Console clean** on every entry HTML.

## Audit checklist (run side-by-side with source before delivery)

**Color** — page bg hex matches sample · card/surface hexes match · primary
action hex matches · badge/label fills match · text colors match · accent used
ONLY where source uses it · shadows tinted with source ink, not neutral grey.

**Type** — families match classification · display weight matches (500 medium ≠
700 bold) · italic/weight-mix devices reproduced · label device matches (italic
serif vs eyebrow vs none) · casing conventions match · no invented tracking.

**Geometry** — radii per element class measured & matched · nav shape + height ·
logo position · container width · section rhythm · button shape · chip shape.

**Components** — every primitive observed in source exists · no primitive
invented without flag · states implemented · slots compose (badge-in-card).

**Chrome & layout** — nav link order/treatment · utility icon set & order ·
footer structure (or flagged extrapolation) · breadcrumb/sort/filter treatments.

**Copy** — voice/person/casing match or placeholders are transparently generic ·
no leftover brand strings after a genericization pass (grep for them).

**Docs** — every substitution flagged · extrapolations listed · README sections
complete · manifest matches actual files.

**Propagation** — grep for stale hexes/fonts/names across `*.jsx`, `*.html`,
`*.css`, `*.md` after any system-wide change.
