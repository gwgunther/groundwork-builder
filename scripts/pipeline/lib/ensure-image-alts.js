/**
 * ensure-image-alts.js
 *
 * Fills missing image alt text deterministically before download/bind.
 * Never overwrites non-empty alts from scrape or vision classification.
 */

const DECORATIVE_ROLES = new Set(['unused']);

/**
 * @param {object} item - { alt, role, personName, src }
 * @param {object} ctx - { practiceName, city }
 * @returns {string}
 */
export function fallbackAltForItem(item, ctx = {}) {
  const name = String(ctx.practiceName || 'Dental practice').trim();
  const city = ctx.city ? ` in ${ctx.city}` : '';
  const role = item?.role || '';
  const person = String(item?.personName || '').trim();
  const existing = String(item?.alt || '').trim();

  if (existing) return existing;
  if (DECORATIVE_ROLES.has(role)) return '';

  switch (role) {
    case 'logo':
    case 'logoFooter':
      return `${name} logo`;
    case 'hero':
      return `${name} dental practice${city}`;
    case 'headshot':
      return person ? `${person}, dentist at ${name}` : `Dentist at ${name}`;
    case 'team':
      return person ? `${person}, ${name} team member` : `Team member at ${name}`;
    case 'beforeAfter':
      return `Before and after dental treatment at ${name}`;
    case 'gallery':
    case 'treatment':
      return `Dental treatment results at ${name}`;
    case 'office':
      return `${name} dental office${city}`;
    case 'badge':
      return inferBadgeAlt(item) || `Professional accreditation at ${name}`;
    default:
      return `Photo from ${name}`;
  }
}

function inferBadgeAlt(item) {
  const hint = String(item?.alt || item?.src || '').trim();
  if (!hint) return '';
  const base = hint.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  if (!base || base.length < 3) return '';
  return `${base} logo`;
}

/**
 * Ensure every image item has alt text where content-bearing.
 * Mutates items in place; also patches bucket arrays if present.
 *
 * @param {object} images - merged.images
 * @param {object} ctx - { practiceName, city }
 * @returns {{ filled: number, total: number }}
 */
export function ensureImageAlts(images, ctx = {}) {
  if (!images || typeof images !== 'object') return { filled: 0, total: 0 };

  let filled = 0;
  const items = Array.isArray(images.items) ? images.items : [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const before = String(item.alt || '').trim();
    const after = fallbackAltForItem(item, ctx);
    if (!before && after) {
      item.alt = after;
      filled++;
    } else if (!item.alt) {
      item.alt = after; // may be '' for decorative
    }
  }

  // Patch legacy bucket shapes (string URLs or {url, alt} objects)
  for (const key of ['hero', 'team', 'office', 'gallery', 'beforeAfter', 'treatments', 'badges', 'headshots']) {
    if (!Array.isArray(images[key])) continue;
    images[key] = images[key].map((entry, i) => patchBucketEntry(entry, items, key, ctx, i));
  }

  if (images.logo && typeof images.logo === 'object' && !images.logo.alt) {
    images.logo.alt = fallbackAltForItem({ ...images.logo, role: 'logo' }, ctx);
    filled++;
  }

  return { filled, total: items.length };
}

function patchBucketEntry(entry, items, bucketRole, ctx, index) {
  const roleMap = {
    hero: 'hero',
    team: 'team',
    headshots: 'headshot',
    office: 'office',
    gallery: 'gallery',
    beforeAfter: 'beforeAfter',
    treatments: 'treatment',
    badges: 'badge',
  };
  const role = roleMap[bucketRole] || bucketRole;

  if (typeof entry === 'string') {
    const match = items.find((it) => it.src === entry);
    const alt = match?.alt || fallbackAltForItem({ src: entry, role }, ctx);
    return alt ? { url: entry, src: entry, alt } : entry;
  }

  if (entry && typeof entry === 'object') {
    const src = entry.url || entry.src;
    const before = String(entry.alt || '').trim();
    if (before) return entry;
    const match = items.find((it) => it.src === src);
    const alt = match?.alt || fallbackAltForItem({ ...entry, src, role }, ctx);
    if (alt) return { ...entry, alt };
  }

  return entry;
}

/**
 * Enrich alt fields on image-source.json sidecar entries.
 * @param {object} sidecar - localPath → metadata
 * @param {object} ctx
 * @returns {{ filled: number }}
 */
export function enrichSidecarAlts(sidecar, ctx = {}) {
  if (!sidecar || typeof sidecar !== 'object') return { filled: 0 };
  let filled = 0;
  for (const [path, meta] of Object.entries(sidecar)) {
    if (!meta || typeof meta !== 'object') continue;
    const before = String(meta.alt || '').trim();
    if (before) continue;
    const alt = fallbackAltForItem(
      { alt: '', role: meta.category || 'gallery', src: meta.sourceUrl || path },
      ctx,
    );
    if (alt) {
      meta.alt = alt;
      filled++;
    }
  }
  return { filled };
}
