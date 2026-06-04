// Vision scoring prompt for the dental-practice design audit.
//
// Design decisions baked in here (see _sourcing notes for rationale):
//   1. Forced evidence (5 observations) before any numeric score.
//   2. Three narrow 1-5 sub-scores instead of one holistic score.
//   3. Written anchor descriptions for every score level.
//   4. Image anchors (1/3/5 reference sites) embedded in every call.
//      Anchors live in _sourcing/anchors/ and are captured once via
//      scripts/sourcing/lib/capture-anchors.js. Cached on disk + sent
//      as base64 in each Claude call.
//   5. Explicit exclusions: no commenting on perf/a11y/features (those
//      are scored separately; commenting here would double-count).
//   6. Blank-screenshot escape valve: if the capture failed or the page
//      is unrenderable, the model returns scores=0 with a reason, and
//      we filter those rows out of design-score aggregation.
//   7. Explicit mobile-vs-desktop comparison: mills often look passable
//      on desktop and collapse on mobile. Captures that failure mode.
//
// Model: claude-sonnet-4-5
// Temperature: 0
// Max tokens: 1500 (allows 5 observations + 3 rationales + JSON overhead)

export const VISION_MODEL = 'claude-sonnet-4-5';
export const VISION_TEMPERATURE = 0;
export const VISION_MAX_TOKENS = 1500;

// Anchor reference sites. These are picked from real spike results so
// the visual scale matches the population the model will judge.
// IMPORTANT: do a 5-minute eyeball check before locking these in —
// each must clearly exemplify its score level.
export const ANCHOR_SITES = {
  score_1: {
    url: 'http://www.myriversidedentaloffice.com/',
    vendor: 'prosites',
    why: 'Classic ProSites template. Generic stock photos, default fonts, web-2.0 carousel.',
  },
  score_3: {
    url: 'http://www.magnoliamoderndental.com/',
    vendor: 'wordpress-generic',
    why: 'Average independent practice WordPress site. Some custom photography, competent but unremarkable.',
  },
  score_5: {
    url: 'https://www.signaturesmilesriverside.com/',
    vendor: 'webflow',
    why: 'Custom Webflow build. Bespoke type/color system, original photography, modern aesthetic.',
  },
};

/**
 * Build the messages array for the Anthropic API.
 *
 * @param {object} args
 * @param {Buffer|string} args.desktopPng  - PNG buffer or base64 string
 * @param {Buffer|string} args.mobilePng
 * @param {object} args.anchors            - { score_1: {png}, score_3: {png}, score_5: {png} }
 *                                            Each .png is Buffer or base64 string.
 * @returns {Array} messages array for anthropic.messages.create()
 */
export function buildVisionMessages({ desktopPng, mobilePng, anchors }) {
  const toB64 = (v) => (Buffer.isBuffer(v) ? v.toString('base64') : v);
  const img = (b64) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: b64 },
  });

  const content = [
    { type: 'text', text: SYSTEM_PREAMBLE },

    // Anchors come first so the model sees the scale before the target.
    { type: 'text', text: '\n═══ ANCHOR: SCORE 1 (clear template, generic) ═══' },
    img(toB64(anchors.score_1.png)),
    { type: 'text', text: '\n═══ ANCHOR: SCORE 3 (average, competent) ═══' },
    img(toB64(anchors.score_3.png)),
    { type: 'text', text: '\n═══ ANCHOR: SCORE 5 (bespoke craft) ═══' },
    img(toB64(anchors.score_5.png)),

    // Target site.
    { type: 'text', text: '\n═══ TARGET — DESKTOP (1440px) ═══' },
    img(toB64(desktopPng)),
    { type: 'text', text: '\n═══ TARGET — MOBILE (390px) ═══' },
    img(toB64(mobilePng)),

    { type: 'text', text: TASK_INSTRUCTIONS },
  ];

  return [{ role: 'user', content }];
}

const SYSTEM_PREAMBLE = `You are evaluating a dental practice's website for visual design quality.

You will see FIVE images in this order:
  1. Anchor for score = 1 (template-quality, generic)
  2. Anchor for score = 3 (average, competent independent practice)
  3. Anchor for score = 5 (bespoke craft, custom design)
  4. TARGET site, desktop screenshot (1440px wide, full page)
  5. TARGET site, mobile screenshot (390px wide, full page)

Use the three anchor images as the actual visual scale. Compare the target
DIRECTLY against them. "Better than the 3 anchor but worse than the 5" is
a 4. Do not score in the abstract.`;

const TASK_INSTRUCTIONS = `
═══════════════════════════════════════════════════════════════════
ESCAPE VALVE — CHECK FIRST
If either target screenshot is mostly blank, shows only a cookie banner,
shows a generic "domain parked" page, is a broken/error page, or otherwise
fails to render the actual website, STOP and return:

{
  "unrenderable": true,
  "reason": "<one sentence describing what you actually see>",
  "observations": [], "visual_craft": null, "clarity_hierarchy": null, "modernity": null
}

Otherwise continue with steps 1–3 below.

═══════════════════════════════════════════════════════════════════
STEP 1 — OBSERVATIONS (5 required)

List exactly 5 specific, concrete visual observations of the TARGET site.
Each must reference something you can literally see.

Good observations:
  ✓ "Hero uses a stock photo of a smiling woman with overlaid teal text"
  ✓ "Three-column services grid below the fold with identical icon style"
  ✓ "Mobile nav collapses to hamburger; logo wraps to two lines on mobile"
Bad observations (do NOT do these):
  ✗ "The site feels outdated"            (vague — describe what you SEE)
  ✗ "Performance could be better"        (not visual — out of scope)
  ✗ "Missing accessibility attributes"   (not visual — out of scope)

EXPLICITLY OUT OF SCOPE — do not comment on:
  - Page load speed, performance, or technical implementation
  - Accessibility (contrast, alt text, ARIA, etc.)
  - Whether features exist (schema, booking widgets, etc.)
  These are measured separately. Your job is purely aesthetic judgment.

MOBILE-VS-DESKTOP COMPARISON IS REQUIRED:
At least one of your 5 observations must address how the mobile version
compares to desktop. If mobile is significantly worse (broken layout,
truncated text, tap targets too small, hero unreadable, nav collapsed
unusably) — call it out specifically. This is a common failure mode for
templated dental sites and we want it captured.

═══════════════════════════════════════════════════════════════════
STEP 2 — SCORES (1–5 each, anchored against the reference images)

A. VISUAL CRAFT
   Does this look custom-designed for THIS practice, or templated?
   Real photography of the actual office/team, or stock?
   Considered type/color/spacing, or defaults?

   1 = Obvious template (see anchor 1). Stock photos. Default fonts. Generic.
   2 = Lightly customized template. Mostly stock. Some brand color applied.
   3 = Average (see anchor 3). Some real photos, some stock. Competent but unremarkable.
   4 = Clearly custom. Mostly real photos. Distinctive type & color choices.
   5 = Bespoke craft (see anchor 5). Original photography. Cohesive brand system.

   PENALIZE mobile heavily if it's significantly worse than desktop.

B. CLARITY & HIERARCHY
   Within 3 seconds, can a first-time visitor tell what the practice
   does, who it's for, and what action to take next?

   1 = Confusing. Walls of text, no clear CTA, buried information.
   2 = Cluttered. CTA exists but competes with noise.
   3 = Adequate. The basics are findable with effort.
   4 = Clear. Strong hierarchy, obvious primary action, scannable.
   5 = Exemplary. Effortless eye path, single dominant CTA, ruthless edit.

   Judge the MOBILE version's clarity too — if mobile buries the CTA
   below 3 screens of scrolling, that lowers the score.

C. MODERNITY (aesthetic only — not the tech stack)
   Does this look like it was designed in the last 3 years (2023+)?

   1 = Looks pre-2015. Gradients, tiny photos, web-1.0 layout.
   2 = Looks 2016–2018. Carousel hero, web-2.0 buttons, rounded everything.
   3 = Looks 2019–2021. Flat design, large photos, but generic.
   4 = Looks current (2023+). Modern type, generous whitespace, contemporary palette.
   5 = Ahead of the curve. Distinctive aesthetic, current trends used well.

   NOTE: pediatric and orthodontic practices often use bright/playful palettes
   intentionally. Don't read "kid-themed" or "bright" as automatically dated.
   Judge whether the AESTHETIC EXECUTION is current, not whether it's serious.

═══════════════════════════════════════════════════════════════════
STEP 3 — RESPONSE FORMAT

Respond with ONLY valid JSON, no prose, no markdown fences:

{
  "unrenderable": false,
  "observations": [
    "observation 1",
    "observation 2",
    "observation 3",
    "observation 4",
    "observation 5 (must address mobile vs desktop)"
  ],
  "visual_craft":      { "score": 1-5, "rationale": "one sentence comparing to anchors" },
  "clarity_hierarchy": { "score": 1-5, "rationale": "one sentence" },
  "modernity":         { "score": 1-5, "rationale": "one sentence" }
}
`;
