/**
 * Unified practice data schema.
 * The merger produces this shape; the injector consumes it.
 */

export const DEFAULT_HOURS = {
  display: [
    { day: 'Mon', time: '9am – 5pm' },
    { day: 'Tue', time: '9am – 5pm' },
    { day: 'Wed', time: '9am – 5pm' },
    { day: 'Thu', time: '9am – 5pm' },
    { day: 'Fri', time: '9am – 5pm' },
    { day: 'Sat', time: 'Closed' },
    { day: 'Sun', time: 'Closed' },
  ],
  schema: ['Mo-Fr 09:00-17:00'],
};

export const DEFAULT_COLORS = {
  primary: '#1B3A5C',
  secondary: '#2E6DA4',
  light: '#EBF2FA',
  accent: '#C9A84C',
  highlight: '#4A8FA0',
};

export function createEmptyPracticeData() {
  return {
    practice: {
      name: null,
      alternateName: null,    // NEW: alternate brand name (often in JSON-LD)
      legalName: null,        // NEW: corporate entity if distinct from brand name
      description: null,      // NEW: practice description (from JSON-LD or meta)
      schemaType: null,       // NEW: schema.org type (Dentist | Orthodontist | DentalPractice)
      domain: null,
      phone: null,
      phoneDigits: null,
      fax: null,              // NEW: fax number (separate from phone)
      email: null,
      googleReviewLink: null,
      googleProfileLink: null,
      patientPortalUrl: null,   // NEW: patient login/portal URL
      priceRange: '$$',
      medicalSpecialty: null,
      tagline: null,          // NEW: brand tagline e.g. "Guiding the Way to..."
      sameAs: [],
    },
    doctor: {
      name: null,
      firstName: null,
      lastName: null,
      credentials: null,
      bio: null,
      education: null,        // legacy string — populated from education[][0]+join for back-compat
      specialties: [],
      photoPath: null,
      // NEW fields below; legacy `doctor` mirror only carries scalar versions
      photoAlt: null,
      sourcePath: null,
      statusNote: null,
      boardCertified: null,
      educationList: [],
      certifications: [],
      organizations: [],
      languages: [],
    },
    additionalDoctors: [],
    // X3: unified doctors[] — rank-ordered, primary first.
    // (Back-compat: `doctor` + `additionalDoctors` are kept in sync by merger.)
    doctors: [],
    // Non-doctor team members (hygienists, assistants, receptionists, office managers)
    staff: [],
    // Navigation tree from the source site, used by injector for the rebuilt nav
    navigation: [],
    address: {
      street: null,
      city: null,
      state: null,
      zip: null,
      country: 'US',
      full: null,
      mapUrl: null,           // NEW: Google Maps short link / place URL
    },
    hours: { ...DEFAULT_HOURS, byDay: null, raw: null, notes: null },
    services: {
      offered: [],
      hubs: [],
    },
    brand: {
      colors: { ...DEFAULT_COLORS },
      fonts: {
        heading: 'Playfair Display',
        body: 'DM Sans',
      },
      logoPath: null,
      affiliations: [],         // NEW: [{ name, logoUrl, url }] — ADA, AAO, Invisalign Diamond, etc.
    },
    // Observed current visual design (vision-based; redesign reads this, never overwrites it)
    currentDesign: null,
    content: {
      heroTagline: null,
      heroHeadline: null,
      heroSubheadline: null,
      ctaText: null,
      ctaSecondaryText: null,
      valueProp: null,
      aboutText: null,
      aboutHeadline: null,
      philosophy: null,
      closingCTA: null,
      testimonials: [],         // [{ text, author, stars, source }]
      faqs: [],                 // [{ question, answer, source, category }]
      generatedFAQs: [],
      stats: {
        yearsExperience: null,
        happyPatients: null,
        googleRating: null,
        fiveStarReviews: null,
      },
      aggregateRating: null,    // NEW: { value, count, source } from JSON-LD or visible rating widget
      insurance: [],            // [string]
      financingOptions: [],     // NEW: ["CareCredit", "In-house payment plan", ...]
      paymentMethods: [],       // NEW: ["Visa", "Mastercard", "HSA", ...]
      patientForms: [],         // NEW: [{ label, url, language }] online/downloadable forms
      areasServed: [],          // NEW: ["Huntington Beach", "Fountain Valley", ...]
      sectionTitles: [],        // NEW: distinctive named section titles ("Smile Designs")
      taglines: [],             // NEW: marketing taglines / promotional claims
      additionalContent: [],    // NEW: per-page rescued content [{ type, title, content, source }]
      generated: null,
    },
    images: {
      // CANONICAL: every image is one normalized record. Single source of truth.
      // [{ src, alt, role, sourcePages:[], personName }] — role ∈ logo|logoFooter|
      //  hero|headshot|team|office|gallery|beforeAfter|treatment|badge|unused
      items: [],
      // Derived role views (projections of items[] — kept for ergonomic access):
      logo: null,
      logoFooter: null,
      hero: [],
      team: [],
      headshots: [],
      office: [],
      gallery: [],
      beforeAfter: [],
      treatments: [],
      badges: [],
    },
    pages: [],                  // NEW: structured page inventory [{ path, title, wordCount, role }]
    migration: {
      oldUrls: [],
      redirectMap: [],
    },
    meta: {
      oldSiteUrl: null,
      scrapedAt: null,
      intakeSource: null,
      clientId: null,
      confidenceFlags: [],
    },
  };
}
