# Groundwork Builder — Codebase Summary

## Overview

Groundwork Builder is a production-ready dental website starter template with an integrated AI-powered pipeline for rapid site generation and deployment. It combines a fully-featured Astro static site with automation scripts that scrape existing dental websites, extract structured data using Claude AI, and populate the template automatically.

## Tech Stack

- **Framework**: Astro v5.4.0 (static site generation)
- **Styling**: Tailwind CSS v3.4.17 with custom dental-themed design tokens
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
└── dental/          # Dental vertical preset (taxonomy, service hubs, article rules, schema config)

public/images/       # Static assets
```

## Key Architecture Decisions

### SEO-First Design
- Auto-generated JSON-LD schemas: LocalBusiness, MedicalProcedure, BlogPosting, FAQPage, BreadcrumbList
- Sitemap with priority levels (homepage 1.0, service hubs 0.9, blog 0.6–0.7)
- Open Graph and Twitter Card metadata on every page
- Canonical URLs throughout

### Centralized Configuration
- `src/config/site.ts` is the single source of truth for all practice information (name, phone, address, hours, doctor info)
- `src/config/navigation.ts` defines header menu structure with dropdowns
- `tailwind.config.mjs` holds brand color palette and typography (Playfair Display + DM Sans)

### Preset-Based Vertical Specialization
- `presets/dental/` contains all dental-specific knowledge (service taxonomy, hub definitions, article rules, schema templates)
- Service hubs are conditional — general-dentistry is always kept; others are auto-included/removed based on detected services

### AI Pipeline Automation
1. **Scraper** (`lib/scraper.js`): Crawls existing dental sites using jsdom
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
