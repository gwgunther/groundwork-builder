# Skills Catalog

> **Auto-generated** from the frontmatter and bodies of every `skills/**/*.md` file.
> Re-run with: `node scripts/pipeline/skill-catalog.js`
>
> See [`PIPELINE.md`](./PIPELINE.md) for how skills compose into the build flow.

Last generated: 2026-05-04 19:01 UTC

## At a glance

| Skill | Tier | Maturity | Phase | Has Prompt |
|---|---|---|---|---|
| [audit/coverage-audit](../skills/audit/coverage-audit.md) | L4 | 🟡 working | Audit | — |
| [audit/site-audit](../skills/audit/site-audit.md) | L1 | 🟡 working | Audit | ✓ |
| [content/content-map](../skills/content/content-map.md) | L1 | 🟡 working | Generate | ✓ |
| [content/cta](../skills/content/cta.md) | L1 | 🟡 working | Generate | ✓ |
| [content/doctor-intro](../skills/content/doctor-intro.md) | L1 | 🟡 working | Generate | ✓ |
| [content/faq](../skills/content/faq.md) | L1 | 🟡 working | Generate | ✓ |
| [content/hero](../skills/content/hero.md) | L1 | 🟡 working | Generate | ✓ |
| [content/reviews](../skills/content/reviews.md) | L1 | 🟡 working | Generate | ✓ |
| [content/services](../skills/content/services.md) | L1 | 🟡 working | Generate | ✓ |
| [creative/derive-design-tokens](../skills/creative/derive-design-tokens.md) | L2 | 🟢 polished | Director | — |
| [creative/director](../skills/creative/director.md) | L1 | 🟢 polished | Director | ✓ |
| [design/brand-direction](../skills/design/brand-direction.md) | L1 | 🟢 polished | Brand Direction | ✓ |
| [design/design-extract](../skills/design/design-extract.md) | L1 | 🟡 working | Design Extract | ✓ |
| [extraction/image-roles](../skills/extraction/image-roles.md) | L1 | 🟡 working | Silver | ✓ |
| [extraction/silver](../skills/extraction/silver.md) | L1 | 🟢 polished | Silver | ✓ |
| [pages/blog-rewrite](../skills/pages/blog-rewrite.md) | L1 | 🟡 working | Generate | ✓ |
| [pages/service-page](../skills/pages/service-page.md) | L1 | 🟡 working | Generate | ✓ |

## Skills by phase

### Silver

#### [extraction/image-roles](../skills/extraction/image-roles.md)
*Tier L1 · 🟡 working · Model: `claude-haiku-4-5` · Source: `scripts/pipeline/lib/ai-image-roles.js` · Function: `classifyOne()`*

Classifies one downloaded image at a time using Claude Haiku Vision.

#### [extraction/silver](../skills/extraction/silver.md)
*Tier L1 · 🟢 polished · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-silver.js` · Function: `buildPrompt()`*

The bronze→silver transform.

### Design Extract

#### [design/design-extract](../skills/design/design-extract.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-design.js` · Function: `runDesignMapping()`*

Reads the **existing** site's current design and extracts what's actually there: the colors actually used, the fonts actually loaded, the visual mood, and an assessment of brand strength.

### Brand Direction

#### [design/brand-direction](../skills/design/brand-direction.md)
*Tier L1 · 🟢 polished · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-brand-direction.js` · Function: `runBrandDirection()`*

Produces deliberate brand guidelines (palette, typography, spatial, motion, voice, mood) for the NEW site.

### Director

#### [creative/derive-design-tokens](../skills/creative/derive-design-tokens.md)
*Tier L2 · 🟢 polished · Model: `deterministic` · Source: `scripts/pipeline/lib/derive-design-tokens.js` · Function: `deriveDesignTokens()`*

Deterministic mapping from Creative Director DNA + brand mood → concrete design tokens.

#### [creative/director](../skills/creative/director.md)
*Tier L1 · 🟢 polished · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-director.js` · Function: `buildPrompt()`*

Picks a DISTINCT visual direction for the practice — archetype, hero variant, chrome variants, density, motion, radius, section order — actively diverging from recent own-builds and the practice's …

### Generate

#### [content/content-map](../skills/content/content-map.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-content.js` · Function: `runContentMapping()`*

Pre-generation pass that uses scraped pages + audit recommendations to produce a **content map** of elevated, practice-specific copy.

#### [content/cta](../skills/content/cta.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `ctaContentBrief()`*

Produce content JSON for the closing call-to-action block: a compelling headline, soft subheadline, primary CTA, and phone.

#### [content/doctor-intro](../skills/content/doctor-intro.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `doctorContentBrief()`*

Produce the content JSON for the homepage Doctor Introduction block.

#### [content/faq](../skills/content/faq.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `faqContentBrief()`*

Produce 6–8 frequently-asked questions (with answers) for the homepage FAQ section.

#### [content/hero](../skills/content/hero.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `heroContentBrief()`*

Produce the content JSON for the homepage hero section: headline, subheadline, eyebrow, CTAs, and phone.

#### [content/reviews](../skills/content/reviews.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `reviewsContentBrief()`*

Produce content JSON for the homepage Reviews/Testimonials section.

#### [content/services](../skills/content/services.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/skills/skill-generate.js` · Function: `servicesContentBrief()`*

Produce content JSON for the homepage Services section: heading, optional eyebrow + subheading, and a per-service descriptions list.

#### [pages/blog-rewrite](../skills/pages/blog-rewrite.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-blog-rewrite.js` · Function: `rewriteBlogPost()`*

Restructures a scraped blog post (or `additionalContent[]` item of `type: blog-post`) into a clean Markdown body for the rebuilt site.

#### [pages/service-page](../skills/pages/service-page.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-service-page.js` · Function: `buildPrompt()`*

Restructures a single scraped service page (raw bodyText + headings) into a clean, multi-section service detail page: headline, subheadline, intro, 3–6 typed sections (highlight / subsection / call…

### Audit

#### [audit/coverage-audit](../skills/audit/coverage-audit.md)
*Tier L4 · 🟡 working · Model: `deterministic` · Source: `scripts/pipeline/lib/coverage-audit.js` · Function: `runCoverageAudit()`*

Whole-pipeline before/after audit.

#### [audit/site-audit](../skills/audit/site-audit.md)
*Tier L1 · 🟡 working · Model: `claude-sonnet-4-6` · Source: `scripts/pipeline/lib/ai-audit.js` · Function: `runSiteAudit()`*

Strategic recommendations for the redesign.

## Tier reference

- **L1** — Prompt — edit `## PROMPT` in the skill's `.md` file
- **L2** — Mapping — deterministic enum table (no AI call)
- **L3** — Component — Astro variant file
- **L4** — Pipeline step — orchestrating logic

## Maturity reference

- 🔵 stub — Placeholder, barely works. Not safe to ship from.
- 🟡 working — Reliable but unpolished. Acceptable output, room to improve.
- 🟢 polished — Well-tuned. Edge cases handled. Iterated multiple times.
- ⭐ mature — Battle-tested across many builds. Has eval fixtures.

## Evolution checklist

Skills with `stub` or `working` maturity that have known gaps — these are your highest-leverage improvements:

### [audit/coverage-audit](../skills/audit/coverage-audit.md) · 🟡 working

- `checkServicePageDepth` ratio is a single magic number (0.35) — doesn't account for legitimately short rewrites of long source pages
- `checkDifferentiators` token-matching is heuristic — labels with stop-words ("offers free consultation") can false-flag if the rebuild used different phrasing
- `no-blog-index` always fires when /blog/ doesn't exist, even if the source site had no blog — should compare against bronze
- Doctor name comparison is case-insensitive trim only — punctuation/middle-name variants (`Dr. J. Smith` vs `Dr. John Smith`) miss
- No check that rebuild homepage actually ment

### [audit/site-audit](../skills/audit/site-audit.md) · 🟡 working

- No verification that recommended services in `serviceEmphasis` actually have content depth in scraped data — can recommend emphasizing a service the practice barely offers
- "Tone" is a free-form phrase rather than a fixed taxonomy — downstream brand-direction has to regex-match it for warm/specialist signals
- Differentiators can drift toward generic ("experienced staff", "modern equipment") when scraped data is sparse
- `warnings` is often empty even when bronze data has obvious issues (404 socials, malformed JSON-LD)
- No memory of past audits for this practice — rebuilds with new scrape 

### [content/content-map](../skills/content/content-map.md) · 🟡 working

- Doesn't yet consume `silver.additionalContent[]` — could ground service intros in real practice voice
- No per-archetype tone calibration — same prompt regardless of warm/specialist
- Service map doesn't surface differentiators inline (technology, languages) into service intros
- Output is consumed by section briefs but not always — some briefs go straight to scraped data

### [content/cta](../skills/content/cta.md) · 🟡 working

- Tone calibration is uniform — same prompt for warm-family vs. clinical-specialist
- Doesn't pull differentiators from the audit (e.g. "same-day", "free consultation") to specialize the CTA copy
- Subheadline can drift toward generic "We can't wait to meet you"

### [content/doctor-intro](../skills/content/doctor-intro.md) · 🟡 working

- AI was previously ignoring locked values (overwriting `name` with a shorter form) — the LOCKED FIELDS section was added to fix this; needs ongoing validation
- No automatic enforcement that the output's locked fields match input — caller should validate post-hoc
- Eyebrow can still default to generic "Meet Our Doctor" when source bio is sparse
- No explicit handling of multi-doctor practices (this is the homepage primary slot only)

### [content/faq](../skills/content/faq.md) · 🟡 working

- No deduplication when scraped FAQs and service-derived FAQs ask the same question
- Doesn't cross-check answers against scraped content for accuracy (could fabricate plausible-but-wrong answers about insurance specifics)
- Category taxonomy is fixed — can't yet add custom categories per practice (e.g. "Pediatric" for kid-focused practices)
- No tone calibration — same prompt for warm-family practice and clinical-specialist practice

### [content/hero](../skills/content/hero.md) · 🟡 working

- No tone calibration — same prompt for warm-family vs. clinical-specialist practices
- Doesn't use the existing scraped hero copy as a stylistic reference (only the tagline field)
- No length validator — caller doesn't enforce ≤10 words
- Subheadline can drift into restating the headline

### [content/reviews](../skills/content/reviews.md) · 🟡 working

- No verification that quote text actually appears in scraped data (trust-based)
- Placeholder review when no real reviews exist is generic — could be smarter ("show fewer items" vs. "show one fake")
- No star-rating sanity check (real reviews often have varying ratings; placeholder defaults to 5)
- Doesn't surface aggregate rating sources separately from individual quotes

### [content/services](../skills/content/services.md) · 🟡 working

- No deduplication if the items array has near-synonyms ("Whitening" + "Teeth Whitening")
- No category-aware ordering (cosmetic/general/orthodontic clusters not grouped)
- desc rewrites can drift from the source description

### [design/design-extract](../skills/design/design-extract.md) · 🟡 working

- CSS parsing is shallow — relies on declared color values; computed/runtime CSS variables can be missed
- No analysis of color USE (a color in the stylesheet isn't necessarily a brand color — could be a button accent on one page)
- Mood label is single-AI-pass — no validation against the audit's positioning
- Font detection misses webfonts loaded via JS (rare but happens)
- evolutionSignal is binary — no "partial evolve" option for sites with one good color but bad typography

### [extraction/image-roles](../skills/extraction/image-roles.md) · 🟡 working

- No detection of multiple people in a single shot beyond the team-group fallback (a 3-doctor portrait might be tagged `team-group` instead of yielding 3 personName extractions)
- personName extraction relies entirely on filename/alt; an unnamed doctor photo can never be paired
- 4MB-per-image cap silently drops oversized files (returns `skipped-too-large`)
- Hero-vs-interior call is judgment-based; small interiors sometimes promoted to hero erroneously
- "patient-smile" can be ambiguous with stock dental photography vs. real patients

### [pages/blog-rewrite](../skills/pages/blog-rewrite.md) · 🟡 working

- Source-too-thin threshold (200 chars) is a single magic number — doesn't account for legitimately short articles vs. truncated scrapes
- No detection of duplicate content across multiple URL variants (per-location keyword dupes) — that's handled upstream in `blog-generator.js` via title-normalization
- Image/asset references in the source body are stripped if they're absolute URLs to the old site
- No re-localization — if the article references the original city/state, those references stay (which is usually correct)
- No structured-output mode — model can occasionally include extra prose ar

### [pages/service-page](../skills/pages/service-page.md) · 🟡 working

- No semantic dedup between the homepage FAQ and the per-service FAQ section
- No automatic check that `headline` includes the city when natural (sometimes drops it)
- `process` and `callout-list` can be over-used — model defaults to imposing structure even when source is plain prose
- 9000-char source cap may truncate long evergreen service pages
