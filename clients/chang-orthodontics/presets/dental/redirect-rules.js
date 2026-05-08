/**
 * Dental redirect rules — map old URL paths to new page paths.
 * Used by the merger to build the redirect map from crawled URLs.
 */

export const REDIRECT_RULES = [
  { pattern: /about|team|doctor|staff/i,                    target: '/about' },
  { pattern: /contact/i,                                    target: '/schedule' },
  { pattern: /implant/i,                                    target: '/services/dental-implants' },
  { pattern: /cosmetic|veneer|whiten/i,                     target: '/services/cosmetic-dentistry' },
  { pattern: /general|cleaning|exam|hygiene/i,              target: '/services/general-dentistry' },
  { pattern: /crown|bridge|denture|restor/i,                target: '/services/restorative-dentistry' },
  { pattern: /blog|article|news|post/i,                     target: '/blog' },
  { pattern: /faq|question/i,                               target: '/faq' },
  { pattern: /financ|insurance|payment/i,                   target: '/financing' },
  { pattern: /gallery|photo|before.?after/i,                target: '/gallery' },
  { pattern: /schedule|appointment|book/i,                  target: '/schedule' },
  { pattern: /service/i,                                    target: '/services' },
];
