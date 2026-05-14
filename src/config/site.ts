// Central source of truth for practice information.
// Replace all [PLACEHOLDER] values with your practice's actual information.

// Real practice phone (used in schema, NAP-consistent for local SEO).
// Never change this when running a Google Ads call-extension forwarding
// number — Google's NAP-verification needs to see your verified number.
const realPhone = '(555) 123-4567';
const realPhoneDigits = '5551234567';

// Display phone — what users see and click in the UI. Defaults to the real
// phone. Override via `PUBLIC_DISPLAY_PHONE` env var to swap in a Google Ads
// call-extension forwarding number for an entire deployment (e.g. staging or
// a campaign-specific subdomain). For per-visitor swapping based on the
// referring ad, install Google's Dynamic Number Insertion snippet — it
// rewrites visible phone numbers on the page at runtime; this env var is
// the static counterpart for deployment-level overrides.
const trackingPhone = import.meta.env.PUBLIC_DISPLAY_PHONE || '';
const trackingDigits = trackingPhone.replace(/\D/g, '');

export const site = {
  name: '[PRACTICE_NAME]',
  url: 'https://[DOMAIN]',
  phone: realPhone,
  phoneDigits: realPhoneDigits,
  displayPhone: trackingPhone || realPhone,
  displayPhoneDigits: trackingDigits || realPhoneDigits,
  email: 'info@[DOMAIN]',
  googleReviewLink: 'https://g.page/r/[YOUR_GOOGLE_REVIEW_ID]/review',
  googleProfileLink: 'https://g.page/r/[YOUR_GOOGLE_PROFILE_ID]',
};

export const doctor = {
  name: 'Dr. [FIRST_NAME] [LAST_NAME]',
  firstName: '[FIRST_NAME]',
  lastName: '[LAST_NAME]',
  credentials: '[CREDENTIALS]', // e.g. 'DDS, MS' or 'DMD'
};

export const doctors = [doctor];

export const address = {
  street: '[STREET_ADDRESS]',
  city: '[CITY]',
  state: '[STATE]',
  zip: '[ZIP]',
  country: 'US',
  full: '[STREET_ADDRESS], [CITY], [STATE] [ZIP]',
};

export const hours = {
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

export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'Dentist',
  'name': site.name,
  'url': site.url,
  'telephone': site.phone,
  'address': {
    '@type': 'PostalAddress',
    'streetAddress': address.street,
    'addressLocality': address.city,
    'addressRegion': address.state,
    'postalCode': address.zip,
    'addressCountry': address.country,
  },
  'openingHours': hours.schema,
  'priceRange': '$$',
  // TODO: Add medicalSpecialty if applicable (e.g. 'Prosthodontics', 'Orthodontics')
  'sameAs': [
    site.googleProfileLink,
    // TODO: Add Yelp, Healthgrades, ZocDoc links
  ],
};

export const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  'name': doctor.name,
  'jobTitle': doctor.credentials,
  'worksFor': { '@type': 'Dentist', 'name': site.name },
};

export const personSchemas = doctors.map((d) => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  'name': d.name,
  'jobTitle': d.credentials,
  'worksFor': { '@type': 'Dentist', 'name': site.name },
}));
