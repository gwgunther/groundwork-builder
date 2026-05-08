---
tier: L1
maturity: working
phase: Generate
source: scripts/pipeline/lib/ai-blog-rewrite.js
function: rewriteBlogPost
model: claude-sonnet-4-6
---

# Skill: Blog Post Rewrite

## Responsibility

Restructures a scraped blog post (or `additionalContent[]` item of `type: blog-post`)
into a clean Markdown body for the rebuilt site. Strips nav/footer chrome,
preserves the article's actual structure (headings, paragraphs, lists),
maintains the original voice. Does NOT generate net-new content — refuses
when the source is too thin (under 200 chars).

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `page.bodyText` | string | bronze.pages OR silver.content.additionalContent[] (type=blog-post) | Source article body |
| `page.h1` / `page.title` | string | scrape metadata | Used to identify the article |
| `practice.name` | string | merged | Practice context (for grounding only — do NOT inject into article) |
| `practice.city` | string | merged | City context |
| `practice.doctor` | string | merged | Doctor context |

## Output schema

```json
{
  "ok": "boolean",
  "title": "string — article title (from h1 or first heading)",
  "body": "string — clean markdown body, no frontmatter, no chrome",
  "error": "string — present only when ok=false"
}
```

## Evaluation criteria

- **Verbatim core content** — the article body should read identically (or nearly) to the original; no paraphrase
- **Chrome stripped** — no navigation menus, no "Book Appointment" buttons, no "© 2026" copyright lines, no "Privacy Statement" or "Web Accessibility" links, no breadcrumbs
- **Structure preserved** — headings, paragraphs, and lists stay in their original order; markdown formatting is faithful
- **No fabrication** — if the source is genuinely thin or contains only a teaser, return `ok: false` rather than padding with invented content
- **Practice context not injected** — the article should NOT suddenly start mentioning the practice name or doctor unless it already did
- **Returns ONLY the markdown body** — no frontmatter, no title heading, no horizontal rules

## Known gaps

- Source-too-thin threshold (200 chars) is a single magic number — doesn't account for legitimately short articles vs. truncated scrapes
- No detection of duplicate content across multiple URL variants (per-location keyword dupes) — that's handled upstream in `blog-generator.js` via title-normalization
- Image/asset references in the source body are stripped if they're absolute URLs to the old site
- No re-localization — if the article references the original city/state, those references stay (which is usually correct)
- No structured-output mode — model can occasionally include extra prose around the markdown

## Improvement levers

1. **Easy (L1):** Tighten chrome-stripping rules with more example patterns to drop
2. **Medium:** Detect inline image references and translate them to imagePath() helpers
3. **Medium:** Pre-pass that extracts only the article element from HTML when bronze captured it
4. **Hard:** Multi-pass — first identify article boundaries, then rewrite

## Test fixtures

_None yet. Future: `skills/pages/blog-rewrite.fixtures/{clean-article,heavy-chrome,truncated}/*.md`_

---

## PROMPT

You are extracting and cleaning a blog article that was scraped from a dental practice website. The scraped text below includes navigation menus, header/footer chrome, copyright notices, "Privacy Statement" links, and other non-article content. Your job is to isolate the actual article body and return it as clean Markdown.

# Article metadata
- Title:    {{title}}
- Practice: {{practiceName}}
- City:     {{city}}
- Doctor:   {{doctor}}

# Scraped raw text
"""
{{trimmed}}
"""

# Instructions

1. Identify the article body within the noise — the explanatory paragraphs, headings, and lists that make up the article.

2. Strip out everything that is not body content:
   - Navigation menus, header/menu items
   - Repeated titles (the H1 often appears 2–3 times in scraped text)
   - Phone numbers, addresses, "Book Now" / "Schedule" / "Request Appointment" buttons
   - Copyright lines, "© Year Practice", "Privacy Statement", "Terms of Use", "Web Accessibility", "Website Design by ..." — these are ALWAYS footer chrome
   - Bare lists of unrelated services or page links
   - Comments forms, social share buttons, "Related Posts" sections

3. Structure the body as clean Markdown:
   - Preserve heading levels (## for major sections, ### for subsections)
   - Multiple paragraphs broken at natural sentence boundaries — never one giant wall of text
   - Lists as Markdown bullets (`-` or `*`) when the source had lists
   - Inline emphasis (bold/italic) only where the source had it

4. Do not invent information. If the article is short or generic in the source, your output is short or generic — do not pad with filler. If the article ends mid-sentence (because the scrape was truncated), end your output at the last complete sentence.

5. Do not use generic copy or template phrases. The output must read like the practice wrote it. Do not introduce any phrasing that wasn't already in the source.

6. Do not inject the practice name, doctor name, or city into sentences where they weren't already — only preserve the references that were in the source.

# Output format

Return a single JSON object with two fields:
- `summary`: one sentence (40–160 chars) suitable for a meta description and the blog index card. Pulled from the article's actual content, not invented.
- `markdown`: the cleaned, structured article body as Markdown. No frontmatter, no title heading at the top (the title lives in file frontmatter), no horizontal rules — just the article body starting with the opening paragraph.

Output ONLY the JSON object — no prose before or after, no Markdown code fences.
