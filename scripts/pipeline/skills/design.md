# Design Skill

This document defines the design judgment standards applied during the AI Design Mapping step. Edit this file to evolve color, typography, and aesthetic decisions across all future site builds.

---

## Core Principle: Elevated, Not Reinvented

The goal is never to ignore the existing brand — it's to take what's there and make it feel like the best version of itself. A practice with muted greens should get a refined, intentional green palette, not a complete rebrand to navy.

---

## Color

**Avoid "dental defaults."** Hospital blue, plain white, toothpaste green — these are clichés. The palette should feel distinctive while still being appropriate for healthcare.

**Primary color** sets the brand character. It should be used for CTAs, key headings, and major UI elements. It needs sufficient contrast against white for accessibility (WCAG AA minimum).

**Light color** is a section background — it must be very light (luminance > 90%). If it's too saturated, it fights with content. When in doubt, go lighter.

**Accent colors** should feel intentional and warm. Earth tones, warm neutrals, and muted golds work well as accents in dental contexts. Avoid neon or overly saturated accents.

**Palette cohesion:** All colors should look like they belong together. A warm primary needs warm accents. A cool primary needs cool complements. Never mix a warm and cool palette without a deliberate bridge color.

**Color psychology for dental:**
- Green: growth, calm, natural — works well for holistic/neighborhood practices
- Deep teal: trust, stability, modern — good for premium/comprehensive practices
- Warm taupe/cream: approachable, gentle — good for family/comfort-focused practices
- Deep navy: authority, confidence — good for cosmetic/high-end practices
- Avoid: bright red (urgency/alarm), orange (too casual), pure black (harsh)

---

## Typography

**Heading fonts** should have character — a serif with personality, or a sans-serif with a distinctive cut. Avoid overused defaults like Open Sans or Roboto for headings.

**Body fonts** must prioritize readability above all. Inter, Lato, Source Sans 3, and DM Sans are reliable choices. The body font should disappear — the reader shouldn't notice it.

**Pairing rule:** Serif heading + sans-serif body is the most reliable combination. Two sans-serifs can work if they have enough contrast in weight/width. Avoid two serifs.

**All fonts must be available on Google Fonts.**

---

## Mood & Feel

The mood label ("Warm Modern Luxury", "Clean Clinical Trust") should guide every downstream decision. When generating a palette and font pairing, check them against the mood — they should feel like they belong to the same concept.

Common moods for dental:
- **Warm Neighborhood** — approachable, personal, community-rooted (warmer palette, softer radius, readable serif)
- **Modern Premium** — sleek, confident, cosmetic-leaning (cooler palette, tight radius, clean sans)
- **Clean Clinical** — trustworthy, precise, no-nonsense (neutral palette, medium radius, high contrast)
- **Soft & Gentle** — calming, low-anxiety, family-friendly (muted warm palette, large radius, soft shadows)

---

## UI Details

**Border radius** affects perceived personality:
- `sm` — precise, professional, slightly formal
- `md` — balanced, modern, versatile
- `lg` — friendly, approachable, contemporary
- `xl` — very soft, gentle, casual

**Shadow style** affects depth and premium feel:
- `soft` — subtle, modern, clean (preferred for premium)
- `medium` — balanced, works for most contexts
- `sharp` — more formal, slightly dated — use sparingly

---

## What to Avoid

- Copying the existing palette exactly without elevation
- Palettes that look good in isolation but fail against white backgrounds
- Fonts that require loading more than 2 Google Font families (performance cost)
- High-saturation accent colors paired with a high-saturation primary
- Designing for aesthetics alone — every choice should serve the practice's positioning
