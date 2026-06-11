# 04 — Templates

Skeletons the agent fills in. `{{placeholders}}` mark required substitutions.
These files are illustrative — adapt names and groups to the audited brand.

> **Responsive, not fixed-width.** The `viewport="WxH"` values in the `@dsCard` /
> `@startingPoint` tags below are capture hints for the catalog tooling — they set
> a *default thumbnail* size, not the width you author at. Every artifact must
> still be fluid and reflow to a single column on phones (principle 7;
> `03-fidelity-rules.md` §Responsive). Use fluid containers + `@media` breakpoints,
> never a hard-coded page width.

---

## tokens/colors.css

```css
/* ==========================================================================
   {{System name}} — Color tokens
   Sampled from: {{source list}}. Derived values marked (derived).
   ========================================================================== */
:root {
  /* --- Base ramp(s) — sampled --- */
  --neutral-0:   {{#hex}};
  --neutral-100: {{#hex}}; /* page background (sampled @ {{where}}) */
  --neutral-300: {{#hex}}; /* media tiles / borders */
  --neutral-600: {{#hex}}; /* muted text */
  --neutral-900: {{#hex}}; /* ink */
  /* …fill full 0/50/100…900 ramp; mark interpolated steps (derived) */

  /* --- BRAND HOOKS — override to re-skin --- */
  --brand:        {{#hex}}; /* sampled from {{element}} */
  --brand-hover:  {{#hex}};
  --brand-active: {{#hex}};
  --brand-on:     {{#hex}};
  --accent:       {{#hex}}; /* used ONLY for: {{exact uses in source}} */
  --positive: {{#hex}}; --warning: {{#hex}}; --danger: {{#hex}};

  /* --- SEMANTIC ALIASES — components consume only these --- */
  --surface-page: var(--neutral-100);   --surface-raised: var(--neutral-0);
  --surface-sunken: var(--neutral-200); --surface-muted: var(--neutral-300);
  --surface-inverse: var(--neutral-800);
  --text-strong: var(--neutral-900); --text-body: var(--neutral-700);
  --text-muted: var(--neutral-600);  --text-subtle: var(--neutral-500);
  --text-disabled: var(--neutral-400);
  --text-on-dark: var(--neutral-50); --text-on-dark-muted: var(--neutral-400);
  --border-subtle: var(--neutral-200); --border-default: var(--neutral-300);
  --border-strong: var(--neutral-400); --border-on-dark: rgba(255,255,255,0.16);
  --ring-focus: {{brand @ ~45%}};      --scrim: {{ink @ ~40%}};
}
```

## styles.css (root)

```css
@import url('./tokens/fonts.css');
@import url('./tokens/colors.css');
@import url('./tokens/typography.css');
@import url('./tokens/spacing.css');
@import url('./tokens/effects.css');
```

## components/<group>/<Name>.jsx

```jsx
import React from 'react';

function useStyleOnce(id, css) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.{{prefix}}{{Name}} {
  font-family: var(--font-ui);
  /* semantic tokens only — no raw hexes */
  transition: background-color var(--dur-base) var(--ease-standard);
}
.{{prefix}}{{Name}}:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.{{prefix}}{{Name}}:active { transform: scale(var(--press-scale)); }
.{{prefix}}{{Name}}--{{variant}} { /* … */ }
`;

/**
 * {{One-line description, citing the source element it recreates.}}
 * variant: {{list}} · size: {{list}}
 */
export function {{Name}}({ variant = '{{default}}', className = '', ...rest }) {
  useStyleOnce('{{kebab-id}}', CSS);
  const cls = ['{{prefix}}{{Name}}', `{{prefix}}{{Name}}--${variant}`, className]
    .filter(Boolean).join(' ');
  return <button className={cls} {...rest} />;
}
```

## components/<group>/<Name>.d.ts

```ts
import * as React from 'react';

/**
 * Props for {{Name}}.
 * @startingPoint section="{{Group}}" subtitle="{{one line}}" viewport="{{WxH}}"
 */
export interface {{Name}}Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** {{What this controls; allowed values and when to use each.}} */
  variant?: {{'a' | 'b'}};
}

/** {{One-line description.}} */
export function {{Name}}(props: {{Name}}Props): React.ReactElement;
```

(Use `@startingPoint` only for components meant to seed new designs.)

## components/<group>/<Name>.prompt.md

```md
{{One sentence: what it is and when to use it.}}

​```jsx
<{{Name}} variant="{{default}}">{{Label}}</{{Name}}>
​```

Variants: {{each with its job}}. {{Sizes / slots / composition notes.}}
```

## Demo card — components/<group>/<group>.card.html

```html
<!-- @dsCard group="Components" viewport="700x{{H}}" name="{{Label}}" subtitle="{{one line}}" -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="../../styles.css" />
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>
<script src="../../_ds_bundle.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
  const { {{Name}} } = window.{{Namespace}}; // get exact namespace from validator
  ReactDOM.createRoot(document.getElementById('root')).render(
    <div style={{ display: 'flex', gap: 16, padding: 24, flexWrap: 'wrap' }}>
      {/* render ALL key states: variants × sizes × disabled × with-icon */}
    </div>
  );
</script>
</body>
</html>
```

(Pin React/Babel versions with integrity hashes in real output.)

## ui_kits/<surface>/loader.js

```js
/* Composes DS primitives + screen modules into one namespace (window.K). */
(function () {
  window.K = window.K || {};
  function strip(src) {
    return src.replace(/^\s*import\s+[^;]*;?\s*$/gm, '')
              .replace(/export\s+function/g, 'function')
              .replace(/export\s+const/g, 'const');
  }
  async function loadFile(url, React, K) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load ' + url);
    const code = strip(await res.text());
    const names = [...code.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]);
    const out = Babel.transform(code, { presets: ['react'] }).code;
    const fn = new Function('React', 'K', out + ';return {' + names.map(n => n + ':' + n).join(',') + '};');
    Object.assign(K, fn(React, K));
  }
  window.bootKit = async function (files) {
    for (const f of files) await loadFile(f, window.React, window.K);
    return window.K;
  };
})();
```

## ui_kits/<surface>/index.html — boot pattern

```html
<!-- @dsCard group="{{Surface label}}" viewport="1280x840" name="{{Name}}" subtitle="{{one line}}" -->
<!-- @startingPoint section="{{Surface label}}" subtitle="{{one line}}" viewport="1280x840" -->
<!DOCTYPE html>
<!-- head: styles.css, React UMD ×2, Babel, icon CDN, loader.js, data.js -->
<body>
<div id="splash">{{wordmark}}</div>
<div id="root"></div>
<div id="err"></div>
<script>
  (async function () {
    try {
      await window.bootKit([ /* DS component paths…, screen paths…, 'App.jsx' */ ]);
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.K.App));
      // then: create icons, fade splash
    } catch (e) { document.getElementById('err').textContent = 'BOOT ERROR:\n' + (e.stack || e.message); }
  })();
</script>
</body>
```

## SKILL.md

```md
---
name: {{brand}}-design
description: Use this skill to generate well-branded interfaces and assets for {{brand}}, either for production or throwaway prototypes/mocks. Contains design guidelines, colors, type, fonts, assets, and UI kit components.
user-invocable: true
---

Read the readme.md within this skill and explore the available files
(styles.css + tokens/, components/, ui_kits/, guidelines/, assets/).
{{One paragraph: the brand look in one line + how to apply it.}}
If invoked without guidance, ask what to build, then act as an expert designer
producing HTML artifacts or production code as needed.
```

## readme.md — section skeleton

```md
# {{Brand}} — Design System
{{One-paragraph identity: look + voice in plain words.}}

## Sources
{{Every input, with links/paths. Note which were ground truth.}}

## Content fundamentals
{{Voice · person · casing · punctuation · emoji policy · VERBATIM examples.}}

## Visual foundations
{{Color · type (incl. typographic devices) · spacing/layout · radii · cards ·
shadows · borders · motion · hover/press/focus · transparency/blur · imagery.}}

## Iconography
{{Set + weight + how loaded + substitution flags + emoji/unicode policy.}}

## Index / manifest
{{File map: tokens, guidelines cards, assets, components (by group), ui_kits,
showcase, themes.}}

## Using components
{{Bundle/namespace snippet.}}

> Substitutions & extrapolations: {{numbered list — fonts, icons, imagery,
> invented sections — each with its justification.}}
```
