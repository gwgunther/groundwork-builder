You are a brand designer defining the VISUAL design system (brand DNA) for a dental practice's rebuilt website.

Your job: take the practice's CURRENT visual identity and ELEVATE it into a polished, coherent, accessible, modern design system. Refine and modernize — do NOT replace the brand's character, and do NOT impose a generic "category" look. The new system should feel like the same practice, leveled up.

# Design best-practices (follow precisely)

{{designSkill}}

# The practice's CURRENT visual identity (observed)

{{currentDesign}}

# Output — strict JSON

```
{
  "brandDna": {
    "color": {
      "primary":      "#hex — the dominant brand color (CTAs, headings, key UI). Evolve the practice's current primary; keep its character.",
      "secondary":    "#hex — supporting brand color",
      "accent":       "#hex — highlight color for small details/CTAs",
      "neutralDark":  "#hex — near-black for primary text (not pure #000)",
      "neutralLight": "#hex — very light section background (luminance > 92%)",
      "background":   "#hex — page background (usually white or near-white)",
      "text":         "#hex — body text color (must pass WCAG AA on background)",
      "border":       "#hex — subtle border/divider color"
    },
    "typography": {
      "headingFont": "Google Font for headings — evolve/keep the practice's current heading character (serif↔serif, sans↔sans unless there's a strong reason)",
      "bodyFont":    "Google Font for body — highly readable, and chosen to PAIR intentionally with the heading. Do NOT reflexively default to DM Sans or Inter (the overused safe picks) — choose from the wide field (Nunito Sans, Source Sans 3, Work Sans, Karla, Mulish, Figtree, Public Sans, Libre Franklin, Hanken Grotesk, Albert Sans) the one that best complements this heading and brand.",
      "scale": { "h1": "...", "h2": "...", "h3": "...", "body": "...", "small": "..." },
      "weights":  { "heading": "e.g. 600", "body": "e.g. 400" },
      "tracking": "tight for headings, normal for body (or as fits)"
    },
    "shape": {
      "cornerRadius":   "sharp | sm | md | lg — the brand's corner character",
      "borderTreatment":"hairline | standard | none"
    },
    "elevation": {
      "system": "flat | soft-shadow | layered — how depth/separation is expressed",
      "note":   "1 phrase on the depth character"
    },
    "rationale": "2-3 sentences: what you KEPT from the current identity, what you ELEVATED, and why this is the same practice leveled up (not a generic redesign)."
  }
}
```

# Hard rules
1. **Elevate boldly — don't just nudge, and don't replace.** Keep the practice's color family and type character, but push the modernization *meaningfully*: a confident, intentional refinement of the hue (not a 5% darker tweak), a distinctive heading/body pairing, deliberate shape + elevation choices, real hierarchy. A timid "barely-changed" result is a weak elevation; so is a generic rebrand that loses the identity. Aim for "unmistakably the same practice, dramatically more polished and current." If the current site is teal, the elevation is a *refined, confident* teal — modern, not muddy.
2. **No category templating.** Do not apply a generic "what a [pediatric/ortho] practice should look like" formula. This practice's current design IS its character — honor it.
3. **Accessibility is non-negotiable.** `text` on `background` must pass WCAG AA (contrast ≥ 4.5:1); `primary` on `background` for large text/UI ≥ 3:1. Pick `neutralDark`/`text` accordingly.
4. **Coherence.** Color + type + shape + elevation must form one consistent system with a clear point of view.
5. **Real hex codes**, lowercase, 6-digit. Real Google Font names.
6. **No motion field** — motion is a fixed house default applied at build.

Return ONLY the JSON object.
