# Design Catalog — Reference Schema (v1.2)

> **Status:** design spec + machine-validatable schema (`schema.json`) + extraction prompt
> (`extraction-prompt.md`) + de-branding checklist (`de-branding-checklist.md`) + two worked
> examples (`examples/`). The **§5 audit wiring IS implemented** (`lib/reference-audit.js`,
> consumed by `skill-critique` + the fixer skills + `designer-agent` via `referenceAudit`).
> Catalog selection/tailoring at build time is not yet wired.
>
> **v1.1 additions** (de-branding completeness — see the checklist): `tokens.type.classification`
> (font-pairing bucket — classify, don't name) + `substitutionCriteria`; top-level `imagery`
> (treatment recipe, not photos); top-level `voice` (tone system, not copy).
>
> **v1.2 additions** (full buildable-surface coverage): all nine `layout.variants` picks are
> REQUIRED (chrome included — an unspecified footer/nav would silently fall back to a default);
> `layout.composition` requires `hero`, `nav`, `footer` prose (chrome is where generic AI
> defaults sneak back in); `tokens.button` + `tokens.label` component atoms (map to the
> pipeline's existing `buttonTreatment`/`labelStyle` enums).

## What this is

A catalog of **curated reference design systems**. Each entry is a real, well-designed site
distilled into a structured spec the builder can **select** and **tailor** to a practice —
instead of inventing layouts from the 8 synthetic archetypes.

The intent is to move the *taste decision* from build-time (where the AI director invents and
the auditors police) to **curation-time** (where a human hand-picks exemplars). Once taste lives
in the catalog, the archetype constraint becomes a fallback and the auditors demote from
taste-makers to fidelity/QA (see §5).

Each catalog entry = three files:

| File | Role |
|---|---|
| `design.json` | the machine contract (this schema) — what the builder consumes |
| `design.md`   | optional human prose for the preview gallery |
| `source.png`  | the reference screenshot — preview thumbnail + build-time vision context |

## How the builder consumes an entry

The builder eats exactly two things, so the schema maps onto exactly two things:

1. **Tokens** → `brand-tokens.js` (`colors`, `roles`, `fonts`, `tokens{radius,cardTreatment,borderTreatment}`).
   The entry's `tokens.color.strategy` is **remappable**: it describes the *system* (light/dark,
   contrast, saturation, accent ratio) and is applied to the practice's own elevated hues. The
   `tokens.color.reference` hexes are kept only for the gallery.
2. **A variant per section** → the on-disk components in `src/components/variants/`.
   `layout.variants` names one existing component per section.

**Key design choice — each reference is its own archetype.** Today `ARCHETYPE_LAYOUT` bundles 1
archetype → a locked set of 9 variants. A catalog entry instead carries an *explicit* variant map,
so it's a hand-curated bundle freed from the fixed 8. `selection.archetype` is retained only as a
*nearest-label* so `sampleLibrary`/`ai-director` stay back-compatible during migration.

## Two kinds of constraint, treated oppositely

| Constraint | Catalog behavior |
|---|---|
| **Archetype bundling** (the 8) | **Dissolved** — the entry's `layout.variants` replaces it |
| **Variant vocabulary** (the 30 components) | **Honored** — `layout.variants` is enum-locked to what renders today |
| **Token enums** (`radius`, `cardTreatment`, …) | **Honored** — values selected within existing enums |

Phase A ships on the existing vocabulary. Phase B is the *only* path that expands it, deliberately.

---

## 1. Entry shape

See `schema.json` for the authoritative, validatable definition. Worked examples:
- `examples/groomify-boutique-warm.json` — light, boutique, warm. Sanctions nothing; flags two
  Phase-B **variant** gaps (tabbed package selector; no contact variant exists).
- `examples/aurelia-dark-luxe.json` — dark, gradient-led, centered hero. Sanctions five taste-bans;
  flags a **theme** gap (dark support) and a **token** gap (no gradient token).

Top-level blocks: `source`, `selection`, `tokens`, `layout`, `fidelity`, `audit`.

## 2. `selection` — how the builder matches an entry to a practice

`archetype` (nearest existing label, back-compat) · `moods[]` (dentalMood enum, the primary match
signal) · `adjectives[]` · `bestFor` · `verticalBias[]`.

## 3. `tokens` — Layer 1, drops onto `brand-tokens.js`

`color.strategy` (remappable system) + `color.reference` (source hexes, preview only) · `type`
(pairing, heading/body, scale) · `shape.cornerRadius` · `elevation.system` · `border.treatment` ·
`density` · `motion`. All scalar values are enum-locked to what the token pipeline already understands.

## 4. `layout` + `fidelity` — Layer 2

`layout.variants` picks existing components. `layout.composition` carries prose the variant pick
can't encode. `layout.novel[]` records section designs no existing variant expresses (Phase B).

### The fidelity model has TWO axes (this is the main pressure-test finding)

The Groomify (light) case only ever exercised "does the layout map to a variant." The Aurelia
(dark) case revealed a **second, independent** question: *even if the layout maps, can the renderer
produce the look?* A dark theme maps perfectly to existing variants yet may not render correctly
(light-theme CSS assumptions), and a gradient accent can't be produced at all (the token pipeline
emits flat hexes). So `fidelity` separates them:

| Field | Question | Values |
|---|---|---|
| `fidelity.layout` | Do sections map to existing variant **components**? | `full` · `partial` · `none` |
| `fidelity.theme`  | Can the **renderer / token system** produce this look? | `light-native` · `needs-dark-support` · `needs-token-extension` |
| `fidelity.phase`  | Ships today, or needs new capability? | `A` (layout=full **and** theme=light-native) · `B` (otherwise) |
| `fidelity.gaps[]` | Every concrete gap, typed | `{type: variant\|theme\|token, detail}` |

**Phase B is therefore three kinds of work, not one:** new **variants** (components), new **theme**
support (dark mode), new **token** types (gradients/duotone). The catalog tells you which.

## 5. `audit` — re-pointing the guardrails (NOT YET WIRED)

The auditors (`skill-critique` + `design-principles-core.md` §B) were built to police *uncurated*
AI output. A curated reference is pre-vetted, so the auditors will otherwise "correct" a build back
toward generic-safe and flatten the distinctiveness the reference exists to provide. The fix: the
auditors stop being taste-makers and become **fidelity + correctness QA**, with the reference as
the rubric.

### 5a. The correctness / taste split of the §B hard penalties

`design-principles-core.md` lists 13 hard penalties (cap a dimension ≤4). Only **3 are correctness**
(objectively wrong, never suppressible); **10 are taste** (defaults for uncurated output, suppressible
when a reference legitimately uses them). This ~75%-taste ratio is *why* the current auditors fight a
curated reference.

**Correctness bans — always enforced, reference-agnostic, no suppression id:**

| § ban | Why correctness |
|---|---|
| off-topic / wrong hero image | a binding/fidelity error — never intentional |
| placeholder / Lorem / TODO text | a bug — never sanctioned |
| gray text on a colored background | almost always an AA contrast failure |
| *(§A8) WCAG AA 4.5:1 / 3:1, visible focus* | accessibility floor — physics, not taste |

**Taste bans — suppressible per-build via `audit.sanctionedPatterns` (id in `code`):**

| § ban | Pattern id | Why suppressible |
|---|---|---|
| pure black `#000` | `pure-black` | passes AA; near-black is a refinement preference; brutalist/editorial uses it on purpose |
| Inter as display on premium/warm | `inter-display` | functional font; the ban targets the slop-default, not a law |
| centered-text-over-dark hero | `centered-over-dark-hero` | cliché only when lazy; with scrim + type it's legitimate |
| 3 identical service cards | `three-equal-cards` | a clean 3-up grid is fine when the design calls for it |
| purple / neon gradient | `gradient-accent` | Stripe (already an inspo) uses gradient with restraint |
| emoji in content | `emoji-in-content` | brand-voice call; default off |
| cards nested in cards | `nested-cards` | rarely needed, but legitimate for a highlighted sub-card |
| rounded-square icon tile above every heading | `icon-tile-above-heading` | slop-tell; some systems use icon+label deliberately |
| left side-accent borders on cards | `side-accent-border` | dated tell, but a valid editorial device |
| gray drop-shadow / dark outer glows | `gray-glow-shadow` | craft marker; rarely worth suppressing |

`audit.sanctionedPatterns` is enum-locked to those 10 ids — a reference physically cannot sanction a
correctness ban.

### 5b. Linkage rule (pressure-test finding)

The Aurelia case showed the `audit` and `tokens` layers can disagree: sanctioning `gradient-accent`
stops the penalty, but the token pipeline still can't *render* a gradient. So:

> A sanctioned pattern that implies a rendering capability MUST also be listed as a `fidelity.gaps`
> entry until that capability is built. `gradient-accent` → `token` gap; `pure-black` / dark theme →
> `theme` gap.

Otherwise the build is "not penalized for missing a gradient" rather than "renders the gradient."

### 5c. Implementation plan (the actual code changes, when we wire it)

1. **`design-principles-core.md` §B** — split the single hard-penalty sentence into two labeled lists
   (Correctness / Taste), tag each taste ban with its pattern id. One paragraph.
2. **`skill-critique.js`** — before scoring, read the build's reference `audit`: drop sanctioned
   taste-bans from the penalty set; append `fidelityChecks` as explicit pass/fail rows. The gate
   becomes "technically sound **and** faithful to the reference."
3. **§C routing** — `bolder` / `layout` / `colorize` fire only on a failed `fidelityCheck` or a
   correctness ban, never on a sanctioned taste pattern. They shift from re-designing to enforcing.

---

## Open items for v1.1

- **No `contact` variant exists** — every reference with a contact block flags the same gap; likely
  the first new component to build regardless of this system.
- **Dark-theme support** is unverified across the 30 variants (`needs-dark-support`).
- **No gradient/duotone token** in `brand-tokens.js` (`needs-token-extension`).
- The **preview gallery** should render each entry against a fixed `FAKE_PRACTICE`, making the
  gallery the contract test for the catalog→builder pipeline (separate task).
