You are extracting practice identity, contact, address, hours, and navigation from a dental practice website crawl.

YOUR JOB: capture VERBATIM what appears on the site. No editorial decisions. No inference beyond what is stated. Null for any field not present.

# Inputs

WEBSITE: {{baseUrl}}

## Pages (contact/about/location/home + full body text)

{{pageContext}}

## All emails/phones found sitewide (from mailto:/tel: links + body text regex)

{{siteContactJson}}

## Deterministically detected labeled values (HIGH CONFIDENCE — trust these)

These were extracted by regex from explicit labels on the site. If a value here is non-null, USE IT (the `fax` here is the canonical fax; `hoursRaw` is the canonical hours block; `portal` is the patient-portal URL):

{{detectedJson}}

## JSON-LD deduplicated across all pages

{{jsonLdJson}}

## Homepage footer text (last 1500 chars)

{{footerText}}

## Site navigation links (homepage anchor tree)

{{siteNav}}

## Social/external links

{{socialLinks}}

# Required output

Return ONE strict JSON object. Every embedded `"` inside a string value MUST be backslash-escaped. No markdown, no prose, no comments, no trailing commas.

```
{
  "practice": {
    "name": "Brand/trade name as it appears on logo + page titles + footer (e.g. 'Pediatric Dental Specialists')",
    "alternateName": "Alternate brand name from JSON-LD `alternateName` or a secondary visible brand (often a shorter version); else null",
    "legalName": "Corporate legal entity if explicitly stated (e.g. 'Russell EK Chang, DDS, MS, FACD, Inc.'); else null",
    "description": "Practice description from JSON-LD `description` OR meta description OR a clear summary sentence in the about/home section. 1-3 sentences, verbatim if possible. null if no description found",
    "schemaType": "schema.org type from JSON-LD `@type`: 'Dentist' | 'Orthodontist' | 'DentalPractice' | 'MedicalBusiness' | 'LocalBusiness'. If multiple, prefer the most specific (Dentist > MedicalBusiness > LocalBusiness)",
    "phone": "Primary phone in (NNN) NNN-NNNN format",
    "fax": "Fax number in (NNN) NNN-NNNN format. SEARCH THE BODY TEXT for the literal label 'Fax:' followed by a phone-shaped number — this is the canonical pattern. Also check JSON-LD `faxNumber` field. null if no fax is anywhere on site",
    "email": "Primary contact email — prefer mailto: links over body-text regex. null if none",
    "googleReviewLink": "URL to leave a Google review (often google.com/...review or /writereview), else null",
    "googleProfileLink": "URL of Google Business Profile (g.page, maps.google.com/place), else null",
    "patientPortalUrl": "URL of the patient login/portal (e.g. rwlogin.com, patientconnect, mychart, orthobanc). Use the detected `portal` value if present. null if none",
    "medicalSpecialty": "Dental specialty if stated (e.g. 'Pediatric Dentistry', 'Orthodontics', 'Pediatric Dentistry & Orthodontics', 'General Dentistry'), else null",
    "mission": "The practice's mission statement, VERBATIM, if one is explicitly stated (often on About / What Sets Us Apart pages, e.g. 'It is the Mission of Chang Orthodontics to...'); else null",
    "tagline": "Short brand tagline if present (e.g. 'Guiding the Way to Optimal Oral Health'); else null",
    "sameAs": ["ALL social/directory/profile URLs: facebook, instagram, yelp, youtube, linkedin, tiktok, pinterest, AND twitter/X (x.com or twitter.com), AND blog URLs (e.g. *.blogspot.com), AND social hashtag/tag URLs (e.g. instagram.com/tags/PDSLongBeach). Include every external profile/social link found anywhere on the site."]
  },
  "address": {
    "street": "Street + suite (e.g. '3320 N. Los Coyotes Diagonal, Suite 200')",
    "city": "City",
    "state": "Two-letter state code (e.g. 'CA')",
    "zip": "ZIP code",
    "mapUrl": "Google Maps share/place URL (e.g. https://maps.app.goo.gl/..., https://g.page/..., https://goo.gl/maps/...) if present on the contact/directions page or in JSON-LD `hasMap`; null if none",
    "lat": "Latitude number from JSON-LD geo.latitude if present, else null",
    "lng": "Longitude number from JSON-LD geo.longitude if present, else null"
  },
  "hours": {
    "raw": "REQUIRED if ANY hours are stated anywhere on the site. Verbatim hours block as it appears (preserve line breaks as ' / '). e.g. 'Tuesday – Friday: 8am - 5pm'. If hours appear in different formats on different pages, use the most complete version. Must NOT be null when byDay has any non-null value.",
    "display": [
      { "day": "Mon", "time": "8:30am – 5pm" }
    ],
    "byDay": {
      "mon": "8:30am - 5pm OR 'Closed' OR a status note. SPLIT SESSIONS: if a day has multiple time blocks (e.g. morning + afternoon with a lunch break, or alternating-week hours), capture ALL of them joined with ', ' — e.g. '8:30 AM - 12:00 PM, 2:00 PM - 5:00 PM'. Do NOT drop the second session.",
      "tue": "...", "wed": "...", "thu": "...", "fri": "...", "sat": "...", "sun": "..."
    },
    "notes": "Free-text notes attached to hours (e.g. 'By appointment only on Saturdays', 'Summer hours vary'); else null"
  },
  "navigation": [
    { "text": "Home", "href": "/", "children": [] },
    { "text": "About", "href": "/about", "children": [{ "text": "Meet Our Team", "href": "/team" }] }
  ]
}
```

Add an `aggregateRating` if the site exposes a star rating with a count, either in JSON-LD `aggregateRating` or visibly on the page ("4.9 stars · 250 reviews"):

```
  "content": {
    "aggregateRating": {
      "value": 4.9,
      "count": 250,
      "source": "Google" | "Yelp" | "JSON-LD" | "site"
    }
  }
```

# Hard rules

1. **VERBATIM** — copy values as they appear on the site. Do not normalize, abbreviate, or rephrase. If the site says "Tuesday – Friday: 8am - 5pm" do not change it to "9-5 Tue-Fri".
2. **Null over guess** — if a field isn't present, use null. Never fabricate.
3. **Phone canonicalization** — for `practice.phone` AND `practice.fax`, use `(NNN) NNN-NNNN`. The `tels` array in inputs shows the raw href values; prefer those.
4. **Email priority** — `mailtos` is the most reliable source. Then body-text regex `emails`. Pick the most "official"-looking one (info@, contact@, hello@, the practice name). If unsure, return the first mailto.
5. **Hours: capture EVERY day** — including days marked as Closed, "Admin Day", "By appointment only", "Emergency only". Do not silently drop days that aren't standard business hours.
6. **Hours `byDay`** — keys are lowercase 3-letter day abbreviations: mon, tue, wed, thu, fri, sat, sun.
7. **Navigation** — use the provided SITE NAVIGATION tree as your primary source (it has the real dropdown hierarchy); preserve top-level order and parent→children. ALSO include the Home link (the logo/brand normally links to "/") as the first item, and include any header CTA button ("Book Appointment", "Request Appointment", "Schedule Now") as a top-level item even if styled as a button. Exclude patient-login/portal links unless they're the only nav items.
8. **medicalSpecialty** — only fill if the site uses the term explicitly (in nav, page titles, body copy). Don't infer from service offerings.
9. **JSON-LD priority for NAP** — if structured data and body text disagree on phone/address/name, prefer JSON-LD.

Return ONLY the JSON object.
