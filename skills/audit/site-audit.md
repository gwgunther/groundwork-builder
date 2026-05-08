---
tier: L1
maturity: working
phase: Audit
source: scripts/pipeline/lib/ai-audit.js
function: runSiteAudit
model: claude-sonnet-4-6
---

# Skill: AI Site Audit

## Responsibility

Strategic recommendations for the redesign. Takes scraped + merged data plus
the loaded vertical preset, and produces positioning / serviceEmphasis / tone
recommendations along with differentiators, content gaps, SEO opportunities,
and warnings. The output's `positioning.recommended` and `tone.recommended`
fields drive the brand-direction phase's color-temperature and typography
personality signals; `serviceEmphasis` informs the director's section
ordering. Prompt template lives separately at
`scripts/pipeline/prompts/site-audit.md` and is interpolated with
`{{placeholder}}` substitutions.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `verticalName` | string | preset.schema.verticalName | "Practice" fallback |
| `practiceName` | string | merged.practice.name | |
| `domain` | string | merged.practice.domain | |
| `doctorName` | string | merged.doctor.name | "Dr. {first} {last}" fallback |
| `credentials` | string | merged.doctor.credentials | |
| `city`, `state` | string | merged.address | |
| `phone` | string | merged.practice.phone | |
| `servicesList` | string | derived | "- {canonical} ({slug})" lines, "(none detected)" fallback |
| `hubsList` | string | derived | "- {label} → /services/{slug}" lines |
| `taxonomyList` | string | preset.taxonomy.services | "- {canonical} [{category}]" lines |
| `pageCount` | string | scraped.migration.oldUrls.length | |
| `hasBio` / `hasTestimonials` / `hasFaqs` | "Yes"/"No" | merged | |
| `socialsCount` / `imageCount` | string | derived counts | |
| `confidenceFlags` | string | merged.meta.confidenceFlags | |

## Output schema

```json
{
  "positioning":     { "current", "recommended", "rationale" },
  "serviceEmphasis": { "primary": "slug", "secondary": ["slug"], "rationale" },
  "tone":            { "current", "recommended", "rationale" },
  "differentiators": ["string"],
  "contentGaps":     ["string"],
  "seoOpportunities": ["string"],
  "warnings":        ["string"]
}
```

## Evaluation criteria

- **Specific to this practice** — recommendations reference actual scraped data, not generic dental advice
- **`serviceEmphasis.primary` is a real slug** from the offered services list, not a fabricated category
- **`positioning.recommended` is concrete** — phrases like "trusted family practice in Long Beach" beat "modern dental practice"
- **`tone.recommended` is descriptive** ("warm, conversational, approachable") — drives downstream brand-direction signals
- **Differentiators cite evidence** from the scraped data (technology, awards, language capabilities, hours notes)
- **SEO opportunities apply Groundwork IA playbook** — primary nav stable paths, on-domain scheduling, structured data, third-party-booker tradeoffs
- **Warnings call out red flags** observed in the data (broken socials, missing bio, phone format inconsistencies)
- **Returns only JSON** — no prose wrap, no code fences (caller has a retry-with-nudge fallback for parse failures)

## Known gaps

- No verification that recommended services in `serviceEmphasis` actually have content depth in scraped data — can recommend emphasizing a service the practice barely offers
- "Tone" is a free-form phrase rather than a fixed taxonomy — downstream brand-direction has to regex-match it for warm/specialist signals
- Differentiators can drift toward generic ("experienced staff", "modern equipment") when scraped data is sparse
- `warnings` is often empty even when bronze data has obvious issues (404 socials, malformed JSON-LD)
- No memory of past audits for this practice — rebuilds with new scrape data start from scratch

## Improvement levers

1. **Easy (L1):** Constrain `tone.recommended` to a small enum (warm/clinical/editorial/bold/refined) so brand-direction can map deterministically
2. **Easy (L1):** Add explicit "name at least one differentiator from scraped signals or technology mentions" requirement
3. **Medium:** Cross-check `serviceEmphasis` slugs against bronze service-page bodyText length — only emphasize services with actual content
4. **Medium:** Persist past audits per-domain and feed into prompt as "previous audit recommended X — what changed?"

## Test fixtures

**References (5 fixtures):**
- `lbpds-pediatric/audit.json` — pediatric specialist (free-form tone, captured pre-enum-fix)
- `chang-orthodontics/audit.json` — orthodontics specialist (free-form tone, captured pre-enum-fix)
- `orange-county-dental-care/audit.json` — tone enum: `warm` ✓ (post-fix)
- `oc-healthy-smiles/audit.json` — tone enum: `warm` ✓ (post-fix, 5-doctor)
- `elements-dentistry/audit.json` — tone enum: `warm` ✓ (post-fix, warm-family)

Run `node scripts/pipeline/test-fixtures.js` for shape validation. The 3 post-fix fixtures validate the tone-enum constraint.

**Future:** sparse-content + non-warm tone (`clinical`/`editorial`/`bold`/`refined`) fixtures.

---

## PROMPT

You are a website strategist analyzing a {{verticalName}} practice website to prepare for a complete site redesign.

## Your Task

Analyze the scraped data from this practice's existing website and produce strategic recommendations that will guide the redesign. Be specific, actionable, and grounded in what you see in the data.

## Practice Data

**Practice Name:** {{practiceName}}
**Website:** {{domain}}
**Doctor:** {{doctorName}} ({{credentials}})
**Location:** {{city}}, {{state}}
**Phone:** {{phone}}

### Services Detected
{{servicesList}}

### Service Hub Pages to Build
{{hubsList}}

### Available Taxonomy (all possible services for this vertical)
{{taxonomyList}}

### Additional Context
- Pages crawled: {{pageCount}}
- Has doctor bio: {{hasBio}}
- Has testimonials: {{hasTestimonials}}
- Has FAQs: {{hasFaqs}}
- Social profiles found: {{socialsCount}}
- Images found: {{imageCount}}
- Confidence flags: {{confidenceFlags}}

## Instructions

Analyze this data and return a JSON object with the following structure. Be specific to THIS practice — don't give generic advice.

**Two hard rules:**

1. **`tone.recommended` MUST be a single word from this enum:** `warm | clinical | editorial | bold | refined`
   - `warm` — family/community/general practices; humanist serif-friendly; soft + approachable
   - `clinical` — medical specialists; precise + restrained; trust through expertise
   - `editorial` — premium/cosmetic/urban; magazine-like; visual confidence
   - `bold` — modern/specialist with strong identity; high contrast; declarative
   - `refined` — luxury/upscale; understated; elegance over volume
   The brand-direction phase regex-matches this enum to drive color-temperature + typography-personality signals downstream. A free-form phrase like "warm, conversational, approachable" breaks that mapping.

2. **`differentiators[]` MUST contain at least ONE entry grounded in scraped signals.** Pull from technology mentions, awards, language capabilities, certifications, hours notes, or staff credentials that appear in the data. If the data is genuinely sparse, return one differentiator referencing the most-specific fact you DID find (a service category, a location detail, a years-in-practice number) — but never fall back to generic filler like "experienced staff" or "modern equipment".

When you identify `seoOpportunities` and `contentGaps`, consider (when relevant to the scraped site) the **Groundwork Builder IA playbook**—domain-agnostic principles: primary `<nav>` with stable paths to main sections, homepage links into major hubs—not only conversion CTAs, footer as a secondary map of key URLs, on-domain scheduling/contact flows not orphaned when a third-party booking tool is primary, sensible crawl/sitemap expectations, and primary-entity + breadcrumb-style structured data where applicable. Call out tradeoffs (e.g. third-party booker vs on-domain contact/scheduling URLs) explicitly when you see them in the data.

```json
{
  "positioning": {
    "current": "What the current site seems to position the practice as",
    "recommended": "Recommended positioning for the redesign",
    "rationale": "Why this positioning will work better"
  },
  "serviceEmphasis": {
    "primary": "slug of the #1 service to emphasize",
    "secondary": ["slug", "slug"],
    "rationale": "Why these services should be the focus"
  },
  "tone": {
    "current": "Assessed tone of the current site",
    "recommended": "ONE of: warm | clinical | editorial | bold | refined",
    "rationale": "Why this tone will resonate with their audience"
  },
  "differentiators": [
    "Specific thing that makes this practice unique (based on scraped data — REQUIRED: at least one entry must reference an actual technology, award, language capability, hours note, or staff credential found in the source. Generic 'experienced staff' / 'modern equipment' filler does not count.)",
    "Another differentiator"
  ],
  "contentGaps": [
    "Missing content that should be added",
    "Another gap"
  ],
  "seoOpportunities": [
    "Specific SEO opportunity based on their services + location",
    "Another opportunity"
  ],
  "warnings": [
    "Any red flags or concerns noticed in the data"
  ]
}
```

Return ONLY the JSON object. No markdown formatting, no explanation before or after.
