---
tier: L1
maturity: polished
phase: Silver
source: scripts/pipeline/lib/ai-silver.js
function: buildPrompt
model: claude-sonnet-4-6
---

# Skill: Silver Extraction

## Responsibility

The bronze→silver transform. Takes raw scraped HTML/JSON-LD/text and extracts
a single structured `PracticeData` JSON object: NAP, doctors[], services,
hours, content blocks (hero/about/testimonials/faqs), images-by-role,
differentiators, and a verbatim content rescue layer (additionalContent[]).
This is the foundation of the entire pipeline — every downstream skill
depends on its accuracy.

## Architecture: parallel per-page extraction

Silver runs the extraction prompt **once per useful page in parallel**, then
merges the partial outputs into a single source of truth. This replaces the
previous "bundle 8 pages into one prompt" design which dropped pages 9+
entirely and broke silver's catch-all promise.

```
filterUsefulPages(bronze.pages)         ← programmatic noise removal
  ↓
runWithConcurrency(pages, 5,
  extractPagePartial(page))             ← one Claude call per page in parallel
  ↓
mergePartials(partials)                 ← combine into one silver JSON
  ↓
normalizeAiOutput(merged)               ← schema normalization
```

**Filter rules** (no AI): drop privacy/terms/legal/sitemap/404/thank-you/
search/tag/category/feed paths and any page under 100 words (homepage exempt).
Hard safety cap of 30 pages (homepage first, then by word count) to bound cost
on huge sites.

**Per-page prompt** explicitly tells the model "this is ONE page of many —
extract only what's on THIS page; null/[] for everything else; do not invent
content from other pages." Each `additionalContent` and `differentiators`
entry is auto-tagged with the source page path.

**Merge rules:**
- Scalars (practice.name, phone, address fields): first non-null wins, with
  pages processed in priority order (homepage → about → contact → team/dr
  → services → other). The homepage's name/phone wins over a service-page
  footer's potentially-truncated copy.
- `doctors[]`: dedupe by normalized name (strip "Dr.", lowercase). When the
  same doctor appears on multiple pages, merge fields (longest bio wins,
  fill nulls, union specialties).
- `services.offered[]`: dedupe by slug.
- Content arrays (testimonials/faqs/insurance/specials): union, dedupe by
  first 80 chars / title.
- `additionalContent[]`: union, dedupe by content hash, cap 30.
- `differentiators[]`: dedupe by `type::label`.
- `images.*`: union by URL per category.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `bronze.baseUrl` | string | scrape | Site root URL |
| `bronze.pages` | array | scrape | All scraped pages — filter step picks useful ones |
| `page.path` / `page.title` / `page.metaDescription` | string | scrape | |
| `page.heroTexts` / `page.headings` / `page.paragraphs` | array | scrape | |
| `page.images` | array | scrape | { src, alt } pairs |
| `page.structuredData` | array | scrape | JSON-LD blocks (Person/Dentist promoted) |
| `page.bodyText` | string | scrape | Truncated to 1500 chars (6000 for people pages) |
| `page.wordCount` | number | scrape | Used by filter |

Per-page formatting includes: title + meta, hero text, headings (cap 20, or
40 for people pages), paragraphs (cap 8/200 chars, or 20/400 for people
pages), images with alt, **all** Person/Dentist JSON-LD entries (sliced 1000
chars each, never deduped), other JSON-LD (cap 3/400 chars), and bodyText
(cap 1500, or **6000 for people pages** — bumped from 1500 to capture 2nd/3rd
doctor bios that previously fell off the end).

## Output schema

```json
{
  "practice":  { "name", "phone", "email", "domain", "googleReviewLink", "googleProfileLink", "sameAs" },
  "address":   { "street", "city", "state", "zip" },
  "hours":     { "display": [{ "day", "time" }], "raw" },
  "doctors":   [
    { "name", "firstName", "lastName", "credentials", "bio", "education", "specialties", "photoUrl" }
  ],
  "services":  { "offered": [{ "name", "category" }] },
  "brand":     { "logoUrl" },
  "content":   { "heroTagline", "heroSubheadline", "aboutText", "testimonials", "faqs", "insurance", "specials", "stats" },
  "additionalContent": [
    { "type", "title", "content", "source" }
  ],
  "differentiators": [
    { "type", "label", "detail", "source", "confidence" }
  ],
  "images":    { "logo", "hero", "team", "office", "gallery", "beforeAfter" },
  "migration": { "oldUrls" }
}
```

### Three content tiers

| Tier | Field | Question it answers | Shape |
|---|---|---|---|
| Structured | `services[]` | What can the practice DO for me? (procedures) | `{ name, slug, category }` |
| Labels | `differentiators[]` | WHY this practice over another? | `{ type, label, detail, source, confidence }` (short labels, 4–12 words) |
| Prose | `additionalContent[]` | What else does the site say in their own voice? | `{ type, title, content, source }` (verbatim full prose blocks) |

Same fact may appear once across tiers — never duplicated. iTero scanner as a label in `differentiators[]` does NOT also appear as a redundant entry there; the matching prose paragraph from `/about` goes in `additionalContent[]` as its full text.

## Evaluation criteria

- **Verbatim copy** for all text fields (heroTagline, heroSubheadline, aboutText, doctor.bio, testimonials, faqs, specials) — no paraphrase, no improvement
- **No fabrication** — null when the field is absent on the site, never a plausible substitute
- **Multi-doctor capture (CRITICAL)** — `doctors[]` must include EVERY doctor mentioned (Person/Dentist JSON-LD, "Get To Know Dr. X" sections). doctors[0] is the most prominent (founder / homepage hero); subsequent entries are equal-billing. Returning a single-doctor array when the site clearly has multiple is a hard error
- **practice.name uses FULL footer/logo name**, not truncated
- **Google links validated** — `googleReviewLink` / `googleProfileLink` must be on a Google domain; otherwise null (caller hard-validates this)
- **Services deduplicated** — no near-synonyms; uses the practice's own naming
- **Image classification** by URL pattern + alt (team/staff/dr- → team; slider/hero/banner → hero; gallery/treatments → gallery)
- **JSON-LD preferred** for NAP and doctor when present
- **Differentiators only when notable** — confidence ≥ 0.7, short labels (4–12 words), type from allowed taxonomy
- **Content rescue (additionalContent)** — sweep bronze for distinctive prose that didn't fit other fields (pull-quotes, philosophy paragraphs, mission statements, "Welcome To" intros, office descriptions, technology copy, blog post bodies, taglines). Verbatim. Each item: `{ type, title, content, source }`. Cap: 30 items, ~2200 chars each. Skipped items = lost voice in the rebuild.
- **Three-tier boundary respected** — services / differentiators / additionalContent are NOT interchangeable; same fact never duplicated across tiers
- **Visual data OUT OF SCOPE** — colors, fonts, mood belong to Design Extract phase. Silver does NOT extract palette or typography even if it can see them in CSS
- **Returns only JSON**

## Known gaps

- Hard safety cap at 30 pages per site (homepage + top by word count) — sites with truly comprehensive content may still lose pages 31+
- bodyText cap of 6000 chars on people pages still truncates very long team listings (10+ doctors on one page)
- Service deduplication relies on the model's judgment per-page; merge step uses slug match which can miss near-synonyms ("Zoom Whitening" vs "Teeth Whitening")
- Hours parsing handles common formats but exotic tables (multi-location, holiday schedules) may degrade
- No structured schema validation — caller normalizes shape but doesn't reject malformed AI output
- Failed page extractions are silently skipped (logged, not retried beyond 3× backoff) — a transient outage on a key page can leave gaps
- Per-page prompt cost scales linearly with site size — 30-page site = 30 Claude calls (vs 1 in the old design)

## Improvement levers

1. **Easy (L1):** Tighten "no fabrication" rule with concrete examples of common hallucinations to avoid
2. **Easy (caller-side):** Validator that re-checks every doctor name against the bronze JSON-LD entries
3. **Easy:** Make `concurrency` configurable from the pipeline runner (currently defaults to 5)
4. **Medium:** Smarter merge for services — fuzzy-match near-synonyms instead of strict slug equality
5. **Medium:** Re-extract failed pages with a longer backoff before giving up
6. **Hard:** Structured-output mode (Anthropic tools) so the model can't return malformed shapes
7. **Hard:** Cache per-page extractions by content hash so re-runs on a stable site only re-extract changed pages

## Test fixtures

**References (5 fixtures):**
- `lbpds-pediatric/silver.json` — pediatric specialist, 3 doctors, 34 services, 33 differentiators
- `chang-orthodontics/silver.json` — orthodontics specialist, 2 doctors, 27 services, **79 differentiators** (richest)
- `orange-county-dental-care/silver.json` — general 2-doctor, 40 services, 24 differentiators
- `oc-healthy-smiles/silver.json` — general 5-doctor (largest doctor count), 21 services, 33 differentiators
- `elements-dentistry/silver.json` — warm-family general, 3 doctors, 28 services, 47 differentiators

Run `node scripts/pipeline/test-fixtures.js` for shape validation across all five (220/220 checks pass).

**Future:** single-doctor general practice + sparse-content + CMS-scale (300+ pages) fixtures.

---


## PROMPT

You are analyzing ONE page from a professional practice website (healthcare, wellness, or local services).
Your job: extract whatever practice information is visible on THIS page and return it as JSON.

This page is one of many — the merge step will combine outputs from all pages into a single source of truth.
For any field NOT present on this page, return null (or [] for arrays). Do not invent or copy from memory of other pages.

WEBSITE: {{bronzeBaseUrl}}
THIS PAGE: {{pagePath}}

{{pageBlock}}

---
Extract the following as a single JSON object. Use null for any field not present on this page.

{
  "practice": {
    "name": "Full legal practice name as shown on site (e.g. 'Spring St. Family Practice', not truncated). Null if not on this page.",
    "phone": "Phone in (XXX) XXX-XXXX format, or null",
    "email": "Email address or null",
    "domain": "Domain without protocol, or null",
    "googleReviewLink": "URL to leave a Google review — MUST be on google.com or g.page domain. Null otherwise.",
    "googleProfileLink": "URL of Google Business Profile (google.com/maps/...) — MUST be a Google domain. Null otherwise.",
    "sameAs": ["Social/directory profile URLs found on this page"]
  },
  "address": {
    "street": "Street address or null",
    "city": "City or null",
    "state": "2-letter state or null",
    "zip": "ZIP code or null"
  },
  "hours": {
    "display": [{ "day": "Mon", "time": "9am – 5pm" }],
    "raw": "Raw hours text as found on this page, or null"
  },
  "doctors": [
    {
      "name": "Full name with Dr. prefix",
      "firstName": "First name only",
      "lastName": "Last name only",
      "credentials": "e.g. DMD, DDS",
      "bio": "Full bio paragraph(s) — verbatim, do not truncate",
      "education": "Education/training details or null",
      "specialties": ["List of specialties or focus areas"],
      "photoUrl": "URL of doctor headshot photo or null"
    }
  ],
  "services": {
    "offered": [
      { "name": "Human-readable service name", "category": "general|cosmetic|orthodontic|emergency|specialty|implant|pediatric" }
    ]
  },
  "brand": {
    "logoUrl": "URL of the practice logo image, or null"
  },
  "content": {
    "heroTagline": "Hero/banner headline visible on THIS page — verbatim. Null if no hero on this page.",
    "heroSubheadline": "Supporting hero subtext, or null",
    "aboutText": "About-us / practice philosophy paragraph(s) on this page, or null",
    "testimonials": [
      { "text": "Review text", "author": "Name or null", "stars": 5 }
    ],
    "faqs": [
      { "question": "Q", "answer": "A" }
    ],
    "insurance": ["List of accepted insurance plans mentioned on this page"],
    "specials": [
      { "title": "Special offer title", "description": "Description" }
    ],
    "stats": {
      "yearsExperience": null,
      "googleRating": null,
      "fiveStarReviews": null
    }
  },
  "images": {
    "logo": "URL of logo image, or null",
    "hero": ["URLs of hero/banner images on this page"],
    "team": ["URLs of doctor/staff headshot photos"],
    "office": ["URLs of office/facility interior photos"],
    "gallery": ["URLs of service category or treatment images"],
    "beforeAfter": ["URLs of before/after treatment photos"]
  },
  "additionalContent": [
    {
      "type": "free-form short label, e.g. 'philosophy' | 'pullquote' | 'office-tour' | 'technology' | 'welcome' | 'mission' | 'community' | 'awards' | 'press' | 'blog-post' | 'specialty-deep-dive' | 'patient-experience' | 'team' | 'financing-detail'",
      "title": "The heading from this page if there was one (H2/H3), or null",
      "content": "VERBATIM body text. Truncate long pieces (>2000 chars) to first 1500 + ' …[truncated]'.",
      "source": "{{pagePath}}"
    }
  ],
  "differentiators": [
    {
      "type": "technology|award|membership|financing|language|emergency|hours_note|staff_note|insurance|patient_perk|unique_feature",
      "label": "Short human-readable label (4–12 words). Examples: 'CEREC same-day crowns', 'Spanish & Vietnamese spoken'",
      "detail": "Optional extra detail (≤1 sentence), or null",
      "source": "{{pagePath}}",
      "confidence": 0.0
    }
  ]
}

Rules — CONTENT FIDELITY (most important):
- COPY VERBATIM: For all text fields (heroTagline, heroSubheadline, aboutText, doctor.bio, testimonials, faqs, specials),
  copy text exactly as it appears on this page. Do not paraphrase or improve. Use null if absent.
- NO FABRICATION: Never invent content. If a field is missing from this page, return null — not a plausible substitute.
  Do not "remember" content from other pages of this site; the merge step handles cross-page combination.

  Common hallucinations to AVOID (these are HARD ERRORS):
  • Inventing a doctor bio when no bio exists on the page — return null, do not write "Dr. X is a dedicated dentist serving the community"
  • Inventing a heroTagline when the page has no hero — return null, do not write "Welcome to {practice}"
  • Inventing testimonials from generic positivity ("great experience", "highly recommend") — only return testimonials with actual review text
  • Inventing years of experience, patient counts, or "established 19XX" claims — return null in stats unless the number is on the page
  • Inventing differentiators by inferring from context — only return differentiators with text directly visible on the page
  • Inventing services not explicitly named on the page — services come from explicit headings/lists, not inference from images or category names
  • Inventing email addresses by combining "info@" + the domain — return null unless an explicit email appears on the page
- THIS PAGE ONLY: Extract what's visible on THIS page. Most fields will be null for most pages — that is correct and expected.
  The homepage typically yields NAP and hero. The about page yields philosophy and primary doctor. A team page yields multiple
  doctors. A service page yields content/differentiators specific to that service. Etc.

- services: extract ONLY services explicitly named as distinct offerings on this page. Deduplicate near-synonyms by keeping
  the site's own naming. Do not infer services from context.

- doctors[]: capture EVERY doctor visible on this page — Person/Dentist JSON-LD entries, "Get To Know Dr. X" / "Meet Dr. Y"
  sections, team/staff entries. doctors[] order is page-local (not site-wide); the merge step handles primary-doctor selection.
  Each entry must include name and credentials (if available); bio verbatim; photoUrl if matchable. If you see 2 doctors
  named on this page, return 2 entries — returning 1 when the page clearly shows multiple is a hard error.

- practice.name: use the FULL name as it appears in footer/logo alt text, not truncated. Null if not visible on this page.

- images: classify by URL pattern + alt. */team/*, /staff/*, /dr-* → team; /slider/*, /hero/*, /banner/* → hero;
  /services/*, /gallery/*, /treatments/* → gallery or office. Before/after → beforeAfter.

- hours: parse whatever format appears (e.g. "Monday-Thursday 9:00AM-6:00PM" → display: [{day:"Mon–Thu", time:"9:00AM–6:00PM"}]).

- JSON-LD preferred for NAP, hours, and doctor info when present.

- THREE-TIER CONTENT MENTAL MODEL — read this before extracting:

  1. SERVICES (services.offered[]) — "What can the practice DO for me?" — procedures the practice offers.
     Structured: { name, category }.

  2. DIFFERENTIATORS (differentiators[]) — "WHY this practice over another?" — short LABELS for distinguishing facts:
     technology (iTero), awards, languages, financing, emergency policies. 4–12 word labels. NOT verbatim prose.

  3. ADDITIONAL CONTENT (additionalContent[]) — "What else does the site say in their own voice?" — verbatim PROSE BLOCKS:
     full paragraphs, doctor pull-quotes, philosophy statements, office tour copy, "Welcome To" intros, blog post bodies.
     Their words, untouched.

  Same fact never duplicated across tiers. iTero as a differentiator label does NOT also appear redundantly; the matching
  paragraph from the technology page goes in additionalContent as its full prose.

- additionalContent — VERBATIM CONTENT RESCUE (do this LAST, after structured fields above):
  • Sweep this page for ANY distinctive prose that didn't land in another field.
  • Examples: practice philosophy, doctor pull-quotes (their actual words in blockquotes/H6), "Welcome To" intros,
    office tour descriptions, technology deep-dives, mission statements, press mentions, taglines, blog post bodies,
    treatment guides, financing/insurance copy, accessibility/multilingual notes.
  • COPY VERBATIM. Do not summarize.
  • Each item: { type, title, content, source: "{{pagePath}}" }.
  • Cap: max 10 items from THIS page (merge step will combine across all pages, capped at 30 total).
  • For very long content (blog posts >2000 chars), include first ~1500 chars + ' …[truncated]'.
  • Do NOT duplicate content already captured in another field on this same page (aboutText, doctor.bio, etc.).
  • Differentiators get LABELS; additionalContent gets PROSE. Not interchangeable.

- DESIGN/VISUAL data is OUT OF SCOPE — colors, fonts, mood belong to the Design Extract phase. Even if visible in CSS,
  do NOT include them. Silver is for TEXT and STRUCTURED data only.

- differentiators: Extract any notable advantages on this page — unique features, technology, awards, financing, language
  capabilities, emergency services, membership plans. Each must have a type from the allowed taxonomy. Min confidence 0.7.
  Empty array [] if nothing notable. Do NOT invent differentiators.

- Return ONLY the JSON object. No markdown. No explanation.
