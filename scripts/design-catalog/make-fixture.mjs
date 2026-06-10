/**
 * make-fixture.mjs — assemble fixture-practice.json from a real past client build.
 *
 * The fixture is the standing placeholder-content file for design-catalog
 * previews/adaptations: instead of inventing practice copy from scratch each
 * time, previews pull REAL shipped content (hero, services, reviews, FAQs,
 * testimonials, stats) and let the AI adapt TONE per the reference entry's
 * voice block — facts and structure stay.
 *
 * Sources (per client):
 *   clients/<slug>/src/components/generated/*.content.json  — shipped section content
 *   clients/<slug>/_pipeline/01-scrape.json                 — practice identity, testimonials, stats, insurance
 *   _memory/runs.jsonl                                      — phone, city, doctor, signals
 *
 * CLI: node scripts/design-catalog/make-fixture.mjs [client-slug] [--out path]
 *      default slug: dentiq → docs/design-catalog/fixture-practice.json
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, CATALOG_DIR } from './lib.mjs';

const slug = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dentiq';
const oi = process.argv.indexOf('--out');
const outPath = oi !== -1 ? process.argv[oi + 1] : join(CATALOG_DIR, 'fixture-practice.json');

const clientDir = join(ROOT, 'clients', slug);
const J = async (p) => JSON.parse(await readFile(p, 'utf8'));

// 1. Shipped section content
const genDir = join(clientDir, 'src', 'components', 'generated');
const sections = {};
for (const f of (await readdir(genDir).catch(() => [])).filter(f => f.endsWith('.content.json'))) {
  sections[f.replace('.content.json', '')] = await J(join(genDir, f));
}

// 2. Scrape — identity + long-form content
const scrape = (await J(join(clientDir, '_pipeline', '01-scrape.json')).catch(() => ({}))).output || {};
const sc = scrape.content || {};

// 3. Run log — phone/city/doctor/signals (latest run for this client)
let run = null, runWithSignals = null;
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
try {
  const lines = (await readFile(join(ROOT, '_memory', 'runs.jsonl'), 'utf8')).trim().split('\n');
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (norm(r.client_slug) !== norm(slug)) continue;
      run = r;                                            // latest = identity
      if ((r.signals || []).length) runWithSignals = r;   // latest signal-bearing = signals
    } catch {}
  }
} catch {}

const fixture = {
  _meta: {
    purpose: 'Standing fixture content for design-catalog previews and adaptation mocks. Real shipped content from a past client build — adapt TONE per the reference entry’s voice block; keep facts and structure. Regenerate: npm run catalog:fixture [client-slug].',
    sourceClient: slug,
    generatedFrom: ['src/components/generated/*.content.json', '_pipeline/01-scrape.json', '_memory/runs.jsonl'],
    internalUseOnly: true,
  },
  practice: {
    name: scrape.practice?.name || run?.practice_name || slug,
    legalName: scrape.practice?.legalName || undefined,
    doctor: [run?.doctor_name, scrape.practice?.alternateName].find(v => v && !/unknown/i.test(v)) || undefined,
    city: run?.city || undefined,
    phone: run?.phone || undefined,
    description: scrape.practice?.description || undefined,
  },
  hero: sections.HeroSection || { headline: sc.heroTagline, subheadline: sc.heroSubheadline },
  doctorIntro: sections.DoctorIntro || null,
  services: sections.ServicesSection || null,
  reviews: sections.ReviewsSection || null,
  faqs: sections.FaqSection || null,
  cta: sections.CTABlock || null,
  longFormTestimonials: (sc.testimonials || []).slice(0, 6),
  stats: sc.stats || null,
  insurance: sc.insurance || null,
  signals: ((runWithSignals || run)?.signals || []).map(s => ({ type: s.type, label: s.label, detail: s.detail })),
};

await writeFile(outPath, JSON.stringify(fixture, null, 2) + '\n');
const ct = (x) => Array.isArray(x?.items) ? x.items.length : Array.isArray(x) ? x.length : 0;
console.log(`fixture ← ${slug}: hero "${(fixture.hero?.headline || '').slice(0, 50)}…" · ${ct(fixture.services)} services · ${ct(fixture.reviews)} reviews · ${ct(fixture.faqs)} faqs · ${fixture.longFormTestimonials.length} testimonials · ${fixture.signals.length} signals`);
console.log(`→ ${outPath}`);
