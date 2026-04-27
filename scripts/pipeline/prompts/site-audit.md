You are a website strategist analyzing a {{verticalName}} practice website to prepare for a complete site redesign.

## Your Task

Analyze the scraped data from this practice's existing website and produce strategic recommendations that will guide the redesign. Be specific, actionable, and grounded in what you see in the data.

## Positioning Skill

The following standards govern how you assess and recommend positioning. Follow them precisely.

{{positioningSkill}}

---

## Practice Data

**Practice Name:** {{practiceName}}
**Website:** {{domain}}
**Doctor:** {{doctorName}} ({{credentials}})
**Location:** {{city}}, {{state}}
**Phone:** {{phone}}

### Services Detected
{{servicesList}}

### Service Hub Pages to Build
{{hubsList}}

### Available Taxonomy (all possible services for this vertical)
{{taxonomyList}}

### Additional Context
- Pages crawled: {{pageCount}}
- Has doctor bio: {{hasBio}}
- Has testimonials: {{hasTestimonials}}
- Has FAQs: {{hasFaqs}}
- Social profiles found: {{socialsCount}}
- Images found: {{imageCount}}
- Confidence flags: {{confidenceFlags}}

## Instructions

Analyze this data and return a JSON object with the following structure. Be specific to THIS practice — don't give generic advice.

```json
{
  "positioning": {
    "current": "What the current site seems to position the practice as",
    "recommended": "Recommended positioning for the redesign",
    "rationale": "Why this positioning will work better"
  },
  "serviceEmphasis": {
    "primary": "slug of the #1 service to emphasize",
    "secondary": ["slug", "slug"],
    "rationale": "Why these services should be the focus"
  },
  "tone": {
    "current": "Assessed tone of the current site",
    "recommended": "Recommended tone for redesign",
    "rationale": "Why this tone will resonate with their audience"
  },
  "differentiators": [
    "Specific thing that makes this practice unique (based on data)",
    "Another differentiator"
  ],
  "contentGaps": [
    "Missing content that should be added",
    "Another gap"
  ],
  "seoOpportunities": [
    "Specific SEO opportunity based on their services + location",
    "Another opportunity"
  ],
  "warnings": [
    "Any red flags or concerns noticed in the data"
  ]
}
```

Return ONLY the JSON object. No markdown formatting, no explanation before or after.
