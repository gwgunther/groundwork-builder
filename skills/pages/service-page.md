---
tier: L1
maturity: working
phase: Generate
source: scripts/pipeline/lib/ai-service-page.js
function: buildPrompt
model: claude-sonnet-4-6
---

# Skill: Structured Service Page Generation

## Responsibility

Restructures a single scraped service page (raw bodyText + headings) into a
clean, multi-section service detail page: headline, subheadline, intro,
3–6 typed sections (highlight / subsection / callout-list / process /
benefits / faq), and a closing CTA section. This replaces the older
paragraph-only `ai-service-rewrite.js` output with a richer schema the page
generator can render with appropriate visual treatments.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `serviceName` | string | service.name | "this service" if missing |
| `practiceName` | string | practice.name | |
| `city` | string | practice.city | "(not specified)" fallback |
| `doctor` | string | practice.doctor | "(not specified)" fallback |
| `phone` | string | practice.phone | "(not specified)" / "[call us]" fallback |
| `trimmed` | string | bronze bodyText | Source text, sliced to 9000 chars |
| `headingsContext` | string | derived | Pre-formatted headings block, or empty string |
| `additionalBlock` | string | derived | Pre-formatted "Voice content from elsewhere" block listing up to 4 `silver.content.additionalContent[]` items relevant to this service (matched by `source` path or by type: technology / specialty-deep-dive / treatment-detail / process / clinical). Used to enrich service pages with cross-page voice — e.g. an iTero scanner description from /about could appear as a callout on the /services/braces page. |

## Output schema

```json
{
  "headline":     "string — H1, e.g. 'Invisalign in Long Beach'",
  "subheadline":  "string | null",
  "intro":        "string — 1-2 paragraphs",
  "primaryCta":   "string — verb + noun",
  "sections": [
    { "type": "highlight",     "label": "string|null", "headline": "string", "body": "string" },
    { "type": "subsection",    "heading": "string", "body": "string" },
    { "type": "callout-list",  "heading": "string", "items": [{ "label": "string", "body": "string" }] },
    { "type": "process",       "heading": "string", "steps": [{ "title": "string", "body": "string" }] },
    { "type": "benefits",      "heading": "string", "items": ["string"] },
    { "type": "faq",           "heading": "string", "items": [{ "q": "string", "a": "string" }] }
  ],
  "ctaSection": { "headline": "string", "body": "string", "primaryCta": "string" }
}
```

## Evaluation criteria

- **No fabrication** — facts not in source must not appear (no invented iTero, no invented years of experience)
- **Chrome stripped** — nav, footer, "Privacy Statement", "Web Accessibility", "© 2026", "Website Design by …" all dropped
- **Voice preserved** — practice's terminology and tone retained ("kiddo" stays "kiddo")
- **Mega-paragraphs split** into a logical sequence of subsections
- **Original headings reused** when the source provided clear ones
- **Reading flow** — intro → why-this-matters → process → benefits → FAQ → CTA
- **3–6 sections** — fewer if source is genuinely thin
- **Phone in ctaSection matches practice phone** verbatim
- **Returns only JSON**, no markdown or prose wrap

## Known gaps

- No semantic dedup between the homepage FAQ and the per-service FAQ section
- No automatic check that `headline` includes the city when natural (sometimes drops it)
- `process` and `callout-list` can be over-used — model defaults to imposing structure even when source is plain prose
- 9000-char source cap may truncate long evergreen service pages

## Improvement levers

1. **Easy (L1):** Tighten the rule about minimum-source-for-section to discourage forced section types
2. **Medium:** Per-section-type validators (process must have ≥3 steps, callout-list ≥3 items) — drop sections that don't meet minima
3. **Medium:** Pass the homepage FAQ items so this skill can de-duplicate
4. **Hard:** Two-pass extraction — first identify section boundaries, then classify each region

## Test fixtures

_None yet. Future: `skills/pages/service-page.fixtures/{thin,rich,chrome-heavy}/*`_

---

## PROMPT

You are restructuring a scraped dental/orthodontic service page into a clean, multi-section service detail page. The source text below was scraped from the practice's existing site and includes nav/footer chrome — your job is to isolate the actual service content and decompose it into the section types listed.

# Service & practice context
- Service:   {{serviceName}}
- Practice:  {{practiceName}}
- Doctor:    {{doctor}}
- City:      {{city}}
- Phone:     {{phone}}

# Source scraped text (includes nav/footer noise — strip it)
"""
{{trimmed}}
"""{{headingsContext}}{{additionalBlock}}

# Section types you may emit (pick 3–6 based on what the source supports)

1. **highlight** — A standout fact, quote, statistic, or "Did you know…" callout. Bold visual treatment.
   { "type": "highlight", "label": "<short eyebrow, e.g. 'Did you know…' or null>", "headline": "<the standout claim>", "body": "<optional 1-sentence elaboration>" }

2. **subsection** — A normal heading + 1-3 paragraph block. The bread-and-butter section type.
   { "type": "subsection", "heading": "<H2-style heading>", "body": "<paragraphs separated by \\n\\n>" }

3. **callout-list** — A heading followed by 3-6 short labelled callout items (each is a label + a sentence).
   { "type": "callout-list", "heading": "<heading>", "items": [{ "label": "<short label, ≤6 words>", "body": "<1 sentence>" }] }

4. **process** — A numbered process / what-to-expect walkthrough. 3-5 steps each with title and short description.
   { "type": "process", "heading": "<e.g. 'What to Expect' or 'How It Works'>", "steps": [{ "title": "<step name>", "body": "<1-2 sentences>" }] }

5. **benefits** — A flat bullet list of 3-6 short benefits / features.
   { "type": "benefits", "heading": "<e.g. 'Why {{serviceName}}?' or 'Benefits'>", "items": ["<short benefit, ≤14 words>"] }

6. **faq** — Service-specific FAQs (different from the homepage FAQ). 2-4 entries.
   { "type": "faq", "heading": "<optional, e.g. 'Common Questions'>", "items": [{ "q": "<question>", "a": "<2-3 sentence answer>" }] }

# Rules

1. **Do not fabricate facts.** If the source doesn't mention iTero scanners, don't add iTero. If it doesn't mention specific qualifications or years of experience, don't add them. Stay grounded in the source text.

2. **Strip noise.** Nav menus, "Book Appointment" buttons, phone numbers in the body, "© 2026 Practice", "Privacy Statement", "Web Accessibility", "Website Design by …", repeated H1, breadcrumbs — all chrome, all dropped.

3. **Preserve voice.** The practice's terminology and tone should carry through. Don't rewrite "kiddo" as "child". Don't replace "delighted" with "pleased".

4. **Split mega-paragraphs.** If the source has one wall of text, break it into a logical sequence of subsections with appropriate headings.

5. **Re-use original headings** when they exist (see Original page headings above). Don't invent new ones if the source provided clear ones.

6. **Order sections by reading flow.** Typically: intro → why-this-matters → process/what-to-expect → benefits → FAQ → CTA.

7. **The intro field** at the top is 1-2 paragraphs that introduce the service. It runs above all the sections. Don't repeat it inside a section.

8. **CTA section at the end** uses the practice's actual phone ({{phone}}) — never invent a different one.

9. If the source is genuinely thin (only an intro paragraph and nothing else), it's fine to return just `sections: [{ type: 'subsection', ...}]` with one subsection — don't pad with fabricated sections.

# Return ONLY this JSON (no markdown, no prose):

{
  "headline":     "<H1 — service name + city if natural, e.g. '{{serviceName}} in {{city}}'>",
  "subheadline":  "<1 sentence subhead, or null>",
  "intro":        "<1-2 paragraph intro, separated by \\n\\n>",
  "primaryCta":   "<verb + noun, e.g. 'Schedule a Consultation' or 'Book Your Visit'>",
  "sections": [
    /* 3-6 sections from the types above */
  ],
  "ctaSection": {
    "headline":   "<closing CTA headline, e.g. 'Ready to schedule?'>",
    "body":       "<optional 1-sentence call to action with phone or scheduling link>",
    "primaryCta": "<verb + noun>"
  }
}
