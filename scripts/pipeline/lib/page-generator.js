/**
 * Page generator — keep/remove service hub pages based on detected services.
 *
 * 1. Deletes service hub pages from src/pages/services/ that the practice doesn't offer.
 * 2. Updates src/pages/services.astro to only list active services.
 * 3. Injects doctor bio into src/pages/about.astro if available.
 */

import { unlink, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Generate / prune pages based on scraped + merged practice data.
 *
 * @param {object} data      - Merged practice data (schema shape from schema.js)
 * @param {string} outputDir - Root of the generated Astro project
 * @param {object} [preset]  - Loaded vertical preset (from preset-loader).
 */
export async function generatePages(data, outputDir, preset = null) {
  const serviceDescriptions = preset?.hubs?.descriptions || {};

  // Normalize hubs — may be objects { slug, label, desc } or plain strings
  const rawHubs = data.services.hubs || [];
  const hubSlugs = rawHubs.map(h => typeof h === 'string' ? h : h.slug);
  const allHubs = Object.keys(serviceDescriptions);

  // Remove service pages the practice doesn't offer
  let removed = 0;
  for (const hub of allHubs) {
    if (!hubSlugs.includes(hub)) {
      try {
        await unlink(resolve(outputDir, `src/pages/services/${hub}.astro`));
        removed++;
        console.log(`  Removed unused service page: services/${hub}.astro`);
      } catch {
        // File may not exist — that's fine
      }
    }
  }

  // Update services.astro index to only list active services
  const kept = hubSlugs.filter((h) => allHubs.includes(h));
  if (kept.length > 0) {
    await updateServicesIndex(kept, outputDir, serviceDescriptions);
    console.log(`  Updated services.astro with ${kept.length} active service hub(s).`);
  }

  // Inject about page with doctor bio if available
  if (data.doctor?.bio) {
    await injectAboutBio(data, outputDir);
    console.log('  Injected doctor bio into about.astro.');
  }

  return { removed, kept: kept.length };
}

/**
 * Replace the services array in the frontmatter of src/pages/services.astro
 * so it only references active hubs.
 */
async function updateServicesIndex(activeHubs, outputDir, serviceDescriptions) {
  const filePath = resolve(outputDir, 'src/pages/services.astro');
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    console.warn('  Warning: services.astro not found — skipping index update.');
    return;
  }

  // Build the replacement array string
  const entries = activeHubs
    .filter((hub) => serviceDescriptions[hub])
    .map((hub) => {
      const { name, desc } = serviceDescriptions[hub];
      return `  { name: '${name}', slug: '${hub}', desc: '${desc}' },`;
    })
    .join('\n');

  const newArray = `const services = [\n${entries}\n];`;

  // Match the existing services array declaration in frontmatter.
  // Handles both single-line and multi-line array definitions.
  const arrayPattern = /const\s+services\s*=\s*\[[\s\S]*?\];/;

  if (arrayPattern.test(content)) {
    content = content.replace(arrayPattern, newArray);
  } else {
    console.warn('  Warning: Could not locate services array in services.astro — skipping.');
    return;
  }

  await writeFile(filePath, content);
}

/**
 * Replace the placeholder paragraph in about.astro with the actual doctor bio.
 */
async function injectAboutBio(data, outputDir) {
  const filePath = resolve(outputDir, 'src/pages/about.astro');
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    console.warn('  Warning: about.astro not found — skipping bio injection.');
    return;
  }

  const doctorName = data.doctor.name
    || (data.doctor.firstName
      ? `Dr. ${data.doctor.firstName} ${data.doctor.lastName}`
      : 'Our Doctor');

  const credentials = data.doctor.credentials ? `, ${data.doctor.credentials}` : '';

  // Look for the TODO comment about doctor intro and replace the placeholder block
  const todoPattern = /<!--\s*TODO:?\s*[Dd]octor\s+intro[\s\S]*?-->\s*\n?\s*<p[^>]*>[\s\S]*?<\/p>/;

  const replacement = `<h2>${doctorName}${credentials}</h2>\n      <p>${data.doctor.bio}</p>`;

  if (todoPattern.test(content)) {
    content = content.replace(todoPattern, replacement);
  } else {
    // Fallback: look for just the TODO comment and replace it
    const fallbackPattern = /<!--\s*TODO:?\s*[Dd]octor\s+intro[\s\S]*?-->/;
    if (fallbackPattern.test(content)) {
      content = content.replace(fallbackPattern, replacement);
    } else {
      console.warn('  Warning: Could not locate doctor intro placeholder in about.astro.');
      return;
    }
  }

  await writeFile(filePath, content);
}
