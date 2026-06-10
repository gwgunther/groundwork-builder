# 02 — Output Schema

The file contract for a generated design system. **Core modules are always
produced; optional modules are chosen per source type** (§Adaptation Matrix).
Folder names may flex to suit a brand's own conventions — the *relationships*
(sibling files, entry points, tags) are the contract.

---

## Project layout

```
styles.css                  ← REQUIRED. Global entry; @import lines ONLY.
readme.md                   ← REQUIRED. Design guide + manifest (see §Docs).
SKILL.md                    ← REQUIRED. Agent-skill wrapper.
tokens/
  colors.css  typography.css  spacing.css  effects.css  fonts.css
guidelines/                 ← foundation specimen cards (*.card.html)
assets/
  img/  icons/  fonts/      ← real assets or labeled placeholders
components/
  <group>/                  ← buttons/ forms/ badges/ … or core/ for small sets
    <Name>.jsx  <Name>.d.ts  <Name>.prompt.md
    <group>.card.html       ← one demo card per directory
ui_kits/
  <surface>/                ← one per product surface
    index.html  loader.js  data.js  Chrome.jsx  <Screen>.jsx…  App.jsx  README.md
showcase/
  index.html  Showcase.jsx  loader.js
themes/                     ← OPTIONAL alternate skins (token override files)
agent_spec/ or docs/        ← anything meta (not compiled)
```

## Tokens — three-layer contract

Every system uses the same layering, whatever the palette:

```css
:root {
  /* 1. BASE RAMPS — sampled from source. Name by family, not by role. */
  --neutral-0 … --neutral-900;     /* always present */
  /* optional extra ramps when the brand has them: --blue-*, --green-*, … */

  /* 2. BRAND HOOKS — the re-skin surface. Keep this list SHORT. */
  --brand / --brand-hover / --brand-active / --brand-on;
  --accent / --accent-hover;
  --positive / --warning / --danger;

  /* 3. SEMANTIC ALIASES — what components consume. Never skip this layer. */
  --surface-page / -raised / -sunken / -muted / -inverse;
  --text-strong / -body / -muted / -subtle / -disabled / -on-dark / -on-dark-muted;
  --border-subtle / -default / -strong / -on-dark;
  --ring-focus;  --scrim;
}
```

Typography roles (in `typography.css`): families (`--font-sans`, `--font-serif`,
optional `--font-mono`), role aliases (`--font-display/-heading/-product/-body/
-ui/-eyebrow` — point at families per the source), fluid display sizes
(`--text-display/-h1…-h4`), text sizes (`--text-lead/-base/-sm/-xs`), weights,
leadings, trackings. Ship utility classes (`.k-display`, `.k-h1`, `.k-body`…)
for non-React consumers.

Spacing/effects: an 8px-base `--space-*` scale, a `--radius-*` scale **measured
from source**, elevation `--shadow-xs…xl` tinted with the brand's ink color,
`--ease-*`/`--dur-*` motion tokens, `--focus-ring`, `--press-scale`, layout
tokens (`--container-max`, `--nav-height`, `--grid-gap`).

`fonts.css`: `@font-face` for shipped binaries, or a hosted `@import` with a
comment flagging any substitution.

## Components — per-component contract

| File | Purpose | Rules |
|---|---|---|
| `<Name>.jsx` | implementation | Named PascalCase `export function <Name>()`. Self-contained: React only, no npm deps, no CSS-in-JS libs. Inject CSS once under a unique id; style via semantic tokens only. Real states: hover/press/focus/disabled. Flex/grid + `gap` for layout. |
| `<Name>.d.ts` | props contract | Interface with JSDoc per prop. `@startingPoint` tags go on the **interface** JSDoc. |
| `<Name>.prompt.md` | agent usage doc | Line 1: one-sentence what & when. Then a minimal JSX example. Then variants/props notes. |
| `<dir>.card.html` | demo card | `@dsCard` tag line 1. Links `styles.css`, loads compiled bundle, renders ALL key states densely. |

Naming: props prefer `variant`, `size`, `tone`, `selected`, `disabled`,
`fullWidth`; slots for composition (`badge={<Badge…/>}`, `icon={…}`).

## Cards (`@dsCard`) & starting points

- Specimen/demo card: first line `<!-- @dsCard group="<Group>" viewport="<WxH>"
  name="<Label>" subtitle="<one line>" -->`. Groups: Colors, Type, Spacing,
  Brand, Components, plus one per UI kit and Showcase.
- Starting points: component → `@startingPoint` in `.d.ts` interface JSDoc;
  screen → `<!-- @startingPoint section="…" … -->` line 1 of the HTML.

## UI kits — per-surface contract

- `index.html` boots React UMD + Babel + icon CDN + `loader.js` + `data.js`,
  mounts `App`. Include a splash element and an error sink for boot failures.
- `loader.js`: fetch source files → strip `import`/`export` → Babel transform →
  merge exports into one namespace (`window.K`). Screens read primitives from
  that namespace; never re-implement them.
- `data.js`: all fixture content in one place (swap point for real data).
- `Chrome.jsx`: nav + footer following source conventions exactly (logo position,
  link treatment, utility icons).
- 3–5 screens per surface; interactive routing + at least one overlay flow
  (cart drawer, dialog, search).
- `README.md`: run instructions, screens & interactions list, file map, notes on
  extrapolations.

## Showcase

One page, styled only by the system: brand-voice hero → foundations panels →
interactive component panels → in-context composition → footer. This is the
"sample hero page" a stakeholder reviews first.

## Themes (optional)

Alternate skins as token-override files (`themes/<name>.css`) linked AFTER
`styles.css`. Each theme overrides ramps + hooks + font roles only. Ship at most
one or two; document in README.

## Docs

**readme.md** required sections, in order: (1) context & sources, (2) content
fundamentals, (3) visual foundations, (4) iconography, (5) index/manifest,
(6) usage snippet, (7) substitution flags. **SKILL.md**: YAML front-matter
(`name`, `description`, `user-invocable: true`) + body directing the reader to
README and key folders.

---

## Adaptation Matrix

Pick modules by source type. Core (always): tokens, foundation cards, README,
SKILL, showcase.

| Source type | Components to expect | UI kits | Notes |
|---|---|---|---|
| **E-commerce** | Button, IconButton, Badge, Tag, Input, Checkbox, QuantityStepper, Accordion, ProductCard, FeatureCard | Storefront (home / collection / product) + cart drawer & search | Price formatting, sale badges, wishlist are motifs to audit |
| **SaaS / app** | Button, Input, Select, Checkbox, Switch, Tabs, Table, Dialog, Toast, Tooltip, Avatar, Badge, EmptyState | App shell (sidebar + topbar) + 2–4 core views (dashboard, list/detail, settings) | Density, table conventions, status colors matter most |
| **Marketing site** | Button, Badge, Card, NavLink, FeatureCard, Testimonial, PricingCard, FAQ Accordion | Landing page + 1–2 inner pages | Hero conventions, section rhythm, scrim treatment |
| **Docs / content** | Button, Callout, CodeBlock, TOC item, SearchInput, Breadcrumb, Pagination | Docs shell (sidebar + article) | Type hierarchy and mono font are the core audit |
| **Mobile app** | Button, ListRow, TabBar item, Sheet, Chip, Input | 3–5 phone screens in a device frame | Hit targets ≥44px; safe areas |
| **Multi-product** | union of the above, grouped | one kit per surface | Shared tokens; per-surface chrome |

When the source doesn't show a module (e.g. no forms anywhere), **skip it** —
don't pad the system with unobserved components.
