# Step 7 — Audit & Refine (spec)

> Status: **PARTIALLY SHIPPED** as `PIPELINE.md` Phases 5–8 (designer agent, SEO optimizer,
> a11y / agentic / citability gates). This doc remains the *target* clean-step architecture
> (ordered gate vs maximize passes + convergence). Do not treat as unimplemented — reconcile
> naming with live phases before net-new work.
> Numbering note: clean-step numbering is 1 Scrape · 2 Synthesize · 3 Merge ·
> 4 Define Brand · 5 Plan Content · 6 Build · 7 Audit & Refine. Live `docs/PIPELINE.md`
> calls the refine loop Phases 5–8.



## Live phase mapping (reconciled 2026-07)

| Step 7 pass (this doc) | Live `PIPELINE.md` phase | Status |
|---|---|---|
| 7.0 Content / integrity | Coverage audit + anti-slop + ship-gates | ✅ shipped |
| 7.1 Design quality maximize | Phase 5 designer agent loop | ✅ shipped (gate ≥7, not yet median-of-3 Opus →9) |
| 7.2 Accessibility | Phase 3f a11y-optimize + Phase 8 axe gate | ✅ shipped |
| 7.3 Performance | PageSpeed pre-build + Lighthouse in audits | ⚡ partial (no post-build maximize loop) |
| 7.4 Convergence | Ship-gates after SEO/a11y/agentic | ⚡ partial (no explicit re-run of 7.0–7.3 as one pass) |

**Decision:** do not rebuild Step 7 as a parallel orchestrator. Extend live Phases 5–8 when raising the design bar 7→9 or adding a true convergence re-check.

## One-liner

Take the built site from **Step 6 (Build)** and **prove it's good enough to ship, iterating until it is** —
a dependency-ordered sequence of single-dimension passes, each with its own isolated eval, ending in an
all-gates convergence check. This is where the design-quality bar (7→9), SEO, accessibility, and
performance get enforced, and where a dev agent can later tune each pass independently.

## Why Step 6 is now "Build" (not "Assemble Layout")

Layout decision and render are inseparable: a layout spec that never renders is inert, and quality can
only be judged on pixels. Step 6 = `(brand-dna, content-plan, images) → built site`. Its internal phases
(decide layout → generate sections → bind images → inject tokens → render) are not separate top-level steps.
**Step 6 keeps the `render-fidelity` eval** (did the realization preserve content? ≥99% ✅).

## Core principles (what keeps this from becoming hacky)

1. **Order by perturbation.** Fixes in one dimension regress another (perf compression hurts design; a bold
   hero hurts LCP; contrast fixes shift the palette). Run most-perturbing → least-perturbing, mechanical last.
2. **End with a non-negotiable convergence pass.** Re-verify ALL gates after the sequence. If a later pass
   regressed an earlier gate, surface it. Genuine conflicts (full-bleed hero vs LCP) become explicit tradeoffs,
   not silent losses.
3. **Route every fix to its rightful OWNER — never patch at the render layer.** This protects the ownership
   boundaries Step 6 established:
   - contrast/a11y fail → **brand-dna** token (not a hardcoded component color)
   - missing/verbatim content → **content-plan / render** (not hand-inserted text)
   - bad hero image → **image binding** selection logic
   - weak polish → **layout director / variant** layer
   AI is reserved for the genuinely subjective call (design polish); everything else is a deterministic
   diagnosis→fix mapping.
4. **Gate vs. maximize are different loop shapes** (see below).
5. **Generator and judge share ONE rubric.** Step 6's section generator and Step 7's design-quality judge
   both consume the same merged design-principles reference. If they diverge, the loop chases a moving target
   and never converges.

## The dimension passes (ordered)

| # | Pass | Type | Eval / bar | Fix owner |
|---|------|------|-----------|-----------|
| 7.0 | Content / integrity | **gate** | fidelity ≥99% ✅, 0 broken links, 0 placeholder/TODO leak, all images resolve | render / content-plan / binding |
| 7.1 | Design quality (taste + impeccable, ONE loop) | **maximize** | pixel-quality ≥9/10 (median-of-3 Opus) | layout director / variants / binding hero / brand tokens |
| 7.2 | Accessibility | **gate** | 0 axe violations; WCAG AA contrast; alt text; keyboard | brand-dna tokens / templates |
| 7.3 | Performance | **gate (thresholds)** | Lighthouse: LCP/CLS/TBT thresholds; bundle budget | mechanical (images, CSS, fonts) — should not change visuals |
| 7.4 | **Convergence** | **gate** | re-run 7.0–7.3; all green simultaneously | escalate conflicts as explicit tradeoffs |

Ordering rationale: content first (everything assumes it's right) → design (the big visual decisions) →
a11y (shares the token/contrast surface with design, so adjacent) → performance LAST (mechanical, shouldn't
perturb visuals if done right) → convergence (catch any cross-dimension regression).

### Gate vs. maximize

- **Gate (constraint satisfaction, bounded):** a11y = 0, integrity = 0, fidelity ≥ 99, perf ≥ thresholds.
  Resolve all violations until the count hits the bar — finite, mostly deterministic, fast. Not an open loop.
- **Maximize (iterative, judge-driven):** design quality → 9/10. Open-ended; this is where the
  diagnose → fix → re-score refine machinery earns its keep.

## The shared design-principles reference (foundational — build FIRST)

Merge `scripts/pipeline/skills/design.md` + `taste-frontend.md` (+ impeccable principles) into ONE reference.
Consumed by:
- **Step 6 generator** — guides what gets generated (hierarchy, spacing, type pairing, restraint, anti-generic).
- **Step 7.1 judge** — the rubric the pixel-quality judge scores against.

This is the single highest-leverage item for moving pixel-quality 7→9, and it's a hard dependency for the
design pass. Existing design-improvement skills (`skill-bolder`, `skill-colorize`, `skill-critique`) are
candidate fix-actions for the design refine loop.

## Per-dimension evals + dev-agent optimization

Each pass is its own isolated eval (consistent with every prior step), which is exactly what lets a dev agent
optimize each independently: `baseline → mutate prompt/config → re-eval → keep/revert`.

For the **efficiency** goal, every eval must emit **cost + latency alongside quality** (output tokens,
wall-clock, # AI calls) so the agent optimizes the *quality/cost frontier*, not quality alone (this automates
the manual Haiku/Sonnet/Opus model-tier tuning).

### Risks to design against
- **Goodhart / judge-gaming:** LLM judges are gameable. Mitigations: median-of-judges (have it), plus a
  **held-out site or two** the agent can't tune against, to detect eval-overfitting.
- **Quality-proxy fidelity:** periodic human spot-check that a judge "9/10" actually looks like a 9.
- **The refine loop's own prompts** (diagnosis→fix routing) are themselves dev-agent-optimizable.

## Build order

1. **Shared design-principles reference** (merge; wire into generator + judge). ← do first
2. **7.1 design-quality refine loop** (diagnose → route fix → re-Build affected piece → re-score). Requires
   Step 6 Build to be **re-entrant + granular** (rebuild one section without rebuilding everything) — design
   this in now.
3. **7.0 integrity gate** (deterministic; cheap; mostly checks).
4. **7.2 a11y gate** (axe-core via Playwright; mostly deterministic fixes routed to tokens).
5. **7.3 performance gate** (Lighthouse thresholds; mechanical fixes).
6. **7.4 convergence pass** + cost/latency instrumentation across all evals.

## Decisions (locked)

- **Design ship-bar: 9/10** (aspirational). Pixel-quality median-of-3 must reach 9 to pass 7.1.
- **Performance thresholds (mobile):** Core Web Vitals "good" as the hard gate — LCP ≤ 2.5s, CLS ≤ 0.1,
  TBT ≤ 200ms — plus Lighthouse Performance ≥ 90 (tighten to 95 once real numbers are in). The only real
  levers on these static sites: hero-image optimization (responsive sizes + modern formats), font
  `display:swap` + preload, and lazy-loading below-fold images. All mechanical → perf runs LAST.
- **Held-out anti-overfit set: DEFERRED to the dev-agent phase.** Not needed while humans hand-tune
  structural fixes (no metric-gaming risk). When the dev agent begins auto-tuning prompts against scores,
  add **2 fresh dental sites** as held-out (never tuned against) rather than removing any of the 5
  truth-listed fixtures. If ever forced to pick from the 5: hold out drbrodsky + magicfox (structural extremes).
- **Design loop (7.1): run-to-convergence, effective max ≈ 5–6 iterations**, early-stop on plateau (halt if
  2 consecutive rounds don't improve the median by ≥0.5). **Keep-BEST build, not keep-last** (late iterations
  can regress). Absolute runaway backstop = 20 iterations (never the expected count).
