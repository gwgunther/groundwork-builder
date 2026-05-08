/**
 * link-scrub.js — Post-generation link validator and auto-fixer.
 *
 * Scans all generated .astro component files for internal href values that
 * point to non-existent template routes. Applies known mappings automatically;
 * flags anything it can't resolve.
 *
 * This runs AFTER component generation and BEFORE the Astro build, so bad
 * links are caught and fixed before they can cause 404s.
 *
 * Usage:
 *   const { fixed, flagged } = await scrubLinks(outputDir);
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';

// The complete set of valid top-level routes in the Astro template.
// Dynamic segments (/services/*, /blog/*, /locations/*) are handled separately.
const VALID_ROUTES = new Set([
  '/',
  '/about',
  '/services',
  '/blog',
  '/gallery',
  '/faq',
  '/financing',
  '/schedule',
  '/thank-you',
  // Pipeline-internal pages — not user-facing but valid
  '/missing',
]);

// Valid dynamic route prefixes — any path starting with these is fine.
const VALID_PREFIXES = [
  '/services/',
  '/blog/',
  '/locations/',
];

// Known bad → good mappings. Applied automatically.
const ROUTE_FIX_MAP = {
  '/new-patients':          '/schedule',
  '/appointment':           '/schedule',
  '/request-appointment':   '/schedule',
  '/book':                  '/schedule',
  '/contact':               '/schedule',
  '/contact-us':            '/schedule',
  '/book-appointment':      '/schedule',
  '/dr-anthony-hoang':      '/about',
  '/dr-richard-lee':        '/about',
  '/meet-the-doctor':       '/about',
  '/meet-the-team':         '/about',
  '/our-team':              '/about',
  '/about-us':              '/about',
  '/reviews':               null,   // no equivalent — remove or replace with /schedule
  '/testimonials':          null,
  '/before-after':          null,
  '/special-offers':        null,
  '/promotions':            null,
  '/careers':               null,
  '/privacy-policy':        null,
  '/sitemap':               null,
};

/**
 * Check if a path is valid.
 */
const ASSET_RE = /\.(css|js|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|eot|pdf|txt|xml|json)(\?.*)?$/i;

function isValidPath(path) {
  if (!path || !path.startsWith('/')) return true; // external/relative — skip
  if (ASSET_RE.test(path)) return true;            // static file — not a page route
  if (path.startsWith('/_astro/') || path.startsWith('/images/') || path.startsWith('/fonts/')) return true;
  const clean = path.replace(/\/$/, '') || '/';
  if (VALID_ROUTES.has(clean)) return true;
  if (VALID_PREFIXES.some(p => path.startsWith(p))) return true;
  return false;
}

/**
 * Attempt to fix a bad path. Returns the fixed path, or null if no fix known.
 */
function fixPath(path) {
  const clean = path.replace(/\/$/, '') || '/';
  if (clean in ROUTE_FIX_MAP) return ROUTE_FIX_MAP[clean];
  // Partial prefix match (e.g. /dr-john-smith → /about)
  for (const [bad, good] of Object.entries(ROUTE_FIX_MAP)) {
    if (bad && clean.startsWith(bad)) return good;
  }
  return undefined; // unknown — needs human review
}

/**
 * Scan and fix all .astro files in the output directory.
 *
 * @param {string} outputDir - Root of the generated Astro project
 * @returns {Promise<{ fixed: Array<{file, from, to}>, flagged: Array<{file, href}> }>}
 */
export async function scrubLinks(outputDir) {
  const absDir = resolve(outputDir);
  const fixed = [];
  const flagged = [];

  const astroFiles = await glob(resolve(absDir, 'src/**/*.astro'));

  for (const file of astroFiles) {
    let content = await readFile(file, 'utf-8');
    let modified = false;

    // Match href="..." and href={`...`} and href={'...'} patterns
    const patterns = [
      /href="(\/[^"#?]*)"/g,
      /href='(\/[^'#?]*)'/g,
    ];

    for (const re of patterns) {
      re.lastIndex = 0;
      content = content.replace(re, (match, path) => {
        if (isValidPath(path)) return match;

        const fix = fixPath(path);
        const relFile = file.replace(absDir + '/', '');

        if (fix === null) {
          // Known bad with no template equivalent — replace href with /schedule as safe fallback
          fixed.push({ file: relFile, from: path, to: '/schedule', reason: 'no-template-equivalent' });
          modified = true;
          return match.replace(path, '/schedule');
        }
        if (fix !== undefined) {
          fixed.push({ file: relFile, from: path, to: fix });
          modified = true;
          return match.replace(path, fix);
        }

        // Unknown path — flag for human review
        flagged.push({ file: relFile, href: path });
        return match;
      });
    }

    if (modified) {
      await writeFile(file, content, 'utf-8');
    }
  }

  return { fixed, flagged };
}
