/**
 * Deterministic affiliation/partner-logo resolver.
 *
 * Dental practices display a standard set of association / certification /
 * partner-brand logos (ADA, AAO, Invisalign, iTero, etc.). These have canonical
 * names that are far more reliably mapped by a dictionary than by an LLM reading
 * often-empty alt text. This resolver:
 *   - matches badge images (by filename fragment OR alt text) to canonical names
 *   - EXCLUDES UI-chrome icons that get mis-bucketed as badges
 */

// fragment (lowercase, matched against filename + alt) → canonical org name
const ORG_MAP = [
  [/\bada\b|american-?dental-?assoc/,            'American Dental Association'],
  [/\baao\b|assoc.*orthodont|american-?assoc/,   'American Association of Orthodontists'],
  [/\baapd\b|pediatric-?dent.*acad|acad.*pediatric/, 'American Academy of Pediatric Dentistry'],
  [/\babo\b|board-?of-?orthodont/,               'American Board of Orthodontics'],
  [/\bcda\b|california-?dental/,                  'California Dental Association'],
  [/\bagd\b|general-?dent.*acad/,                 'Academy of General Dentistry'],
  [/\bicd\b|college-?of-?dent/,                   'International College of Dentists'],
  [/\bitero\b/,                                   'iTero'],
  [/invisalign-?diamond|diamond-?(provider|invis)/, 'Invisalign Diamond Provider'],
  [/invisalign-?teen/,                            'Invisalign Teen'],
  [/invis(align)?\b|invis\b/,                     'Invisalign'],
  [/iqair|clean-?air/,                            'IQAir Clean Air Facility'],
  [/inbrace/,                                     'InBrace'],
  [/lightforce|lf-?logo/,                         'LightForce'],
  [/\bdamon\b/,                                   'Damon System'],
  [/\bspark\b.*align|spark-?logo/,                'Spark Aligners'],
  [/carecredit/,                                  'CareCredit'],
  [/sunbit/,                                      'Sunbit'],
  [/lendingclub|lending-?club/,                   'LendingClub'],
  [/harbor-?dental/,                              'Harbor Dental Society'],
  [/seal-?of-?accept/,                            'ADA Seal of Acceptance'],
  [/\bgreater?-?long-?beach|tri-?county/,         'Local Dental Society'],
];

// filename fragments that indicate UI chrome, never an affiliation
const ICON_EXCLUDE = /(marker|clock|scroll-?logo|arrow|chevron|caret|sprite|spacer|pixel|hamburger|menu-?icon|search-?icon|close|map-?pin|location-?icon|phone-?icon|email-?icon|envelope|star-?icon|quote|hours|calendar|nav-?|btn-?|button|bg-?|background|divider|shape|blob|wave|dots?-?pattern)/i;

function canonicalName(src, alt) {
  const hay = `${(alt || '').toLowerCase()} ${(src || '').toLowerCase()}`;
  for (const [re, name] of ORG_MAP) {
    if (re.test(hay)) return name;
  }
  return null;
}

function isIcon(src, alt) {
  const fname = (src || '').split('/').pop() || '';
  if (ICON_EXCLUDE.test(fname)) return true;
  // very generic alt with no org match and a tiny utility-ish filename
  return false;
}

/**
 * Resolve badge images → affiliations[]. Returns [{ name, logoUrl, url }].
 * `badges` items may be url-strings or { src, alt, personName } objects.
 */
export function resolveAffiliations(badges, existing = []) {
  const out = [];
  const seen = new Set();

  // Seed with any LLM-provided affiliations that already have a real name
  for (const a of (existing || [])) {
    if (a && a.name) {
      const key = a.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ name: a.name, logoUrl: a.logoUrl || null, url: a.url || null }); }
    }
  }

  for (const b of (badges || [])) {
    const src = typeof b === 'string' ? b : b?.src;
    const alt = typeof b === 'object' ? (b?.alt || b?.personName) : null;
    if (!src) continue;
    if (isIcon(src, alt)) continue;
    const name = canonicalName(src, alt) || (alt && alt.length > 1 && alt.length < 60 ? alt : null);
    if (!name) continue; // unidentifiable badge — skip rather than emit a null-name entry
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, logoUrl: src, url: null });
  }
  return out;
}

/** Filter a badges image bucket to drop UI-chrome icons. */
export function cleanBadgeBucket(badges) {
  return (badges || []).filter(b => {
    const src = typeof b === 'string' ? b : b?.src;
    const alt = typeof b === 'object' ? (b?.alt || b?.personName) : null;
    return src && !isIcon(src, alt);
  });
}
