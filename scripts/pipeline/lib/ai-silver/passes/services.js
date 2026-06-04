/**
 * Pass: services — every service / treatment / procedure mentioned on the site.
 */

import { loadPrompt, fillTemplate, runPassCall, renderPagesAsContext, pagesMatching, MODELS } from '../shared.js';

export const name = 'services';

const PATTERNS = [
  /\/services?/i, /\/treatments?/i, /\/procedures?/i, /\/our[-_]?services?/i,
  /\/(braces|invisalign|orthodont|implant|cosmetic|whitening|crown|bridge|veneer|extraction|root[-_]?canal|periodont|emergency|sedation|cleaning|exam|filling|sealant|pediatric|specialty)/i,
  // Treatment-detail page patterns (these carry the per-service detail facts:
  // durations, age recommendations, process steps)
  /\/(itero|digital[-_]?x|x[-_]?ray|appliance|retainer|expander|herbst|positioner|aligner|spacer|headgear|mouth[-_]?guard|night[-_]?guard|denture|bonding|onlay|inlay|fluoride|3d[-_]?imaging|scanner|impression|early[-_]|phase[-_]|adult[-_]|teen|interceptive|life[-_]?with[-_]?braces)/i,
];

// Nav-section labels that indicate the section's child links are service/treatment pages
const SERVICE_SECTION = /(service|treatment|braces|smile|orthodont|procedure|what[-_ ]we[-_ ]do|dentistr)/i;

// "Practice approach / process" pages that carry treatment-detail facts (visit
// frequency, appointment specifics, what-sets-us-apart claims) even though they
// aren't service pages per se.
const APPROACH_PATTERNS = [
  /what[-_]?sets[-_]?us[-_]?apart/i, /office[-_]?visits?/i, /first[-_]?visit/i,
  /\/(retention|retainer)/i, /life[-_]?with[-_]?braces/i, /why[-_]?(choose|us)/i,
  /our[-_]?(approach|process|difference)/i, /patient[-_]?experience/i,
];

export function selectPages(bronze) {
  const set = new Set(pagesMatching(bronze.pages, PATTERNS));
  const home = bronze.pages.find(p => p.path === '/' || p.path === '');
  const about = bronze.pages.find(p => /\/about/.test(p.path));
  if (home) set.add(home);
  if (about) set.add(about);

  // Pull in every page that is a CHILD link under a service/treatment nav section
  // (the nav tree gives us the dropdown hierarchy).
  const tree = bronze.siteAssets?.navigationTree || [];
  const childPaths = new Set();
  for (const section of tree) {
    if (SERVICE_SECTION.test(section.text || '')) {
      for (const child of (section.children || [])) {
        if (child.href) childPaths.add(child.href.replace(/\/$/, ''));
      }
    }
  }
  for (const p of bronze.pages) {
    if (childPaths.has(p.path.replace(/\/$/, ''))) set.add(p);
  }
  // Practice-approach pages (carry treatment-detail facts)
  for (const p of bronze.pages) {
    if (APPROACH_PATTERNS.some(re => re.test(p.path))) set.add(p);
  }
  return Array.from(set);
}

export async function run({ bronze, pages }) {
  if (pages.length === 0) return { services: { offered: [] } };
  // Build a flat service-candidate list from navigation labels + all page
  // titles/H1s/H2s — these are the most reliable enumeration of what the
  // practice offers, and survive body-text truncation.
  const navLabels = [];
  const walkNav = (items) => {
    for (const n of (items || [])) {
      if (n.text) navLabels.push(n.text);
      if (Array.isArray(n.children)) walkNav(n.children);
    }
  };
  walkNav(bronze.siteAssets?.navigation || []);
  const headingCandidates = [];
  for (const p of bronze.pages) {
    for (const h of (p.headings || [])) {
      if ((h.level === 1 || h.level === 2 || h.level === 3) && h.text) headingCandidates.push(h.text);
    }
  }

  const tmpl = await loadPrompt('services');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    pageContext: renderPagesAsContext(pages, { bodyChars: 9000, paragraphs: 40, images: 15 }),
    navList: JSON.stringify(navLabels, null, 2),
    headingCandidates: JSON.stringify([...new Set(headingCandidates)].slice(0, 120), null, 2),
    allPaths: JSON.stringify((bronze.siteAssets?.allUrls || []).map(u => { try { return new URL(u).pathname; } catch { return u; } }).slice(0, 80), null, 2),
  });
  const { slice } = await runPassCall({ name, model: MODELS.default, prompt, maxTokens: 8000, rootArrayKey: 'offered' });
  // Normalize wrapping: model may return either { services: { offered: [] } } or { offered: [] }
  if (slice.offered && !slice.services) return { services: { offered: slice.offered } };
  return slice;
}
