/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#2D6A78',
          secondary: '#1A4A57',
          light:     '#F2F9FA',
          accent:    '#3AAFA9',
          highlight: '#3AAFA9',
        },
        neutral: {
          dark:   '#0F2E36',
          mid:    '#5A7F8A',
          light:  '#F2F9FA',
          border: '#5A7F8A',
        },
        surface: {
          1: '#FFFFFF',
          2: '#F2F9FA',
        },
        // Role-based border color (used as border-border-light in templates).
        // No literal-color slots — text/dark surfaces use neutral-dark and
        // muted text uses neutral-mid; both trace to brand.dark / brand.muted.
        'border-light':'#5A7F8A',
      },
      fontFamily: {
        serif: ['Plus Jakarta Sans', 'Georgia', 'serif'],
        sans:  ['DM Sans',    'system-ui', 'sans-serif'],
      },
    },
  },
};
