You are bucketing every image on a dental practice website into structured categories.

# Inputs

WEBSITE: {{baseUrl}}

## All unique images — each is `ID | alt | ...url-tail`

You will assign images BY THEIR INTEGER ID. **Do NOT echo back URLs** — only return ids.

{{imageList}}

## Known doctor names (from JSON-LD / homepage)

{{doctorHints}}

# Required output — strict JSON, ids only

```
{
  "assignments": {
    "logo":       <id of the primary header logo, or null>,
    "logoFooter": <id of a distinct footer logo if different from header, else null>,
    "hero":       [<ids of hero/banner/homepage-slider/page-header images>],
    "headshots":  [{ "id": <id>, "personName": "Dr. ABC" }],
    "team":       [{ "id": <id>, "personName": "Name or null" }],
    "office":     [<ids of office/clinic interior OR exterior photos>],
    "gallery":    [<ids of general practice/lifestyle/patient imagery>],
    "beforeAfter":[<ids of before/after smile transformation photos>],
    "treatments": [<ids of service/treatment/procedure imagery, incl. per-service page hero images>],
    "badges":     [<ids of affiliation/partner/certification LOGOS — see rules>]
  }
}
```

# Bucketing rules — apply in order, each image goes in exactly ONE bucket

1. **logo** — alt contains "logo" or the practice name, url-tail has `/logo`. Pick the single best HEADER logo.
2. **logoFooter** — a SECOND, distinct logo image (often a footer or white/inverted variant). null if there's only one logo.
3. **badges** — LOGOS of external organizations, associations, certifications, or partner brands. These are trust signals, NOT services. Examples: ADA, AAO, AAPD, CDA, ABO, "Invisalign", "Invisalign Diamond Provider", "iTero", "InBrace", "LightForce", "CareCredit", insurance carrier logos, "Sunbit". If the alt or url-tail names a known org/brand/cert, it's a badge.
4. **headshots** (DOCTORS) — alt has "Dr."/"Doctor" + name, OR url-tail matches `/dr-`, `/img-dr-`, OR alt matches a doctor hint name. Set personName to the matched doctor. A combined photo of multiple doctors goes here too (personName = the names).
5. **team** (NON-DOCTOR staff) — alt starts with "Staff member:" or names a non-doctor person, OR url-tail matches `/staff`, `/team-`. personName if a name is clear, else null.
6. **beforeAfter** — url-tail/alt mentions before/after, smile-makeover, transformation, "case".
7. **hero** — url-tail matches `/hero`, `/banner`, `/slide`, `/home-slider`, `/header`, OR alt suggests a page-header/banner image (e.g. "...contact", "...about hero").
8. **office** — url-tail/alt mentions office, clinic, facility, interior, exterior, lobby, operatory, front desk, building.
9. **treatments** — per-service or per-treatment imagery; url-tail under `/services`, `/treatment`, or a service-page hero (e.g. `_hero-image-invisalign`).
10. **gallery** — real content imagery that fits nothing above (lifestyle, patients, community, decorative-but-meaningful photos).

# Hard rules

- **Return IDs ONLY, never URLs.** The harness resolves ids→urls.
- **EXCLUDE junk**: tracking pixels, spacers, sprite sheets, tiny utility icons (<50px social/payment icons). Already pre-filtered, but skip any that slipped through.
- **headshots = doctors only; team = non-doctor staff.** Never mix.
- **Every meaningful image should land in some bucket** — if you're unsure between gallery and treatments, prefer the more specific one; if truly generic, use gallery. Don't drop real photos.
- **badges is for LOGOS of orgs/brands/certs** — when in doubt whether something is a partner/affiliation logo vs a service image, check the alt: a recognizable brand/org name → badges.

Return ONLY the JSON object.
