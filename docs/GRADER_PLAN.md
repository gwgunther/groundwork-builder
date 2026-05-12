# Grader Integration Plan

How the Owner.com-style grader folds into the existing Groundwork pipeline.

## TL;DR

We already have the spine. `scripts/pipeline/lib/tech-audit.js` emits a `Finding` shape, `audit-site.js` orchestrates scrape + PageSpeed + tech + AI audit, and `rubric.json` scores the *built* output. The grader is the same machinery, exposed earlier in the funnel, with three additions: a GBP scanner, a competitor/keyword module, and a `state` field on findings so the same cards flip red→green after the build.

## What exists today

| Capability | File | Notes |
|---|---|---|
| Crawl + bronze | `scripts/pipeline/lib/scraper.js` | ✅ |
| AI silver extraction | `lib/ai-silver.js` | ✅ |
| PageSpeed | `lib/pagespeed.js` | ✅ |
| Tech audit findings | `lib/tech-audit.js` | ✅ — already emits `{id, category, severity, title, detail, benefit, affectedPages, count}` |
| AI content audit | `lib/ai-audit.js`, `lib/ai-seo-audit.js` | ✅ |
| Audit report HTML | `lib/audit-report-generator.js` | ✅ |
| Standalone runner | `scripts/pipeline/audit-site.js` | ✅ — already the grader entry point in everything but name |
| Rubric scoring (built site) | `rubric.json` | ✅ — design quality, not pre-build audit |

Existing tech-audit categories: `seo`, `performance`, `accessibility`, `mobile`, `content`.
Existing finding ids: `missing-title`, `duplicate-titles`, `missing-meta`, `missing-h1`, `multiple-h1`, `missing-alt`, `missing-canonical`, `missing-schema`, `no-faq`, `no-testimonials`, `no-viewport`, `thin-content`, `thin-about`, `low-performance`, `low-lcp`, `high-cls`.

## What's missing

1. **GBP completeness scanner** — title, description, hours, phone, price range, service options, social, category match, reviews count, first-party website linked.
2. **Competitor + keyword module** — nearby restaurants/practices via Places, keyword rank for `{vertical} {city}`.
3. **Hosting / domain checks** — nameserver status, fractured presence, third-party-site-as-main-domain.
4. **`Finding.state`** — `issue | fixed | not_applicable` so re-scan flips cards without changing the catalog.
5. **`Finding.fix_action`** — pointer to the generator/skill that resolves this finding.
6. **Growth Score** — single weighted number across all findings (separate from rubric.json, which scores built design).
7. **Places-autocomplete entry** — replaces `--url` with a single field that resolves both site + GBP.
8. **Re-scan pass** — runs scanners against the built site (preview URL) and produces the diff that powers the pitch.

## Proposed `Finding` schema (extended)

Keeps every existing field. New fields marked **NEW**.

```ts
type Finding = {
  // Existing
  id: string;                        // 'missing-meta', 'gbp-no-hours', etc.
  category: 'seo' | 'performance' | 'accessibility' | 'mobile' | 'content'
          | 'gbp' | 'trust' | 'competitive' | 'hosting';   // NEW categories added
  severity: 'critical' | 'warning' | 'passed';
  title: string;                     // "Missing meta descriptions"
  detail: string;                    // "3 pages are missing a <meta description> tag."
  benefit: string;                   // why_it_matters — already present
  affectedPages?: string[];
  count?: number;

  // NEW
  state: 'issue' | 'fixed' | 'not_applicable';
  weight: number;                    // 0.5–2.0, feeds Growth Score
  fixed_copy?: string;               // "Added meta descriptions to all pages."
  fix_action?: {                     // how the builder resolves this
    kind: 'generator' | 'gbp_api' | 'manual' | 'skill';
    target: string;                  // skill id, generator name, or GBP field
  };
  evidence?: {                       // snapshot used by the detector
    before?: unknown;
    after?: unknown;                 // populated on re-scan
  };
};
```

Compatibility note: existing `tech-audit.js` findings get `state: 'issue' | 'passed'` derived from current `severity`, default `weight: 1.0`, and `fix_action` filled in as we wire each check to its generator. No breaking change.

## Starter check catalog

Drawn from Owner.com's catalog (~20 checks) mapped to existing detectors where possible. **bold** = new check.

### Website / SEO (extends tech-audit.js)
- `missing-title` ✅ exists
- `missing-meta` ✅ exists
- `meta-no-keywords` **new** — meta description lacks vertical/city keyword
- `missing-h1` ✅ exists
- `h1-no-keywords` **new** — H1 lacks vertical/city keyword
- `title-mismatch-gbp` **new** — page title ≠ GBP business name
- `missing-faq` ✅ exists (`no-faq`)
- `thin-about` ✅ exists
- `missing-favicon` **new**
- `missing-og-title` / `missing-og-image` / `missing-og-desc` **new**
- `missing-twitter-card` **new**

### Performance / mobile (exists)
- `low-performance`, `low-lcp`, `high-cls`, `no-viewport` ✅

### Trust / contact (new category)
- `no-address-on-site` **new**
- `no-phone-on-site` **new**
- `no-hours-on-site` **new**
- `no-social-links` **new**
- `off-site-ordering-links` **new** (restaurant) / `off-site-booking-links` (medical)

### GBP (new category, new scanner)
- `gbp-no-title`
- `gbp-no-description`
- `gbp-description-no-keywords`
- `gbp-no-phone`
- `gbp-no-hours`
- `gbp-no-price-range`
- `gbp-no-service-options`
- `gbp-no-social-links`
- `gbp-no-website-linked`
- `gbp-low-review-count`
- `gbp-category-mismatch`
- `gbp-incomplete-profile`

### Competitive (new category, last to build)
- `keyword-rank-below-3` **new**
- `outranked-by-local-competitor` **new**

### Hosting (new category)
- `using-third-party-domain` **new**
- `fractured-web-presence` **new** (multiple domains for one brand)

## Growth Score

`growth_score = round(100 * sum(weight * passed) / sum(weight))` over all applicable findings. Separate from `rubric.json` (which scores built design quality). Both can be shown in the report — pre-build Growth Score and post-build Design Score.

## Re-scan & before/after

After the builder publishes (or generates a preview), re-run the same scanners against the preview URL. For each finding:

- `issue` → `fixed` if detector now passes. Populate `evidence.after`.
- `issue` → `issue` if still failing (rare; flag for manual).

The pitch report renders the finding list twice: red (before) and green (after). Same data, two states.

## File-level changes (proposed PR scope)

1. **`scripts/pipeline/lib/findings.js`** *(new)* — schema helpers: `makeFinding()`, `aggregateGrowthScore()`, `flipState()`.
2. **`scripts/pipeline/findings-catalog.json`** *(new)* — single source of truth for `id → {title, benefit, fixed_copy, weight, fix_action}`. Detectors reference this by id instead of inlining copy.
3. **`scripts/pipeline/lib/tech-audit.js`** — minor: read copy from catalog, emit `state` + `weight`. Backwards-compatible.
4. **`scripts/pipeline/lib/gbp-scanner.js`** *(new)* — wraps Places Details API + GBP API; emits GBP findings.
5. **`scripts/pipeline/lib/trust-scanner.js`** *(new)* — address/phone/hours/social regex on bronze pages.
6. **`scripts/pipeline/lib/hosting-scanner.js`** *(new)* — nameserver + domain checks.
7. **`scripts/pipeline/lib/competitor-scanner.js`** *(new, last)* — Places nearby + SERP rank.
8. **`scripts/pipeline/audit-site.js`** — wire new scanners in; compute Growth Score.
9. **`scripts/pipeline/lib/audit-report-generator.js`** — render Growth Score + finding cards (red/green states).
10. **`scripts/pipeline/rescan.js`** *(new)* — re-run scanners against preview URL, diff, write `findings-after.json`.

Order to ship: **1 → 2 → 3** (refactor, no behavior change) → **5, 6** (cheap new scanners) → **4** (GBP, needs API auth) → **9** (UI) → **10** (rescan) → **7** (competitor, last).

## Resolved decisions

1. **Vertical scope** — Dental only. No preset abstraction for the catalog. Single file: `scripts/pipeline/findings-catalog.js`.
2. **GBP auth** — Not wired (every `GBP_*` env var is empty; OAuth script exists but unused). Scan path uses **Places Details API** (`GOOGLE_PLACES_API_KEY` is set); read-only, no per-customer OAuth needed. Write path (auto-fix GBP) deferred until first paying customer.
3. **Deployment model** — Eventual public lead-gen tool (Owner.com pattern). Ship as CLI first; build the data layer (findings, catalog, scoring) generically so the public UI can render the same data later.
4. **Rubric coexists** with grader. Rubric grades built design quality (Phase 4.5 designer agent). Grader grades business-presence completeness on input + output. Different artifacts.

## PR #1 — landed

- `scripts/pipeline/findings-catalog.js` — catalog of ~30 dental checks with weights, fixed_copy, fix_action.
- `scripts/pipeline/lib/findings.js` — `enrichFinding`, `enrichFindings`, `aggregateGrowthScore`, `flipState`.
- `scripts/pipeline/lib/tech-audit.js` — non-breaking: enriches findings + returns `growthScore`.
- `scripts/pipeline/audit-site.js` — prints Growth Score in CLI summary.

Verified: smoke test produces `growthScore`, `state`, `weight`, `fixed_copy`, `fix_action` on every existing finding.

## PR #2 — landed

- `scripts/pipeline/lib/trust-scanner.js` — regex over bronze body text for phone (US-format-tolerant), address (street suffixes), hours (day + time + keyword), and aggregated `siteAssets.socialLinks`.
- `scripts/pipeline/lib/hosting-scanner.js` — third-party-host pattern check (wix/squarespace/weebly/godaddy/etc.), fractured-presence heuristic via e-TLD+1 comparison across discovered URLs, plus one NS lookup recorded in `meta`.
- `audit-site.js` runs both as Phase 4b/4c, writes per-scanner JSON, and now emits a **combined Growth Score** across tech + trust + hosting findings to `_data/findings.json`.

Verified end-to-end with two fixtures: complete-trust site → 100, bare wixsite + missing trust signals → 15.

## PR #3 — GBP scanner via Places Details

- `scripts/pipeline/lib/gbp-scanner.js` — Places Autocomplete lookup → Places Details fetch → emit GBP findings (`gbp-no-*` ids already in catalog).
- New CLI flag `--place-id` or `--business-name` for Places-first lookup.
- Wire into `audit-site.js`.

## PR #4 — Report UI (HTML)

- `audit-report-generator.js` renders findings as cards grouped by category, color-coded by `state`. Growth Score hero. "Fix with AI" CTA per card.

## PR #5 — landed

- `scripts/pipeline/lib/findings-diff.js` — pure `diffFindings(before, after)` + `summarizeDiff(diff)`. Classifies each id into one of six transitions: `fixed`, `still-issue`, `regressed`, `unchanged`, `new`, `removed`. Computes before/after Growth Score + delta.
- `scripts/pipeline/rescan.js` — CLI. Loads original `findings.json`, scrapes preview URL, re-runs tech + trust + hosting + GBP (placeId reused from prior audit), writes `findings-after.json` + `findings-diff.json`. Skips PageSpeed and AI audit (slow, not the diff signal).

Verified with a fixture: 2 fixed / 1 regressed / 1 still-issue / 1 new → score 27 → 44 (delta +17), all transitions classified correctly.

Report-side rendering of the diff (red→green flip in place) is deferred to a later PR so this one stays focused on the data layer.

## PR #5b — Diff rendering — landed

- `audit-report-generator.js` gains a diff-mode branch:
  - `buildDiffHero(diff)` — strikethrough before-score, arrow, after-score, ±delta badge, fixed/still-issue/regressed counters.
  - `buildDiffFindings(diff)` — finding cards grouped by transition (Fixed → Regressed → Still issue → New → Unchanged), each card shows side-by-side BEFORE/AFTER detail blocks, past-tense `fixed_copy` headline for fixed transitions, and the existing "why this matters" footnote.
  - `generateAuditReports` accepts `diff` and writes to `audit-report-after.html` instead of overwriting the original.
- `rescan.js` calls `generateAuditReports` with the computed diff so a single `rescan` invocation produces both `findings-diff.json` and the rendered HTML.

Verified visually: fixture run with 3 fixed / 1 still-issue (score 16 → 79, +63) renders the hero, tab label "Before → After 3", and diff cards as expected.

## PR #6 — Competitor + keyword module (last)

- `scripts/pipeline/lib/competitor-scanner.js` — Places nearby + simple SERP rank for `{specialty} {city}`. Emits `keyword-rank-below-3`, `outranked-by-local-competitor`.
