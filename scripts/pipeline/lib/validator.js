/**
 * Validator — install deps, run the Astro build, and scan the output
 * for leftover placeholder tokens that still need manual attention.
 */

import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';

/**
 * Validate the generated project by building it and scanning for placeholders.
 *
 * @param {string} outputDir - Root of the generated Astro project
 * @returns {{ buildSuccess: boolean, placeholders: Array<{file: string, pattern: string}>, errors: string[] }}
 */
export async function validate(outputDir) {
  const absDir = resolve(outputDir);
  const results = { buildSuccess: false, placeholders: [], errors: [] };

  // -----------------------------------------------------------------------
  // Step 1: Install dependencies
  // -----------------------------------------------------------------------
  console.log('  Installing dependencies...');
  try {
    execSync('npm install --silent', {
      cwd: absDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (err) {
    const stderr = err.stderr?.toString().slice(0, 500) || err.message;
    results.errors.push(`npm install failed: ${stderr}`);
    return results;
  }

  // -----------------------------------------------------------------------
  // Step 2: Build the Astro site
  // -----------------------------------------------------------------------
  console.log('  Building site...');
  try {
    execSync('npm run build', {
      cwd: absDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
    results.buildSuccess = true;
    console.log('  Build succeeded.');
  } catch (err) {
    const stderr = err.stderr?.toString().slice(0, 500) || err.message;
    results.errors.push(`Build failed: ${stderr}`);
    return results;
  }

  // -----------------------------------------------------------------------
  // Step 3: Scan rendered HTML for leftover placeholder tokens
  // -----------------------------------------------------------------------
  console.log('  Scanning for leftover placeholders...');

  // Catch-all: any [ALL_CAPS_TOKEN] or [Title Case Token] left in HTML
  const PLACEHOLDER_PATTERNS = [
    /\[[A-Z][A-Z0-9_\s]{2,}\]/,  // [PRACTICE_NAME], [CITY], [YOUR_GOOGLE_MAPS_URL], etc.
    /\[University Name\]/i,
    /\[Graduation Year\]/i,
    /\[X\]\+/,
  ];

  const htmlFiles = await glob(resolve(absDir, 'dist/**/*.html'));

  for (const file of htmlFiles) {
    const content = await readFile(file, 'utf-8');
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(content)) {
        const relPath = file.replace(absDir + '/', '');
        results.placeholders.push({ file: relPath, pattern: pattern.source });
      }
    }
  }

  if (results.placeholders.length > 0) {
    console.log(`  Found ${results.placeholders.length} leftover placeholder(s).`);
  } else {
    console.log('  No leftover placeholders found.');
  }

  // -----------------------------------------------------------------------
  // Step 4: Scan for internal links pointing to pages that don't exist (404s)
  // -----------------------------------------------------------------------
  console.log('  Scanning for broken internal links...');
  results.brokenLinks = [];

  // Build the set of valid paths from dist/**/*.html
  const builtPaths = new Set(['/']);
  for (const file of htmlFiles) {
    // dist/about/index.html → /about/
    let rel = file.replace(resolve(absDir, 'dist'), '').replace(/\\/g, '/');
    if (rel.endsWith('/index.html')) rel = rel.slice(0, -'index.html'.length);
    else rel = rel.slice(0, -'.html'.length);
    builtPaths.add(rel);
    // Also add without trailing slash
    builtPaths.add(rel.replace(/\/$/, '') || '/');
  }

  // Scan all HTML files for internal hrefs that resolve to a missing path
  const internalHrefRe = /href="(\/[^"#?]*)"/g;
  const reportedLinks = new Set();
  // Patterns that are valid file/asset references, not page routes
  const ASSET_RE = /\.(css|js|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|eot|pdf|txt|xml|json)(\?.*)?$/i;
  const ASTRO_ASSET_RE = /^\/_astro\//;

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf-8');
    let m;
    internalHrefRe.lastIndex = 0;
    while ((m = internalHrefRe.exec(html)) !== null) {
      const href = m[1].replace(/\/$/, '') || '/';
      if (reportedLinks.has(href)) continue;
      // Skip asset/file references — we only care about page routes
      if (ASSET_RE.test(href) || ASTRO_ASSET_RE.test(href)) continue;
      if (href.startsWith('//') || href.startsWith('tel:') || href.startsWith('mailto:')) continue;
      // Dynamic routes (locations, blog slugs) are fine — skip if parent exists
      const parentPath = '/' + href.split('/').filter(Boolean).slice(0, -1).join('/');
      const isDynamic = builtPaths.has(parentPath + '/') || builtPaths.has(parentPath);
      if (!builtPaths.has(href) && !builtPaths.has(href + '/') && !isDynamic) {
        results.brokenLinks.push({ href, foundIn: file.replace(absDir + '/', '') });
        reportedLinks.add(href);
      }
    }
  }

  if (results.brokenLinks.length > 0) {
    console.log(`  ⚠  Found ${results.brokenLinks.length} broken internal link(s):`);
    for (const { href, foundIn } of results.brokenLinks.slice(0, 10)) {
      console.log(`     ${href}  (in ${foundIn})`);
    }
  } else {
    console.log('  No broken internal links found.');
  }

  return results;
}
