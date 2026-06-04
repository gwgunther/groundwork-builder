You are extracting every service, treatment, and procedure mentioned on a dental practice website.

# Inputs

WEBSITE: {{baseUrl}}

## Pages

{{pageContext}}

## Navigation labels (flattened — these frequently enumerate services)

{{navList}}

## All page headings sitewide (H1/H2/H3 — another enumeration of services & sub-services)

{{headingCandidates}}

## All crawled paths (for inferring service hub pages)

{{allPaths}}

# Output — strict JSON

```
{
  "services": {
    "offered": [
      {
        "name": "Human-readable service name as it appears on the site (e.g. 'Invisalign Clear Aligners', 'Pediatric Sedation', 'Tooth-Colored Fillings')",
        "category": "general | cosmetic | orthodontic | emergency | specialty | implant | pediatric | preventive | restorative | periodontal | endodontic | oral_surgery | sedation",
        "description": "Short 1-2 sentence description if the page provides one, else null",
        "details": [
          "Verbatim factual statements the page makes ABOUT this service — symptoms, benefits, reasons, durations, age recommendations, what-to-expect, process steps. ONE fact per entry. e.g. 'Root canal symptoms include toothache, abscess, sensitivity, and discoloration', 'The AAO recommends children have an orthodontic evaluation by age 7', 'Invisalign should be worn 20-22 hours a day', 'Most braces bonding appointments take one to two hours'. Empty array if the page only names the service without detail."
        ],
        "source": "Page path where this service is described (e.g. '/services/invisalign')",
        "confidence": 0.9
      }
    ]
  }
}
```

# Rules

1. **EVERYTHING mentioned as a service/treatment/procedure** — include nav items, page headings, body-text bullet lists, sub-services under a category, AND services listed only on the homepage or about page (e.g. "Infant oral healthcare", "Sedation dentistry", "Athletic mouth-guards", "Early Orthodontic Treatment"). If a service is named ANYWHERE on the site, it MUST appear. Be exhaustive — a missing service is a failure. If the site lists "Crowns", "Bridges", "Veneers", "Inlays/Onlays" as separate items under Restorative, output each one.
2. **Verbatim names** — use the site's exact phrasing. Do not normalize "Invisalign®" to "Invisalign" or split "Crowns and Bridges" into two.
3. **Category** — pick the closest match from the enum. If the page itself labels the category (e.g. "Cosmetic Dentistry > Veneers"), use that.
4. **Source** — the specific page path where this service is described in detail, OR the path where it's listed if no dedicated page exists.
5. **Dedup** — same service mentioned on 3 pages = ONE entry (use the most descriptive source page).
6. **No fabrication** — only services explicitly named. Do not invent "we probably also do X" entries.
6b. **Mine the navigation labels and headings lists** — these enumerate services that may be truncated out of the body text. Every nav/heading item that names a clinical service, treatment, or procedure (e.g. "Infant Oral Healthcare", "Sedation Dentistry", "Athletic Mouth-Guards", "Early Orthodontic Treatment", "Oral Cancer Screening", "Fluoride", "Sealants") MUST appear in the output. Exclude non-service nav items (About, Contact, Patient Forms, Blog, Map).
7. **confidence** — 0.95 for services with dedicated detail pages; 0.8 for mention-only services; 0.6 for ambiguous category mentions.
8. **DETAILS ARE MANDATORY when present** — for every service whose page states factual specifics, populate `details[]` with each fact VERBATIM. These are the most-missed items. Examples of facts that MUST be captured as detail entries:
   - durations: "The Herbst® appliance is worn for about 12 to 15 months", "Positioner appliances are worn for four to eight weeks", "Most bonding appointments take one to two hours"
   - timing/frequency: "Patients visit the orthodontist about every four to eight weeks", "Invisalign patients visit every 6-12 weeks", "Patients see their orthodontist at every appointment"
   - age/eligibility: "Phase One early treatment typically begins around age eight or nine", "The AAO recommends an orthodontic evaluation by age 7"
   - process/tech specs: "The iTero scanner produces a 3D impression in as little as two to three minutes", "Invisalign should be worn 20-22 hours a day"
   - offers: "complimentary orthodontic consultation"
   Read the FULL body of each service/treatment page and extract every such factual statement. A service page with detail facts but empty `details[]` is a failure.

Return ONLY the JSON object.
