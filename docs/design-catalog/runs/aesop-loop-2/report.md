# Ingest report — aesop-apothecary-warm-v2

Result: **PASS** after 2 iteration(s) · est. cost $0.53

Signature elements (judge): Two-surface warm ivory system: distinct page ground (#fffef2) and card surface (#f6f5e8) — not white, not grey · Horizontally scrollable editorial card carousel with dot pagination and full-width near-black CTA buttons per card · Horizontal image-tile specialty/category browser as a navigation device with label below each tile · Pill-shaped filter chips coexisting with globally sharp-cornered button system in the comparison/filter section

| iter | result | failed | J1 | J2 | J3 | J4 | J5 | J6 | J7 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | fail | 2 | 5 | 5 | 4 | 5 | 5 | 5 | 5 |
| 2 | pass | 0 | 5 | 5 | 4 | 5 | 5 | 5 | 5 |

## Final eval

- ✓ **M1-schema** — valid
- ✓ **M2-hex-residue** — clean
- ✓ **M3-industry-residue** — clean
- ✓ **M4-coverage-depth** — ok
- ✓ **M5-linkage** — consistent
- ✓ **M6-eyebrow-policy** — coherent
- ✓ **M7-color-accuracy** — all reference hexes within tolerance of 9 observed colors
- ✓ **J1-character** (5/5) — Source: humanist grotesque (SuisseIntl), warm ivory/cream temperature, flat materiality, emphasis via weight-shift and sparse amber eyebrow labels only. Entry correctly names modern-grotesque, warm-editorial archetype, sharp radius, flat elevation, amber accent sparing on eyebrows only, two-surface warm neutral system. Would clearly not describe a generic blue-CTA healthcare site or a cool-minimal SaaS site.
- ✓ **J2-color** (5/5) — All six reference hexes match the computed-style probe exactly: pageBackground #fffef2, cardSurface #f6f5e8, nearBlack #252525, headingText #333333, secondaryText #666666, lightText #fffef2, accentAmber #945c26. Strategy correctly describes two warm neutrals as dominant surfaces, near-black reserved for chrome and filled buttons, amber appearing only on micro-labels. No hex drift detected.
- ✓ **J3-layout** (4/5) — heroLayout poster, navVariant split-logo, footerVariant classic-4col, galleryVariant full-bleed-row all confirmed in screenshots. faqLayout two-column is admitted as invented in grounding notes with no FAQ visible — acceptable as schema-required inference. servicesLayout card-grid is slightly imprecise (the source shows a horizontally scrollable carousel, not a static grid) but this is acknowledged in novel[] and fidelity.gaps. Composition descriptions for hero, nav, footer, services, about, trustSignals, pullQuote all match visible screenshot evidence.
  - fix: Minor: servicesLayout enum could be 'carousel' if available in schema, but the gap is already declared in novel[] so no critical fix needed.
- ✓ **J4-heading-anatomy** (5/5) — Eyebrow policy 'sparing' confirmed: screenshot shows eyebrow labels on selected sections only (A moment for mentors, Enlightening assistance, Perfectly portable, Signature fragrances) but not on New and Notable, Compare our fragrances, Recommended reading, or the pull-quote section. EmphasisDevice correctly identified as weight shift (regular h1/h2 at 30px, SuisseIntl-Medium for h3) and warm amber on eyebrow labels only — confirmed by probe headings data. No italic, no uppercase, no imported eyebrow-on-every-section pattern.
- ✓ **J5-translation** (5/5) — All free-text fields use dental vocabulary: 'boutique or specialist dental practice', 'cosmetic or holistic-leaning practices', 'treatment cards', 'book-appointment CTA', 'dental specialty', 'whitening tiers, aligner brands, implant types', 'clinical instruments', 'doctors and clinical staff'. Product sections mapped to services, fragrance comparison mapped to treatment comparison carousel. Imagery subjectTreatment describes doctors' hands at work, treatment rooms, clinical instruments — all appropriate dental translations of the source's apothecary/product photography style.
- ✓ **J6-honesty** (5/5) — Signature elements: (1) Two-surface warm ivory system (#fffef2 page + #f6f5e8 card) — captured in tokens.color.reference and strategy, gap declared for token extension. (2) Horizontally scrollable product/service card carousel with dot pagination — declared as novel requiresNewComponent:true with full spec. (3) Horizontal image-tile navigation row (Browse by category) — declared as novel requiresNewComponent:true. (4) Pill filter chips in fragrance comparison section coexisting with global sharp-corner system — declared as novel requiresNewComponent:true with token gap noted. No silent flattening detected.
- ✓ **J7-checks** (5/5) — 12 fidelityChecks present, all specific to this design. Examples verifiable from build screenshot: 'Hero must be full-bleed poster with centred headline in warm off-white and a hairline outline CTA — no scrim overlay, no gradient, no pill button' (would catch generic hero with gradient scrim); 'Warm amber accent must appear only on eyebrow and category micro-labels, never on headings, body copy, or buttons' (would catch accent misuse); 'Footer must render on a near-black ground with warm off-white link text — not a light or grey footer' (would catch neutralized footer); 'Page background must be warm ivory, not pure white' (would catch neutralization to #ffffff). All checks protect signature elements and are specific enough to fail a generic build.