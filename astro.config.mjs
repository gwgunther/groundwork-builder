import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

// TODO: Replace with your practice's domain
export default defineConfig({
  site: 'https://example.com',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/thank-you'),
      serialize(item) {
        const siteUrl = 'https://example.com';
        if (item.url === siteUrl + '/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        // TODO: Update these paths to match your service hub pages
        const highPriority = ['/dental-implants/', '/cosmetic-dentistry/', '/general-dentistry/', '/about'];
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
    tailwind(),
  ],
});
