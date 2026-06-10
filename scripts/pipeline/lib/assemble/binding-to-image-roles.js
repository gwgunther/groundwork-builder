/**
 * Step 6 — bridge the deterministic image binding → the image-roles.json shape
 * the Astro components already consume. This REPLACES the second Vision pass
 * (ai-image-roles.js): roles + portraits already live in the normalized
 * items[]/binding, so there's nothing left to re-classify.
 *
 * The binding holds SOURCE URLs; components need LOCAL downloaded paths. The
 * downloader writes a sidecar (image-source.json) mapping localPath →
 * { sourceUrl, ... }. We invert it and translate.
 *
 * Input:
 *   binding : output of bindImages() — { globals, portraits, byPage, ... }
 *   sidecar : parsed public/images/image-source.json — { local: { sourceUrl, ... } }
 * Output (image-roles.json shape):
 *   { hero, doctorPortrait, doctorPortraits, team, interior, gallery, beforeAfter, unused, byPage }
 */
import { resolveImageUrl } from '../image-downloader.js';
import { fallbackAltForItem } from '../ensure-image-alts.js';

export function bindingToImageRoles(binding, sidecar, baseUrl = null, ctx = {}) {
  // The sidecar keys local files by the RESOLVED (absolute) sourceUrl, while the
  // binding holds raw silver srcs (often relative). Resolve binding srcs the same
  // way the downloader did so they match. Index by both raw and resolved.
  const srcToLocal = new Map();
  for (const [local, meta] of Object.entries(sidecar || {})) {
    if (meta && meta.sourceUrl) srcToLocal.set(meta.sourceUrl, local);
  }
  const loc = (src) => {
    if (!src) return null;
    if (srcToLocal.has(src)) return srcToLocal.get(src);
    const resolved = resolveImageUrl(src, baseUrl);
    return (resolved && srcToLocal.get(resolved)) || null;
  };
  const locs = (arr) => (arr || []).map(loc).filter(Boolean);

  const g = binding.globals || {};
  const doctorPortraits = {};
  for (const [name, src] of Object.entries(binding.portraits?.byName || {})) {
    const l = loc(src);
    if (l) doctorPortraits[name] = l;
  }
  const firstName = Object.keys(doctorPortraits)[0] || null;

  // Per-page service image (local path) — preserves the sourcePages join through render.
  const byPage = {};
  for (const [slug, b] of Object.entries(binding.byPage || {})) {
    const l = b.image ? loc(b.image) : null;
    if (l) byPage[slug] = l;
  }

  const alts = {};
  for (const [localPath, meta] of Object.entries(sidecar || {})) {
    const trimmed = String(meta?.alt || '').trim();
    if (trimmed) {
      alts[localPath] = trimmed;
      continue;
    }
    const generated = fallbackAltForItem(
      { alt: '', role: meta?.category || 'gallery', src: meta?.sourceUrl || localPath },
      ctx,
    );
    if (generated) alts[localPath] = generated;
  }

  return {
    hero: locs(g.hero)[0] || locs(g.office)[0] || null,
    doctorPortrait: firstName ? doctorPortraits[firstName] : null,
    doctorPortraits,
    team: locs(g.team),
    interior: locs(g.office),
    gallery: locs(g.gallery),
    beforeAfter: locs(g.beforeAfter),
    badges: locs(g.badges),
    unused: [],
    byPage,
    alts,
  };
}

export default bindingToImageRoles;
