/**
 * Dental authority article rules — blog posts to auto-generate per service hub.
 * Extracted from dental-taxonomy.js + blog-generator.js.
 */

export const AUTHORITY_ARTICLE_RULES = {
  'dental-implants': [
    {
      slug: 'dental-implants-cost-guide',
      title: 'How Much Do Dental Implants Cost in {year}? A Transparent Guide',
      angle: 'cost-transparency',
      keywords: ['dental implant cost', 'how much do dental implants cost', 'implant price'],
    },
    {
      slug: 'dental-implants-vs-dentures',
      title: 'Dental Implants vs. Dentures: Which Is Right for You?',
      angle: 'comparison',
      keywords: ['implants vs dentures', 'dental implants or dentures', 'implant vs denture'],
    },
    {
      slug: 'dental-implant-procedure-what-to-expect',
      title: 'What to Expect During the Dental Implant Procedure',
      angle: 'patient-education',
      keywords: ['dental implant procedure', 'implant surgery', 'what to expect dental implant'],
    },
  ],

  'porcelain-veneers': [
    {
      slug: 'porcelain-veneers-cost-guide',
      title: 'How Much Do Porcelain Veneers Cost in {year}?',
      angle: 'cost-transparency',
      keywords: ['veneer cost', 'porcelain veneer price', 'how much do veneers cost'],
    },
    {
      slug: 'veneers-vs-crowns',
      title: 'Veneers vs. Crowns: Understanding the Difference',
      angle: 'comparison',
      keywords: ['veneers vs crowns', 'veneer or crown', 'difference veneers crowns'],
    },
    {
      slug: 'are-porcelain-veneers-worth-it',
      title: 'Are Porcelain Veneers Worth It? Pros, Cons & What to Know',
      angle: 'patient-education',
      keywords: ['are veneers worth it', 'porcelain veneers pros cons', 'veneer pros and cons'],
    },
  ],

  'invisalign-clear-aligners': [
    {
      slug: 'invisalign-cost-guide',
      title: 'How Much Does Invisalign Cost in {year}? What Your Dentist Might Not Tell You',
      angle: 'cost-transparency',
      keywords: ['invisalign cost', 'how much is invisalign', 'clear aligner cost'],
    },
    {
      slug: 'invisalign-vs-braces',
      title: 'Invisalign vs. Braces: A Dentist\'s Honest Comparison',
      angle: 'comparison',
      keywords: ['invisalign vs braces', 'clear aligners vs braces', 'invisalign or braces'],
    },
    {
      slug: 'invisalign-what-to-expect',
      title: 'Getting Invisalign: Timeline, Tips & What to Expect',
      angle: 'patient-education',
      keywords: ['invisalign what to expect', 'invisalign timeline', 'how long invisalign'],
    },
  ],

  'cosmetic-dentistry': [
    {
      slug: 'smile-makeover-options',
      title: 'Smile Makeover: Your Complete Guide to Cosmetic Dentistry Options',
      angle: 'patient-education',
      keywords: ['smile makeover', 'cosmetic dentistry options', 'smile transformation'],
    },
    {
      slug: 'cosmetic-dentistry-cost-guide',
      title: 'Cosmetic Dentistry Costs: What to Budget for Your New Smile',
      angle: 'cost-transparency',
      keywords: ['cosmetic dentistry cost', 'cosmetic dental price', 'smile makeover cost'],
    },
  ],

  'general-dentistry': [
    {
      slug: 'dental-cleaning-what-to-expect',
      title: 'What Happens During a Dental Cleaning? A Step-by-Step Guide',
      angle: 'patient-education',
      keywords: ['dental cleaning', 'teeth cleaning', 'what happens dental cleaning'],
    },
    {
      slug: 'how-often-should-you-visit-the-dentist',
      title: 'How Often Should You Really Visit the Dentist?',
      angle: 'patient-education',
      keywords: ['how often visit dentist', 'dental checkup frequency', 'dental visit schedule'],
    },
    {
      slug: 'cavity-prevention-tips',
      title: 'Cavity Prevention: 7 Evidence-Based Tips from Your Dentist',
      angle: 'patient-education',
      keywords: ['cavity prevention', 'prevent cavities', 'stop tooth decay'],
    },
  ],

  'dentures': [
    {
      slug: 'dentures-cost-guide',
      title: 'How Much Do Dentures Cost in {year}? Full Breakdown',
      angle: 'cost-transparency',
      keywords: ['denture cost', 'how much do dentures cost', 'denture price'],
    },
    {
      slug: 'types-of-dentures',
      title: 'Types of Dentures: Full, Partial, Snap-On & Implant-Supported',
      angle: 'patient-education',
      keywords: ['types of dentures', 'denture options', 'partial vs full dentures'],
    },
    {
      slug: 'adjusting-to-new-dentures',
      title: 'Adjusting to New Dentures: Tips for the First 30 Days',
      angle: 'patient-education',
      keywords: ['new dentures', 'adjusting to dentures', 'getting used to dentures'],
    },
  ],

  'all-on-4-dental-implants': [
    {
      slug: 'all-on-4-cost-guide',
      title: 'All-on-4 Dental Implants Cost in {year}: Is It Worth the Investment?',
      angle: 'cost-transparency',
      keywords: ['all on 4 cost', 'all-on-4 price', 'full arch implant cost'],
    },
    {
      slug: 'all-on-4-vs-dentures',
      title: 'All-on-4 vs. Traditional Dentures: A Complete Comparison',
      angle: 'comparison',
      keywords: ['all on 4 vs dentures', 'all-on-4 or dentures', 'fixed vs removable teeth'],
    },
  ],

  'emergency-dentistry': [
    {
      slug: 'dental-emergency-guide',
      title: 'Dental Emergency? Here\'s What to Do Before You Reach the Dentist',
      angle: 'patient-education',
      keywords: ['dental emergency', 'tooth emergency', 'what to do dental emergency'],
    },
    {
      slug: 'knocked-out-tooth-guide',
      title: 'Knocked-Out Tooth: A Step-by-Step Guide to Saving Your Tooth',
      angle: 'patient-education',
      keywords: ['knocked out tooth', 'avulsed tooth', 'tooth knocked out what to do'],
    },
  ],

  'periodontics': [
    {
      slug: 'gum-disease-signs-treatment',
      title: 'Gum Disease: Signs, Stages & Treatment Options',
      angle: 'patient-education',
      keywords: ['gum disease', 'periodontal disease', 'gingivitis treatment'],
    },
    {
      slug: 'deep-cleaning-vs-regular-cleaning',
      title: 'Deep Cleaning vs. Regular Cleaning: What\'s the Difference?',
      angle: 'comparison',
      keywords: ['deep cleaning teeth', 'scaling and root planing', 'deep cleaning vs regular'],
    },
  ],

  'root-canal-therapy': [
    {
      slug: 'root-canal-what-to-expect',
      title: 'Root Canal Treatment: What to Expect (It\'s Not as Bad as You Think)',
      angle: 'patient-education',
      keywords: ['root canal', 'root canal what to expect', 'root canal procedure'],
    },
    {
      slug: 'root-canal-cost-guide',
      title: 'How Much Does a Root Canal Cost in {year}?',
      angle: 'cost-transparency',
      keywords: ['root canal cost', 'root canal price', 'how much root canal'],
    },
  ],

  'tmj-tmd-treatment': [
    {
      slug: 'tmj-symptoms-treatment',
      title: 'TMJ/TMD: Symptoms, Causes & Treatment Options',
      angle: 'patient-education',
      keywords: ['tmj symptoms', 'tmd treatment', 'jaw pain treatment'],
    },
  ],
};

/**
 * Map hub/service slugs to valid Zod category enum values from content/config.ts.
 * Values: general-dentistry, cosmetic, implants, restorative, oral-health
 */
export const CATEGORY_MAP = {
  'general-dentistry': 'general-dentistry',
  'cosmetic-dentistry': 'cosmetic',
  'dental-implants': 'implants',
  'all-on-4-dental-implants': 'implants',
  'restorative-dentistry': 'restorative',
  'porcelain-veneers': 'cosmetic',
  'teeth-whitening': 'cosmetic',
  'invisalign-clear-aligners': 'cosmetic',
  'dental-crowns': 'restorative',
  'dental-bridges': 'restorative',
  'dentures': 'restorative',
  'root-canal-therapy': 'restorative',
  'emergency-dentistry': 'general-dentistry',
  'bone-grafting': 'implants',
  'oral-surgery': 'restorative',
  'periodontics': 'oral-health',
  'tmj-tmd-treatment': 'oral-health',
  'sedation-dentistry': 'general-dentistry',
  'pediatric-dentistry': 'general-dentistry',
};

/**
 * Derive a category string for the article based on which hub it belongs to.
 * Maps to valid Zod enum values: general-dentistry, cosmetic, implants, restorative, oral-health
 */
export function deriveCategory(article) {
  for (const [hubSlug, rules] of Object.entries(AUTHORITY_ARTICLE_RULES)) {
    if (rules.some((r) => r.slug === article.slug)) {
      return CATEGORY_MAP[hubSlug] || 'general-dentistry';
    }
  }
  return 'general-dentistry';
}
