# Dental Website Starter

A production-ready dental website template built with Astro, Tailwind CSS, and modern web standards. Designed for fast, SEO-optimized dental practice websites deployed to Cloudflare Pages.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Setup Checklist

### 1. Practice Information

Update `src/config/site.ts` — replace all `[PLACEHOLDER]` values:

- Practice name, phone, email
- Doctor name and credentials
- Street address, city, state, zip
- Google Business Profile links
- Office hours

### 2. Brand Colors & Fonts

Update `tailwind.config.mjs`:

- `brand.primary` — your main brand color
- `brand.secondary` — secondary color
- `brand.light` — light background tint
- `brand.accent` — accent color (gold, coral, etc.)
- `brand.highlight` — highlight color

Update Google Fonts link in `src/layouts/BaseLayout.astro` if changing fonts.

### 3. Navigation

Edit `src/config/navigation.ts` to match your practice's services and page structure.

### 4. Services

Customize the service pages in `src/pages/services/`:

- `general-dentistry.astro`
- `cosmetic-dentistry.astro`
- `dental-implants.astro`
- `restorative-dentistry.astro`

Add or remove service pages as needed. Update the services array in `src/pages/services.astro` and the footer links in `src/components/Footer.astro`.

### 5. Location Pages

Edit `src/pages/locations/[city].astro` — add nearby cities to `getStaticPaths()` for local SEO.

### 6. Images

Add images to `public/images/`:

- `branding/` — logo, favicon, OG image
- `heroes/` — hero section backgrounds
- `team/` — doctor and staff photos
- `gallery/` — before/after and result photos

### 7. Blog

Add markdown posts to `src/content/blog/`. See `sample-post.md` for the frontmatter format.

### 8. Environment Variables

Copy `.env.example` to `.env` and fill in:

- `PUBLIC_GA4_MEASUREMENT_ID` — Google Analytics 4

Optional (for automation scripts):
- Google Service Account credentials
- Google Business Profile OAuth tokens
- Cloudflare API credentials

### 9. Domain & Deployment

Update `astro.config.mjs` — replace `https://[DOMAIN]` with your actual domain.

Update `.github/workflows/deploy.yml`:
- Replace `[DOMAIN]` with your domain
- Replace `[PROJECT_NAME]` with your Cloudflare Pages project name
- Add required secrets to GitHub repository settings

## Architecture

```
src/
  config/         — site.ts (business info), navigation.ts (menu)
  layouts/        — BaseLayout.astro (SEO, schema, analytics)
  components/     — Header, Footer, CTABlock, FAQBlock, GalleryGrid, BeforeAfter
  pages/          — file-based routing
    services/     — service hub pages
    blog/         — blog listing + dynamic posts
    locations/    — local SEO city pages
  content/        — markdown blog posts
  styles/         — global.css (Tailwind component layer)
scripts/          — GA4, GSC, GBP automation
public/images/    — static assets
```

## Built-in Features

- **SEO**: Auto-generated BreadcrumbList, FAQPage, MedicalProcedure, BlogPosting, LocalBusiness schemas
- **Performance**: Static HTML, no JavaScript frameworks, optimized images
- **Analytics**: GA4 integration via environment variable
- **Sitemap**: Auto-generated with custom priorities
- **Responsive**: Mobile-first design with Tailwind
- **Accessibility**: ARIA labels, keyboard navigation, semantic HTML
- **Gallery**: Filterable grid with lightbox and before/after comparisons
- **Blog**: Markdown content collection with frontmatter SEO fields
- **Automation**: Scripts for GA4 reporting, Google Search Console, Google Business Profile management

## Tech Stack

- [Astro](https://astro.build) v5 — static site generation
- [Tailwind CSS](https://tailwindcss.com) v3 — utility-first styling
- [Cloudflare Pages](https://pages.cloudflare.com) — free global CDN hosting
- TypeScript — type-safe configuration

## Deployment

Push to `main` branch triggers automatic deployment via GitHub Actions to Cloudflare Pages.

Manual deployment:
```bash
npm run build
npx wrangler pages deploy dist --project-name=[PROJECT_NAME]
```
