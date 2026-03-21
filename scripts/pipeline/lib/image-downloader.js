/**
 * Image downloader — fetch images from the old site and save them
 * into the new project's public/images/ directory tree.
 *
 * Directory layout:
 *   public/images/branding/   — logo
 *   public/images/team/       — team / headshot photos
 *   public/images/heroes/     — first 3 office photos (used as hero backgrounds)
 *   public/images/gallery/    — remaining office photos + explicit gallery images
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

/**
 * Download all discovered images into the output project.
 *
 * @param {object} data     - Merged practice data (schema shape from schema.js)
 * @param {string} outputDir - Root of the generated Astro project
 * @returns {number} Number of images successfully downloaded
 */
export async function downloadImages(data, outputDir) {
  const imageDir = resolve(outputDir, 'public/images');
  let downloaded = 0;

  /** Normalize image entry — may be a plain URL string or { url, src, ... } object */
  const getUrl = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.url || entry.src || null;
  };

  // Download logo
  const logoUrl = getUrl(data.images?.logo);
  if (logoUrl) {
    const result = await downloadToDir(
      logoUrl,
      resolve(imageDir, 'branding'),
      'logo',
    );
    if (result) {
      downloaded++;
      console.log(`  Downloaded logo: branding/${result}`);
    }
  }

  // Download team photos
  for (let i = 0; i < (data.images?.team?.length || 0); i++) {
    const url = getUrl(data.images.team[i]);
    if (!url) continue;
    const result = await downloadToDir(
      url,
      resolve(imageDir, 'team'),
      `team-${i + 1}`,
    );
    if (result) {
      downloaded++;
      console.log(`  Downloaded team photo: team/${result}`);
    }
  }

  // Download office/hero photos (first 3 go to heroes/, rest to gallery/)
  for (let i = 0; i < (data.images?.office?.length || 0); i++) {
    const url = getUrl(data.images.office[i]);
    if (!url) continue;
    const subdir = i < 3 ? 'heroes' : 'gallery';
    const dir = resolve(imageDir, subdir);
    const result = await downloadToDir(
      url,
      dir,
      `office-${i + 1}`,
    );
    if (result) {
      downloaded++;
      console.log(`  Downloaded office photo: ${subdir}/${result}`);
    }
  }

  // Download gallery photos
  for (let i = 0; i < (data.images?.gallery?.length || 0); i++) {
    const url = getUrl(data.images.gallery[i]);
    if (!url) continue;
    const result = await downloadToDir(
      url,
      resolve(imageDir, 'gallery'),
      `gallery-${i + 1}`,
    );
    if (result) {
      downloaded++;
      console.log(`  Downloaded gallery photo: gallery/${result}`);
    }
  }

  return downloaded;
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
    await writeFile(resolve(dir, filename), buffer);
    return filename;
  } catch (err) {
    console.warn(`  Warning: Could not download ${url}: ${err.message}`);
    return null;
  }
}
