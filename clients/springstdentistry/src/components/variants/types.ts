/**
 * Content interfaces for variant section components.
 *
 * These are the JSON objects AI generates (one per section), separate from
 * the HTML layout which lives in the pre-authored variant .astro files.
 */

export interface HeroContent {
  variant:       'centered' | 'split';
  eyebrow?:      string | null;
  headline:      string;
  subheadline:   string;
  primaryCta:    { label: string; href: string };
  secondaryCta?: { label: string; href: string } | null;
  phone?:        string;
  hasImage?:     boolean;
}

export interface ServicesContent {
  variant:    'card-grid' | 'alternating-rows';
  eyebrow?:   string | null;
  heading:    string;
  subheading?: string | null;
  items:      Array<{ name: string; slug: string; desc: string }>;
  ctaLabel?:  string;
}

export interface DoctorIntroContent {
  variant:     'split-photo' | 'full-width-card';
  eyebrow?:    string | null;
  name:        string;
  credentials: string;
  bio:         string;
  ctaLabel:    string;
  ctaHref:     string;
  hasPortrait: boolean;
}

export interface ReviewsContent {
  variant:          'card-row' | 'pull-quotes';
  eyebrow?:         string | null;
  heading:          string;
  items:            Array<{ quote: string; author: string; rating?: number }>;
  aggregateRating?: number;
  reviewCount?:     number;
  googleUrl?:       string;
}

export interface CtaContent {
  variant:      'centered-banner' | 'split-image';
  headline:     string;
  subheadline:  string;
  primaryCta:   { label: string; href: string };
  phone?:       string;
  hasImage?:    boolean;
}

export interface FaqItem {
  q: string;
  a: string;
  category?: string;
}
export interface FaqContent {
  variant: string;
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  items: FaqItem[];
}
