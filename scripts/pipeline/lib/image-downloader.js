/**
 * Image downloader — fetch images from the old site and save them
 * into the new project's public/images/ directory tree.
 *
 * Directory layout:
 *   public/images/branding/   — logo
 *   public/images/team/       — team / headshot photos
 *   public/images/heroes/     — first 3 office photos (used as hero backgrounds)
 *   public/images/gallery/    — remaining office photos + explicit gallery images
 *
 * Naming:
 *   We preserve a SLUG derived from the original URL filename when possible,
 *   prefixed by category. For example:
 *     dr-melissa-ven-dange-magic-fox-orthodontics.jpg
 *       → team/team-1-dr-melissa-ven-dange.jpg
 *   This keeps identifying info (doctor names, "office", "exterior", etc.)
 *   visible to downstream classifiers and audit steps. If no useful slug can
 *   be extracted, falls back to category-N.ext.
 *
 * Sidecar:
 *   public/images/image-source.json keeps full provenance per local file:
 *     { "team/team-1-dr-melissa.jpg": { sourceUrl, alt, originalFilename, category } }
 *   Used by ai-image-roles.js to pair photos with named doctors.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Filename slug extraction
// ---------------------------------------------------------------------------

const NOISE_TOKENS = new Set([
  'magic-fox-orthodontics', 'magic-fox', 'orthodontics',
  'magicfox', 'magicfoxsmiles',
  'jpg', 'jpeg', 'png', 'webp',
  'image', 'img', 'photo', 'pic', 'picture',
  'header', 'hero', 'banner',
  'webflow', 'cms', 'asset', 'assets',
  'final', 'final-final', 'small', 'medium', 'large', 'thumb', 'thumbnail',
  '1x', '2x', '3x',
]);

/**
 * Resolve a possibly-relative image URL against the practice's site origin.
 *
 * Silver passes through whatever <img src> the source HTML used. Common shapes:
 *   - Absolute:           https://example.com/foo.jpg          → kept as-is
 *   - Protocol-relative:  //cdn.example.com/foo.jpg            → prepend https:
 *   - Absolute path:      /sesame_media/foo.jpg                → resolved against site origin
 *   - Relative path:      assets/foo.jpg                       → resolved against site origin
 *   - data: / blob: / javascript:                              → returned null (not downloadable)
 *
 * Without this resolution, fetch() rejects the relative paths with "Failed to
 * parse URL" — the bug that caused ~30 image download failures on chang.
 *
 * @param {string} url       - Possibly-relative image URL
 * @param {string} baseUrl   - Practice site origin (e.g. "https://changorthodontics.com")
 * @returns {string|null}    - Absolute URL, or null if input is unfetchable
 */
export function resolveImageUrl(url, baseUrl) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Schemes we can't fetch (data:, blob:, javascript:, mailto:, tel:)
  if (/^(data|blob|javascript|mailto|tel):/i.test(trimmed)) return null;

  // Protocol-relative: //cdn.example.com/foo.jpg
  if (trimmed.startsWith('//')) return 'https:' + trimmed;

  // Already absolute http(s)
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Need a base to resolve against
  if (!baseUrl) return null;

  // Normalize baseUrl to include protocol
  let base = baseUrl;
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;

  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

/** Extract a meaningful slug from a URL's filename. Returns '' if nothing useful. */
export function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const file = path.split('/').pop() || '';
    // Strip extension, query suffixes, hash prefixes (webflow IDs, etc.)
    let stem = file
      .replace(/\.[a-z0-9]+(\?.*)?$/i, '')   // .jpg, .png?v=...
      .replace(/^[0-9a-f]{16,}_/, '')         // 67d476b1dc573fe09355512d_
      .replace(/-?[0-9a-f]{12,}$/, '')        // trailing hash IDs
      .replace(/[_]+/g, '-')                  // _ → -
      .replace(/-+/g, '-')                    // collapse dashes
      .toLowerCase();
    // Drop noise tokens
    const tokens = stem.split('-').filter(t => t && !NOISE_TOKENS.has(t) && !/^\d+$/.test(t));
    return tokens.slice(0, 6).join('-');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download all discovered images into the output project,
 * then upload to GCS (when configured) via runStorage.
 *
 * @param {object} data       - Merged practice data (schema shape from schema.js)
 * @param {string} outputDir  - Root of the generated Astro project
 * @param {object} [runStorage] - Optional run storage from createRunStorage()
 * @returns {number} Number of images successfully downloaded
 */
export async function downloadImages(data, outputDir, runStorage = null) {
  const imageDir = resolve(outputDir, 'public/images');
  let downloaded = 0;
  let skipped = 0;

  // Resolve image URLs against this base so relative paths from the source
  // HTML (e.g. /sesame_media/foo.jpg, /assets/bar.png) become fetchable.
  // Silver stores the practice domain without protocol — we add https://.
  const baseUrl = data.practice?.domain
    ? (/^https?:\/\//i.test(data.practice.domain) ? data.practice.domain : `https://${data.practice.domain}`)
    : null;

  // Sidecar mapping: localPath → { sourceUrl, alt, originalFilename, category }
  const sourceMap = {};

  /** Normalize image entry — may be a plain URL string or { url|src, alt, ... } object.
   *  Resolves the URL against baseUrl. Returns { url: null } if URL is missing
   *  or unfetchable (data:, blob:, etc.). */
  const getEntry = (entry) => {
    if (!entry) return { url: null, alt: '' };
    const raw = typeof entry === 'string' ? entry : (entry.url || entry.src || null);
    const alt = typeof entry === 'string' ? '' : (entry.alt || entry.title || '');
    const resolved = resolveImageUrl(raw, baseUrl);
    if (!resolved && raw) {
      skipped++;
      console.warn(`  Warning: Could not resolve image URL "${raw}" against base "${baseUrl}"`);
    }
    return { url: resolved, alt };
  };

  /** Build the saved filename: prefix-N[-slug].ext */
  function buildName(prefix, idx, url) {
    const slug = slugFromUrl(url);
    return slug ? `${prefix}-${idx}-${slug}` : `${prefix}-${idx}`;
  }

  // Download logo
  const logoEntry = getEntry(data.images?.logo);
  if (logoEntry.url) {
    const result = await downloadToDir(logoEntry.url, resolve(imageDir, 'branding'), 'logo');
    if (result) {
      downloaded++;
      sourceMap[`branding/${result}`] = {
        sourceUrl: logoEntry.url, alt: logoEntry.alt,
        originalFilename: extractOriginalFilename(logoEntry.url),
        category: 'logo',
      };
      console.log(`  Downloaded logo: branding/${result}`);
    }
  }

  // Download team photos (preserve doctor-name slugs from URL)
  for (let i = 0; i < (data.images?.team?.length || 0); i++) {
    const entry = getEntry(data.images.team[i]);
    if (!entry.url) continue;
    const baseName = buildName('team', i + 1, entry.url);
    const result = await downloadToDir(entry.url, resolve(imageDir, 'team'), baseName);
    if (result) {
      downloaded++;
      sourceMap[`team/${result}`] = {
        sourceUrl: entry.url, alt: entry.alt,
        originalFilename: extractOriginalFilename(entry.url),
        category: 'team',
      };
      console.log(`  Downloaded team photo: team/${result} (alt: "${entry.alt || '-'}")`);
    }
  }

  // Download office/hero photos (first 3 → heroes/, rest → gallery/)
  for (let i = 0; i < (data.images?.office?.length || 0); i++) {
    const entry = getEntry(data.images.office[i]);
    if (!entry.url) continue;
    const subdir = i < 3 ? 'heroes' : 'gallery';
    const dir = resolve(imageDir, subdir);
    const baseName = buildName('office', i + 1, entry.url);
    const result = await downloadToDir(entry.url, dir, baseName);
    if (result) {
      downloaded++;
      sourceMap[`${subdir}/${result}`] = {
        sourceUrl: entry.url, alt: entry.alt,
        originalFilename: extractOriginalFilename(entry.url),
        category: subdir === 'heroes' ? 'hero' : 'office',
      };
      console.log(`  Downloaded office photo: ${subdir}/${result}`);
    }
  }

  // Download gallery photos
  for (let i = 0; i < (data.images?.gallery?.length || 0); i++) {
    const entry = getEntry(data.images.gallery[i]);
    if (!entry.url) continue;
    const baseName = buildName('gallery', i + 1, entry.url);
    const result = await downloadToDir(entry.url, resolve(imageDir, 'gallery'), baseName);
    if (result) {
      downloaded++;
      sourceMap[`gallery/${result}`] = {
        sourceUrl: entry.url, alt: entry.alt,
        originalFilename: extractOriginalFilename(entry.url),
        category: 'gallery',
      };
      console.log(`  Downloaded gallery photo: gallery/${result}`);
    }
  }

  // Write the sidecar source-map so downstream phases (image-roles, audit)
  // can recover the original filename + alt text per local file.
  if (Object.keys(sourceMap).length > 0) {
    await mkdir(imageDir, { recursive: true });
    await writeFile(
      resolve(imageDir, 'image-source.json'),
      JSON.stringify(sourceMap, null, 2),
    );
  }

  if (skipped > 0) {
    console.warn(`  ${skipped} image URL${skipped === 1 ? '' : 's'} could not be resolved against base "${baseUrl}" — skipped`);
  }

  return downloaded;
}

function extractOriginalFilename(url) {
  try {
    const path = new URL(url).pathname;
    return path.split('/').pop() || '';
  } catch {
    return '';
  }
}

/**
 * Download a single URL into a directory with a deterministic base name.
 *
 * @param {string} url      - Image URL to fetch
 * @param {string} dir      - Target directory (created if missing)
 * @param {string} baseName - File name without extension
 * @returns {string|null}   - Saved filename, or null on failure
 */
async function downloadToDir(url, dir, baseName) {
  try {
    await mkdir(dir, { recursive: true });

    const res = await fetch(url, {
      headers: { 'User-Agent': 'GroundworkBuilder/1.0 (+internal)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`  Warning: HTTP ${res.status} for ${url}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Derive extension from the URL pathname; default to .jpg
    let ext;
    try {
      ext = extname(new URL(url).pathname) || '.jpg';
    } catch {
      ext = '.jpg';
    }

    const filename = `${baseName}${ext}`;
    const localPath = resolve(dir, filename);
    await writeFile(localPath, buffer);
    return filename;
  } catch (err) {
    console.warn(`  Warning: Could not download ${url}: ${err.message}`);
    return null;
  }
}
