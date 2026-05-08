# Dental Website — Information Architecture Reference

This document defines best practices for structuring dental practice websites.
It is loaded by the IA planning step to ground decisions in established patterns
rather than general AI intuition.

Edit this file freely as you learn what converts and what doesn't.

---

## Page Inventory

Every dental site should have these pages. Pages marked (required) must exist.
Pages marked (conditional) are generated only when content is available.

### Required Pages

**Home (`/`)**
The single highest-traffic page. Primary jobs: establish trust immediately,
answer "are you taking new patients?", give the patient a next action.
- Above fold: practice name, city, phone, "Book Appointment" CTA
- Must establish credibility within 3 seconds: doctor name/photo, rating, years open
- Do not lead with a list of services — lead with an outcome ("healthy smile", "pain-free")

**Services Index (`/services`)**
A navigable list of all offered services. Each card links to its individual page.
Patients arrive here from Google ("dentist services Long Beach") or from nav.
- Group related services visually if > 8 services
- Each card: name, 1-sentence outcome description, link to individual page
- CTA at bottom: "Not sure what you need? Call us."

**Individual Service Pages (`/services/[slug]`)**
One page per offered service. These are the highest SEO-value pages on the site.
Patients search "dental implants Long Beach" and land here — not the homepage.
- H1: service name + city (e.g., "Dental Implants in Long Beach")
- Lead with: what it is, who it's for, what the outcome is
- Include: process overview, what to expect, cost/insurance note if available
- Before/after photos are extremely high-converting on these pages if available
- CTA: "Schedule a Consultation" linking to /schedule
- Minimum viable length: 300 words. Under 150 words signals a stub to both patients and Google.

**About / Meet the Doctor (`/about`)**
Second most-visited page after home. Patients are evaluating whether they trust this person
with their mouth. Personal details and authentic photos matter more than credentials.
- Doctor photo is mandatory — no placeholder
- Lead with: where they're from, why they became a dentist, what they love about it
- Secondary: credentials, education, memberships
- Include: philosophy statement ("we believe every patient deserves...")
- If multiple doctors: give each a section or separate page
- Avoid: stock photos of dental offices, generic "we care about you" copy

**Schedule / Book Appointment (`/schedule`)**
The conversion destination for every CTA on the site.
- Phone number prominent above fold
- If online booking exists: embed it or link directly
- Office hours must be accurate and visible
- Address with map embed if possible
- Reassurance copy: "New patients welcome", "Same-day emergencies"

**Blog (`/blog`)**
SEO vehicle and trust signal. Patients who read blog posts convert at higher rates.
- Posts should be locally relevant (mention city, practice name)
- Best topics: procedure explainers, what-to-expect guides, local oral health tips
- Minimum 500 words per post for SEO value
- Doctor attribution adds trust ("Written by Dr. Anthony Hoang")

### Conditional Pages (generate when content exists)

**Gallery (`/gallery`)**
Generate only when 6+ authentic (non-stock) images are available.
Before/after photos are far more valuable than office exterior shots.
If only stock photos exist: do not generate this page — it signals inauthenticity.

**FAQ (`/faq`)**
Generate only when 5+ real FAQs are available from the original site or silver extraction.
Questions should be what patients actually ask, not marketing copy disguised as questions.

**Financing (`/financing`)**
Generate only when financing/payment plans are mentioned in bronze data.
This page reduces cost anxiety — it converts patients who otherwise would not call.

**Reviews (`/reviews` — not currently a template page)**
Note: we do not currently generate a standalone reviews page.
Reviews are surfaced as a homepage section and footer links instead.

---

## Navigation Structure

### Primary Navigation (desktop)
- Maximum 5 visible items — cognitive overload past this
- Services should always be a dropdown (too many to list in nav bar)
- "Book Appointment" CTA button always rightmost, visually distinct
- Phone number in header on desktop — patients want to call

**Proven primary nav patterns for dental:**
```
[Logo]  Services▾  About  Blog  Gallery  [Phone]  [Book Appointment]
```
```
[Services▾]  [About]  [Logo]  [Blog]  [Phone]  [Book Appointment]
```

### Services Dropdown
- Show max 6 individual services in dropdown
- "All Services →" link at bottom of dropdown
- Most searched services first: Dental Implants, Invisalign, Teeth Whitening, Dental Crowns

### Footer Navigation
- Repeat all primary nav links
- Add: Privacy Policy (if available), Sitemap
- Social links: Google Maps, Facebook, Yelp if available
- Hours must appear in footer — this is where patients look
- Address as text (not just a link) — readable without clicking

### Mobile Navigation
- Hamburger menu is fine — patients expect it
- Phone number tap target in mobile header, always visible without opening menu
- "Book Appointment" accessible without opening menu

---

## Homepage Section Order

Research-backed sequence for dental practice homepages:

1. **Hero** — establish trust, show the practice, give next action
2. **Trust bar / stat bar** — "4.9★ on Google · 500+ patients · Est. 2015" (if data available)
3. **Doctor intro** — humanize, build personal connection (if doctor bio available)
4. **Services** — what we do (show top 6, link to /services for more)
5. **Reviews / Testimonials** — social proof (only if real reviews available)
6. **Gallery** — show the space and results (only if authentic photos available)
7. **CTA** — final conversion push before footer

Rules:
- Never open with services — lead with trust
- Reviews should appear after services, not before — establish competence first
- CTA should appear at least twice: in hero and at the bottom
- If no authentic gallery photos: skip gallery section entirely on homepage

---

## CTA Strategy

**Primary CTA everywhere:** "Book Appointment" → `/schedule`
**Secondary CTA (below primary):** "Or call us: [phone]" as tel: link
**Emergency signal:** If practice offers emergency services, surface "Same-day emergencies welcome" near every CTA

Never use:
- "Learn More" as a CTA — vague, no commitment
- "Contact Us" as primary CTA — too passive for appointment booking
- "Schedule a Free Consultation" unless actually free — creates distrust if not

---

## Content Priorities by Source

When content is available from the original site (bronze), use it.
Only generate AI content when the original has nothing.

| Content Type | Priority Order |
|---|---|
| Doctor bio | Bronze verbatim → AI-expanded if < 100 words → AI-written if missing |
| Service page body | Bronze paragraphs (filtered) → AI-written if < 150 words |
| Blog posts | Bronze scraped posts → AI-written if none |
| Testimonials | Bronze scraped reviews → never fabricate |
| FAQs | Bronze scraped FAQs → AI-generated if < 4 available |
| Hero headline | AI-written (should be differentiated, not copied) |
| Practice philosophy | Bronze if available → AI-written |

**Never fabricate:** testimonials, doctor credentials, before/after claims, pricing, insurance acceptance, specific procedure claims.

---

## Trust Signal Inventory

These elements directly impact conversion rate. Surface as many as available:

**High impact:**
- Google rating + review count (e.g., "4.9★ from 52 reviews")
- Years in practice / established date
- Doctor photo (authentic, not stock)
- Before/after photos (authentic)
- Real patient testimonials with names
- Emergency availability

**Medium impact:**
- Insurance logos (if accepted plans known)
- Google Maps embed or link
- Memberships: ADA, state dental association
- Doctor education / credentials
- Team photos

**Low impact (but still use if available):**
- Awards / recognitions
- Technology callouts (digital X-rays, CEREC, etc.)
- Languages spoken

---

## Image Guidance

**Hero image:** Authentic office interior or doctor smiling > generic dental stock.
A real office photo converts better than a perfect stock image. Patients are evaluating the space.

**Doctor photo:** Must be authentic. Outdoor or office setting. Smiling. No lab coat required.
"Clinical" headshots perform worse than natural/approachable ones.

**Before/after:** Highest-converting content type on dental sites. Use them everywhere
they're available: service pages, gallery, doctor-intro. Do not hide them.

**Stock photos to avoid:**
- Smiling diverse family groups (signals inauthenticity immediately)
- Perfect teeth close-ups with no context
- Generic dental tools/equipment
- Office stock that looks like every other dental site

---

## SEO Structure

**Local SEO priorities for dental:**
- City/neighborhood in H1 of service pages ("Dental Implants in Long Beach")
- Practice name + city in title tags
- Address and phone in footer (schema.org LocalBusiness)
- Google Maps URL in footer for citation consistency
- Distinct page per service (not one page with all services)

**Schema.org markup (already in template):**
- LocalBusiness with address, phone, hours, geo coordinates
- BreadcrumbList on service pages
- FAQPage on FAQ page
- BlogPosting on blog posts

---

## What's Missing — Common Gaps

These are the most common missing pieces on scraped dental sites.
Surface these as action items when they can't be resolved automatically:

1. **Doctor photo** — extremely common, has high impact. Flag if only stock available.
2. **Authentic office/operatory photos** — drives gallery and hero quality
3. **Before/after photos** — highest converting content, often not on site
4. **Current hours** — scraped hours may be outdated, patient must verify
5. **Insurance list** — almost never on websites but patients want it
6. **Online booking link** — if practice uses Zocdoc/Dentrix/etc., link it
7. **Pricing / financing info** — reduces cost anxiety pre-call
8. **Email address** — for contact form functionality

---

## Patterns to Avoid

These are common dental website anti-patterns that reduce trust or conversion:

- **Generic taglines:** "We care about your smile" / "Your comfort is our priority" — every dental site says this. Use something specific.
- **Services as hero:** Leading with a list of services before establishing any trust
- **No doctor photo:** Patients are choosing a person, not a building
- **Phone number buried in footer only:** Should be in header and near every CTA
- **"Request an appointment" instead of "Book":** Weaker commitment language
- **Outdated design signals:** Gradients from 2010, Comic Sans, tables for layout — signals the practice is behind
- **No mobile tap targets:** Buttons under 44px on mobile drive drop-off
- **Slow hero image:** Large unoptimized hero image kills first impression on mobile

---

*This document is a living reference. Update it as you observe what works and what doesn't across builds.*
