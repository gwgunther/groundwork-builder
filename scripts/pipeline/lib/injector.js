/**
 * Clone the starter template and inject all config files from merged PracticeData.
 *
 * This module generates complete TypeScript/JS config files (not string-replace)
 * and sweeps .astro/.md files for placeholder tokens.
 */

import { cp, readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import { DEFAULT_HOURS, DEFAULT_COLORS } from './schema.js';
import { esc } from './utils.js';
import { upsertManagedFile } from './managed-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Template root is 3 levels up from this file (scripts/pipeline/lib -> project root) */
const TEMPLATE_ROOT = resolve(__dirname, '../../..');

/** Directories / files to skip when cloning the template */
const CLONE_EXCLUDE = new Set([
  'node_modules',
  'dist',
  '.git',
  'scripts/pipeline',
  '_memory',
  '_pipeline',
  'clients',         // built sites — never copy other clients into a new build
  'skills',          // skill source files — runtime-loaded, not part of template output
]);

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Clone the template into outputDir and inject all configuration.
 *
 * @param {object} data      - Complete PracticeData from merger.
 * @param {string} outputDir - Absolute path to the target directory.
 * @param {object} [preset]  - Loaded vertical preset (from preset-loader).
 */
export async function injectTemplate(data, outputDir, preset = null, design = null) {
  console.log(`[injector] Cloning template into ${outputDir}`);
  await cloneTemplate(TEMPLATE_ROOT, outputDir);

  // Lint: every component in src/components/generated/ that loads
  // image-roles.json must use the same `../../public/...` depth. Drift here
  // produces silent failure (the gallery bug). Fail fast at template-clone
  // time so the operator sees a clear error instead of a missing section.
  await lintGeneratedComponentPaths(outputDir);

  console.log('[injector] Injecting site config');
  await injectSiteConfig(data, outputDir, preset);

  console.log('[injector] Injecting navigation');
  await injectNavigation(data, outputDir);

  console.log('[injector] Injecting Tailwind config');
  await injectTailwindConfig(data, outputDir);

  console.log('[injector] Injecting Astro config');
  await injectAstroConfig(data, outputDir);

  console.log('[injector] Injecting deploy config');
  await injectDeployConfig(data, outputDir);

  console.log('[injector] Injecting content config');
  await injectContentConfig(data, outputDir);

  console.log('[injector] Replacing page placeholders');
  await injectPagePlaceholders(data, outputDir, design);

  console.log('[injector] Done.');
}

// ---------------------------------------------------------------------------
// Clone helper
// ---------------------------------------------------------------------------

/**
 * Verify every `.astro` file under `outputDir/src/components/generated/` that
 * loads `image-roles.json` uses the canonical `../../public/...` path. The
 * Astro runtime resolves `import.meta.url` for components in `generated/`
 * such that this is the correct depth. Three slashes (`../../../public/...`)
 * silently fails to load and any such section renders empty — that's the
 * gallery bug we hunted down by hand once.
 *
 * Throws with a clear error if drift is detected. Better to fail at template
 * clone than ship a broken section.
 */
async function lintGeneratedComponentPaths(outputDir) {
  const generatedDir = resolve(outputDir, 'src', 'components', 'generated');
  let entries;
  try {
    entries = await readdir(generatedDir, { withFileTypes: true });
  } catch {
    return; // dir may not exist on first runs
  }

  const offenders = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.astro')) continue;
    const filePath = join(generatedDir, e.name);
    const content = await readFile(filePath, 'utf8');

    // Look for any URL constructor referencing image-roles.json.
    const re = /new URL\(['"]([^'"]*image-roles\.json)['"]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const refPath = m[1];
      // Allowed: '../../public/images/image-roles.json' (depth-2 from generated/)
      // Disallowed: anything else (most commonly '../../../public/...').
      if (!/^\.\.\/\.\.\/public\/images\/image-roles\.json$/.test(refPath)) {
        offenders.push({ file: e.name, refPath });
      }
    }
  }

  if (offenders.length > 0) {
    const list = offenders.map(o => `  - ${o.file}: ${o.refPath}`).join('\n');
    throw new Error(
      `[injector] Path-consistency lint failed in src/components/generated/.\n` +
      `Components in generated/ must reference image-roles.json as '../../public/images/image-roles.json'.\n` +
      `Drift detected:\n${list}\n` +
      `Fix the offending stub before re-running. (Other depths silently fail and the section renders empty.)`
    );
  }
}

async function cloneTemplate(srcRoot, destRoot, finalDestRoot = null) {
  // finalDestRoot tracks the original output dir across recursive calls so we
  // can detect "destination is inside the template" loops. Without this, when
  // the user passes --output ../groundwork-builder/clients/foo (a path INSIDE
  // the template root), we'd recursively copy `clients/` into `clients/foo/clients/`
  // and infinite-loop until ENAMETOOLONG.
  finalDestRoot = finalDestRoot || resolve(destRoot);

  await mkdir(destRoot, { recursive: true });

  const entries = await readdir(srcRoot, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcRoot, entry.name);
    const destPath = join(destRoot, entry.name);

    // Compute the relative path from the template root for exclusion checks
    const relFromRoot = relative(TEMPLATE_ROOT, srcPath);

    // Check if this entry (or a parent path) is in the exclusion set
    const shouldExclude = [...CLONE_EXCLUDE].some(
      ex => relFromRoot === ex || relFromRoot.startsWith(ex + '/')
    );
    if (shouldExclude) continue;

    // Skip the destination itself if it lives inside the template root —
    // prevents the recursive copy from copying its own destination into itself.
    const absSrcPath = resolve(srcPath);
    if (absSrcPath === finalDestRoot || finalDestRoot.startsWith(absSrcPath + '/')) {
      continue;
    }

    if (entry.isDirectory()) {
      await cloneTemplate(srcPath, destPath, finalDestRoot);
    } else {
      await mkdir(dirname(destPath), { recursive: true });
      await cp(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// site.ts
// ---------------------------------------------------------------------------

export async function injectSiteConfig(data, outputDir, preset = null) {
  const p = data.practice;
  const d = data.doctor;
  const a = data.address;
  const h = data.hours || DEFAULT_HOURS;

  const hoursDisplay = (h.display || DEFAULT_HOURS.display)
    .map(e => `    { day: '${esc(e.day)}', time: '${esc(e.time)}' },`)
    .join('\n');

  const hoursSchema = (h.schema || DEFAULT_HOURS.schema)
    .map(s => `'${esc(s)}'`)
    .join(', ');

  const sameAs = (p.sameAs || [])
    .filter(Boolean)
    .map(url => `    '${esc(url)}',`)
    .join('\n');

  const sameAsBlock = sameAs
    ? `[\n    site.googleProfileLink,\n${sameAs}\n  ]`
    : `[\n    site.googleProfileLink,\n  ]`;

  const businessType = preset?.schema?.businessType || 'Dentist';
  const defaultCredentials = preset?.schema?.defaultCredentials || 'DDS';

  const content = `// Central source of truth for practice information.
// Auto-generated by the build pipeline — do not edit manually.

export const site = {
  name: '${esc(p.name || '')}',
  url: 'https://${esc(p.domain || 'example.com')}',
  phone: '${esc(p.phone || '')}',
  phoneDigits: '${esc(p.phoneDigits || '')}',
  email: '${esc(p.email || '')}',
  googleReviewLink: '${esc(p.googleReviewLink || '')}',
  googleProfileLink: '${esc(p.googleProfileLink || '')}',
};

export const doctor = {
  // \`name\` includes the title prefix (e.g. "Dr. Anthony Hoang"). Use it as-is.
  // For copy that already provides a title, use \`nameNoTitle\` instead.
  name: '${esc(d.name || '')}',
  firstName: '${esc(d.firstName || '')}',
  lastName: '${esc(d.lastName || '')}',
  nameNoTitle: '${esc((d.name || '').replace(/^(Dr|Doctor|Mr|Mrs|Ms|Prof)\.?\s+/i, ''))}',
  credentials: '${esc(d.credentials || defaultCredentials)}',
  bio: ${JSON.stringify(d.bio || data.content?.aboutText || '')},
};

// Additional doctors — secondary clinicians at the practice. Templates that
// support multi-doctor display (about.astro, team page) iterate this array.
// Empty for single-doctor practices.
export const additionalDoctors = ${JSON.stringify(
  (data.additionalDoctors || []).filter(x => x?.name).map(x => ({
    name:        x.name        || '',
    firstName:   x.firstName   || '',
    lastName:    x.lastName    || '',
    nameNoTitle: (x.name || '').replace(/^(Dr|Doctor|Mr|Mrs|Ms|Prof)\.?\s+/i, ''),
    credentials: x.credentials || '',
    bio:         x.bio         || '',
    education:   x.education   || '',
    specialties: x.specialties || [],
    photoPath:   x.photoPath   || null,
  })),
  null,
  2,
)};

// Unified doctors[] — primary first, then additionalDoctors. Use this when
// you want to render ALL doctors uniformly (e.g. team page, multi-doctor
// "Meet Our Doctors" section).
export const doctors = [doctor, ...additionalDoctors];

export const address = {
  street: '${esc(a.street || '')}',
  city: '${esc(a.city || '')}',
  state: '${esc(a.state || '')}',
  zip: '${esc(a.zip || '')}',
  country: '${esc(a.country || 'US')}',
  full: '${esc(a.full || '')}',
};

export const hours = {
  display: [
${hoursDisplay}
  ],
  schema: [${hoursSchema}],
};

export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': '${esc(businessType)}',
  'name': site.name,
  'url': site.url,
  'telephone': site.phone,
  'address': {
    '@type': 'PostalAddress',
    'streetAddress': address.street,
    'addressLocality': address.city,
    'addressRegion': address.state,
    'postalCode': address.zip,
    'addressCountry': address.country,
  },
  'openingHours': hours.schema,
  'priceRange': '${esc(p.priceRange || '$$')}',${
    p.medicalSpecialty
      ? `\n  'medicalSpecialty': '${esc(p.medicalSpecialty)}',`
      : ''
  }
  'sameAs': ${sameAsBlock},
};

// Person schema for the practice's primary doctor — used on the about page
// and any page that profiles the doctor specifically.
// (Back-compat scalar; new code should iterate \`personSchemas[]\` instead.)
export const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  'name': doctor.name,
  'jobTitle': '${esc((d.credentials || defaultCredentials).trim())} ${esc((preset?.schema?.businessType || 'Dentist'))}',
  'worksFor': {
    '@type': '${esc(businessType)}',
    'name': site.name,
    'url': site.url,
    'address': localBusinessSchema.address,
  },${d.bio ? `
  'description': doctor.bio,` : ''}${d.education ? `
  'alumniOf': '${esc(d.education)}',` : ''}${d.specialties && d.specialties.length ? `
  'knowsAbout': ${JSON.stringify(d.specialties)},` : ''}
};

// Person schemas for ALL doctors — one entry per clinician. Use this on
// /about/ (so search engines see every doctor as a Person entity) and on
// per-doctor /team/<slug>/ pages. \`personSchema\` (singular, above) remains
// for back-compat = personSchemas[0].
export const personSchemas = doctors.map((doc) => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  'name': doc.name,
  'jobTitle': \`\${(doc.credentials || '${esc(defaultCredentials)}').trim()} ${esc(preset?.schema?.businessType || 'Dentist')}\`,
  'worksFor': {
    '@type': '${esc(businessType)}',
    'name': site.name,
    'url': site.url,
    'address': localBusinessSchema.address,
  },
  ...(doc.bio       ? { 'description': doc.bio } : {}),
  ...(doc.education ? { 'alumniOf':   doc.education } : {}),
  ...(doc.specialties && doc.specialties.length ? { 'knowsAbout': doc.specialties } : {}),
  ...(doc.photoPath ? { 'image': doc.photoPath } : {}),
}));
`;

  const filePath = resolve(outputDir, 'src/config/site.ts');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// navigation.ts
// ---------------------------------------------------------------------------

export async function injectNavigation(data, outputDir) {
  // Use the actual scraped services for the dropdown — not invented hub categories.
  const offered = (data.services?.offered || []).slice(0, 8);
  const serviceDropdown = offered
    .map(s => {
      const label = typeof s === 'string' ? s : s.name;
      const slug  = typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, '-') : (s.slug || s.name?.toLowerCase().replace(/\s+/g, '-'));
      const desc  = typeof s === 'object' ? (s.description || s.blurb || '') : '';
      return `      { label: '${esc(label)}', href: '/services/${esc(slug)}', desc: '${esc(desc)}' },`;
    })
    .join('\n');

  const content = `// Navigation link structure for Header.astro
// Auto-generated by the build pipeline — do not edit manually.
// NOTE: The AI-generated Header.astro may build its own nav from site config + DNA.
// This file serves as a structured reference and fallback.

export interface NavDropdownItem {
  label: string;
  href: string;
  desc?: string;
}

export interface NavLink {
  label: string;
  href: string;
  dropdown?: NavDropdownItem[];
}

export const navLinks: NavLink[] = [
  { label: 'About', href: '/about' },
  {
    label: 'Services',
    href: '/services',
    dropdown: [
${serviceDropdown}
      { label: 'All Services', href: '/services' },
    ],
  },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
];
`;

  const filePath = resolve(outputDir, 'src/config/navigation.ts');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// tailwind.config.mjs
// ---------------------------------------------------------------------------

export async function injectTailwindConfig(data, outputDir) {
  // Strict — every design token must come from the brand step. No hardcoded
  // fallbacks. If a required key is missing, that means the upstream brand
  // step (ai-brand-direction.js) failed to produce it, and we want loud
  // failure rather than silently shipping generic defaults across builds.
  const colors = data.brand?.colors || {};
  const fonts  = data.brand?.fonts  || {};

  const required = ['primary', 'secondary', 'light', 'accent', 'dark', 'muted'];
  const missingColors = required.filter(k => !colors[k]);
  if (missingColors.length > 0) {
    throw new Error(
      `[injector] Brand palette missing required keys: ${missingColors.join(', ')}. ` +
      `The brand-direction phase (ai-brand-direction.js) must produce all of: ${required.join(', ')}. ` +
      `Refusing to ship hardcoded fallback colors.`
    );
  }
  if (!fonts.heading || !fonts.body) {
    throw new Error(
      `[injector] Brand fonts missing: heading=${fonts.heading || '(missing)'}, body=${fonts.body || '(missing)'}. ` +
      `The brand-direction phase must produce both. Refusing to ship Playfair/DM Sans defaults.`
    );
  }

  // Derived system tokens — every value traces back to the brand palette:
  //   surface-1   = pure white (the page background; not a brand decision)
  //   surface-2   = brand.light  (warm off-white from brand)
  //   neutral-*   = derived from brand.dark / brand.muted / brand.light
  // No literal hex values appear in this output that didn't come from brand.
  const content = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '${esc(colors.primary)}',
          secondary: '${esc(colors.secondary)}',
          light:     '${esc(colors.light)}',
          accent:    '${esc(colors.accent)}',
          highlight: '${esc(colors.accent)}',
        },
        neutral: {
          dark:   '${esc(colors.dark)}',
          mid:    '${esc(colors.muted)}',
          light:  '${esc(colors.light)}',
          border: '${esc(colors.muted)}',
        },
        surface: {
          1: '#FFFFFF',
          2: '${esc(colors.light)}',
        },
        // Role-based border color (used as border-border-light in templates).
        // No literal-color slots — text/dark surfaces use neutral-dark and
        // muted text uses neutral-mid; both trace to brand.dark / brand.muted.
        'border-light':'${esc(colors.muted)}',
      },
      fontFamily: {
        serif: ['${esc(fonts.heading)}', 'Georgia', 'serif'],
        sans:  ['${esc(fonts.body)}',    'system-ui', 'sans-serif'],
      },
    },
  },
};
`;

  const filePath = resolve(outputDir, 'tailwind.config.mjs');
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// global.css — DNA-driven component classes
// ---------------------------------------------------------------------------

/**
 * Generate src/styles/global.css from the design DNA so that btn-primary,
 * btn-secondary, .card, and .section-heading reflect the archetype choices
 * (radius, density, heading scale) instead of being hardcoded.
 */
export async function injectGlobalCss(dna, outputDir) {
  if (!dna) return;

  // Radius token → Tailwind rounded class
  const radiusMap = {
    none:  'rounded-none',
    sm:    'rounded-sm',
    md:    'rounded-md',
    lg:    'rounded-lg',
    xl:    'rounded-xl',
    full:  'rounded-full',
  };
  const btnRadius = radiusMap[dna.radius] || 'rounded-md';
  const cardRadius = dna.radius === 'none' ? 'rounded-none'
    : dna.radius === 'full' ? 'rounded-2xl'
    : dna.radius === 'xl'   ? 'rounded-2xl'
    : dna.radius === 'lg'   ? 'rounded-xl'
    : 'rounded-xl';

  // Density token → button padding
  const paddingMap = {
    compact: 'px-5 py-2.5',
    default: 'px-6 py-3',
    airy:    'px-8 py-4',
  };
  const btnPadding = paddingMap[dna.density] || 'px-6 py-3';

  // Heading scale → font sizes
  const headingMap = {
    dramatic:   'text-5xl md:text-6xl',
    moderate:   'text-4xl md:text-5xl',
    restrained: 'text-3xl md:text-4xl',
  };
  const sectionHeading = headingMap[dna.headingScale] || headingMap.moderate;

  // Card treatment → border/shadow
  const cardTreatmentMap = {
    'flat':        'border border-border-light bg-surface-2',
    'soft-shadow': 'shadow-sm bg-surface-1',
    'hard-shadow': 'shadow-md bg-surface-1',
    'outlined':    'border-2 border-neutral-dark bg-surface-1',
    'ghost':       'bg-surface-2',
  };
  const cardStyle = cardTreatmentMap[dna.cardTreatment] || 'border border-border-light bg-surface-2';

  // Motion token → transition speed
  const motionMap = {
    none:    'duration-0',
    subtle:  'duration-200',
    moderate:'duration-300',
    expressive: 'duration-500',
  };
  const transitionDuration = motionMap[dna.motion] || 'duration-200';

  const css = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Auto-generated from design DNA — archetype: ${dna.archetype || 'default'} */

@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    @apply font-sans antialiased text-neutral-dark;
  }

  h1 {
    @apply font-serif;
  }

  a {
    @apply transition-colors ${transitionDuration};
  }
}

@layer components {
  .btn-primary {
    @apply inline-block bg-brand-primary text-white font-semibold ${btnPadding} ${btnRadius} transition-all ${transitionDuration} text-center hover:opacity-90;
  }

  .btn-secondary {
    @apply inline-block bg-transparent text-brand-primary font-semibold ${btnPadding} ${btnRadius} transition-all ${transitionDuration} text-center border border-brand-primary hover:bg-brand-primary hover:text-white;
  }

  .btn-accent {
    @apply inline-block bg-brand-accent text-white font-semibold ${btnPadding} ${btnRadius} transition-all ${transitionDuration} text-center hover:opacity-90;
  }

  .section-heading {
    @apply ${sectionHeading} font-bold leading-tight tracking-tight text-neutral-dark;
  }

  .section-subheading {
    @apply text-2xl md:text-3xl font-semibold leading-tight tracking-tight text-neutral-dark;
  }

  .card {
    @apply ${cardRadius} p-6 ${cardStyle};
  }

  .prose-dental {
    @apply text-neutral-mid leading-relaxed;
  }

  .prose-dental p {
    @apply mb-4;
  }

  .prose-dental h2 {
    @apply text-2xl md:text-3xl font-semibold leading-tight tracking-tight text-neutral-dark mt-8 mb-4;
  }

  .prose-dental h3 {
    @apply font-serif text-xl font-semibold mt-6 mb-3 text-neutral-dark;
  }

  .prose-dental ul {
    @apply list-disc list-inside mb-4 space-y-2;
  }

  .prose-dental ol {
    @apply list-decimal list-inside mb-4 space-y-2;
  }

  .nav-link {
    @apply font-medium transition-colors ${transitionDuration} text-neutral-dark hover:text-brand-primary;
  }
}
`;

  const filePath = resolve(outputDir, 'src/styles/global.css');
  await writeFile(filePath, css, 'utf-8');
}

// ---------------------------------------------------------------------------
// astro.config.mjs
// ---------------------------------------------------------------------------

export async function injectAstroConfig(data, outputDir) {
  const domain = data.practice?.domain || 'example.com';
  const siteUrl = `https://${domain}`;

  const hubPaths = (data.services?.hubs || [])
    .map(h => `'/${h.slug}/'`)
    .join(', ');

  // Astro 6 + Tailwind 4 — Tailwind is wired via the Vite plugin
  // (@tailwindcss/vite), not the deprecated @astrojs/tailwind integration.
  // Matches this repo's root astro.config.mjs and the generated project's
  // package.json (which already lists @tailwindcss/vite as a dependency).
  const content = `import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: '${esc(siteUrl)}',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      entries: ['src/pages/**/*.astro'],
      noDiscovery: true,
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/thank-you'),
      serialize(item) {
        const siteUrl = '${esc(siteUrl)}';
        if (item.url === siteUrl + '/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        const highPriority = [${hubPaths ? hubPaths + ', ' : ''}'/about'];
        if (highPriority.some(p => item.url.endsWith(p) || item.url.endsWith(p + '/'))) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        if (item.url.includes('/blog/') && !item.url.replace(siteUrl + '/blog/', '').includes('/')) {
          return { ...item, priority: 0.7, changefreq: 'weekly' };
        }
        if (item.url.includes('/blog/')) {
          return { ...item, priority: 0.6, changefreq: 'monthly' };
        }
        return { ...item, priority: 0.8, changefreq: 'monthly' };
      },
    }),
  ],
});
`;

  const filePath = resolve(outputDir, 'astro.config.mjs');
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// .github/workflows/deploy.yml
// ---------------------------------------------------------------------------

export async function injectDeployConfig(data, outputDir) {
  const deployPath = resolve(outputDir, '.github/workflows/deploy.yml');

  let content;
  try {
    content = await readFile(deployPath, 'utf-8');
  } catch {
    // No deploy file in the cloned output — nothing to patch
    return;
  }

  const domain = data.practice?.domain || 'example.com';
  const projectName = domain.replace(/\./g, '-');

  content = content.replace(/https:\/\/\[DOMAIN\]/g, `https://${domain}`);
  content = content.replace(/\[DOMAIN\]/g, domain);
  content = content.replace(/\[PROJECT_NAME\]/g, projectName);

  await writeFile(deployPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// content/config.ts  (update default author)
// ---------------------------------------------------------------------------

export async function injectContentConfig(data, outputDir) {
  const configPath = resolve(outputDir, 'src/content/config.ts');

  let content;
  try {
    content = await readFile(configPath, 'utf-8');
  } catch {
    return;
  }

  const practiceName = data.practice?.name || '';
  if (practiceName) {
    content = content.replace(
      /\.default\(['"].*?['"]\)/g,
      `.default('${esc(practiceName)}')`
    );
  }

  await writeFile(configPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Placeholder sweep across .astro and .md files
// ---------------------------------------------------------------------------

export async function injectPagePlaceholders(data, outputDir, design = null) {
  const patterns = [
    resolve(outputDir, 'src/**/*.astro'),
    resolve(outputDir, 'src/**/*.md'),
  ];

  let files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { nodir: true });
    files = files.concat(matches);
  }

  // Build replacement map from data
  const city = data.address?.city || '';
  const state = data.address?.state || '';
  const practiceName = data.practice?.name || '';
  const doctorFirst = data.doctor?.firstName || '';
  const doctorLast = data.doctor?.lastName || '';
  const credentials = data.doctor?.credentials || 'DDS';
  const domain = data.practice?.domain || 'example.com';
  const street = data.address?.street || '';
  const zip = data.address?.zip || '';

  // Stats replacements — replace [X]+ patterns near known stat labels
  const stats = data.content?.stats || {};

  const doctorFullName = data.doctor?.name
    || (doctorFirst ? `Dr. ${doctorFirst} ${doctorLast}`.trim() : '');
  const doctorBio = data.doctor?.bio
    || (doctorFullName ? `${doctorFullName} is dedicated to providing exceptional dental care to patients in ${city || 'the community'}.` : '');

  // Build Google Fonts URL from brand fonts (preferred — produced by the
  // brand-direction phase) with the design-detection fonts as a backstop only
  // when brand-direction didn't run. We never fall back to a hardcoded family.
  const googleFontsUrl = buildGoogleFontsUrl(data.brand?.fonts || design?.fonts);

  const replacements = [
    // Exact bracket placeholders
    [/\[CITY\]/g, city],
    [/\[STATE\]/g, state],
    [/\[PRACTICE_NAME\]/g, practiceName],
    [/\[FIRST_NAME\]/g, doctorFirst],
    [/\[LAST_NAME\]/g, doctorLast],
    [/\[DOCTOR_NAME\]/g, doctorFullName],
    [/\[DOCTOR_BIO\]/g, doctorBio],
    [/\[CREDENTIALS\]/g, credentials],
    [/\[DOMAIN\]/g, domain],
    [/\[STREET_ADDRESS\]/g, street],
    [/\[ZIP\]/g, zip],
    [/\[YOUR_GOOGLE_REVIEW_ID\]/g, extractGoogleId(data.practice?.googleReviewLink) || 'YOUR_GOOGLE_REVIEW_ID'],
    [/\[YOUR_GOOGLE_PROFILE_ID\]/g, extractGoogleId(data.practice?.googleProfileLink) || 'YOUR_GOOGLE_PROFILE_ID'],
    [/\[GOOGLE_FONTS_URL\]/g, googleFontsUrl],
  ];

  for (const filePath of files) {
    let content = await readFile(filePath, 'utf-8');
    let changed = false;

    for (const [pattern, replacement] of replacements) {
      const before = content;
      content = content.replace(pattern, replacement);
      if (content !== before) changed = true;
    }

    // Replace stat [X]+ placeholders with actual values when available
    if (stats.yearsExperience) {
      const before = content;
      content = content.replace(
        /(\[X\]\+)([\s\S]{0,40}Years?\s*Experience)/gi,
        `${stats.yearsExperience}+$2`
      );
      if (content !== before) changed = true;
    }
    if (stats.happyPatients) {
      const before = content;
      content = content.replace(
        /(\[X\]\+)([\s\S]{0,40}Happy\s*Patients?)/gi,
        `${stats.happyPatients}+$2`
      );
      if (content !== before) changed = true;
    }
    if (stats.fiveStarReviews) {
      const before = content;
      content = content.replace(
        /(\[X\]\+)([\s\S]{0,40}5[- ]?Star\s*Reviews?)/gi,
        `${stats.fiveStarReviews}+$2`
      );
      if (content !== before) changed = true;
    }

    // Replace any remaining [X]+ with a safe placeholder
    {
      const before = content;
      content = content.replace(/\[X\]\+/g, '—');
      if (content !== before) changed = true;
    }

    if (changed) {
      await writeFile(filePath, content, 'utf-8');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the Google Place ID from a g.page URL.
 * e.g. 'https://g.page/r/CU4itT3RNhmQEBM/review' -> 'CU4itT3RNhmQEBM'
 */
function extractGoogleId(url) {
  if (!url) return null;
  const match = url.match(/\/r\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Build a Google Fonts URL from brand-direction font choices.
 * Strict — fails loudly if fonts aren't provided. We never ship a default
 * typeface across builds; that's exactly the contamination we're avoiding.
 */
function buildGoogleFontsUrl(fonts) {
  const heading = fonts?.heading || fonts?.display;
  const body    = fonts?.body;
  if (!heading || !body) {
    throw new Error(
      `[buildGoogleFontsUrl] Brand fonts missing: heading=${heading || '(missing)'}, body=${body || '(missing)'}. ` +
      `The brand-direction phase must produce both.`
    );
  }

  // Map font names → Google Fonts API param strings
  const fontParams = {
    'Playfair Display':     'Playfair+Display:wght@600;700',
    'Cormorant Garamond':   'Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400',
    'Libre Baskerville':    'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
    'Lora':                 'Lora:ital,wght@0,400;0,600;0,700;1,400',
    'Merriweather':         'Merriweather:ital,wght@0,300;0,400;0,700;1,300',
    'EB Garamond':          'EB+Garamond:ital,wght@0,400;0,600;0,700;1,400',
    'DM Serif Display':     'DM+Serif+Display:ital,wght@0,400;1,400',
    'Fraunces':             'Fraunces:opsz,wght@9..144,300;9..144,600;9..144,700',
    'Spectral':             'Spectral:ital,wght@0,400;0,600;0,700;1,400',
    'Bitter':               'Bitter:ital,wght@0,400;0,600;0,700;1,400',
    'Abril Fatface':        'Abril+Fatface:wght@400',
    'Bebas Neue':           'Bebas+Neue:wght@400',
    'Raleway':              'Raleway:ital,wght@0,400;0,600;0,700;1,400',
    'Josefin Sans':         'Josefin+Sans:ital,wght@0,300;0,400;0,600;1,300',
    'Syne':                 'Syne:wght@400;600;700;800',
    'DM Sans':              'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400',
    'Inter':                'Inter:wght@400;500;600;700',
    'Outfit':               'Outfit:wght@300;400;500;600;700',
    'Plus Jakarta Sans':    'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Nunito':               'Nunito:ital,wght@0,400;0,600;0,700;1,400',
    'Nunito Sans':          'Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400',
    'Lato':                 'Lato:ital,wght@0,400;0,700;1,400',
    'Source Sans 3':        'Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400',
    'Work Sans':            'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Karla':                'Karla:ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Manrope':              'Manrope:wght@400;500;600;700',
    'Figtree':              'Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400',
  };

  const headingParam = fontParams[heading] || `${heading.replace(/ /g, '+')}:wght@400;600;700`;
  const bodyParam    = fontParams[body]    || `${body.replace(/ /g, '+')}:wght@400;500;600;700`;

  // Avoid duplicating if heading and body are the same family
  const params = heading === body
    ? headingParam
    : `${headingParam}&family=${bodyParam}`;

  return `https://fonts.googleapis.com/css2?family=${params}&display=swap`;
}

// ---------------------------------------------------------------------------
// Design DNA — written by the Creative Director phase
// ---------------------------------------------------------------------------

/**
 * Write src/config/design-dna.ts in the output project so the homepage
 * consumes the DNA at build time.
 */
export async function writeDesignDna(dna, outputDir) {
  // Override chrome variants with deterministic values from designTokens.
  // The AI director picks these freely — we replace them post-hoc so two sites
  // with different archetypes always get different nav/footer/gallery.
  const tokens = dna.designTokens || {};
  const dnaWithOverrides = {
    ...dna,
    navVariant:     tokens.navVariant     || dna.navVariant     || 'left-logo',
    footerVariant:  tokens.footerVariant  || dna.footerVariant  || 'editorial-split',
    galleryVariant: tokens.galleryVariant || dna.galleryVariant || 'masonry-3col',
  };

  const dnaJson = JSON.stringify(dnaWithOverrides, null, 2);
  const body = `/**
 * Design DNA — generated by Creative Director phase.
 * Do not hand-edit; overwrite by re-running the pipeline.
 */

export interface DesignTokens {
  cornerRadius:       'sharp' | 'moderate' | 'rounded' | 'full';
  buttonTreatment:    'filled' | 'outline' | 'soft-fill';
  labelStyle:         'inline' | 'badge';
  sectionSpacing:     'compact' | 'default' | 'airy';
  contentDensity:     'tight' | 'default' | 'loose';
  layoutWidth:        'narrow' | 'standard' | 'full';
  // 5 hero variants
  heroLayout:         'centered' | 'split' | 'split-offset' | 'poster' | 'text-only';
  // 5 services variants
  servicesLayout:     'card-grid' | 'alternating-rows' | 'accordion' | 'two-col-feature' | 'numbered-list';
  // 5 doctor-intro variants
  aboutLayout:        'split-photo' | 'full-width-card' | 'editorial-full' | 'minimal-text' | 'two-col-brief';
  // 5 reviews variants
  testimonialsLayout: 'card-row' | 'pull-quotes' | 'single-featured' | 'list-testimonials' | 'grid-mosaic';
  // 5 CTA variants
  ctaLayout:          'centered-banner' | 'split-image' | 'inline-minimal' | 'floating-card' | 'two-button';
  // 5 FAQ variants
  faqLayout:          'accordion-expandable' | 'two-column' | 'simple-stack' | 'cards-grid' | 'split-by-category';
  // 5 nav variants — deterministic per archetype
  navVariant:         'centered-logo' | 'left-logo' | 'split-logo' | 'transparent-overlay' | 'top-bar';
  // 5 footer variants
  footerVariant:      'minimal-dark' | 'editorial-split' | 'classic-4col' | 'compact-centered' | 'bold-cta-footer';
  // 5 gallery variants
  galleryVariant:     'masonry-3col' | 'editorial-2col' | 'filmstrip' | 'featured-grid' | 'full-bleed-row';
  // Visual personality signals
  typePersonality:    'grotesque' | 'display-serif' | 'humanist-serif' | 'geometric-sans';
  colorFamily:        'warm' | 'cool' | 'neutral';
}

export interface DesignDNA {
  archetype: string;
  heroVariant: 'centered' | 'asymmetric-left' | 'asymmetric-right' | 'split-image' | 'full-bleed' | 'poster';
  servicesVariant: 'cards-3up' | 'editorial-list' | 'accordion';
  navVariant: 'centered-logo' | 'left-logo' | 'split-logo' | 'transparent-overlay' | 'top-bar';
  footerVariant: 'minimal-dark' | 'editorial-split' | 'classic-4col' | 'compact-centered' | 'bold-cta-footer';
  galleryVariant: 'masonry-3col' | 'editorial-2col' | 'filmstrip' | 'featured-grid' | 'full-bleed-row';
  sectionOrder: string[];
  cardTreatment: 'bordered-flat' | 'soft-shadow' | 'elevated' | 'ghost';
  density: 'airy' | 'balanced' | 'dense';
  motion: 'none' | 'subtle' | 'expressive';
  radius: 'sharp' | 'sm' | 'md' | 'lg' | 'pill';
  borrowedFrom?: string | null;
  borrowedTrait?: string | null;
  divergenceRationale?: string;
  creativeDirection?: string;
  // typeui-style design system fields — populated by Creative Director
  typographyScale?: string;
  colorPalette?: string;
  spacingScale?: string;
  writingTone?: string;
  brandSummary?: string;
  doRules?: string[];
  dontRules?: string[];
  designTokens?: DesignTokens;
}

export const designDNA: DesignDNA = ${dnaJson};

export interface ImageRoles {
  hero: string | null;
  doctorPortrait: string | null;
  team: string[];
  interior: string[];
  gallery: string[];
  beforeAfter: string[];
}

export function imagePath(role: string | null | undefined): string | null {
  if (!role) return null;
  return \`/images/\${role.replace(/^\\/+/, '')}\`;
}
`;
  await writeFile(join(outputDir, 'src', 'config', 'design-dna.ts'), body);
}
