---
tier: L1
maturity: working
phase: ContentMap
source: scripts/pipeline/lib/ai-content-map.js
function: runContentMap
model: claude-sonnet-4-6
---

# Skill: Content Map (Blueprint / Audit)

## Responsibility

The audit pass that decides — **before any copy is written** — what each page
needs and what existing source material best fits. Produces a `contentAudit`
keyed by section, where every entry records:

- `existing`: the verbatim source text (or null if missing)
- `source`: which page path it came from
- `quality`: `strong | adequate | weak | missing`
- `action`: `keep | optimize | create`
- `rationale`: 1 sentence on why this assessment

The Content Write phase (`skills/content/content-write.md`) consumes this
blueprint to produce the actual copy. The split lets each phase do one job:
Map judges what's there and what's needed; Write composes the words.

This skill does NOT generate copy. It is a planning + audit pass only.

## Inputs

| Field | Type | Source | Notes |
|---|---|---|---|
| `practice` / `doctor` / `address` | object | merged | Practice profile for grounding section needs |
| `services.offered[]` | array | merged | Drives the per-service section list |
| `additionalContent[]` | array | merged | Verbatim prose rescue, source-tagged — primary candidate pool |
| `differentiators[]` | array | merged | Why-us labels, source-tagged — for service section weaving guidance |
| `pageInventory[]` | array | scraped | All scraped pages (condensed) for source identification |
| `audit` | object | site-audit | Strategic positioning + tone + serviceEmphasis |

## Output schema

```json
{
  "contentAudit": {
    "homepage.heroHeadline": {
      "existing": "Verbatim text from a source page, or null",
      "source":   "Page path (e.g. /, /about, /services/cerec), or null",
      "quality":  "strong | adequate | weak | missing",
      "action":   "keep | optimize | create",
      "rationale": "1 sentence explaining the assessment"
    },
    "homepage.heroSubheadline": { ... },
    "homepage.valueProp":       { ... },
    "about.introParagraph":     { ... },
    "about.philosophy":         { ... },
    "services.<slug>.intro":    { ... }
  },
  "coverage": {
    "totalSections": 42,
    "byQuality": { "strong": 7, "adequate": 4, "weak": 1, "missing": 30 },
    "byAction":  { "keep": 11, "optimize": 1, "create": 30 }
  },
  "differentiatorMatches": {
    "<service-slug>": ["differentiator-label-that-applies", "..."]
  },
  "rationale": "2-3 sentences on the editorial direction this audit suggests for Write"
}
```

`differentiatorMatches` tells Write which service intros should weave which
differentiators (e.g. CEREC technology → dental-crowns service).

## Evaluation criteria

- **Every required section has an audit entry** — homepage hero/sub/valueProp, about intro/philosophy, every service.<slug>.intro
- **`source` is a real page path** — must appear in the page inventory or be a known top-level path; otherwise null
- **Quality scoring is honest** — model should not score everything `strong` to please. Generic "Welcome to <practice>" copy is `weak`, not `strong`
- **`action` follows from quality** — `strong → keep`, `adequate → keep | optimize`, `weak → optimize | create`, `missing → create`
- **additionalContent prose is preferred over pageInventory excerpts** when both could fit a section
- **Service-level differentiator matching is conservative** — only match when the differentiator's source page or label genuinely aligns with the service
- **Returns only JSON**

## Known gaps

- Section keys are AI-chosen rather than schema-enforced (same gap as combined version)
- No automated check that `source` actually contains the `existing` text — model can hallucinate the source attribution
- Quality scoring is subjective per-run — same content might score `adequate` one run, `strong` another
- Doesn't yet score whether scraped service page content is itself weak/generic before recommending `keep`

## Improvement levers

1. **Easy (L1):** Define an explicit list of required section keys in the prompt so every run produces a complete audit
2. **Easy (caller-side):** Validator that confirms each `source` path actually appears in pageInventory
3. **Medium:** Show the model a "what makes copy strong vs weak" rubric in the prompt to anchor scoring
4. **Hard:** Persist past audits and feed in as "previous audit said X — what changed?"

## Test fixtures

**References (5 fixtures, with quality-scoring variation by source quality):**

| Fixture | Strong | Adequate | Weak | Missing | Notes |
|---|---|---|---|---|---|
| `lbpds-pediatric/content-blueprint.json` | 3 | 20 | 10 | 9 | Mixed-quality pediatric source |
| `chang-orthodontics/content-blueprint.json` | 8 | 19 | 3 | 12 | Tech-rich source (more `keep`) |
| `orange-county-dental-care/content-blueprint.json` | 11 | 18 | 18 | 2 | Richest source — most `keep` actions |
| `oc-healthy-smiles/content-blueprint.json` | 2 | 18 | 4 | 4 | Mostly adequate-quality |
| `elements-dentistry/content-blueprint.json` | 5 | 11 | 12 | 8 | Thinner source (more `create`) |

The variation across fixtures shows the rubric works — same prompt, different scoring per site. Run `node scripts/pipeline/test-fixtures.js` for shape validation.

**Future:** strict-thin-source fixture (60%+ `missing`) to exercise the create path more aggressively.

---

## PROMPT

You are the Content Map / Audit phase for a dental practice website redesign. Your job: BEFORE any copy is written, audit what content already exists on the site for every section the new site will need, and recommend what to do with each.

You are NOT writing copy. You are producing a blueprint that the Content Write phase will consume.

## Practice Profile

**Practice Name:** {{practiceName}}
**Website:** {{domain}}
**Doctor:** {{doctorName}} ({{credentials}})
**Location:** {{city}}, {{state}}
**Phone:** {{phone}}
**Services Offered:** {{servicesList}}

## Audit Strategy (from site-audit phase)

- Recommended positioning: {{auditPositioning}}
- Recommended tone: {{auditTone}}
- Primary service to emphasize: {{auditPrimaryService}}

## Sections you must audit (every one of these requires a contentAudit entry)

```
homepage.heroHeadline
homepage.heroSubheadline
homepage.heroTagline
homepage.valueProp
about.headline
about.introParagraph
about.philosophy
{{serviceSectionList}}
```

(Service entries are keyed `services.<slug>.intro` — one per slug listed above.)

## Source: scraped service page content (verbatim — primary candidate for service intros)

{{servicePageContent}}

## Source: practice's own voice — verbatim prose rescue (additionalContent — primary candidate for hero/about/philosophy)

These are distinctive prose blocks rescued verbatim from the original site, tagged by source page. The practice's actual words. **Prefer these over generic page-inventory excerpts when scoring quality and recommending `keep`.**

{{additionalContentBlock}}

## Source: differentiators (why-us facts, source-tagged)

These are short labels of facts that distinguish this practice. Each is tagged with a source page. Use them to populate `differentiatorMatches` — a per-service mapping of which differentiator labels would naturally fit in that service's intro.

{{differentiatorsBlock}}

## Source: page inventory (fallback context)

{{pageInventory}}

## Instructions

For every section listed above, decide:

1. **`existing`**: the verbatim source text that best fits this section (look first in additionalContent, then in scraped service pages for service intros, then in pageInventory excerpts). If nothing fits, return null.

2. **`source`**: the page path the existing text came from. Must match a real path you saw in the inputs. Null if existing is null.

3. **`quality`** — be honest:
   - `strong`: distinctive, specific to this practice, evokes voice (e.g. a doctor pull-quote, a specific philosophy statement)
   - `adequate`: usable, on-topic, but generic ("Welcome to Smiles Dental")
   - `weak`: thin, hollow, or off-topic — would feel generic on the new site
   - `missing`: nothing on the site addresses this section

4. **`action`**:
   - `keep`: use verbatim (typical for `strong`)
   - `optimize`: light editing for clarity, fixing typos, splitting run-ons (typical for `adequate`)
   - `create`: write new from scratch (typical for `weak` or `missing`)

5. **`rationale`**: one sentence explaining the assessment. Reference what specifically made it strong/weak.

For `differentiatorMatches`: for each service slug that has a service-page intro section, list any differentiator labels (from the differentiators block) that would naturally fit in that service's intro. A differentiator matches a service when its source page IS that service page, or when its `type`/`label` describes equipment/process used for that service. Be conservative — only include genuine matches, not loose associations.

For `coverage`: count `byQuality` and `byAction` totals across all audit entries. Include `totalSections`.

For `rationale`: 2-3 sentences on the editorial direction this audit suggests — what voice exists, where coverage is strong, where Write will need to create.

## Source priority (when multiple candidates exist for a section)

1. **additionalContent** — verbatim prose from the practice (hero/about/philosophy)
2. **Scraped service page content** — for service intros only
3. **pageInventory excerpts** — fallback when the above don't have a match
4. **null + missing/create** — if nothing fits

Never invent content. The blueprint is a record of what's THERE, not a place to compose new prose.

## Return ONLY this JSON (no markdown, no prose):

```json
{
  "contentAudit": {
    "homepage.heroHeadline":   { "existing": "...", "source": "/", "quality": "...", "action": "...", "rationale": "..." },
    "homepage.heroSubheadline":{ "existing": "...", "source": "/", "quality": "...", "action": "...", "rationale": "..." },
    "homepage.heroTagline":    { "existing": "...", "source": "/", "quality": "...", "action": "...", "rationale": "..." },
    "homepage.valueProp":      { "existing": "...", "source": "...", "quality": "...", "action": "...", "rationale": "..." },
    "about.headline":          { "existing": "...", "source": "...", "quality": "...", "action": "...", "rationale": "..." },
    "about.introParagraph":    { "existing": "...", "source": "...", "quality": "...", "action": "...", "rationale": "..." },
    "about.philosophy":        { "existing": "...", "source": "...", "quality": "...", "action": "...", "rationale": "..." },
    "services.<slug>.intro":   { "existing": "...", "source": "...", "quality": "...", "action": "...", "rationale": "..." }
  },
  "coverage": {
    "totalSections": 42,
    "byQuality": { "strong": 0, "adequate": 0, "weak": 0, "missing": 0 },
    "byAction":  { "keep": 0, "optimize": 0, "create": 0 }
  },
  "differentiatorMatches": {
    "<service-slug>": ["matching differentiator label", "..."]
  },
  "rationale": "2-3 sentences"
}
```
