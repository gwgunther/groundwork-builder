# Design Rules Playbook

This document consolidates the design rules currently used across the Groundwork pipeline so they can be exported and reused elsewhere.

## Purpose

Use this as the single reference for:
- visual quality standards
- UX and content quality standards
- shipping thresholds
- which skills/rules to apply first

## Core Design Principles (Always Follow)

### 1) Typography
- Use a clear type hierarchy with meaningful contrast between headline, subhead, and body.
- Avoid muddy scales (many near-identical sizes).
- Keep body measure readable (typically about 45-75 characters per line).
- Maintain consistent line-height and spacing rhythm.
- Prefer intentional pairings over default/generic font choices.

### 2) Color and Contrast
- Apply palette roles intentionally (roughly 60/30/10 for dominant/support/accent usage).
- Reserve accent color for action and emphasis, not broad page coverage.
- Meet accessibility contrast minimums:
  - body text: >= 4.5:1
  - large text: >= 3.0:1
  - UI elements: >= 3.0:1
- Avoid flat, generic “default framework” palettes unless explicitly desired.

### 3) Spatial Layout
- Create section rhythm with deliberate variation in spacing and density.
- Avoid “same padding everywhere” monotony.
- Use whitespace to establish hierarchy before users read copy.
- Ensure mobile layouts collapse cleanly at small widths (including 375px).

### 4) Information Hierarchy
- The first screen should quickly communicate:
  - who the practice is
  - where it is
  - what core service/action to take
- Keep one primary CTA per screen context.
- Place primary booking/contact action above the fold when possible.
- Defer secondary information until after the core message is clear.

### 5) UX Writing
- Prefer specific, grounded copy over generic category statements.
- Tie claims and CTAs to real context (practice, location, doctor, services).
- Avoid “template-sounding” AI copy.
- Keep labels and actions concrete, direct, and easy to parse.

### 6) Craft and Polish
- Every interactive element should have hover/focus/active feedback.
- Handle empty/error/edge states (no placeholder leakage or null artifacts).
- Keep touch targets usable (about 44px minimum).
- Eliminate obvious glitches (broken images, alignment cracks, console-visible issues).

## Trust and Conversion Requirements

For local service sites, trust and clarity outrank novelty.

Critical trust signals should be present and easy to find:
- clickable phone in header on mobile
- visible doctor identity/credentials
- real testimonials or honest substitute messaging
- clear address/hours
- payment/insurance details when available

## Distinctiveness Rules (Anti-Template / Anti-AI-Slop)

- A site should feel specific to this practice, not swappable with any competitor.
- Penalize common generic patterns and overused aesthetics when they weaken identity.
- Distinctiveness should not undermine trust; avoid novelty that harms clarity/conversion.

## Shipping Gate (Operational Threshold)

The implementation gate is met when all agent-fixable dimensions are >= 7:
- typography
- color_contrast
- spatial_layout
- information_hierarchy
- craft
- ux_writing

If these pass, build is considered shippable even if human-judgment dimensions still need follow-up actions.

## Scoring Bands

- 1-3: Failing (disqualifying issues)
- 4-6: Adequate but generic/template-like
- 7-8: Strong, considered, portfolio-worthy
- 9-10: Exceptional, distinctive, hard to improve

## Skill Application Strategy

### Core Skills (always in loop)
- shape
- critique
- typeset
- colorize
- layout
- polish

### Situational Skills (use when needed)
- bolder
- quieter
- clarify
- harden

### Meta/Support (pipeline/system support)
- impeccable (reference vocabulary and principles)
- distill (library ingestion)
- extract (component/system extraction)

## Practical Review Checklist

Before shipping, verify:
- hierarchy is obvious within 3 seconds
- one clear primary action exists
- typography scale feels intentional, not default
- contrast passes and accent use is controlled
- spacing rhythm is deliberate across sections
- copy is specific and non-generic
- trust signals are visible
- mobile interaction is clean and comfortable
- edge states are handled
- no obvious AI-template tells dominate the experience

## Source of Truth (In This Repo)

- Rule loader and section mapping: `scripts/pipeline/lib/impeccable.js`
- Scoring rubric and gate criteria: `scripts/pipeline/rubric.json`
- Skill loading policy: `scripts/pipeline/skills-registry.json`
- Impeccable reference library: `src/skills/impeccable/.claude/skills/impeccable/reference/`

## Export Note

This file is intentionally standalone and portable. You can copy it as-is into another project, docs system, or prompt library.
