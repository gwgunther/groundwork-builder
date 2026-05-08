---
tier: L1
maturity: polished
phase: Director
source: scripts/pipeline/lib/ai-director.js
function: buildPrompt
model: claude-sonnet-4-6
---

# Skill: Creative Director (Design DNA)

## Responsibility

Picks a DISTINCT visual direction for the practice — archetype, hero variant,
chrome variants, motion level, radius level, section order — actively diverging
from recent own-builds and the practice's own anti-inspo. Output is the
"design DNA" that drives every downstream layout decision. The director runs
3 candidates in parallel at temperatures 0.7 / 0.9 / 1.0, then a low-temp
evaluator picks the best. The brand brief from `ai-brand-direction.js` is the
director's primary creative anchor — the director orchestrates LAYOUT around
the brand, not the other way around.

**What the director does NOT pick:**
- `density` (airy/balanced/dense) is owned by Brand Direction. The director
  consumes it from the brief; `normalizeDna` stamps it onto the DNA from
  `brandBrief.spatial.density` regardless of what the model returned. The
  prompt no longer asks for it. This was a fix to remove a leak where two
  phases could pick conflicting density.
- `motion` and `radius` are still picked by the director (as abstract enum
  levels: `none|subtle|expressive`, `sharp|sm|md|lg|pill`) but soft-guided by
  Brand Direction's CSS-level `motion.pageEntrance` / `motion.transitions` and
  `spatial.cardRadius` character. The director must align with that character
  but is not stamp-overridden.

Recent additions: archetype family axis (classic-warm vs editorial-bold) with
explicit personality matching to practice positioning; color-temperature and
typography-personality guidance baked into the archetype mapping;
hard-overrides on chrome variants in `derive-design-tokens.js` to prevent
chrome-variant collisions across builds.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `dataSignals` | object | derived from merged | hasStats / hasGallery / hasReviews / hasTeamPhotos / hasSecondaryDoctor / serviceCount / hasHeroImage |
| `dataSignals.practice` / `.doctor` / `.city` | string | merged | |
| `design.mood` | string | extraction | |
| `design.rationale` | string | extraction | |
| `brandBlock` | string | derived | If brandBrief: pre-formatted "Brand Direction Brief" block; else empty |
| `auditBlock` | string | derived | If audit: "Practice Strategy" block with positioning + serviceEmphasis + differentiators; else empty |
| `iaBlock` | string | derived | If dental-ia.md loaded: pre-formatted IA reference block; else empty |
| `owns` | JSON string | library.own | Recent own-builds — DIVERGE from these |
| `inspos` | JSON string | library.inspo | Cross-pollinate, borrow ONE trait |
| `antis` | JSON string | library.anti | Explicit "do not echo" |

## Output schema

```json
{
  "archetype": "editorial-asymmetric | centered-classic | magazine-split | minimal-brutalist | warm-editorial | card-heavy | poster-hero | bold-serif-driven",
  "heroVariant": "centered | asymmetric-left | asymmetric-right | split-image | full-bleed | poster",
  "servicesVariant": "cards-3up | editorial-list | accordion",
  "navVariant": "centered-logo | left-logo | split-logo | transparent-overlay | top-bar",
  "footerVariant": "minimal-dark | editorial-split | classic-4col | compact-centered | bold-cta-footer",
  "ctaVariant": "full-width-dark | split-card | inline-minimal",
  "doctorVariant": "portrait-left | portrait-right | editorial-full",
  "galleryVariant": "masonry-3col | editorial-2col | filmstrip | featured-grid | full-bleed-row",
  "sectionOrder": ["hero", "..."],
  "cardTreatment": "bordered-flat | soft-shadow | elevated | ghost",
  "motion": "none | subtle | expressive",
  "radius": "sharp | sm | md | lg | pill",
  "borrowedFrom": "string | null",
  "borrowedTrait": "string",
  "headingScale": "dramatic | moderate | restrained",
  "sectionDivider": "none | line | space | color-shift",
  "heroTextPosition": "bottom-left | center | right",
  "divergenceRationale": "string — 2-3 sentences",
  "creativeDirection": "string — 1-2 sentences"
}
```

## Evaluation criteria

- **Archetype matches practice personality** — classic-warm family for general/family/community; editorial-bold for specialist/premium/urban
- **Color temperature matches archetype family** — warm tones for classic family, cool tones for editorial bold
- **Typography personality matches archetype** — humanist serif for warm-family, grotesque/display for editorial-bold
- **Diverges from own-builds** — archetype + heroVariant combo must not match any entry in `owns`
- **Within-family novelty** — does not repeat the same archetype as a previous build, even if it matches the family
- **Drops sections with missing data** — no stat-bar without stats, no gallery without ≥4 images, no reviews without testimonials, no doctor-intro without doctor name (caller hard-strips these regardless)
- **Hero/services/cta always present** in sectionOrder (caller enforces minimum)
- **Density is inherited, not picked** — `dna.density === brandBrief.spatial.density` always, stamped by `normalizeDna`. Director's prompt does not include it
- **Motion level matches brand brief character** — "brief and functional" pageEntrance → subtle/none; expressive description → expressive
- **Radius level matches brand brief cardRadius** — "rounded-2xl" → lg, "rounded-xl" → md, "rounded-none" → sharp
- **Borrowed trait is named** — borrowedFrom + borrowedTrait, with the trait called out in divergenceRationale
- **All enum fields valid** — invalid values fall back to defaults in normalizeDna (caller)
- **Returns only JSON**

## Known gaps

- Personality matching depends on the brand-direction phase setting the right tone signals upstream — if those are wrong, the director compounds the error
- No explicit feedback loop from coverage-audit / build outcomes back into anti-inspo (a build that produced a generic-looking site doesn't automatically poison its archetype for next time)
- "Borrowed trait" is often vague ("color contrast", "section rhythm") — hard to verify the borrow actually shows up in the build
- Section order rules don't yet learn from practice-vertical patterns (specialists may benefit from services-before-doctor)
- 3-candidate evaluator can prefer "safe" candidates when the candidates differ mostly in unmeasurable ways (radius / motion / cardTreatment)
- Director and Brand Direction still use different vocabularies for motion (CSS values vs `none|subtle|expressive`) and radius (Tailwind class vs `sharp|sm|md|lg|pill`). Soft guidance asks Director to align but there's no automated check that it actually did. Density was the only field strict enough to deterministically stamp; the others remain best-effort.

## Improvement levers

1. **Easy (L1):** Tighten "Within each family, pick a DIFFERENT archetype" with an explicit list of recent same-family archetypes used
2. **Easy (L1):** Add a hard rule that `borrowedTrait` must reference a concrete UI element (color/spacing/component), not a vibe
3. **Medium:** Feed coverage-audit findings from past builds into anti-inspo automatically
4. **Medium:** Per-vertical section-order priors (orthodontics → before-after gallery first; cosmetic → reviews early)
5. **Hard:** Replace LLM evaluator with a deterministic scorer that measures actual layout-token diversity vs. own-builds

## Test fixtures

**References (5 fixtures, all stamped to brand.spatial.density):**

| Fixture | Archetype | heroVariant | radius | motion |
|---|---|---|---|---|
| `lbpds-pediatric/director-run1.json` | editorial-asymmetric | asymmetric-left | sm | subtle |
| `chang-orthodontics/director-run1.json` | magazine-split | asymmetric-left | lg | subtle |
| `orange-county-dental-care/director-run1.json` | magazine-split | asymmetric-left | lg | subtle |
| `oc-healthy-smiles/director-run1.json` | magazine-split | asymmetric-left | lg | subtle |
| `elements-dentistry/director-run1.json` | **card-heavy** (warm family) | asymmetric-left | lg | subtle |

Run `node scripts/pipeline/test-fixtures.js` for shape validation including the density-stamping invariant (`dna.density === brand.spatial.density`).

**Note:** 3 of 5 picked `magazine-split`. Each fixture run is independent (no shared library history), so the "diverge from own-builds" rule has no signal across separate test runs. In a real pipeline run with library history, divergence kicks in.

**Future:** more archetype variety — `centered-classic`, `warm-editorial`, `poster-hero`, `bold-serif-driven`, `minimal-brutalist` are all unrepresented.

---

## PROMPT

You are the Creative Director for an AI website generator. Your job: pick a DISTINCT visual direction for this practice, grounded in the brief, actively diverging from our recent builds.

# Brief
- Practice:     {{dataSignals.practice}}
- Doctor:       {{dataSignals.doctor}}
- City:         {{dataSignals.city}}
- Mood (from design phase): {{design.mood}}
- Palette mood hint:        {{design.rationale}}
{{brandBlock}}
{{auditBlock}}
{{iaBlock}}

# Brand Direction Brief context (when present, embedded in `brandBlock`)

The brand brief is the director's primary creative anchor. It contains:
- `Density (FIXED — set by Brand Direction, not your call)` — the director MUST NOT include `density` in its output. `normalizeDna` stamps it onto the DNA from the brief regardless of model output.
- `Card radius character (guidance)` — Tailwind class like "rounded-2xl". The director picks an abstract level (sharp/sm/md/lg/pill) that aligns with this character.
- `Motion character (guidance)` — descriptive prose about transitions / page entrance. The director picks an abstract level (none/subtle/expressive) that aligns.


# Available data (drives section presence — do NOT include sections whose data is missing)
- hero image?            {{dataSignals.hasHeroImage}}
- team photos?           {{dataSignals.hasTeamPhotos}}
- gallery (≥4 photos)?   {{dataSignals.hasGallery}}
- stats data?            {{dataSignals.hasStats}}
- testimonials?          {{dataSignals.hasReviews}}
- secondary doctor?      {{dataSignals.hasSecondaryDoctor}}
- service count:         {{dataSignals.serviceCount}}

# Recent own-builds (DIVERGE from these — do NOT pick the same archetype + hero variant combo)
{{owns}}

# Anti-inspo (explicit "do not echo")
{{antis}}

# Pull references (cross-pollinate; borrow ONE trait from any of these)
{{inspos}}

# Allowed values
- archetype:         editorial-asymmetric | centered-classic | magazine-split | minimal-brutalist | warm-editorial | card-heavy | poster-hero | bold-serif-driven
- heroVariant:       centered | asymmetric-left | asymmetric-right | split-image | full-bleed | poster
- servicesVariant:   cards-3up | editorial-list | accordion
- navVariant:        centered-logo | left-logo | split-logo | transparent-overlay | top-bar
- footerVariant:     minimal-dark | editorial-split | classic-4col | compact-centered | bold-cta-footer
- ctaVariant:        full-width-dark | split-card | inline-minimal
- doctorVariant:     portrait-left | portrait-right | editorial-full
- galleryVariant:    masonry-3col | editorial-2col | filmstrip | featured-grid | full-bleed-row
- headingScale:      dramatic | moderate | restrained
- sectionDivider:    none | line | space | color-shift
- heroTextPosition:  bottom-left | center | right
- sections (any subset, ordered): hero, doctor-intro, stat-bar, services, gallery, reviews, faq, cta

# Archetype personality axis — CRITICAL for differentiation
Archetypes are split into two families. Your archetype MUST match the practice personality:

**Classic/warm family** → use for: general dentistry, family practices, community-focused, accessible, friendly brands
  Archetypes: centered-classic | warm-editorial | card-heavy
  These produce: centered hero, card-grid services, card-row testimonials
  Color temperature: WARM — earth tones, terracotta, sage, cream. Navy or cool-gray backgrounds feel wrong here.
  Typography: humanist serif heading (DM Serif Display, Playfair Display, Lora) — warm, readable, trustworthy

**Editorial/bold family** → use for: specialists (ortho, implants, cosmetic), premium/luxury positioning, urban practices, brands with strong visual identity
  Archetypes: editorial-asymmetric | magazine-split | poster-hero | bold-serif-driven | minimal-brutalist
  These produce: split hero, alternating-rows services, pull-quote testimonials
  Color temperature: COOL or NEUTRAL — navy, charcoal, steel blue, muted forest green, slate. Terracotta or warm-amber reads as the wrong personality here.
  Typography: grotesque or display (Space Grotesk, Barlow Condensed, Syne, Clash Display) — bold, modern, high-contrast

Note: the brand direction phase runs before the director, so the palette may already be set. Use creativeDirection to call out if the chosen archetype and the provided palette are mismatched — this flags the tension for human review.

# Rules
1. Omit any section whose data is false above. Intelligent templates, not templated intelligence.
2. If stats data is missing, DO NOT include 'stat-bar' — do not render a card with dashes.
3. Archetype + heroVariant must differ from every own-build above.
4. **`borrowedTrait` MUST reference a concrete UI element**, not a vibe. Acceptable: "stacked editorial caption", "color-blocked CTA band", "asymmetric portrait offset", "thin-rule section dividers", "oversized type accent", "two-column rhythm". UNACCEPTABLE (rejected): "color contrast", "section rhythm", "modern feel", "clean look", "bold visual presence". A reviewer should be able to point at the rebuilt site and find the trait.
5. Density is set by Brand Direction (see brief above) — do not include it in your output.
6. Personality axis takes priority over divergence: do NOT pick an editorial archetype for a warm community practice just to be different from a previous build.
7. **Same-family novelty:** within the chosen family, pick a DIFFERENT archetype from every previous own-build IN THE SAME FAMILY. Look at the recent own-builds list above and identify which entries are in your chosen family — your archetype must not match any of them.

# Motion + radius soft guidance (when brand brief is present)
- Pick `motion` (none|subtle|expressive) to align with the brief's motion character: "brief and functional" → subtle or none; "expressive"/"playful" → expressive.
- Pick `radius` (sharp|sm|md|lg|pill) to align with the brief's cardRadius: "rounded-2xl"/"rounded-xl" → lg or md; "rounded-none"/"rounded-sm" → sharp or sm.

Return ONLY this JSON (no markdown, no prose):
{
  "archetype":        "<one of allowed>",
  "heroVariant":      "<one of allowed>",
  "servicesVariant":  "<one of allowed>",
  "navVariant":       "<one of allowed>",
  "footerVariant":    "<one of allowed>",
  "ctaVariant":       "<one of allowed>",
  "doctorVariant":    "<one of allowed>",
  "galleryVariant":   "<one of allowed>",
  "sectionOrder":     ["hero", "..."],
  "cardTreatment":    "bordered-flat|soft-shadow|elevated|ghost",
  "motion":           "none|subtle|expressive",
  "radius":           "sharp|sm|md|lg|pill",
  "borrowedFrom":     "<slug of inspo used, or null>",
  "borrowedTrait":    "<one short phrase>",
  "headingScale":     "dramatic|moderate|restrained",
  "sectionDivider":   "none|line|space|color-shift",
  "heroTextPosition": "bottom-left|center|right",
  "divergenceRationale": "<2–3 sentences — what you deliberately did NOT pick and why>",
  "creativeDirection":   "<1–2 sentences — the essence of this site's visual voice>"
}
