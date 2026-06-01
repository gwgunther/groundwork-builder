You are analyzing raw crawled data from a dental practice website.
Your job: extract structured practice information and return it as JSON.

{{siteData}}

---
Extract the following as a single JSON object. Use null for any field you cannot determine with confidence.

{
  "practice": {
    "name": "Full legal practice name (e.g. 'Spring St. Dentistry', not truncated)",
    "phone": "Phone in (XXX) XXX-XXXX format",
    "email": "Email address or null",
    "domain": "Domain without protocol",
    "googleReviewLink": "URL to leave a Google review, or null",
    "googleProfileLink": "URL of Google Business Profile, or null",
    "sameAs": ["Social/directory profile URLs"]
  },
  "address": {
    "street": "Street address",
    "city": "City",
    "state": "2-letter state",
    "zip": "ZIP code"
  },
  "hours": {
    "display": [{ "day": "Mon", "time": "9am – 5pm" }],
    "raw": "Raw hours text as found on site"
  },
  "doctors": [
    {
      "name": "Full name with Dr. prefix",
      "firstName": "First name only",
      "lastName": "Last name only",
      "credentials": "e.g. DMD, DDS",
      "bio": "Full bio paragraph(s) — do not truncate. NULL if no actual doctor bio exists. Do NOT use the practice mission/about copy as a doctor bio.",
      "education": "Education/training details or null",
      "specialties": ["List of specialties or focus areas"],
      "photoUrl": "URL of doctor headshot photo or null",
      "rank": 1
    }
  ],
  "staff": [
    {
      "name": "Full name (no Dr. prefix — these are non-doctor team members)",
      "role": "hygienist | assistant | receptionist | office_manager | other",
      "bio": "Short bio if present, else null",
      "credentials": "e.g. RDH, CDA — or null",
      "photoUrl": "URL of staff headshot or null"
    }
  ],
  "navigation": [
    {
      "text": "Visible nav label",
      "href": "Path or URL as it appears in the source nav",
      "children": [
        { "text": "Sub-item label", "href": "/sub-item" }
      ]
    }
  ],
  "services": {
    "offered": [
      {
        "name": "Human-readable service name",
        "category": "general|cosmetic|orthodontic|emergency|specialty|implant|pediatric"
      }
    ]
  },
  "brand": {
    "colors": {
      "primary": "The dominant non-white, non-black brand color hex (e.g. a teal or navy)",
      "secondary": "Second most prominent brand color hex",
      "accent": "Accent color hex or null"
    },
    "logoUrl": "URL of the practice logo image"
  },
  "content": {
    "heroTagline": "The main hero/banner headline (short, punchy — e.g. 'Creating the Perfect Smile for Your Family')",
    "heroSubheadline": "Supporting hero subtext or null",
    "aboutText": "Full about-us / practice philosophy paragraph(s)",
    "testimonials": [
      { "text": "Review text", "author": "Name or null", "stars": 5 }
    ],
    "faqs": [
      { "question": "Q", "answer": "A" }
    ],
    "insurance": ["List of accepted insurance plans"],
    "specials": [
      { "title": "Special offer title", "description": "Description" }
    ],
    "stats": {
      "yearsExperience": null,
      "googleRating": null,
      "fiveStarReviews": null
    }
  },
  "images": {
    "logo": "URL of logo image",
    "hero": ["URLs of hero/banner background images"],
    "team": ["URLs of doctor/staff headshot photos"],
    "office": ["URLs of office/facility interior photos"],
    "gallery": ["URLs of service category or treatment images"],
    "beforeAfter": ["URLs of before/after smile transformation photos"]
  },
  "migration": {
    "oldUrls": ["All crawled page paths, one per entry"]
  }
}

Rules:
- practice.name: use the FULL name as it appears in the footer or logo alt text, not truncated
- brand.colors.primary: must NOT be white (#fff, #ffffff, #f*) or near-black (#000, #111, #222, #333). Pick the actual brand color.
- images: classify based on URL path patterns AND alt text. /client/images/dr-* → team. /home-slider/* → hero. /dental-services/* → gallery. Before/after → beforeAfter.
- hours: parse whatever format appears (e.g. "Monday-Thursday 9:00AM-6:00PM" → display: [{day:"Mon–Thu", time:"9:00AM–6:00PM"}])
- services: extract everything mentioned as a service, treatment, or procedure across all pages
- doctors: array of ALL doctors at the practice, ordered by prominence. Rank 1 = primary/featured (founder, "Dr. X" in branding, first to appear). Use null for bio when no actual doctor bio exists — DO NOT substitute the practice's mission/about/philosophy text for a missing doctor bio.
- staff: array of non-doctor team members (hygienists, dental assistants, receptionists, office managers) found on team/staff pages. Empty array if none found.
- navigation: copy the primary site navigation as a tree. Top-level items become `text`+`href`; nested dropdown items go in `children`. Preserve the source order. Exclude patient-login portals.
- If JSON-LD structured data exists, prefer it for NAP (name, address, phone), hours, and doctor info
- Return ONLY the JSON object. No markdown. No explanation.
