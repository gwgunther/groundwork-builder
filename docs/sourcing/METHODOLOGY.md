# Dental Practice Sourcing — Methodology

> **Lifecycle context:** This doc covers funnel-top sourcing (journey phase ①). Full journey map → [../lifecycle/CUSTOMER_JOURNEY.md](../lifecycle/CUSTOMER_JOURNEY.md).
>
> A scored prospect database (~5k dental practices) that doubles as research input for a derived best-practices checklist. The checklist drives the builder's audit rules, template spec, and the public gap report.
>
> **Goal:** find independent dental practices with a thriving business but a poor website — the "prime quadrant" where our pitch lands hardest.

---

## 1. The Three Products From One Scrape

A single dataset produces three deliverables:

1. **Prospect database** (private) — 5k scored practices in Airtable, filterable by tier/quadrant, fed into cold outreach.
2. **Best-practices checklist** (internal) — derived from what the top decile consistently does. Becomes the builder's audit checklist *and* the spec for new-site templates.
3. **Public gap report** (marketing artifact) — anonymous, aggregate-level analysis of the industry's website quality. Lead magnet.

Keep them separate downstream: exemplars (top decile) get showcased and never contacted; prime-quadrant practices are by-name prospects but stay anonymous in anything public.

---

## 2. Architecture & Separation

All sourcing code lives under `scripts/sourcing/`, fully isolated from the builder (`scripts/pipeline/`). Sourcing may import read-only builder utilities (e.g. audit detectors), never the reverse.

```
scripts/sourcing/
├── spike/                          # one-off thesis-test scripts
│   └── vendor-detect.js
├── lib/
│   ├── places.js                   # Google Places API wrapper
│   ├── fetch-html.js               # polite homepage fetcher
│   ├── vendor-fingerprints.js      # 30+ vendor signatures (mills/DIY/CMS/modern)
│   ├── chain-detector.js           # DSO filter (PDS, Heartland, Aspen, etc.)
│   ├── scoring.js                  # deterministic scoring (Lighthouse, flags)
│   ├── screenshot.js               # Playwright desktop + mobile capture
│   ├── capture-anchors.js          # one-time: cache anchor screenshots
│   ├── vision-prompt.js            # Claude vision prompt + message builder
│   ├── vision-score.js             # the actual API call
│   ├── ad-detect.js                # Meta Ad Library + Google Ads Transparency
│   ├── enrich.js                   # rich Place Details (Tier A only)
│   └── airtable.js                 # batched, rate-limited sync
├── research/                       # built later, after data exists
│   ├── exemplar-filter.js
│   ├── rules/                      # one detector per hypothesis
│   ├── run-differential-analysis.js
│   ├── discover-patterns.js        # AI pattern mining
│   └── output/
│       ├── best-practices-checklist.md
│       ├── differential-analysis.csv
│       └── ai-discovered-patterns.md
└── run.js                          # pipeline orchestrator

_sourcing/                          # gitignored output dir
├── spike-*.{json,csv}
├── screenshots/                    # {place_id}-{desktop|mobile}.png
└── anchors/                        # cached anchor reference PNGs
```

**Cleanup if it ever spins off:** `rm -rf scripts/sourcing _sourcing`.

---

## 3. Data Sources & Pipeline Flow

### 3.1 Sourcing (Google Places API New)

- **Text Search** endpoint, queries like `"dentist in {city}, {state}"`.
- Returns up to 60 results per query (3 pages of 20).
- For 5k records: ~85–100 city queries OR a denser per-city variant set (`"orthodontist in..."`, `"pediatric dentist in..."`).
- Stable dedup key: `place_id`.
- **Cost:** ~$0.032/call. 5k records ≈ $50–100 in Places API.

### 3.2 Two-tier enrichment economics

| Tier | Runs on | Cost/practice | Data |
|---|---|---|---|
| **Cheap** | All 5k (sourcing time) | ~$0.05 | Name, address, phone, website, rating, count, primary type, status, lat/lng |
| **Rich** | Tier A only (~250 practices) | ~$0.30–0.50 | Hours, photos, reviews, opening patterns, GBP services |

Promote-to-rich is triggered by an Airtable view, not by sourcing run. Saves ~$300 vs enriching everything.

### 3.3 Pipeline order per practice

```
Google Places (cheap data)
      ↓
Homepage fetch (HTML, headers, final URL)
      ↓
[FILTER] Chain/DSO detector → if matched, mark excluded, stop
      ↓
Vendor fingerprint → category + vendor name
      ↓
Deterministic scoring (Lighthouse via PageSpeed Insights API,
   HTML parse for schema/booking/tel/etc., dated-tech flag count)
      ↓
Screenshot capture (Playwright: desktop 1440px + mobile 390px)
      ↓
Vision scoring (Claude Sonnet 4.5, single call w/ 5 images)
      ↓
Ad-spend detection (Meta Ad Library API + Google Ads Transparency scrape)
      ↓
Sync to Airtable (batched, rate-limited)
```

Each step is independently re-runnable; raw HTML and screenshots are cached so re-scoring with updated rubrics doesn't require re-fetching.

---

## 4. The Filtering Decision: Who's NOT a Prospect

### 4.1 Chains / DSOs (Dental Service Organizations)

Corporate companies that own or manage many dental practices. The local dentist is an employee; marketing decisions are made at HQ. They look like prospects in Google Places (one GBP per location) but are not pitchable.

**Filter list** (the ones we'll keep seeing):
- Pacific Dental Services / SmileGeneration (the `sc_cid=GBP` URL pattern)
- Heartland Dental
- Aspen Dental
- Western Dental
- Smile Brands
- MB2 Dental
- Affordable Dentures & Implants
- Brident, Castle Dental, DentalPro7

Detected via URL patterns + shared template host fingerprints. Marked `Is Chain = true`, status `excluded-dso`. Kept in Airtable (separate view) for audit, not deleted.

### 4.2 Modern-custom practices

Sites built on Webflow/Next.js/Framer/Astro with custom design. Probably have an agency. Marked low priority via `Vendor Multiplier = 0.3×`. Not excluded — some may still convert — just deprioritized.

### 4.3 Unreachable / closed

`HTTP Status != 200` or `business_status = CLOSED_PERMANENTLY` → status `excluded-closed`.

---

## 5. Scoring System

Three composite scores feed one final ranker. Roughly **95% objective overall** — only ~3–5% of the final Opportunity Score comes from AI judgment.

### 5.1 Design Score (0–100)
*"How bad / good does this website look?"*

| Input | Weight | Objectivity |
|---|---|---|
| Lighthouse Performance (mobile) | 20% | Objective |
| Lighthouse Accessibility | 10% | Objective |
| Lighthouse Best Practices | 10% | Objective |
| Has HTTPS | 5% | Objective |
| Has viewport meta | 5% | Objective |
| Has Schema.org JSON-LD | 5% | Objective |
| Has click-to-call | 3% | Objective |
| Has booking widget | 5% | Objective |
| Per-service page count | 5% | Objective |
| Dated-tech flag count | -2% each | Objective |
| **Vision: Visual Craft (1–5)** | 5% | Subjective (AI) |
| **Vision: Clarity & Hierarchy (1–5)** | 5% | Subjective (AI) |
| **Vision: Modernity (1–5)** | 5% | Subjective (AI) |

**~85% deterministic, 15% AI judgment.** The AI portion is bounded by anchor calibration, forced evidence, temp 0, and structured JSON output.

### 5.2 Business Value Score (0–100)
*"Is this a thriving practice that can afford us?"*

| Input | Weight |
|---|---|
| Review count (log-scaled) | 30% |
| Average rating | 20% |
| Years in business (proxy: oldest review age) | 15% |
| Specialty premium (ortho/cosmetic/implants/perio > general) | 20% |
| Multi-location | 15% |
| Ad-spend bonus (if Meta or Google ads) | +10% |

**100% objective.**

### 5.3 Vendor Multiplier (0.3×–1.5×)

| Vendor category | Multiplier |
|---|---|
| Confirmed dental-mill (ProSites, PBHS, Officite, etc.) | 1.5× |
| DIY builder (Wix, Squarespace, Weebly) | 1.2× |
| Generic WordPress | 1.1× |
| Unknown | 1.0× |
| Modern custom (Webflow, Next.js, Astro, Framer) | 0.3× |

**100% objective** (lookup based on fingerprint match).

### 5.4 Opportunity Score (the final ranker)

```
Opportunity = (BusinessValue × (100 − DesignScore) / 100) × VendorMultiplier
```

**Tier:** A ≥ 60, B 40–60, C 20–40, D < 20.

**Quadrant** (high/low Business × high/low Design):
- **Prime** — high value, low design → the target
- **Skip — already sorted** — high value, high design
- **Nurture** — low value, low design
- **Low priority** — low value, high design

---

## 6. The AI Vision Scoring Approach

**Model:** `claude-sonnet-4-5`, temperature 0, max 1500 tokens.

**Input per practice:**
1. Anchor image for score = 1 (template-quality dental mill)
2. Anchor image for score = 3 (average independent WordPress practice)
3. Anchor image for score = 5 (bespoke modern custom build)
4. Target site — desktop screenshot (1440px, full page)
5. Target site — mobile screenshot (390px, full page)

**Anchor sites** (locked at pipeline init, cached as PNGs):
- Score 1: ProSites template (e.g. `myriversidedentaloffice.com`)
- Score 3: WordPress generic (e.g. `magnoliamoderndental.com`)
- Score 5: Webflow custom (e.g. `signaturesmilesriverside.com`)

**Prompt structure** (full source in `scripts/sourcing/lib/vision-prompt.js`):

1. **Escape valve first** — if the screenshot is blank/broken/parked-domain, return `{unrenderable: true}` with null scores. Filtered out of aggregates.
2. **Step 1: 5 forced observations** — concrete things visible in the screenshots. At least one must address mobile-vs-desktop. Explicit "do not comment on perf/a11y/features" exclusions to prevent double-counting with the deterministic layer.
3. **Step 2: Three 1–5 sub-scores** — Visual Craft / Clarity & Hierarchy / Modernity. Each level has a written anchor description. Pediatric/ortho carve-out to prevent unfair "kid-themed = dated" penalty.
4. **Step 3: Strict JSON output**, no markdown fences.

**Cost:** ~$0.02–0.03/practice × 5k = $100–150 total.

**Output cached** by `place_id` so re-runs (e.g. after prompt updates) only re-score the changed/new rows.

---

## 7. Ad-Spend Detection

| Platform | Method | Reliability | Cost |
|---|---|---|---|
| **Meta** (Facebook + Instagram) | Official Ad Library API | Very high (legal requirement) | Free |
| **Google** | Playwright scrape of Ads Transparency Center | Moderate (may break) | ~$0 (reuses screenshot browser) |

Either positive → bumps Business Value Score (the practice has a real marketing budget and is sending paid traffic, likely to a mediocre landing page — strong "wow" potential).

---

## 8. Airtable Storage

**Base:** existing `appuv93d4njPSwx9Y`.
**Table:** new — `Sourced Practices` (do NOT pollute the existing `Accounts` CRM).
**Promotion flow:** when a sourced row becomes a real prospect, "promote to Accounts" creates a linked record. Sourced table = funnel top, Accounts = qualified leads.

**Schema groups** (full list in setup script):

- **Identity / source** — `Place ID`, `Practice Name`, `Slug`, `Source`, `Sourced At`, `MSA / Market`
- **Location** — `Address`, `City`, `State`, `Zip`, `Latitude`, `Longitude`
- **Contact** — `Website URL`, `Final URL`, `Phone`, `Email`
- **Google Places data** — `Primary Type`, `Types`, `Rating`, `Review Count`, `Business Status`
- **Tech audit** — `HTTP Status`, `Vendor`, `Vendor Category`, `Is Chain / DSO`, `Chain Name`, `Lighthouse Performance/Accessibility/Best-Practices`, `Has HTTPS`, `Has Viewport Meta`, `Has Schema.org`, `Has Click-to-Call`, `Has Booking Widget`, `Booking Vendor`, `Per-Service Page Count`, `Dated-Tech Flags`, `Dated-Tech Flag List`
- **AI vision** — `Vision: Visual Craft`, `Vision: Clarity & Hierarchy`, `Vision: Modernity`, `Vision Observations`, `Desktop Screenshot` (attachment), `Mobile Screenshot` (attachment)
- **Ad spend** — `Running Google Ads`, `Google Ads Count`, `Running Meta Ads`, `Meta Ads Count`
- **Computed scores** (Airtable formula fields — no code) — `Design Score`, `Business Value Score`, `Vendor Multiplier`, `Opportunity Score`, `Tier`, `Quadrant`
- **Outreach state** — `Status`, `Notes`, `Promoted To Account` (link)

**Views to create:**
- Prime quadrant (Tier A) — main outreach list
- By vendor — grouped
- Excluded — DSO
- Exemplars (Design Score ≥ 85) — feeds research module
- Reachability issues — for cleanup

**Engineering notes:**
- Batch writes (Airtable limit: 10 records/request, ~5 req/sec per base).
- Confirm row ceiling against current plan tier — Team/Pro = 50k records/base, Business = 125k. 5k is fine; plan ahead if scaling to 25k+.

---

## 9. The Best-Practices Research Loop (Product 2)

Built **after** the sourcing pipeline has populated Airtable. Reuses the same dataset.

### 9.1 Filter for the exemplar set

Stack three filters (Airtable view):
- Design Score top 10% (≥85)
- Business Value Score top 25% (≥60) — high reviews + rating prove the practice is thriving
- `Is Chain = unchecked`
- `Vendor Category != dental-mill`

Result: ~50–150 sites. The "great + working" intersection.

### 9.2 Pass 1 — rule-based hypothesis testing

Define a list of suspected best practices, write a binary detector per hypothesis, run across (a) exemplars and (b) bottom decile, compute the differential.

**Starter hypothesis list:**
- Insurance providers listed on homepage
- Real photo of the actual dentist above the fold
- Phone number visible without scrolling
- "Book online" button in header (not just footer)
- Hours of operation on homepage
- Patient testimonials/reviews embedded on homepage
- New-patient special / offer in hero
- Map / address in footer
- Team page with dentist + staff photos
- Per-service pages with own URLs (not collapsed into "services")
- Spanish language toggle (regional consideration)
- Office tour / virtual tour
- Financing / payment-plan callout
- Emergency dental callout
- Schema.org LocalBusiness markup
- Click-to-call telephone link
- Above-the-fold CTA other than "call us"

**Output table format:**

```
Rule                          Top decile  Bottom decile  Differential
Book-online button in header       91%          18%          +73  ★
Insurance list on homepage         78%          22%          +56  ★
Real dentist photo above fold      83%          31%          +52  ★
Phone number above fold            95%          88%           +7    table stakes
```

**Promotion rule:** differential ≥ 40 → confirmed best practice → goes into:
1. Builder's audit checklist (any client site is checked against it)
2. Builder's component-library spec (new sites must include these blocks)
3. Public gap report's "what top sites do that yours doesn't" section

### 9.3 Pass 2 — AI pattern discovery

Feed Claude ~30 exemplar homepages (screenshots + extracted text) in one call. Prompt:

> "These are 30 high-performing dental practice homepages. Identify patterns that appear in many of them. Rank by prevalence. For each pattern: name it, estimate % of sites you see it in, and explain why it likely works. Ignore universal patterns (every business has a logo)."

Surfaces patterns we didn't pre-list. High-confidence AI-discovered patterns get promoted into Pass 1's detector for v2.

### 9.4 Slice by specialty

General-dentistry exemplars and cosmetic-dentistry exemplars likely have **different** best practices (insurance lists matter for high-volume general; signal "commodity" for cosmetic). Run differential analysis per `primary_type` slice. Produces specialty-specific checklists, all useful to the builder.

### 9.5 The closed loop

```
Sourced data → exemplar filter → pattern extraction → checklist
       ↓                                                    ↓
       └──────── builder audit + template spec ←────────────┘
                                ↓
                    public gap report (anonymized)
```

---

## 10. Spike Findings (Riverside–San Bernardino MSA, n=100)

Baseline thesis test, run before committing to full pipeline. **Conclusion: proceed with adjustments.**

| Category | % |
|---|---|
| WordPress generic | 44% |
| Unknown (not yet fingerprinted) | 26% |
| Confirmed dental-mill | 13% |
| DIY builder (Wix/Squarespace/etc.) | 7% |
| Modern stack (Webflow/Next/Astro) | 6% |
| Drupal / Joomla | 4% |

**Key insights from the spike:**

1. **DSO/chain filtering is a hard requirement we missed initially.** ~12% of the sample turned out to be corporate-owned (Pacific Dental Services, West Coast Dental, Dental Views, Riverside Dental Group). Pitching them is wasted effort.
2. **The 13% confirmed-mill share is a floor, not ceiling.** Many mills (especially ProSites/PBHS) deliver via WordPress themes — they're inside the 44% WP bucket but not fingerprinted as mills yet. Theme-level fingerprints are a v2 improvement.
3. **Don't make the vendor multiplier the primary signal.** A bad-design WordPress site is just as much a prime prospect as a confirmed ProSites site. Vendor is a *boost*, not a *gate*. Final scoring weights: Design gap 70%, Business value 30%, vendor multiplier ±20%.

---

## 11. Open Questions / Future Improvements

- **Anchor sanity check** — eyeball the 3 anchor sites and confirm each clearly exemplifies its score level before locking.
- **Vision sub-score correlation** — after first 100-site batch, check if Visual Craft and Modernity move together (r > 0.85). If so, collapse to 2 sub-scores.
- **Theme-level WordPress fingerprints** — deferred to v2. Would convert some of the 44% WP-generic bucket into properly-classified mill rentals.
- **Calibration set** (~100 hand-scored sites) — skipped for v1; revisit if defending scores externally becomes important.
- **Double-counting fix** — currently relying on prompt-level "don't comment on tech staleness" exclusion. Watch for drift in first batch.
- **Specialty-aware vision prompts** — v2 if pediatric/ortho scoring proves systematically off.
- **Nationwide expansion** — current plan targets one MSA. Top 50–100 MSAs would be ~50k–200k practices — Airtable row ceiling becomes a real concern.

---

## 12. Quick Reference — Costs at Scale (5k Practices)

| Line item | Cost |
|---|---|
| Google Places API (Text Search + lite Details) | $50–100 |
| Google Places rich enrichment (Tier A only, ~250) | $15 |
| PageSpeed Insights API | Free (rate-limited) |
| Claude vision scoring | $100–150 |
| Playwright screenshots | Compute only |
| Meta Ad Library API | Free |
| Airtable | Existing plan |
| **Total per 5k run** | **~$165–265** |

---

## 13. Quick Reference — Glossary

- **MSA** — Metropolitan Statistical Area. US Census-defined metro region (~400 in the US). The right unit for outreach campaigns because patient/marketing dynamics stay consistent within one.
- **DSO** — Dental Service Organization. Corporate company that owns/manages many practices. Not pitchable.
- **Dental mill** — Vendor that sells the same templated website to thousands of dentists on a $200–500/mo subscription. ProSites, PBHS, Officite, SmileMarketing, Dentist Identity, Roadside Dental, etc. **Highest-leverage prospects** because they're already paying real money monthly for something mediocre.
- **Custom modern** — Site clearly designed for this specific practice in the last 3 years on a modern stack. Worst prospects (probably have an agency, not in pain).
- **Prime quadrant** — High business value + low design quality. Where the pitch lands hardest.
- **Exemplar set** — Top 10% by design × top 25% by business value, excluding chains and mills. Feeds research / best-practices extraction.
