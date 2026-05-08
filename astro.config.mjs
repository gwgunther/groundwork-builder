import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// TODO: Replace with your practice's domain
export default defineConfig({
  site: 'https://example.com',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/thank-you') && !page.includes('/referral'),
      serialize(item) {
        const siteUrl = 'https://example.com';
        if (item.url === siteUrl + '/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        // Key hub URLs — tune per project (see BUILD_BEST_PRACTICES.md)
        if (item.url === `${siteUrl}/schedule/` || item.url === `${siteUrl}/services/`) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        // TODO: Update these path suffixes to match your service hub slugs
        const highPriority = [
          '/dental-implants/',
          '/cosmetic-dentistry/',
          '/general-dentistry/',
          '/restorative-dentistry/',
          '/about/',
        ];
        if (highPriority.some((p) => item.url.endsWith(p))) {
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
