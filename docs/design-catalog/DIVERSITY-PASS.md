# Diversity pass notes — 2026-08-07

Light re-check after catalog UX + controlled-diversity edits. Full vision judge (J1–J7) not re-run (needs source screenshots + LLM). Mechanical M1–M6 run against existing `entry.json` files.

## Showcase diversity checklist

| Template | Change verified | Glance notes |
|---|---|---|
| Klinik | Outfit body (was DM Sans); responsive `@media` | Warm terracotta reference — unchanged character |
| Luvia | Plum + stone canvas; geometric data hero; Source Sans 3 | No longer Klinik terracotta twin |
| Groomify | Mist page (no sage frame); responsive `@media` | Pilates keeps sage-frame motif |
| Wellbe | Hero grid overflow fixed; panel via margin | Olive + Syne + yellow still unique |
| Dermato | Edge-to-edge hero; gold band; Newsreader; photo hero | Not “Klinik with dark card” |
| Clearpath | Bodoni + Figtree; photo hero; `.hero-glow` fix | Cool teal + didone distinct from Pilates |
| Sun & Moon | Karla body; stone greige `#EDE8DF`; Moon band after hero | Duality visible early |
| Calmio | Photographic hero (Unsplash) | Photo card signature readable |

## Mechanical eval (`entry.json`)

| Entry | M pass | Notes |
|---|---|---|
| klinik | PASS | — |
| dermato | PASS | — |
| clearpath | PASS | — |
| luvia | FAIL M1-schema | Pre-existing entry/schema drift — not introduced by showcase CSS pass |
| groomify | FAIL M1-schema | Same |
| wellbe | FAIL M1-schema | Same |
| sun-moon | FAIL M1-schema | Same |

Follow-up: refresh failing entries to current schema, then optional full J-eval with showcase screenshots.
