# De-Branding Checklist

How to turn screenshots of someone else's website into a **brand-agnostic design system**
that can be applied to any practice. Run this per ingest — it's the quality gate between
"a description of their site" and "a template we can re-skin."

## The one rule

> **Separate IDENTITY from SYSTEM.** Capture the transferable system (rules, relationships,
> ratios, classifications, treatments) and strip the source's identity (the specific brand
> fill). Identity lives ONLY in `*.reference` fields — preview/anchor use, never shipped.

Identity has **two axes**, and both get stripped:
1. **Brand identity** — hexes, fonts, photos, copy, name (the table below).
2. **Industry context** — the source's domain constructs. The entry is always expressed as a
   **dental practice site**: source sections translate to practice equivalents (products →
   services, pricing tiers → treatment packages, shop CTA → book appointment, team →
   doctor-intro), sections with no practice equivalent (cart, checkout, product pages) are
   dropped, and every free-text field is written in practice vocabulary. We are borrowing the
   source's design *language*, never its *subject matter*.

**Portability test** — apply to every transferable field: *could this value render a
pediatric dentist, a luxury med-spa, AND a family practice without looking wrong?*
If a value only makes sense for the source brand, it's identity → move to `reference` or drop.

## What transfers vs what gets stripped

| Layer | STRIP (identity) | TRANSFER (system — the template) |
|---|---|---|
| **Color** | the literal brand hues | theme (light/dark), saturation level, contrast targets, 60/30/10 distribution, temperature strategy, accent restraint, surface-derivation rule |
| **Type** | the specific (often proprietary) font | the *classification* (resolves to a font-pairing bucket), scale ratio, weight strategy, tracking, case, measure, line-height |
| **Shape/Material** | — | radius scale, border treatment, shadow philosophy, card treatment |
| **Layout** | the source's actual content | section composition, rhythm, grid, density, variant map |
| **Imagery** | the actual photos | crop style, color grading, framing, subject treatment, image-to-text ratio |
| **Mood/Voice** | brand name, taglines, products | tone adjectives, formality, sentence rhythm, favored/banned vocabulary kinds |
| **Motion/Tech** | — | motion philosophy, interaction/hover/focus patterns |

Color and type are the subtle ones: **keep the relationships, drop the values.**
"Muted, cool, high-contrast, one sparingly-used accent ~10%, surfaces tinted from the base"
is a system that re-skins onto any practice's palette. `#6b7257` is identity — reference only.

## The checklist

1. **Color → relationships, not hues.** Record theme, saturation, contrast target,
   accent-usage ratio, temperature, surface-derivation rule into `tokens.color.strategy`.
   Literal hexes → `tokens.color.reference` and *only* there.
2. **Type → classify, don't name.** Map display + body to a `type.classification` bucket
   (`editorial-serif | display-serif | humanist-trust | modern-grotesque | geometric-clean`
   — the builder's font-pairing buckets, so every practice resolves to a real, license-clean
   Google Font). Capture scale/weights/tracking/case. State `substitutionCriteria` (what a
   substitute font must preserve). Literal font name → `reference`.
3. **Imagery → recipe, not photos.** Crop, grading, framing, subject treatment,
   image:text ratio into the `imagery` block. Never the actual images.
4. **Voice → tone, not copy.** Formality, rhythm, favored/avoided vocabulary kinds into
   the `voice` block. Never the source's headlines or product names.
5. **Layout → grammar, not content.** Variant per section (`layout.variants`) +
   composition prose for what the variant pick can't encode. The source's words are irrelevant.
6. **Strip residue — brand AND industry.** No brand name, logo, product name, location, or
   proprietary-font dependency survives in any transferable field; no source-industry
   construct (cart, product grid, checkout, store vocabulary) survives anywhere — translated
   to a practice equivalent or dropped.
7. **Run the portability test** on every transferable field (three-practices question above).
   Failures → `reference` or drop.
8. **Flag capability gaps** in `fidelity` (variant / theme / token) and **sanction only
   deliberate, well-executed taste choices** in `audit.sanctionedPatterns` (remember the
   linkage rule: a sanctioned pattern implying a rendering capability must also appear as a
   `fidelity.gaps` entry until that capability is built).

## Pass criteria

An entry passes de-branding when someone who never saw the source **could not name the
original brand — or its industry — from the transferable fields alone** — yet could
faithfully rebuild its *feel* for a new practice.
