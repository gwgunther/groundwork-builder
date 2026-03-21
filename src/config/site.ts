// Central source of truth for practice information.
// Replace all [PLACEHOLDER] values with your practice's actual information.

export const site = {
  name: '[PRACTICE_NAME]',
  url: 'https://[DOMAIN]',
  phone: '(555) 123-4567',
  phoneDigits: '5551234567',
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
