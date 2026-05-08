# Build & SEO playbook (Groundwork Builder)

Internal reference for **information architecture, crawl signals, structured data, and launch checks** for any site shipped from this repo. It is **not** tied to a particular domain—apply the principles; swap labels and routes to match each project’s vertical and content model.

Use alongside the [README](README.md) setup checklist and [CODEBASE_SUMMARY](CODEBASE_SUMMARY.md) for architecture and pipeline behavior.

---

## 1. Site structure and navigation

- **Primary navigation** should use semantic HTML: a single top-level `<nav>` with predictable destinations (this template wires that in `src/config/navigation.ts` and `src/components/Header.astro`).
- Prefer **stable, first-class URL paths** for main sections so crawlers and users see a clear hierarchy (e.g. about, services or product hubs, resources, scheduling/contact). Avoid burying important destinations only in footers or one-off buttons.
- **Labels vs. paths:** Menu copy can vary by brand (“Resources,” “Get Started,” “Patients,” etc.); keep **targets** consistent and crawlable.

**Where to edit:** `src/config/navigation.ts`, `src/components/Header.astro`.

---

## 2. Homepage internal linking

The homepage should surface **more than a single conversion action**. Link to major hubs: who you are (about), what you offer (category or hub pages), breadth of offerings (index page), highlights or proof (e.g. gallery or case studies), and primary resources. That reinforces central URLs and spreads internal linking weight.

**Where to edit:** `src/pages/index.astro` (sections and text links).

---

## 3. Footer as a secondary site map

The footer should **repeat important destinations** with consistent anchor text—service or product groupings, about, resources, scheduling—so every page reinforces the same URL set.

**Where to edit:** `src/components/Footer.astro`.

---

## 4. Crawl signals

### `robots.txt`

- Default stance: **allow** public content; **disallow** only URLs that should not be indexed (e.g. thank-you or confirmation flows, referral handoffs, or other non-public/thin routes you define).
- Include a **`Sitemap:`** line pointing at the **sitemap index** for the **production origin** (must match the configured site URL).
- This repo ships **`public/robots.txt`** with placeholders—**set the domain** to match `site.url` in `src/config/site.ts` and `astro.config.mjs` for each deployment.

### Sitemap (`@astrojs/sitemap`)

- Use `serialize()` (or equivalent) so **home** and **key hubs** get higher priority/changefreq; tier blog or news; keep defaults sensible for long-tail pages.
- Use **`filter`** to drop URLs that should not appear in the XML at all.

### Build output

- Run `npm run build` and verify `dist/sitemap-index.xml` (and `robots.txt`) before go-live.

---

## 5. Structured data (JSON-LD)

- **Organization / local business:** Configure the primary entity in `src/config/site.ts` (type may vary by vertical—e.g. `Dentist`, `LocalBusiness`). Keep **`sameAs`** filled with authoritative profiles where applicable.
- **BreadcrumbList:** This template auto-generates breadcrumbs from the path in `BaseLayout.astro` for non-home URLs when you use that layout.
- **Per-page schema:** Pass `schema` from pages when the content warrants it (FAQ, articles, specific offer types—see README).
- **WebSite:** `BaseLayout` can include a minimal `WebSite` + `publisher` block for sitewide clarity. It does **not** control search result “sitelinks”; it is standard structured-data hygiene.

**Where to edit:** `src/config/site.ts`, `src/layouts/BaseLayout.astro`, individual pages.

---

## 6. Scheduling / contact URLs and third-party tools

- **On-domain scheduling or contact routes** (this template often uses `/schedule`) should be linked from **header, footer, CTAs, and body copy** on relevant inner pages so those URLs are not orphaned.
- If **primary booking** goes to a **third-party** system (practice-management schedulers, SaaS booking widgets, etc.):
  - Using the external URL for the main button is fine when required for operations.
  - Still expose a **stable on-domain path** in global chrome when you care about branded search, analytics, or SEO signals for that URL—e.g. nav, footer, or a secondary “Schedule on our site” action—rather than sending every prominent CTA only off-site.

**Where to edit:** `src/config/site.ts`, `Header.astro`, `Footer.astro`, `CTABlock.astro`, page content.

---

## 7. Optional dedicated contact page

A separate **`/contact`** route is optional if NAP and actions already live in the header/footer. Add a contact page when you want one canonical URL for “contact us” queries; keep it useful (hours, map, clear paths to schedule/call) and avoid duplicating the same thin block across many URLs.

---

## 8. Search Console and sitelinks

- Search Console does **not** offer a control to force or label organic sitelinks. Clear IA, internal linking, and time help; outcomes vary by query and algorithm.

---

## 9. AI pipeline alignment (`scripts/pipeline/`)

When generating or migrating sites from scraped content:

- **Site audit:** Consider IA, internal linking, crawl/schema—not only messaging (see `prompts/site-audit.md`).
- **Content map:** Copy should support CTAs and links into hubs and scheduling/contact where appropriate (`prompts/content-map.md`).
- **Design map:** Visual choices should not hide primary nav or bury key journeys (`prompts/design-map.md`).
- **Vertical name:** Content and design prompts interpolate **`{{verticalName}}`** from the active preset’s schema (e.g. `presets/dental/schema-config.js` → `verticalName: 'Dental'`). Defaults in extraction prompts (`lib/ai-silver.js`) are written for any professional practice site, not a single domain.

**Presets** under `presets/` encode vertical taxonomies—keep generated routes aligned with the stable URL strategy you ship for that project.

---

## 10. Pre-launch checklist (SEO & IA)

- [ ] `src/config/site.ts`: accurate `name`, `url`, contact fields, `sameAs` as needed.
- [ ] `astro.config.mjs`: `site` origin matches production; sitemap priorities and filters reviewed.
- [ ] `public/robots.txt`: production origin and sitemap URL; `Disallow` only what you intend.
- [ ] Navigation + footer: primary destinations and scheduling/contact discoverable.
- [ ] Homepage links into major hubs (about, services, proof/resources—adapt to the project).
- [ ] Key inner pages link to scheduling/contact where relevant.
- [ ] `npm run build` succeeds; spot-check sitemap and JSON-LD on representative pages.

---

## Quick reference — key files

| Concern | File(s) |
|--------|---------|
| Business + primary entity schema | `src/config/site.ts` |
| Nav labels & URLs | `src/config/navigation.ts` |
| Global chrome | `src/components/Header.astro`, `Footer.astro` |
| Meta, breadcrumbs, WebSite schema | `src/layouts/BaseLayout.astro` |
| Sitemap | `astro.config.mjs` |
| Robots | `public/robots.txt` |
| Homepage IA | `src/pages/index.astro` |

Extend this document when you add verticals, locales, or hosting targets; keep **principles** broad and **examples** labeled as template defaults, not client-specific requirements.
