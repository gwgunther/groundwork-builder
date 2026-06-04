/**
 * Pass: images — bucket every image found in bronze into:
 *   logo, logoFooter, hero, team (staff), headshots (doctors), office,
 *   gallery, beforeAfter, treatments, badges (affiliations/partner logos).
 *
 * ARCHITECTURE: the model NEVER transcribes image URLs. Each unique image is
 * given an integer id; the model returns id→bucket assignments only. We resolve
 * ids back to URLs programmatically. This eliminates URL-transcription errors
 * and the token blow-up that emptied buckets on image-heavy (Webflow) sites.
 */

import { loadPrompt, fillTemplate, runPassCall, MODELS } from '../shared.js';

export const name = 'images';

// Images that are never content: tracking pixels, spacers, data URIs
const JUNK = /facebook\.com\/tr|google-analytics|googletagmanager|\/pixel|1x1|spacer|blank\.gif|^data:/i;

export function selectPages(bronze) {
  return bronze.pages || [];
}

function collectImages(bronze) {
  const byUrl = new Map();
  for (const p of bronze.pages || []) {
    for (const img of (p.images || [])) {
      const src = img.src;
      if (!src || JUNK.test(src)) continue;
      if (!byUrl.has(src)) byUrl.set(src, { src, alt: img.alt || '', pages: new Set() });
      byUrl.get(src).pages.add(p.path);
    }
  }
  return Array.from(byUrl.values()).map((v, i) => ({
    id: i,
    src: v.src,
    alt: v.alt,
    pages: [...v.pages].slice(0, 4),
  }));
}

export async function run({ bronze }) {
  const images = collectImages(bronze);
  if (images.length === 0) return { images: {} };
  const byId = new Map(images.map(i => [i.id, i]));

  // Doctor name hints from JSON-LD
  const doctorHints = new Set();
  for (const p of bronze.pages) {
    for (const item of (p.structuredData || [])) {
      const t = item['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.some(x => /Person|Dentist|Physician/i.test(String(x))) && item.name) doctorHints.add(item.name);
    }
  }

  const tmpl = await loadPrompt('images');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    // Compact list: "id | alt | pathHint" — NO full URL echo required from model
    imageList: images.slice(0, 600).map(i => {
      const pathHint = i.src.replace(/^https?:\/\/[^/]+/, '').slice(-70);
      return `${i.id} | alt="${(i.alt || '').slice(0, 80)}" | ...${pathHint}`;
    }).join('\n'),
    doctorHints: JSON.stringify([...doctorHints], null, 2),
  });

  const { slice } = await runPassCall({ name, model: MODELS.default, prompt, maxTokens: 8000 });
  const a = slice.assignments || slice.images || slice || {};

  // ---- Normalized model: every image is ONE fully-attributed record in a
  // single canonical list (items[]). Role-buckets are DERIVED projections of
  // items — never a second source of truth. sourcePages + personName are
  // FIELDS on the image, not side-tables. -------------------------------------

  // Map the model's bucket → singular role name.
  const ASSIGN = {
    logo: 'logo', logoFooter: 'logoFooter', hero: 'hero', headshots: 'headshot',
    team: 'team', office: 'office', gallery: 'gallery', beforeAfter: 'beforeAfter',
    treatments: 'treatment', badges: 'badge',
  };
  // Resolve any assignment entry (id | {id,personName} | url string) → src.
  const toSrc = (x) => {
    if (typeof x === 'number') return byId.get(x)?.src || null;
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object' && x.id != null) return byId.get(x.id)?.src || null;
    return null;
  };

  // One item per unique image; default role 'unused' until assigned.
  const itemBySrc = new Map(images.map(img => [img.src, {
    src: img.src, alt: img.alt, role: 'unused', sourcePages: img.pages, personName: null,
  }]));

  for (const [bucket, role] of Object.entries(ASSIGN)) {
    const v = a[bucket];
    const entries = Array.isArray(v) ? v : (v != null ? [v] : []);
    for (const x of entries) {
      const src = toSrc(x);
      if (!src || !itemBySrc.has(src)) continue;
      const item = itemBySrc.get(src);
      item.role = role;
      if (x && typeof x === 'object' && x.personName) item.personName = x.personName;
    }
  }

  const items = [...itemBySrc.values()];
  const byRole = (r) => items.filter(i => i.role === r);

  // Derived role views (projections of items — single source of truth is items[]).
  return {
    images: {
      items,
      logo: (items.find(i => i.role === 'logo') || {}).src || null,
      logoFooter: (items.find(i => i.role === 'logoFooter') || {}).src || null,
      hero: byRole('hero'),
      headshots: byRole('headshot'),
      team: byRole('team'),
      office: byRole('office'),
      gallery: byRole('gallery'),
      beforeAfter: byRole('beforeAfter'),
      treatments: byRole('treatment'),
      badges: byRole('badge'),
    },
  };
}
