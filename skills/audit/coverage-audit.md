---
tier: L4
maturity: working
phase: Audit
source: scripts/pipeline/lib/coverage-audit.js
function: runCoverageAudit
model: deterministic
---

# Skill: Coverage Audit

## Responsibility

Whole-pipeline before/after audit. Compares the scraped/silver/bronze
artifacts against the final rebuilt site (config files + built HTML) and
flags content that the pipeline silently dropped or thinned. Catches the
class of failures that the per-step skills can't see (e.g. a second doctor
appears in bronze JSON-LD but never makes it through silver → merge → about
page). Outputs `coverage-audit.json` and `coverage-audit.md`.

## Inputs (read from disk)

| File | Used for |
|---|---|
| `_pipeline/01-bronze.json` | Source of truth — all scraped pages, JSON-LD, bodyText |
| `_pipeline/01-scrape.json` | Silver extraction (.output) |
| `_pipeline/06-merge.json` | Merged data |
| `public/images/image-roles.json` | Doctor↔photo pairing manifest |
| `dist/index.html` | Built homepage HTML |
| `dist/about/index.html` | Built about page HTML |
| `dist/services/<slug>/index.html` | Per-service rebuilt pages |
| `src/config/site.ts` | Final phone, NAP |

## Output schema

```json
{
  "findings": [
    {
      "severity": "CRITICAL | WARNING | NOTE",
      "check":    "doctors-missing | doctors-not-on-about-page | doctor-photo-pairing-uncertain | secondary-doctor-no-photo | services-missing | service-page-thin | differentiators-missing | phone-missing | phone-mismatch | no-blog-index | additional-content-not-surfaced",
      "message":  "string — human description",
      "detail":   { /* check-specific structured detail */ },
      "hint":     "string — suggested fix path"
    }
  ],
  "summary": { "total", "critical", "warning", "note" },
  "markdown": "string — rendered report"
}
```

## Evaluation criteria

- **No false negatives on multi-doctor sites** — if bronze JSON-LD has 3 Person/Dentist entries and rebuild has 1, must fire `doctors-missing` CRITICAL
- **No false positives on intentional content compression** — service-page-thin uses 35% threshold, allowing for chrome-stripping and copy compression
- **Phone is normalized before comparison** — digits-only comparison so format differences don't false-flag
- **Each finding includes a hint** pointing at the likely upstream fix location (e.g. "ai-silver.js may have truncated about-page bodyText")
- **Summary counts match findings array** by severity
- **Markdown report groups by severity** with appropriate icons

## Known gaps

- `checkServicePageDepth` ratio is a single magic number (0.35) — doesn't account for legitimately short rewrites of long source pages
- `checkDifferentiators` token-matching is heuristic — labels with stop-words ("offers free consultation") can false-flag if the rebuild used different phrasing
- `no-blog-index` always fires when /blog/ doesn't exist, even if the source site had no blog — should compare against bronze
- Doctor name comparison is case-insensitive trim only — punctuation/middle-name variants (`Dr. J. Smith` vs `Dr. John Smith`) miss
- No check that rebuild homepage actually mentions every service in `services.offered` by name
- No check on hours fidelity (display vs raw)
- Built HTML is read but only minimally analyzed (regex strip-tags) — can't detect visual issues

## Improvement levers

1. **Easy (L4):** Add `checkHomepageServiceCoverage` — every offered service should appear in homepage HTML at least once
2. **Easy (L4):** Skip `no-blog-index` when bronze had no blog pages
3. **Medium:** Per-finding severity calibration based on practice profile (single-doctor practice → demote `additional-doctor-no-photo` to NOTE)
4. **Medium:** Add fuzzy match on doctor names (Levenshtein) for the case-mismatch / middle-initial cases
5. **Hard:** Visual-coverage check — rendered screenshot diff against bronze hero image to detect "site looks too generic"

## Test fixtures

_None yet. Future: synthetic bronze→rebuild pairs that trigger each of the 7 checks._

---

## Logic — the 7 checks

### 1. `checkDoctors` — doctors-missing (CRITICAL) + doctors-not-on-about-page (WARNING)

```
bronzeDoctors = collect names from bronze.pages[*].structuredData[*]
                where @type matches /Person|Dentist|Orthodontist|Physician|MedicalProfessional/
                AND name starts with /Dr\.?|Doctor/
rebuildDoctors = silver.doctor.name + silver.additionalDoctors[*].name
missing = bronzeDoctors - rebuildDoctors  (case-insensitive trim)
→ if missing.length > 0: CRITICAL doctors-missing

aboutText = strip-tags(builtAboutHtml)
missingFromAbout = rebuildDoctors where lastName not in aboutText (case-insensitive)
→ if missingFromAbout.length > 0: WARNING doctors-not-on-about-page
```

### 2. `checkDoctorPhotoPairing` — doctor-photo-pairing-uncertain (WARNING) + additional-doctor-no-photo (NOTE)

```
For primary doctor:
  if no explicit pairing in imageRoles.doctorPortraits[primaryName]:
    if doctorPortrait filename does NOT include lastName.toLowerCase():
      → WARNING doctor-photo-pairing-uncertain

For each additionalDoctor d:
  if !imageRoles.doctorPortraits[d.name]:
    → NOTE additional-doctor-no-photo
```

### 3. `checkServiceCount` — services-missing (WARNING)

```
bronzeServices = paths matching /^\/services\/([^/]+)\/?$/
rebuildServices = silver.services.offered[*].slug (or slugified name)
missing = bronzeServices - rebuildServices
→ if missing.length > 0: WARNING services-missing
```

### 4. `checkServicePageDepth` — service-page-thin (WARNING)

```
For each bronze /services/<slug>/ with bodyText.length >= 1500:
  builtText = strip-tags(<main> of dist/services/<slug>/index.html)
  ratio = builtText.length / sourceText.length
  → if ratio < 0.35: WARNING service-page-thin
```

### 5. `checkDifferentiators` — differentiators-missing (NOTE)

```
For each silver/merged signal s:
  tokens = s.label.split(/\s+/).filter(len>=4 && !['practice','offers','provides']).slice(0,2)
  missing if NOT every token appears in builtHomeHtml + builtAboutHtml (lowercased, tags stripped)
→ if missing.length >= 2: NOTE differentiators-missing
```

### 6. `checkContact` — phone-missing (CRITICAL) + phone-mismatch (CRITICAL)

```
sourcePhone  = silver.practice.phone || merged.practice.phone
rebuildPhone = phone field extracted from src/config/site.ts via regex
→ if sourcePhone but no rebuildPhone:                            CRITICAL phone-missing
→ if normalize(source) !== normalize(rebuild) (digits-only):     CRITICAL phone-mismatch
```

### 7. `checkBlogPresence` — no-blog-index (NOTE)

```
→ if dist/blog/index.html does not exist: NOTE no-blog-index
```

### 8. `checkAdditionalContent` — additional-content-not-surfaced (NOTE / WARNING)

Validates that rescued content blocks from `silver.content.additionalContent[]`
actually appear in the built site. If a rescued "philosophy" paragraph or
doctor pull-quote isn't echoed anywhere in the rebuild, the catch-all
mechanism captured the content but generate skills aren't using it.

```
1. items = silver.content.additionalContent || []
2. For each item, take 3 candidate phrases (~8 words each) from item.content
3. Concatenate all built HTML page text (homepage, /about, /services, every /services/<slug>)
4. If NONE of the 3 phrases appear (case-insensitive) in the built text → mark as not-surfaced
5. If 5+ items not surfaced → WARNING; otherwise NOTE
```
