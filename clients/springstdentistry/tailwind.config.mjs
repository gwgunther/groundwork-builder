/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#1a5c6e',
          secondary: '#2d4a52',
          light:     '#f0f7f8',
          accent:    '#b8923a',
          highlight: '#b8923a',
        },
        neutral: {
          dark:   '#0e1f24',
          mid:    '#5a7a82',
          light:  '#f0f7f8',
          border: '#5a7a82',
        },
        surface: {
          1: '#FFFFFF',
          2: '#f0f7f8',
        },
        // Role-based border color (used as border-border-light in templates).
        // No literal-color slots — text/dark surfaces use neutral-dark and
        // muted text uses neutral-mid; both trace to brand.dark / brand.muted.
        'border-light':'#5a7a82',
      },
      fontFamily: {
        serif: ['Plus Jakarta Sans', 'Georgia', 'serif'],
        sans:  ['DM Sans',    'system-ui', 'sans-serif'],
      },
    },
  },
};
