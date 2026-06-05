# Dental Practice Sourcing — Methodology

> **Lifecycle context:** This doc covers funnel-top sourcing (journey phase ①). Full journey map → [../lifecycle/CUSTOMER_JOURNEY.md](../lifecycle/CUSTOMER_JOURNEY.md). Production ops → [RUNBOOK.md](./RUNBOOK.md).
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

### 3.1 Sourcing (Google Places API New) — metro registry + geo-radius

- **Metro registry** (`scripts/sourcing/config/metros.js`): the 100 largest US MSAs, auto-parsed from the Census list into `{ key, label, primaryCity, state, geocodeQuery, pop, radiusMeters }`. Run any metro with `--metro <key>` (`--list-metros` to see all).
- **Geo-radius coverage** (not per-city text search): geocode the metro's primary city once → center point, then run each query term (`dentist`, `cosmetic dentist`, `orthodontist`, `dental implants`, `pediatric dentist`) **location-biased to a population-scaled radius** (22–50km). Pulls the most-prominent practices metro-wide (suburbs included) without enumerating cities.
- Each term returns ≤60 (3 pages of 20); dedup by `place_id`; **cap 200/metro** (the most-prominent — Google ranks by prominence, which correlates with business value). Override with `--limit`.
- **Cost:** ~$0.03/query × ~6 queries/metro ≈ trivial (~$0.20/metro). Lighthouse (PageSpeed) is free.
- **Mega-metro caveat:** a single radius from the core city under-covers sprawl (NYC/LA/Chicago); "top 200" there skews to the urban core. Fine for a first pass; add secondary center points later if needed.

### 3.2 Two-tier enrichment economics

| Tier | Runs on | Cost/practice | Data |
|---|---|---|---|
| **Cheap** | All 5k (sourcing time) | ~$0.05 | Name, address, phone, website, rating, count, primary type, status, lat/lng |
| **Rich** | Tier A only (~250 practices) | ~$0.30–0.50 | Hours, photos, reviews, opening patterns, GBP services |

Promote-to-rich is triggered by an Airtable view, not by sourcing run. Saves ~$300 vs enriching everything.

### 3.3 Pipeline order

```
Per practice (parallel, concurrency 4, 200s hard timeout each):
  Google Places (cheap data: name/addr/phone/website/rating/reviews/lat-lng/maps-uri)
      ↓
  Playwright capture (RENDERED html + desktop & mobile screenshots)
      ↓
  [FILTER] Chain/DSO detector → if matched, mark excluded
      ↓
  Vendor fingerprint (rendered HTML) → category + vendor + WP theme
      ↓
  HTML feature parse (schema/booking/tel/contact-form/dated-tech/multi-loc) + email extract
      ↓
  Lighthouse via PageSpeed Insights API → 4 bands
      ↓
  Per-row: Quality Checklist (count) + Lighthouse bands
      ↓
  Persist: checkpoint JSON (local + GCS) · screenshots → GCS · rendered HTML → GCS (gzip)

Per metro (after all rows):
  finalizeScores() → per-metro percentile thresholds → Business Tier,
                     Weakness Tier, Tier/Quadrant (gates), Exemplar (gates)
      ↓
  Sync to Airtable (batched, rate-limited, upsert by Place ID)
```

**No vision in sourcing** (deferred — §6). **No ad detection** (removed — §7).
Everything is independently re-runnable; rendered HTML + screenshots + checkpoints are cached (local + GCS), so re-scoring with updated thresholds (`--rescore`) requires **no re-fetch** — instant and free.

**Resilience:** per-practice 200s hard timeout (one hung call can't stall the run); `process.exit(0)` on completion (orphaned sockets can't hang exit); all regex detectors bounded/ReDoS-safe; checkpoints make any run resumable.

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

Sites built on Webflow/Next.js/Framer/Astro with custom design. Probably have an agency, not in pain. Not excluded, but they naturally land in the **Skip ("already sorted")** quadrant — a custom build passes the "custom build" check and usually has a low Weakness Score, so the gates deprioritize them without any special multiplier. (They're also the **exemplar** candidates — see §5.5.)

### 4.3 Unreachable / closed

`HTTP Status != 200` or `business_status = CLOSED_PERMANENTLY` → status `excluded-closed`.

---

## 5. Scoring System — FINAL MODEL (rubric 2026.06.04)

> **Design principle:** no invented weights or transforms. The *only* computed
> number is a uniform checklist count. Everything else is a raw fact, a Google
> Lighthouse band, a binary HTML fact, a data-relative percentile, or a gate.
> This makes the whole system **objective, reproducible, and defensible** —
> every threshold references an external standard (Google) or the data itself.
>
> History: earlier rubrics used weighted composites (a "Website Quality Score",
> "Business Value Score", "Opportunity Score", "Vendor Multiplier"). Those are
> **retired** — the weights were arbitrary judgment dressed as numbers, and a
> test showed they changed ~50% of exemplar picks. Replaced by the model below.

### 5.0 The three jobs (different rigor for each)

| Job | Needs | Rigor |
|---|---|---|
| **Rank prospects** (who to cold-email first) | a useful priority order | low — you review the A-list anyway |
| **Define exemplars** (top sites for Product #2 + claims) | a defensible, reproducible definition | **high** — customer-facing |
| **Generate the pitch** (per-prospect "what's wrong") | concrete, true, specific statements | **high** — said to their face |

### 5.1 The objective fact sheet (per practice — stored, never blended)

- **Raw numbers:** review count, star rating (Google Places facts).
- **Google Lighthouse bands** (the unit we use in logic, not the raw 0–100 — bands are stable per Google's variability guidance): Performance / Accessibility / Best-Practices / SEO, each **Good (≥90) / Needs Improvement (50–89) / Poor (<50)**. These thresholds are *Google's*, percentile-grounded in real web data (green ≈ top 8% of the web).
- **Binary HTML facts:** HTTPS, viewport, schema.org, booking widget, click-to-call, dated-tech present, contact form.
- **Categorical facts:** vendor category, chain/DSO flag, contactability (email/phone).

### 5.2 Quality Checklist — the ONE computed number (uniform count, 0–11)

Each item is a pass/fail bar grounded in a Google band or a verifiable fact. **Score = how many pass.** Uniform weight (1 each) — the only non-arbitrary way to combine. The **failed items are the outreach pitch.**

```
☐ Mobile performance not Poor   (Lighthouse ≥ 50 — Google "not red")
☐ Accessibility Good            (Lighthouse ≥ 90 — Google "green")
☐ Best Practices Good           (Lighthouse ≥ 90)
☐ SEO Good                      (Lighthouse ≥ 90)
☐ Custom build (not template)   (vendor = modern-stack)
☐ Structured data (schema.org)
☐ Online booking
☐ Click-to-call
☐ HTTPS
☐ Mobile viewport
☐ No dated tech
```

- **Quality Score** = count passed (higher = better site). **Weakness Score** = count failed.
- **Why "not Poor" for performance but "Good" elsewhere:** each Lighthouse check uses the Google band that *discriminates* in this vertical. Green mobile performance is near-impossible for content-heavy dental sites (~3% achieve it), so requiring it would carry no information; "not Poor" cleanly flags the genuinely-broken red tail. Green *is* achievable on a11y/best-practices/SEO, so it's the meaningful bar there. Both are Google's own boundaries.

### 5.3 Business strength = review percentile (per metro, data-relative)

- **Business Tier:** High = top quartile of the metro's review counts · Med = above median · Low = rest. Data-relative (auto-calibrates per market), no invented absolute. Used for *ranking by establishment/size* — exactly where percentiles fit.

### 5.4 Tier + Quadrant = gates over two axes (no number)

Two objective axes: **Business Tier** (review percentile) × **Weakness Tier** (failed-check count: Severe ≥6 / Moderate 3–5 / Minor 0–2).

- **Quadrant:** High biz + weak site → **Prime** · High biz + good site → **Skip (already sorted)** · Low biz + weak → **Nurture** · Low biz + good → **Low Priority**.
- **Tier (at-a-glance):** A = High biz + Severe weakness · B = High biz + Moderate · C = Med biz + weak · D = rest.
- **Vendor situation is a separate facet**, NOT folded into a score — so you filter "Prime + on a dental-mill" (the hottest pitch) without us baking a multiplier judgment into a number. *You* apply that business judgment by choosing the view.
- **Ranking within a view** = sort by review count (raw fact). No composite.

### 5.5 Exemplar ("Top Site") = objective gates

The sites Product #2 learns from. A practice qualifies if it passes **all**:

```
✓ Independent (not chain/DSO)
✓ Not a mill template
✓ Custom build (vendor = modern-stack)
✓ Accessibility Good   (Google green)
✓ Best Practices Good  (Google green)
✓ SEO Good             (Google green)
✓ Established  — reviews ≥ 150 (floor)
✓ Well-liked  — rating ≥ 4.5  (floor)
```

**Floors, not percentiles, for the two business gates here** (deliberately different from §5.3): review counts are right-skewed, so "top quartile" measures *size* not *establishment* — a floor ("150+ reviews") captures the intent. Dental ratings are compressed at the top (metro medians ~4.9), so "above median" is hypersensitive — a floor ("4.5★+") is the meaningful "well-liked" cut. *Performance deliberately NOT gated* (universally low/noisy; would exclude genuinely great sites).

Exemplar floors are **tunable post-scrape** via `--rescore` (instant, no re-crawl) to land ~1,000 across all metros. Looser is fine — a broad, geographically-diverse exemplar set makes for a better best-practices study.

### 5.6 The pitch = failed checklist items (auto-generated)

The unchecked boxes become the cold-email body, verbatim and true:
> *"Google rates your site's mobile performance **Poor** and accessibility **Poor**. No online booking, no structured data, and you're on a templated platform (ProSites)."*

**Pitch framing:** lead with the concrete/visible/fixable failures (no booking, rented template, no schema, not mobile-friendly); use "Google rates your performance **Poor**" as the supporting Google-backed punch, not the headline (performance is universal + hardest to fix). The builder genuinely fixes it — a clean modern build lifts a site out of the red — so "gotta fix" comes with "here's the fix."

---

## 6. Vision — NOT used in sourcing (deferred)

Sourcing is **fully objective — no AI/vision.** Aesthetic quality can't be made objective, so vision is deferred to where it's irreplaceable and cheap:

1. **Audit-on-promotion** — when a prospect is promoted to the builder/audit pipeline, that pipeline deep-audits the site (incl. visual + Lighthouse), catching any deceptively-nice false positive *right before outreach*. No vision wasted on prospects you never contact.
2. **Exemplar pattern-extraction** (Product #2) — a one-time pass over the small confirmed-exemplar set, where vision reads aesthetic patterns (photography, typography, layout) to derive the checklist.

Screenshots (desktop + mobile) **are** captured at sourcing and stored in GCS, so both later passes have them without re-crawling. The vision prompt/anchor machinery is retained in `scripts/sourcing/lib/vision-*.js` for those passes (forced-evidence, anchored, temp 0, structured JSON, prompt-cached anchors).

---

## 7. Ad-Spend Detection — REMOVED

There is no reliable **public** way to determine whether an arbitrary practice runs Meta/Google ads at scale (the Meta Ad Library token only exposes ads you have access to; the Google SERP scrape was fragile and leaked browser processes). Dropped from the pipeline. Airtable columns kept dormant in case a clean source appears.

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
- **Tech audit** — `HTTP Status`, `Vendor`, `Vendor Category`, `WordPress Theme`, `Is Chain / DSO`, `Chain Name`, `Multi-Location`, `Lighthouse Performance/Accessibility/Best-Practices/SEO` (raw), `Perf/Accessibility/Best-Practices/SEO Band` (Good/NI/Poor), `Has HTTPS/Viewport/Schema.org/Click-to-Call/Booking Widget/Contact Form`, `Booking Vendor`, `Dated-Tech Flags`
- **Screenshots** — `Desktop Screenshot`, `Mobile Screenshot` (attachments; for review + later vision passes)
- **GCS pointers** — `Rendered HTML (GCS)`
- **Evaluation** (objective; written from Node) — `Quality Score` (0–11), `Weakness Score` (0–11), `Missing Items` (the pitch), `Business Tier`, `Weakness Tier`, `Is Exemplar`, `Exemplar Blocked By`, `Tier`, `Quadrant`
- **Outreach state** — `Status`, `Notes`, `Promoted To Account` (link), `Google Maps / GBP`
- **Audit metadata** — `Last Audited At`, `Rubric Version`
- *(Retired blends — delete in UI: `Website Quality Score`, `Business Value Score`, `Vendor Multiplier`, `Opportunity Score`, and the `Vision:*`/ad-spend columns.)*

**Views to create:**
- Prime quadrant (Tier A) — main outreach list, sorted by Review Count
- Prime + on a dental-mill — the hottest pitch segment
- By vendor — grouped
- Excluded — DSO
- Exemplars (`Is Exemplar = ✓`) — feeds research module
- Reachability issues — for cleanup

**Engineering notes:**
- Batch writes (Airtable limit: 10 records/request, ~5 req/sec per base).
- Confirm row ceiling against current plan tier — Team/Pro = 50k records/base, Business = 125k. 5k is fine; plan ahead if scaling to 25k+.

---

## 9. The Best-Practices Research Loop (Product 2)

Built **after** the sourcing pipeline has populated Airtable. Reuses the same dataset.

### 9.1 Filter for the exemplar set

The exemplar set is just `Is Exemplar = ✓` (the §5.5 gates):
- Independent (not chain/DSO), not a mill template, custom build
- Google **Good** on accessibility + best-practices + SEO
- Established (reviews ≥ 150) + well-liked (rating ≥ 4.5)

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
