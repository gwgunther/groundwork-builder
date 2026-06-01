# Groundwork Builder — Codebase Summary

## Overview

Groundwork Builder is a production-ready website starter (default **dental** vertical) with an integrated AI pipeline for rapid site generation and deployment. It combines a fully-featured Astro static site with automation scripts that scrape an existing practice website, extract structured data using Claude AI, and populate the template. **[BUILD_BEST_PRACTICES.md](BUILD_BEST_PRACTICES.md)** describes cross-project IA/SEO principles; preset files under `presets/` hold vertical-specific taxonomy and copy rules.

## Tech Stack

- **Framework**: Astro v5.4.0 (static site generation)
- **Styling**: Tailwind CSS v3.4.17 with customizable brand design tokens (default dental-oriented palette)
- **Language**: TypeScript + JavaScript (Node.js for pipeline scripts)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) for content extraction and generation
- **Hosting**: Cloudflare Pages (deployed via Wrangler)
- **CI/CD**: GitHub Actions

## Project Structure

```
src/
├── config/          # Centralized site config (practice info, navigation)
├── layouts/         # BaseLayout with SEO, schema, GA4
├── components/      # Reusable UI (Header, Footer, CTABlock, FAQBlock, GalleryGrid, BeforeAfter)
├── pages/           # File-based routing (services/, blog/, locations/, etc.)
├── content/         # Astro Content Collections (blog posts in Markdown)
└── styles/          # Tailwind layers + custom component classes

scripts/
└── pipeline/        # AI automation pipeline
    ├── studio.js    # Main entry point
    ├── prompts/     # Claude system prompts (site-audit, content-map, design-map)
    └── lib/         # Scraper, AI extraction, page/blog generators, image downloader

presets/
└── dental/          # Default vertical: taxonomy, service hubs, article rules, schema config (add more verticals as needed)

public/images/       # Static assets
```

## Key Architecture Decisions

### SEO-First Design
- Auto-generated JSON-LD schemas: LocalBusiness, MedicalProcedure, BlogPosting, FAQPage, BreadcrumbList, WebSite (see `BaseLayout.astro`)
- Sitemap with priority levels (homepage 1.0, key hubs including `/schedule` and `/services`, service hubs 0.9, blog 0.6–0.7); `public/robots.txt` template for crawl hints
- **IA & linking playbook:** [BUILD_BEST_PRACTICES.md](BUILD_BEST_PRACTICES.md) — nav structure, homepage/footer internal links, scheduling/contact URL strategy, Search Console notes (not site-specific)
- Open Graph and Twitter Card metadata on every page
- Canonical URLs throughout

### Centralized Configuration
- `src/config/site.ts` is the single source of truth for all practice information (name, phone, address, hours, doctor info)
- `src/config/navigation.ts` defines header menu structure with dropdowns
- `tailwind.config.mjs` holds brand color palette and typography (Playfair Display + DM Sans)

### Preset-Based Vertical Specialization
- `presets/dental/` holds the default vertical’s taxonomy, hub definitions, article rules, and schema defaults (fork for other industries)
- Service hubs are conditional — in the dental preset, general-dentistry is always kept; others are auto-included/removed based on detected services

### AI Pipeline Automation
1. **Scraper** (`lib/scraper.js`): Crawls the source practice site using jsdom
2. **AI Extractor** (`lib/ai-silver.js`): Uses Claude to extract structured PracticeData from scraped HTML
3. **Design Extractor** (`lib/ai-design.js`): Extracts color themes and design elements
4. **Page Generator** (`lib/page-generator.js`): Prunes unused service pages, updates services index
5. **Blog Generator** (`lib/blog-generator.js`): Creates draft article stubs with SEO metadata
6. **Image Downloader** (`lib/image-downloader.js`): Downloads practice photos

### Component Patterns
- Layout composition via `BaseLayout.astro` (wraps all pages, manages head metadata)
- Props-driven components with variant support (e.g., CTABlock: dark/light/white)
- Inline `<script>` tags for interactivity (mobile menu, FAQ accordion, gallery filters)
- Astro Content Collections with Zod schema validation for blog posts

## Build & Deploy

```bash
npm run dev       # Dev server on localhost:3000
npm run build     # Static build to /dist
npm run preview   # Preview built site
```

Deployment is automatic via GitHub Actions on push to `main`, or manual via `npx wrangler pages deploy dist`.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for pipeline |
| `PUBLIC_GA4_MEASUREMENT_ID` | Google Analytics 4 |
| `CLOUDFLARE_API_TOKEN` | Deployment credentials |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | Google API automation |
| `GSC_SITE_URL` | Google Search Console |
| `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` | Google Business Profile OAuth |
