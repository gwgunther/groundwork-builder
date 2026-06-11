# 01 — Process Playbook

The pipeline, step by step, with the techniques that matter. Steps marked
**[gate]** must pass before moving on.

---

## Step 1 — Intake & clarify

- Inventory every source given (images, URLs, repos, Figma, docs). Read all of it
  **before** asking questions.
- Identify: brand name, product type(s), which surfaces are shown (marketing site,
  app, store, docs…), and the apparent design language in one sentence.
- Decide which schema modules apply using `02-schema.md` §Adaptation Matrix.
- Ask the user only what the source cannot answer. Typical questions:
  - Which surfaces matter most? (pick UI kit targets)
  - Real font files / icon set / logo available?
  - Is this a faithful recreation or a "base to re-brand later"? (affects how
    much brand content vs. placeholder content to ship)
- **[gate]** If a referenced source is inaccessible (dead Figma link, missing repo),
  STOP and ask. Never build from memory of what a product "probably looks like."

## Step 2 — Source audit

Do this rigorously; everything downstream inherits its quality.

**Colors — sample, never guess.** Load each source image onto a canvas and read
pixels programmatically at deliberate points: page background, card backgrounds,
primary button center, badge fills, heading text, body text, borders/dividers,
dark sections, hover states if multiple frames exist. Record exact hex values.
Sample 2–3 points per region to detect gradients vs. flats. Build the ramp from
sampled anchors; interpolate intermediate steps only as needed and mark them
derived.

**Typography.** Identify family classification (serif/grotesque/geometric/mono),
contrast level, distinctive letterforms (single-story a? flowing italics?).
If the exact font is unknown, choose the closest Google Fonts match and **flag the
substitution**. Capture: weights in use, the display-vs-UI split, italic usage
(decorative or semantic?), casing conventions (Title Case? UPPERCASE tracking?),
size hierarchy by measuring rendered text heights against image dimensions.

**Geometry.** Measure corner radii (compare against known element sizes — a 44px
button with fully-round ends is a pill; a card whose corner arc spans ~12/300 of
its width is ~12px), border widths, spacing rhythm (gaps between cards, section
padding), container max-width, nav height & shape (pill? rounded rect? square?),
logo position (left? **center?** — check carefully).

**Effects.** Shadow softness/тint/opacity (sample shadow pixels vs background),
gradient scrims on imagery, blur usage, divider treatments.

**Motifs.** List recurring patterns: how cards look, how images are framed,
emphasis devices (e.g. one dark card per section), label treatments (italic serif?
uppercase eyebrow? neither?), badge shapes, price formatting, star/rating style.
**Write the motif list down** — it becomes the Visual Foundations section and the
audit checklist.

**Copy & voice.** Collect verbatim strings from the source: headlines, button
labels, microcopy, product names. Derive: person (you/we), casing, punctuation
habits, emoji usage (almost always none), sentence length, emotional register.

**Iconography.** Stroke weight, corner rounding, fill vs line. Match to a
CDN-available set (Lucide, Heroicons, Phosphor…) and flag the substitution, OR
copy real icon assets out of a codebase if available.

**[gate]** Produce the audit summary (a short doc or README draft section) before
writing any CSS. Every later decision cites this audit.

## Step 3 — Tokens

- Write `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`,
  `tokens/effects.css`, `tokens/fonts.css` per `02-schema.md` §Tokens.
- Three layers in colors.css: **base ramps** (sampled values) → **brand hooks** →
  **semantic aliases**. Components may only use hooks + aliases.
- Root `styles.css` is `@import` lines only.
- **[gate]** Run the project's design-system compiler/validator until clean.

## Step 4 — Foundation cards

Small specimen HTMLs (~700px wide, 150–250px tall) for every sub-concept:
brand colors / neutral ramp / text & feedback; display type / headings / body;
spacing scale / radii / elevation; logo / imagery. One concept per card; show
real tokens (link the system stylesheet); annotate with exact values. More small
cards beats fewer dense ones.

## Step 5 — Components

- List candidate primitives **from the source screens** (don't import a standard
  kit list). Typical e-commerce: Button, IconButton, Badge, Tag/Chip, Input,
  Checkbox, QuantityStepper, Accordion, ProductCard, FeatureCard. Typical SaaS:
  Button, Input, Select, Tabs, Table, Dialog, Toast, Avatar, Sidebar items.
- Per component: `<Name>.jsx` (self-contained, CSS injected once via a
  `useStyleOnce` helper, styling only via tokens), `<Name>.d.ts` (props contract;
  starting-point tags live on the **props interface** JSDoc), `<Name>.prompt.md`
  (one-line what/when + JSX example + variant notes), and a shared demo card per
  directory showing all states densely.
- Implement real interaction states observed or reasonably implied: hover, press
  (scale ~0.98 if the brand is soft), focus ring, disabled.
- **[gate]** Render every component visually before moving on. Use a dev harness
  that transpiles the actual source files — verify with real DOM measurements
  (`getBoundingClientRect`, `getClientRects().length` for line counts), because
  DOM-to-image screenshot tools can mis-render webfonts and CSS `gap`.

## Step 6 — UI kit(s)

- One directory per product surface: `{index.html, loader.js, data.js,
  Chrome.jsx, <Screen>.jsx…, App.jsx, README.md}`.
- Screens compose the primitives via a shared namespace (`window.K` pattern:
  loader fetches → strips module syntax → Babel-transpiles → merges).
- `index.html` must look like the real product and be interactive: navigation
  between screens, cart/drawer/dialog flows faked client-side, toasts.
- Fixture data lives in `data.js` — names, prices, categories. Use real brand
  content for a faithful recreation; clearly-generic placeholders for a base
  system ("Product One", "Category A").
- **[gate]** Screenshot each screen and route transition; fix layout bugs.

## Step 7 — Showcase

A single page that demos the entire system **using only the system**: hero in the
brand voice, foundation panels (hooks, ramp, type), interactive component panels,
then in-context compositions (feature row + product grid). Nav and footer follow
the brand's chrome conventions. No styling that isn't tokens.

**Build it responsive from the first line** (principle 7), not as a retrofit:
`<meta name="viewport" content="width=device-width, initial-scale=1">`; a fluid
container (`max-width` + side padding, never a fixed-`px` page width); multi-column
panels via `grid-template-columns: repeat(auto-fit, minmax(...))` or `flex-wrap`
so they collapse to one column on phones; `clamp()` for hero/heading type; a
mobile nav treatment (collapse the link row, don't let it overflow). Add explicit
`@media (max-width: 768px)` / `(max-width: 480px)` blocks for anything the fluid
primitives don't cover.
- **[gate]** View the showcase at 320px, 768px, and 1280px (responsive audit in
  `03-fidelity-rules.md`). No horizontal overflow, no clipped headings, columns
  reflow to one. Fix before moving on.

## Step 8 — Docs

- **README.md** — sections: project context & sources; content fundamentals
  (voice, casing, examples — verbatim from source); visual foundations (answer
  ALL: color, type, spacing, radii, cards, shadows, borders, motion, hover/press/
  focus, transparency/blur, imagery treatment, layout rules); iconography;
  index/manifest; how-to-use-components snippet; **substitution flags**.
- **SKILL.md** — front-matter (name, description, user-invocable) + instructions
  pointing readers at the README and file map.
- UI kit README per kit.

## Step 9 — Strict audit  **[gate]**

Run `03-fidelity-rules.md` §Audit Checklist against the source images
side-by-side with your rendered output. Fix every drift item. Re-run the
compiler check. Then verify the entry pages load clean (no console errors).

## Step 10 — Deliver

Do not summarize what you built (the user can see it). State: caveats,
substitutions awaiting real assets, and one **clear, bold ask** that unblocks
iteration (e.g. "confirm palette + send font files").
