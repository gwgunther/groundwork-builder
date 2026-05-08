/**
 * Post-build integrity validator.
 *
 * Runs after Astro produces `dist/`. Catches a class of silent-failure bugs
 * that the existing pipeline doesn't:
 *
 *   1. Section-presence: every entry in `designDNA.sectionOrder` actually
 *      reached the rendered HTML. (The gallery bug — section in the order,
 *      dispatcher invoked the component, component returned empty due to a
 *      silent path error — slipped past every other layer.)
 *
 *   2. Image integrity: every `<img src="/...">` in built HTML resolves to
 *      a real file in `dist/`. The Astro build does not fail on broken image
 *      paths, so they ship as 404s.
 *
 *   3. Internal link integrity: every `<a href="/path">` resolves to a route
 *      that was actually built. Catches links to pages that don't exist
 *      (e.g. /faq when the FAQ page wasn't generated).
 *
 * Returns a list of issues with shape { kind, detail, file? } so build-site
 * can plumb them into the missing report.
 */

import { readFile, access, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

/**
 * @param {string} outputDir   - project root (contains `dist/` and `public/`)
 * @param {string[]} expectedSections - designDNA.sectionOrder (the contract)
 * @returns {Promise<{ kind: string, detail: string, file?: string }[]>}
 */
export async function validateBuild(outputDir, expectedSections = []) {
  const distDir = resolve(outputDir, 'dist');
  const issues = [];

  // 1. Section presence — only checks the homepage (where the dispatcher lives)
  const indexPath = resolve(distDir, 'index.html');
  let homepageHtml = '';
  try {
    homepageHtml = await readFile(indexPath, 'utf8');
  } catch {
    issues.push({ kind: 'missing-page', detail: `dist/index.html not produced — Astro build did not emit the homepage` });
    return issues; // can't proceed without the homepage
  }

  // Each section in the dispatcher is wrapped in <div data-section="name" class="contents">.
  // Verify every expected section has at least one occurrence AND the wrapper has
  // non-empty content (catches the gallery-empty case).
  for (const section of expectedSections) {
    const marker = `data-section="${section}"`;
    const idx = homepageHtml.indexOf(marker);
    if (idx === -1) {
      issues.push({
        kind: 'section-not-rendered',
        detail: `Section "${section}" is in designDNA.sectionOrder but the dispatcher's marker (data-section="${section}") is not in dist/index.html. The component may have failed to render or the dispatcher omitted it.`,
        file: 'dist/index.html',
      });
      continue;
    }
    // Check whether the wrapper div is empty (component returned nothing).
    // We look for the next > after the marker, then check whether the content
    // up to a closing </div> is just whitespace.
    const tagEnd = homepageHtml.indexOf('>', idx);
    if (tagEnd === -1) continue;
    // Find the matching </div> by counting depth. Since the wrapper div is
    // class="contents" and contains a real component, we expect at least one
    // child element.
    const after = homepageHtml.slice(tagEnd + 1, tagEnd + 600);
    const nextOpenTag = after.match(/<[a-zA-Z]/);
    if (!nextOpenTag) {
      issues.push({
        kind: 'section-empty',
        detail: `Section "${section}" rendered an empty wrapper. The component returned nothing — typically a silent data-load failure (e.g. wrong path to image-roles.json) or all gating conditions returning false.`,
        file: 'dist/index.html',
      });
    }
  }

  // 2 & 3. Walk every built HTML page for broken images and broken internal links.
  const htmlFiles = await collectHtmlFiles(distDir);
  for (const htmlFile of htmlFiles) {
    let html;
    try {
      html = await readFile(htmlFile, 'utf8');
    } catch {
      continue;
    }

    const relFile = htmlFile.replace(distDir, 'dist');

    // Image src: literal absolute paths starting with /
    const imgRegex = /<img[^>]*\ssrc=["'](\/[^"']+)["']/gi;
    let m;
    while ((m = imgRegex.exec(html)) !== null) {
      const src = m[1];
      if (src.startsWith('//') || src.startsWith('data:')) continue;
      const absPath = resolve(distDir, src.replace(/^\//, '').split('?')[0].split('#')[0]);
      try {
        await access(absPath);
      } catch {
        issues.push({
          kind: 'broken-image-build',
          detail: `<img src="${src}"> in ${relFile} — file not present in dist/. Will 404 in production.`,
          file: relFile,
        });
      }
    }

    // Internal links: <a href="/..."> — skip external, mailto:, tel:, hash-only
    const linkRegex = /<a[^>]*\shref=["'](\/[^"']*)["']/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1].split('?')[0].split('#')[0];
      if (!href || href === '/') continue;
      // Resolve to dist/path → look for either path/index.html or path.html
      const cleanHref = href.replace(/\/+$/, '').replace(/^\//, '');
      const candidates = [
        resolve(distDir, cleanHref, 'index.html'),
        resolve(distDir, `${cleanHref}.html`),
      ];
      let found = false;
      for (const c of candidates) {
        try { await access(c); found = true; break; } catch {}
      }
      if (!found) {
        // Also accept literal files in public/ (e.g. /favicon.svg, /images/...)
        // We already validate /images via the image check; allow other static files.
        const staticPath = resolve(distDir, cleanHref);
        try { await access(staticPath); found = true; } catch {}
      }
      if (!found) {
        issues.push({
          kind: 'broken-link-build',
          detail: `<a href="${href}"> in ${relFile} — destination route was not built. Visitors will hit a 404.`,
          file: relFile,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectHtmlFiles(dir) {
  const out = [];
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.isFile() && e.name.endsWith('.html')) {
        out.push(p);
      }
    }
  }
  try { await walk(dir); } catch {}
  return out;
}
