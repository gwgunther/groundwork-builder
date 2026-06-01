# Groundwork Dental — Design System

> **v2.** Cleaned, deduplicated, contrast-audited, and resolved. One value, one name.
> Companion to `Groundwork Design System.html` (visual reference). This file supersedes the color/font notes in `CLAUDE.md`. Paste-ready `tailwind.config.mjs` + `global.css` live in `migrated/`.

Voice in one line: **the honest dental website guy.** Conversational, self-aware, no corporate fluff. Warm, honest, tech-forward — *not* dental blue. The system obeys the same rule it sells: **fast and unbloated** — no unnecessary webfonts, no accidental complexity.

---

## Contents

1. [Color](#color)
2. [Typography](#typography)
3. [Spacing & radius](#spacing--radius)
4. [Layout](#layout)
5. [Components — primitives](#components--primitives)
6. [Components — organisms](#components--organisms)
7. [Accessibility](#accessibility)
8. [Icons & imagery](#icons--imagery)
9. [Migration map (v1 → v2)](#migration-map-v1--v2)
10. [Decisions](#decisions)

---

## Color

Every value appears **exactly once**. v1 had `#F8F8F3` under four names and `#334155` under three — collapsed.

### Brand

| Token | Hex | Usage |
|---|---|---|
| `sage` | `#5F7F6B` | Accent for **non-text** UI — icons, large numerals, progress bars, table highlight, active underlines. |
| `sage-dark` | `#4A6B55` | Sage **text** & links on light **and** the primary-button fill (white text = 5.95:1). |
| `sage-darker` | `#3D5A48` | Primary-button **hover** only. |
| `sage-tint` | `#EBF0EC` | Soft fills — badges, callout panels, checkbox washes, drag-over states. |

> `sage` was `brand-warm` in v1 — a misnomer for a cool green. The duplicate `brand-sage` alias (same hex) is gone.

### Neutrals

| Token | Hex | Usage |
|---|---|---|
| `charcoal` | `#334155` | Primary text, headings, dark surfaces, `.btn-dark`. |
| `mid-gray` | `#64748B` | Secondary text, descriptions, captions, labels, default eyebrows. |
| `border-light` | `#E0DDD5` | Hairline borders, dividers, input & card outlines. A warm beige. |

### Surfaces

| Token | Hex | Usage |
|---|---|---|
| `surface-1` | `#FFFFFF` | Default page background and resting card surface. |
| `surface-2` | `#F8F8F3` | The single off-white. "Cream" emphasis sections (hero, callouts) **and** tinted cards & specialty bands. |

> `surface-warm` (#FAF8F5) was **dropped** — it sat ~2 points from `surface-2` (imperceptible). Migrate its ~8 uses to `surface-2`.

**Section background system**

- `surface-1` (white) — default sections.
- `surface-2` — every tinted moment: emphasis bands, specialty pages (`/dental-websites/*`), pricing, callouts. (This is what `bg-brand-cream` **and** `bg-surface-warm` meant.)
- `charcoal` — reserved for the Ownership Guarantee section, the pricing "highlighted" tier, and the footer.

### Text on dark (charcoal) surfaces

| Token | Hex | Usage |
|---|---|---|
| `on-dark` | `#E7EBF0` | Body / heading text on `charcoal` (8.5:1). |
| `on-dark-muted` | `#AAB4C2` | Secondary text & footer links on `charcoal` (4.8:1). |

> New — the footer and pricing tier previously used ad-hoc `neutral-200/300`. Now tokenized.

### Semantic

Replaces the raw Tailwind colors (`amber-50/700`, `neutral-100`, `red-600`) that badges & the autosave indicator referenced directly. All contrast-checked against their own background for small text.

| Token | Text | Background | Ratio | Usage |
|---|---|---|---|---|
| `success` | `#4A6B55` | `#EBF0EC` | 5.25:1 | "Complete", "Saved". Reuses `sage-dark` — no second green. |
| `warning` | `#92400E` | `#FCF4E8` | 6.5:1 | "In progress", autosave "unsaved". *(darkened from amber-700)* |
| `pending` | `#475569` | `#F1F0EB` | 6.6:1 | "Pending", neutral. *(darkened from mid-gray — old combo was 4.2:1)* |
| `danger`  | `#B42318` | `#FDF0EE` | 6.1:1 | Form validation, "Save failed", destructive. **New.** |

**Opacity convention.** Sage washes use opacity, not new tokens: `sage/5` (panel tints), `sage/10` (chips), `sage/20`–`/40` (borders), `sage/50` (drag-over). Keep to these five steps.

---

## Typography

| Role | Family | Weights | Source |
|---|---|---|---|
| Serif — body, headings, prose | `Georgia, "Times New Roman", serif` | Regular | **System (deliberate)** |
| Sans — nav, buttons, eyebrows, labels, badges | `Figtree, "Helvetica Neue", Helvetica, Arial, sans-serif` | 400 / 500 / 600 / 700 | Google Fonts |
| Mono — pricing & metrics only | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | — | **System (deliberate)** |

> **Fonts are a speed decision, on purpose.** Georgia and the system-mono stack ship zero bytes — which is on-brand for an agency that sells PageSpeed. The one webfont we load is Figtree. *(v1 named JetBrains Mono but never loaded it; the token is now an honest system stack.)* If you ever want a hosted serif, that's a brand call — but weigh it against the performance pitch.

**Rule:** Georgia for everything you read. Figtree for UI chrome. Mono for numerals only.

### Type scale

Sizes are the **Tailwind utilities you actually use** — documented, not re-tokenized. Stick to this set.

| Style | Utility | Size | Notes |
|---|---|---|---|
| `display` / `.section-heading` (h1) | `text-4xl md:text-5xl` | 36 → 48px | Georgia, leading-tight, tracking-tight |
| `.section-subheading` (h2) | `text-2xl md:text-3xl` | 24 → 30px | Georgia |
| h3 | `text-xl` | 20px | Georgia |
| `lead` | `text-lg` / `text-xl` | 18–20px | mid-gray |
| `body` / `.prose-article` | base | 16px | leading-relaxed (1.625) |
| small | `text-sm` | 14px | UI text, table cells |
| caption | `text-xs` | 12–13px | mid-gray |
| `.form-label` / `.eyebrow` | `text-label` / `text-eyebrow` | 11px | caps, tracked. *(eyebrow was 10px)* |
| `.nav-link` | `text-xs` | 12px | caps, widest |
| stat / mono | `font-mono` | contextual | pricing numbers |

### Prose hierarchy (`.prose-article`)

- `h2` — `mt-12 mb-5`, breaks long-form into named sections.
- `h3` — `mt-8 mb-3`.
- `p` — `mb-5`.
- `blockquote` — top rule in `sage`, `sage/5` tint bg, `not-italic`, charcoal text. `strong` inside → `sage-dark`.
- `strong` — charcoal, semibold.

---

## Spacing & radius

**Spacing uses Tailwind's scale** — it's already your token system. Don't invent a parallel one. The curated subset in use:

| Utility | px | Where |
|---|---|---|
| `gap-4` / `space-y-4` | 16 | uniform grids, card stacks |
| `p-6` | 24 | default card padding |
| `gap-6` | 24 | featured grids, column gaps |
| `p-8` | 32 | featured / pricing card padding |
| `py-10` | 40 | section padding — standard |
| `py-12` / `py-16` | 48 / 64 | section padding — emphasis |
| `gap-12` / `lg:gap-20` | 48 / 80 | two-column editorial layouts |

Stay on this ladder; reach for a new step only with a reason.

**Radius** — gentle, never sharp.

| Utility / token | px | Use |
|---|---|---|
| `rounded-sm` | 2 | tag chips, focus wells |
| `rounded` | 4 | **default** — buttons, inputs, cards, images |
| `rounded-full` | 9999 | pills / badges only |

**Motion.** One token: `duration-200` (200ms) is the default for color/transform transitions. Accordions use 220ms. Respect `prefers-reduced-motion` (the FAQ block already does).

---

## Layout

- **Max width:** `max-w-6xl` (1152px) for full-width sections; `max-w-5xl` for pricing; `max-w-3xl` (768px) for prose / centered content.
- **Page padding:** `px-4 sm:px-6 lg:px-8`.
- **Section vertical padding:** `py-10` standard; `py-12`/`py-16` for emphasis.
- **Sticky header** at `top-0 z-50`, solid white, hairline bottom rule.
- **Grid** collapses to single column under 740px (`md:` / `lg:` breakpoints).

---

## Components — primitives

### Buttons

All buttons: Figtree 500, 14px, `tracking-wide`, `rounded`, `px-6 py-3` (44px min height).

| Class | Resting | Hover | Use |
|---|---|---|---|
| `.btn-primary` | `sage-dark` bg, white text | `sage-darker` bg | Primary CTA |
| `.btn-secondary` | white bg, charcoal text, `border-light` | `surface-2` bg, `charcoal` border | Secondary CTA |
| `.btn-dark` | `charcoal` bg, white text | `#283344` bg | CTA on tinted sections |

**States (all variants):** focus-visible → 2px `sage` ring, 2px offset · active → `translateY(1px)` + darker · disabled → 50% opacity, `not-allowed`.

> **Why resting = sage-dark.** White on `sage` (#5F7F6B) is only 4.4:1 — under AA. `sage-dark` gets it to 5.95:1. `sage` stays the accent for icons & large numerals (3:1 territory). This is the most visible v2 change — CTAs are a touch deeper green. Revert by swapping `.btn-primary` back to `bg-sage` if you'd rather accept 4.4:1.

### Cards (`.card`)

`rounded p-6 border bg-surface-2 border-border-light` — the workhorse.

- **Featured:** `p-8` for pricing / hero callouts.
- **Link card:** white fill; border warms to `sage` on hover (blog & specialty tiles).
- **Hairline (`.card-hairline`):** transparent, top-and-bottom rule only — editorial lists & stat rows.

### Eyebrow

```
font-sans uppercase font-medium · 11px · letter-spacing 0.14em
color: mid-gray   /* default — was neutral-400 (2.5:1, failed) */
```

Tints: `sage-dark` (on light/cream sections), `mid-gray` (default), `on-dark-muted` (on charcoal).

### Form elements

- `.form-input` — Georgia text, white bg, `border-light` border, **sage** focus ring. 44px min height.
- `.form-label` — 11px, caps, 0.12em, Figtree 500.
- `.form-textarea` — extends `.form-input`, `min-h-[120px]`, `resize-y`.
- `.upload-zone` — dashed `border-light`, hover `sage/50`.

### Status badges

`inline-flex` pill, Figtree 500, 12px, `rounded-full`. Semantic tokens:

| Class | Token |
|---|---|
| `.status-badge-complete` | `success` |
| `.status-badge-progress` | `warning` |
| `.status-badge-pending` | `pending` |
| `.status-badge-error` | `danger` *(new — wires up the autosave "Save failed" state)* |

---

## Components — organisms

The composed pieces that ship. Markup lives in `src/components/`.

### Header / nav (`Header.astro`)

Sticky, white, hairline bottom rule. Wordmark = `Groundwork` (Georgia 20px) · 1px divider · `dental` (Figtree 10px caps, `sage`). Desktop nav uses `.nav-link`; active link gets a charcoal label with a 1px `sage` underline. Dropdowns reveal on hover/focus-within with a `shadow-lg` white panel. Mobile: 44px hamburger toggling a full-width menu. Primary CTA (`Get Started`) pinned right.

### Comparison table (`ComparisonTable.astro`)

`table-fixed`, top & bottom rules only, no inner row borders. Column heads: `text-eyebrow` caps, `mid-gray`. The **Groundwork** column is highlighted with a `sage-tint` background and `sage-dark` head — the one place the table earns color. Cells: Georgia 14px, feature column `charcoal` medium, comparison columns `mid-gray` centered. Horizontally scrolls under `sm`.

### Pricing table (`PricingTable.astro`)

Card grid (2- or 3-up). Standard tier: `surface-2` + `border-light`. **Highlighted** tier: `charcoal` bg with `on-dark` / `on-dark-muted` text and `sage`/neutral check & cross icons. Price in Georgia `text-4xl`. CTA: highlighted tier uses `.btn-primary`, others `.btn-secondary`.

### FAQ accordion (`FAQBlock.astro`)

Single column, `max-w-3xl`, dividers between rows. Question = Georgia, hover → `sage`. Chevron rotates 180° on open. Smooth open via `grid-template-rows: 0fr → 1fr` (220ms), disabled under `prefers-reduced-motion`. Emits FAQ JSON-LD. ARIA `aria-expanded` / `aria-controls` wired.

### CTA block (`CTABlock.astro`)

Full-width rounded panel, centered, `p-8 md:p-12`. Three variants:

| Variant | Background | Heading | Button |
|---|---|---|---|
| `light` *(default)* | `surface-2` | charcoal | `.btn-primary` |
| `dark` | `charcoal` | white / `on-dark` | sage-dark fill |
| `warm` | `sage` | white | white fill, charcoal text |

### Intake workspace (`pages/intake/`, `components/intake/`)

- **Progress bar:** `border-light` track, `sage` fill, `duration-500` width transition, with "{n} of {total} sections" + percent labels.
- **Section cards:** white `.card`, hover border `sage/40`, status badge top-right (complete / progress / pending), "Required" note in `sage-dark`.
- **Autosave indicator** (`AutoSaveIndicator.tsx`): `saved` → `success`, `saving` → `mid-gray`, `unsaved` → `warning`, `error` → `danger`. *(Update the raw `text-brand-warm` / `text-amber-600` / `text-red-600` to the tokens.)*
- **File uploader / `.upload-zone`:** dashed drop target, drag-over → `sage/50` border + `sage-tint/20` fill.

### Footer (`Footer.astro`)

`charcoal` bg, 4-column grid (Brand · Pages · Specialties · Get Started). Column heads: `text-eyebrow` caps in `on-dark-muted`. Links `on-dark` → white on hover. Bottom rule + copyright.

---

## Accessibility

WCAG 2.1 AA: **4.5:1** normal text, **3:1** large text (≥24px / ≥19px bold) and UI. Ratios computed against the real hexes.

| Pairing | Ratio | Verdict |
|---|---|---|
| charcoal on white | 10.4:1 | AAA |
| sage-dark on white | 5.95:1 | AA — **text & links** |
| mid-gray on white | 4.76:1 | AA |
| sage on white | 4.44:1 | large / UI only |
| sage on cream | 4.18:1 | large / UI only |
| white on sage-dark (button) | 5.95:1 | AA |
| on-dark on charcoal | 8.5:1 | AAA |
| on-dark-muted on charcoal | 4.8:1 | AA |
| all four semantic badges | 5.2–6.6:1 | AA |
| ~~neutral-400 eyebrow~~ | 2.52:1 | **fixed → mid-gray** |
| ~~white on sage button~~ | 4.44:1 | **fixed → sage-dark** |
| ~~mid-gray pending badge~~ | 4.2:1 | **fixed → slate-600** |

**Rules:** sage *text*/links → `sage-dark`; eyebrows → `mid-gray`/`sage-dark`, never `neutral-400`; focus is always a visible 2px `sage` outline; never remove it.

---

## Icons & imagery

- **Icons:** inline SVG only, no library. `w-5 h-5` inline; `text-sage` for accent icons like checkmarks (`sage-dark` if it sits at text size); `flex-shrink-0 mt-1` alongside text. 1.5–2px stroke, `currentColor`.
- **Imagery:** **no stock photos.** Real screenshots, PageSpeed scores, founder photos only. Warm-neutral, honest.

---

## Migration map (v1 → v2)

Direct find-and-replace across `tailwind.config.mjs`, `global.css`, and markup. Paste-ready files in `migrated/`.

| Was | Now | Notes |
|---|---|---|
| `brand-warm` | `sage` (text/links → `sage-dark`) | ~100 refs — the big one. It's a green. |
| `brand-warm-dark` | `sage-dark` | |
| `brand-sage` | `sage` | duplicate alias — removed |
| `brand-sage-light` | `sage-tint` | |
| `brand-cream` | `surface-2` | `bg-brand-cream` → `bg-surface-2` (~15 sections) |
| `surface-warm` | `surface-2` | token dropped (~8 uses) |
| `neutral-light` | `surface-2` | same `#F8F8F3` — drop from config |
| `neutral-dark` | `charcoal` | same `#334155` — drop duplicate key |
| `neutral-mid` | `mid-gray` | same `#64748B` |
| `neutral-border` | `border-light` | same `#E0DDD5` |
| `bg-amber-50` / `text-amber-700` / `text-amber-600` | `warning` | badges + autosave |
| `bg-neutral-100` | `pending` | pending badge |
| `text-red-600` | `danger` | autosave "Save failed" |
| `text-neutral-400` (eyebrow) | `mid-gray` | accessibility fix |
| `text-neutral-200/300` (footer, tier) | `on-dark` / `on-dark-muted` | dark-surface text |
| `font-mono` → JetBrains Mono | system mono stack | webfont never loaded |
| `.btn-primary` `bg-brand-warm` | `bg-sage-dark hover:bg-sage-darker` | contrast fix |

---

## Decisions

Resolved from v2's open questions — with the reasoning, so they can be revisited.

1. **Dropped `surface-warm`.** Two off-whites ~2 points apart weren't a real distinction. One tinted surface (`surface-2`) everywhere. Less to maintain, nothing to mix up.
2. **Kept the slate neutrals.** `charcoal` / `mid-gray` carry a faint blue undertone, but "not dental blue" is about the *brand accent* — and that's sage. Slate *text* reads clean and professional; re-hueing the whole site is high-risk churn for ~no gain. Documented as intentional.
3. **Fonts are system-only, on purpose.** No JetBrains Mono webfont (switched to a system stack); Georgia's Times fallback is accepted. Zero font bytes beyond Figtree keeps the system aligned with the PageSpeed pitch. Revisit only if brand craft outweighs speed.
4. **Spacing & type stay on Tailwind's scale.** No parallel numbering — just a documented subset of the utilities actually in use.

---

*v1's stale `CLAUDE.md` warning (about `#1A1A1A` / `#C45D3E` / "DM Sans") is removed — `CLAUDE.md` is already aligned.*
