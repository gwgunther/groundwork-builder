# Design Principles — Shared Core

> **Single source of design truth.** This is the canonical tenet set consumed by BOTH ends of the
> Build→Audit loop, so the thing that GENERATES and the thing that JUDGES are calibrated to the same
> standard (without this, the refine loop chases a moving target and never converges):
>
> - **Generator** (Step 6 — layout director + `generate-sections`): builds toward §A tenets.
> - **Judge** (Step 7 — pixel-quality): scores the render against the §B screenshot-observable signals.
>
> Detailed, stack-specific guidance lives in `design.md` (project brand judgment) and `taste-frontend.md`
> (framework-agnostic craft + dials). Those are the generator's deep references; THIS file is the shared
> distillation both ends agree on. Where they conflict, project rules (`design.md`) win.

---

## §A — Tenets (what "good" means)

1. **Elevated, not reinvented.** Keep the practice's own character; make it the best version of itself.
   Never a generic category rebrand.
2. **Intentional color.** One dominant neutral base, ≤1 saturated accent (<80% sat), 60/30/10 distribution.
   Warm-with-warm / cool-with-cool — never mix temperatures without a bridge. No pure black (`#000`).
3. **Hierarchy by weight + space, not just size.** A clear single focal point; scannable order; restraint
   over oversized H1s.
4. **Distinctive, readable type.** Heading font with character; body font that disappears. Serif+sans is
   the safe pairing. Not Inter/Roboto/Open Sans as the "premium" default.
5. **Layout variety, anti-cliché.** Avoid the centered-text-over-dark-photo hero and the 3-equal-card row.
   Prefer asymmetric/split/editorial when brand variance allows. Vary section rhythm (spacing/density).
6. **Card restraint + refined materiality.** Cards only when elevation signals hierarchy; otherwise
   hairlines/whitespace. Tinted soft shadows, never gray box-shadow glows or neon.
7. **Coherence.** Color + type + shape + spacing read as ONE system with a point of view.
8. **Accessible by construction.** WCAG AA: 4.5:1 body, 3:1 large/UI. Visible focus states.
9. **No AI-slop tells.** No filler verbs ("Elevate/Seamless/Unleash"), no fake-precise numbers, no generic
   stock-photo emptiness, no emoji, no purple/neon gradients, no broken/placeholder imagery.

---

## §B — Screenshot-observable signals (the JUDGE's rubric)

Each scored dimension maps to what is VISIBLE in a homepage screenshot. Score 0–10 (10 = top-tier custom
agency; 8 = clearly above template-default; 6 = acceptable-but-generic; 4 = visibly flawed; 2 = broken).

| Dimension | Looks GOOD (→high) | Looks BAD (→low) |
|---|---|---|
| **brandCoherence** | the brand-dna palette + type character are visibly used and unified | generic dental-default colors; palette doesn't match the brand-dna reference; mismatched temperatures |
| **visualHierarchy** | one clear focal point, scannable top-to-bottom order, intentional emphasis | competing focal points; flat/uniform emphasis; oversized H1 with no support |
| **typography** | distinctive heading, readable body, deliberate scale/rhythm, good measure | Inter/Roboto generic feel; cramped or ballooned scale; weak pairing |
| **layoutComposition** | intentional spacing, alignment, balance; varied section rhythm; asymmetry where apt | centered-over-dark-photo hero; 3-equal-card row; uniform padding monotony; awkward gaps |
| **polish** | refined materiality (tinted soft shadows, hairlines), custom feel, considered imagery | template-generic; gray box-shadows; neon/purple; off/irrelevant hero image; placeholder vibes |
| **overall** | reads as a real, custom, on-brand practice site | reads as an AI/template default |

**Hard penalties (cap the relevant dimension ≤4 if present):** pure black text/bg; Inter as the display
face on a "premium/warm" brand; centered-text-over-dark-image hero; 3 identical service cards; visible
purple/neon gradient; emoji in content; an off-topic/wrong hero image; any placeholder/Lorem/TODO text.

---

## §C — Notes for the refine loop

When the judge flags a low dimension, route the fix to its OWNER (never patch the render layer):
- brandCoherence/contrast → **brand-dna** tokens
- layoutComposition/polish (cliché layout, card overuse) → **layout director / variant** choice
- off/irrelevant hero → **image binding** hero selection
- typography generic → **brand-dna** font choice
Candidate fix-actions already in the repo: `skill-bolder`, `skill-colorize`, `skill-critique`.
