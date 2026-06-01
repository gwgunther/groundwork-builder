/**
 * Dental service taxonomy — canonical names, slugs, categories, and aliases.
 * Used by the scraper and merger for fuzzy matching detected services.
 */

export const SERVICES = [
  {
    canonical: 'General Dentistry',
    slug: 'general-dentistry',
    category: 'general',
    aliases: [
      'general dentistry', 'general dental', 'cleanings', 'dental cleaning',
      'teeth cleaning', 'exams', 'dental exam', 'checkup', 'check-up',
      'dental check up', 'fillings', 'dental filling', 'composite filling',
      'tooth-colored filling', 'preventive', 'preventive dentistry',
      'preventive care', 'fluoride', 'fluoride treatment', 'sealants',
      'dental sealants', 'oral health', 'routine dentistry', 'family dentistry',
      'family dental', 'comprehensive exam',
    ],
  },
  {
    canonical: 'Cosmetic Dentistry',
    slug: 'cosmetic-dentistry',
    category: 'cosmetic',
    aliases: [
      'cosmetic dentistry', 'cosmetic dental', 'cosmetic', 'smile makeover',
      'smile design', 'aesthetic dentistry', 'aesthetic', 'esthetic',
      'smile transformation', 'smile enhancement',
    ],
  },
  {
    canonical: 'Dental Implants',
    slug: 'dental-implants',
    category: 'restorative',
    aliases: [
      'dental implants', 'dental implant', 'implant', 'implants',
      'single tooth implant', 'implant placement', 'tooth implant',
      'implant dentistry', 'tooth replacement', 'implant restoration',
      'implant-supported', 'mini implants', 'mini dental implants',
    ],
  },
  {
    canonical: 'All-on-4 Dental Implants',
    slug: 'all-on-4-dental-implants',
    category: 'restorative',
    aliases: [
      'all-on-4', 'all on 4', 'all on four', 'all-on-four',
      'teeth in a day', 'teeth-in-a-day', 'all-on-x', 'all on x',
      'all-on-6', 'all on 6', 'all on six', 'all-on-six',
      'full arch implants', 'full-arch', 'full arch dental implants',
      'full mouth implants', 'full mouth dental implants',
      'implant-supported dentures', 'fixed implant denture',
      'hybrid denture', 'zirconia bridge',
    ],
  },
  {
    canonical: 'Porcelain Veneers',
    slug: 'porcelain-veneers',
    category: 'cosmetic',
    aliases: [
      'porcelain veneers', 'veneers', 'veneer', 'dental veneer',
      'dental veneers', 'porcelain veneer', 'composite veneers',
      'composite veneer', 'no-prep veneers', 'prepless veneers',
      'lumineers', 'emax veneers',
    ],
  },
  {
    canonical: 'Teeth Whitening',
    slug: 'teeth-whitening',
    category: 'cosmetic',
    aliases: [
      'teeth whitening', 'tooth whitening', 'whitening', 'bleaching',
      'dental bleaching', 'zoom whitening', 'zoom', 'in-office whitening',
      'professional whitening', 'take-home whitening', 'kor whitening',
      'opalescence', 'bright smile',
    ],
  },
  {
    canonical: 'Invisalign / Clear Aligners',
    slug: 'invisalign-clear-aligners',
    category: 'orthodontic',
    aliases: [
      'invisalign', 'clear aligners', 'clear aligner', 'invisible braces',
      'invisible aligners', 'orthodontics', 'orthodontic', 'braces',
      'suresmile', 'clear correct', 'clearcorrect', 'spark aligners',
      'teeth straightening', 'straight teeth', 'adult orthodontics',
    ],
  },
  {
    canonical: 'Dental Crowns',
    slug: 'dental-crowns',
    category: 'restorative',
    aliases: [
      'dental crowns', 'dental crown', 'crown', 'crowns',
      'porcelain crown', 'porcelain crowns', 'ceramic crown',
      'same-day crown', 'cerec crown', 'cerec', 'e.max crown',
      'zirconia crown', 'tooth cap', 'dental cap',
    ],
  },
  {
    canonical: 'Dental Bridges',
    slug: 'dental-bridges',
    category: 'restorative',
    aliases: [
      'dental bridges', 'dental bridge', 'bridge', 'bridges',
      'fixed bridge', 'fixed dental bridge', 'porcelain bridge',
      'implant-supported bridge', 'maryland bridge', 'cantilever bridge',
      'crowns and bridges', 'crowns & bridges',
    ],
  },
  {
    canonical: 'Dentures',
    slug: 'dentures',
    category: 'restorative',
    aliases: [
      'dentures', 'denture', 'partial denture', 'partial dentures',
      'full denture', 'full dentures', 'complete dentures',
      'snap-on denture', 'snap on denture', 'snap-in denture',
      'implant denture', 'implant dentures', 'removable denture',
      'flexible denture', 'flexible partial', 'acrylic denture',
      'immediate denture',
    ],
  },
  {
    canonical: 'Root Canal Therapy',
    slug: 'root-canal-therapy',
    category: 'restorative',
    aliases: [
      'root canal', 'root canal therapy', 'root canal treatment',
      'endodontic', 'endodontics', 'endodontic therapy',
      'root canal specialist', 'retreatment', 'apicoectomy',
    ],
  },
  {
    canonical: 'Emergency Dentistry',
    slug: 'emergency-dentistry',
    category: 'general',
    aliases: [
      'emergency dentistry', 'emergency dental', 'emergency',
      'urgent dental', 'urgent dental care', 'same day',
      'same-day dental', 'toothache', 'tooth ache', 'dental emergency',
      'broken tooth', 'chipped tooth', 'knocked out tooth',
      'dental pain', 'walk-in dental', 'after hours dental',
    ],
  },
  {
    canonical: 'Bone Grafting',
    slug: 'bone-grafting',
    category: 'surgical',
    aliases: [
      'bone grafting', 'bone graft', 'bone grafts', 'sinus lift',
      'sinus augmentation', 'ridge augmentation', 'ridge preservation',
      'socket preservation', 'socket graft', 'block graft',
      'guided bone regeneration', 'gbr', 'prp', 'prf',
    ],
  },
  {
    canonical: 'Restorative Dentistry',
    slug: 'restorative-dentistry',
    category: 'restorative',
    aliases: [
      'restorative dentistry', 'restorative', 'dental restoration',
      'reconstruction', 'full mouth reconstruction',
      'full mouth rehabilitation', 'smile reconstruction',
      'tooth restoration', 'tooth repair',
    ],
  },
  {
    canonical: 'Oral Surgery',
    slug: 'oral-surgery',
    category: 'surgical',
    aliases: [
      'oral surgery', 'oral surgeon', 'extraction', 'extractions',
      'tooth extraction', 'wisdom teeth', 'wisdom tooth',
      'wisdom teeth removal', 'surgical extraction', 'impacted tooth',
      'impacted wisdom teeth', 'third molar',
    ],
  },
  {
    canonical: 'Pediatric Dentistry',
    slug: 'pediatric-dentistry',
    category: 'general',
    aliases: [
      'pediatric dentistry', 'pediatric dental', 'pediatric',
      'children', 'kids dental', 'kids dentistry', 'childrens dentistry',
      "children's dentistry", 'child dental', 'baby teeth',
      'kids teeth', 'adolescent dentistry', 'infant dental',
    ],
  },
  {
    canonical: 'Periodontics',
    slug: 'periodontics',
    category: 'general',
    aliases: [
      'periodontics', 'periodontal', 'gum disease', 'gum treatment',
      'deep cleaning', 'scaling', 'scaling and root planing',
      'root planing', 'gum surgery', 'gum graft', 'gum grafting',
      'laser gum treatment', 'lanap', 'periodontist',
      'periodontal disease', 'gingivitis', 'pocket reduction',
    ],
  },
  {
    canonical: 'TMJ / TMD Treatment',
    slug: 'tmj-tmd-treatment',
    category: 'general',
    aliases: [
      'tmj', 'tmd', 'tmj treatment', 'tmd treatment',
      'jaw pain', 'bite therapy', 'tmj disorder',
      'temporomandibular', 'temporomandibular joint',
      'jaw joint', 'jaw disorder', 'bite adjustment',
      'occlusal adjustment', 'night guard', 'mouth guard',
      'bruxism', 'teeth grinding', 'jaw clicking',
    ],
  },
  {
    canonical: 'Sedation Dentistry',
    slug: 'sedation-dentistry',
    category: 'general',
    aliases: [
      'sedation dentistry', 'sedation', 'dental sedation',
      'iv sedation', 'oral sedation', 'nitrous oxide',
      'laughing gas', 'sleep dentistry', 'dental anxiety',
      'anxious patients', 'conscious sedation',
    ],
  },
  {
    canonical: 'Dental Technology',
    slug: 'dental-technology',
    category: 'general',
    aliases: [
      'dental technology', 'technology', '3d imaging', 'cbct',
      'cone beam', 'digital x-rays', 'digital x-ray',
      'intraoral scanner', 'itero', 'digital impressions',
      'cad/cam', 'laser dentistry', 'dental laser',
      '3d printing', 'guided surgery',
    ],
  },
];

/**
 * Match input text (or a URL slug) against the dental taxonomy.
 * Returns the best matching service entry, or null.
 */
export function matchServiceTaxonomy(text, urlSlug) {
  if (!text && !urlSlug) return null;

  const normalised = (text || '').toLowerCase().trim();
  const normSlug = (urlSlug || '').toLowerCase().replace(/^\/+|\/+$/g, '').replace(/\//g, ' ').replace(/-/g, ' ').trim();

  // First pass: exact alias match on text
  for (const svc of SERVICES) {
    for (const alias of svc.aliases) {
      if (normalised === alias || normalised.includes(alias)) {
        return { canonical: svc.canonical, slug: svc.slug, category: svc.category };
      }
    }
  }

  // Second pass: match on URL slug
  if (normSlug) {
    for (const svc of SERVICES) {
      const canonSlug = svc.slug.replace(/-/g, ' ');
      if (normSlug === canonSlug || normSlug.includes(canonSlug)) {
        return { canonical: svc.canonical, slug: svc.slug, category: svc.category };
      }
      for (const alias of svc.aliases) {
        if (normSlug === alias || normSlug.includes(alias)) {
          return { canonical: svc.canonical, slug: svc.slug, category: svc.category };
        }
      }
    }
  }

  // Third pass: partial word-overlap scoring (at least 2 matching words)
  const words = normalised.split(/\s+/);
  let bestMatch = null;
  let bestScore = 0;

  for (const svc of SERVICES) {
    for (const alias of svc.aliases) {
      const aliasWords = alias.split(/\s+/);
      let overlap = 0;
      for (const w of words) {
        if (w.length >= 3 && aliasWords.includes(w)) overlap++;
      }
      if (overlap >= 2 && overlap > bestScore) {
        bestScore = overlap;
        bestMatch = { canonical: svc.canonical, slug: svc.slug, category: svc.category };
      }
    }
  }

  return bestMatch;
}
