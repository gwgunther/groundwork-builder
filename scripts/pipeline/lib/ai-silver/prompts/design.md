You are OBSERVING and describing a dental practice website's CURRENT visual design — exactly as it looks today. You are NOT redesigning it. Describe what IS, objectively, like a design critic documenting the existing site.

# Inputs

WEBSITE: {{baseUrl}}

You are given SCREENSHOTS of the live homepage (above-the-fold + a content section), plus:

## Exact computed design tokens (read from the rendered DOM — authoritative for values)

{{computedTokens}}

## CSS color list (hex values found in the stylesheet)

{{cssColors}}

# Output — strict JSON

```
{
  "currentDesign": {
    "palette": [
      { "hex": "#1b7a8c", "role": "primary | secondary | accent | background | text | neutral", "colorName": "plain-language name a human would use ('teal', 'navy', 'warm gold', 'charcoal')", "usage": "where it appears (nav, buttons, headings, page bg…)" }
    ],
    "typography": {
      "headingFont": "Family name as rendered (from computed tokens; strip fallbacks)",
      "bodyFont": "Family name as rendered (from computed tokens; strip fallbacks)",
      "headingStyle": "serif | sans-serif | slab | script | display",
      "scale": "Use the computed H1 px vs base px ratio: 'tight' (H1 < 2× body), 'moderate' (2–3×), 'dramatic' (> 3×). State the ratio in scaleNote.",
      "scaleNote": "e.g. 'H1 36px vs 16px body = 2.25× → moderate'",
      "weight": "Report the VISUAL heaviness of headings as they appear. If the heading font NAME encodes a weight (e.g. 'Swis721 Heavy', 'Montserrat Black', 'Lato Light'), that wins — 'Heavy'/'Black'/'Bold' → 'bold', 'Light'/'Thin' → 'light'. Otherwise use the computed h1Weight token: ≤300 'light', 400–500 'regular', ≥600 'bold'. Match what the headings LOOK like in the screenshot."
    },
    "layoutStyle": "Describe the layout language: e.g. 'centered single-column, generous whitespace', 'dense multi-column with sidebar', 'full-bleed hero + card grid'",
    "spacingDensity": "airy | balanced | dense",
    "mood": ["3-6 adjectives for the emotional read: e.g. 'clinical', 'warm', 'playful', 'dated', 'corporate', 'premium', 'cluttered'"],
    "imageryStyle": "Describe photography/graphics: e.g. 'stock clinical photos', 'real team photos', 'illustrated/cartoon (kid-friendly)', 'no imagery', 'before/after heavy'",
    "era": "modern | transitional | dated-2010s | dated-2000s — how current it feels",
    "datednessNote": "1 sentence on what makes it feel current or dated",
    "brandStrength": 1,
    "brandStrengthNote": "1 sentence — is there a coherent, distinctive brand, or is it generic/template?",
    "notableElements": ["distinctive design features: e.g. 'dolphin logo mark', 'teal-to-navy gradient hero', 'rounded card corners', 'sticky CTA bar'"]
  }
}
```

# Rules

1. **OBSERVE, don't improve.** Report the site as it actually appears in the screenshots. If it's dated and cluttered, say so. Do NOT suggest or invent a better design — that's a different step.
2. **Use the computed tokens for exact values** (font families, button bg, radius, sizes) — they're read from the live DOM and are authoritative. Use the screenshots for everything the tokens can't convey: layout, mood, imagery, overall feel.
3. **palette — DRIVEN BY THE SCREENSHOT, not the CSS list.** This is the #1 accuracy rule and the most common failure:
   - Work backwards from the IMAGE. Point at the screenshot: "the nav bar is X, the primary button is Y, headings are Z, the page background is W, body text is C." Those observed colors ARE the palette.
   - For the dominant `backgroundColor` token and `headerBg` token, trust the SCREENSHOT over the token — if the nav/header looks white in the image, its role color is white/near-white; do NOT label a CSS blue as "nav background" when the nav renders white.
   - Only attach a hex once you've matched a VISIBLE color to the nearest token/CSS value. If you can't tie a visible color to a token, give your best-estimate hex from the pixels rather than borrowing an unrelated token.
   - HARD EXCLUDE any hex from the CSS list/tokens that you cannot point to in the screenshot (buried hover navies, unused chartreuse/blue accents, theme leftovers).
   - **Cap at 3–5 colors, each one you could circle in the screenshot.** A short, fully-verifiable palette scores far better than a padded one. When unsure about a color, leave it out.
   - Match the shade you actually see: if the heading blue looks deep navy, don't report a medium blue token just because it's in the CSS. Pick the token closest to the rendered shade.
   - Exclude pure white/near-black unless they're genuinely a defining brand choice (then mark role 'background'/'text').
   - **`usage` must describe the color's GENERAL role, not a pinpoint element a crop could contradict.** Write "brand primary — header/accents, section headings, links" rather than "navigation bar background." Only name one specific element (e.g. "primary button fill") when that element UNMISTAKABLY shows the color in this screenshot. A brand color present in the header area, headings, or accents is role 'primary'/'secondary' even if the top nav bar itself renders white/transparent over the hero.
4. **brandStrength** — integer 1 (generic template, no identity) to 5 (strong, distinctive, cohesive brand).
5. **mood / era / imageryStyle** — these come from LOOKING at the screenshots. Be honest and specific.
6. **Null over guess** — if a screenshot wasn't provided or a value is genuinely indeterminate, use null. Never fabricate a hex or font you don't see.

Return ONLY the JSON object.
