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
      domain: null,
      phone: null,
      phoneDigits: null,
      email: null,
      googleReviewLink: null,
      googleProfileLink: null,
      priceRange: '$$',
      medicalSpecialty: null,
      sameAs: [],
    },
    doctor: {
      name: null,
      firstName: null,
      lastName: null,
      credentials: null,
      bio: null,
      education: null,
      specialties: [],
      photoPath: null,
    },
    additionalDoctors: [],
    address: {
      street: null,
      city: null,
      state: null,
      zip: null,
      country: 'US',
      full: null,
    },
    hours: { ...DEFAULT_HOURS },
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
    },
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
      testimonials: [],
      faqs: [],
      generatedFAQs: [],
      stats: {
        yearsExperience: null,
        happyPatients: null,
        googleRating: null,
        fiveStarReviews: null,
      },
      insurance: [],
      generated: null,  // AI-generated content map (set by ai-content.js)
    },
    images: {
      logo: null,
      team: [],
      office: [],
      gallery: [],
    },
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
