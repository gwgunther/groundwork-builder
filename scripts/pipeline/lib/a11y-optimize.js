/**
 * a11y-optimize.js
 *
 * Pre-build accessibility optimizations applied to each client output dir.
 * Complements template-level fixes (skip link, reduced motion) and the
 * post-build axe-core audit.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { enrichSidecarAlts } from './ensure-image-alts.js';

/**
 * @param {string} outputDir - client project root
 * @param {object} opts
 * @param {object} [opts.practice] - { name, city }
 * @returns {Promise<{ sidecarFilled: number, galleryInjected: boolean, galleryCount: number }>}
 */
export async function runA11yOptimize(outputDir, opts = {}) {
  const practice = opts.practice || {};
  const ctx = {
    practiceName: practice.name || 'Dental practice',
    city: practice.city || null,
  };

  let sidecarFilled = 0;
  let galleryInjected = false;
  let galleryCount = 0;

  const sidecarPath = join(outputDir, 'public/images/image-source.json');
  if (existsSync(sidecarPath)) {
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
    ({ filled: sidecarFilled } = enrichSidecarAlts(sidecar, ctx));
    if (sidecarFilled > 0) {
      await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2));
    }
    ({ injected: galleryInjected, count: galleryCount } = await injectGalleryPage(outputDir, sidecar, ctx));
  }

  return { sidecarFilled, galleryInjected, galleryCount };
}

/**
 * Populate gallery.astro with images + alt text from the download sidecar.
 */
async function injectGalleryPage(outputDir, sidecar, ctx) {
  const GALLERY_CATEGORIES = new Set(['gallery', 'beforeAfter', 'treatment', 'office']);
  const entries = Object.entries(sidecar || {})
    .filter(([, meta]) => GALLERY_CATEGORIES.has(meta?.category))
    .map(([localPath, meta]) => ({
      src: `/images/${localPath.replace(/^\/+/, '')}`,
      alt: String(meta.alt || '').trim() || `${ctx.practiceName} dental gallery photo`,
      procedure: categoryToProcedure(meta.category),
    }));

  if (entries.length === 0) {
    return { injected: false, count: 0 };
  }

  const practiceName = ctx.practiceName;
  const body = `---
import BaseLayout from '../layouts/BaseLayout.astro';
import GalleryGrid from '../components/GalleryGrid.astro';
import CTABlock from '../components/CTABlock.astro';
import { site, localBusinessSchema } from '../config/site';

const beforeAfterItems = [];

const galleryImages = ${JSON.stringify(entries, null, 2)};
---

<BaseLayout
  title={\`Before & After Gallery — \${site.name}\`}
  description={\`See real patient results from \${site.name}. Before and after photos of dental implants, veneers, and smile makeovers.\`}
  schema={localBusinessSchema}
>
  <section class="bg-surface-2">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div class="max-w-3xl mx-auto text-center">
        <h1 class="section-heading mb-6">Before & After Gallery</h1>
        <p class="text-lg text-neutral-mid">
          Real results from real patients. See the difference quality dental care can make.
        </p>
      </div>
    </div>
  </section>

  {galleryImages.length > 0 && (
    <section class="py-16 bg-surface-2">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <GalleryGrid images={galleryImages} />
      </div>
    </section>
  )}

  <section class="py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <CTABlock phone={site.phone} />
    </div>
  </section>
</BaseLayout>
`;

  const galleryPath = join(outputDir, 'src/pages/gallery.astro');
  await writeFile(galleryPath, body);
  return { injected: true, count: entries.length };
}

function categoryToProcedure(category) {
  if (category === 'beforeAfter') return 'Before & After';
  if (category === 'treatment') return 'Treatment';
  if (category === 'office') return 'Office';
  return 'Gallery';
}
