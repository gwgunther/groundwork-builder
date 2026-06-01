/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#0e5c6e',
          secondary: '#1a3d4f',
          light:     '#f0f7f8',
          accent:    '#b8924a',
          highlight: '#b8924a',
        },
        neutral: {
          dark:   '#0f2330',
          mid:    '#4a6472',
          light:  '#f0f7f8',
          border: '#4a6472',
        },
        surface: {
          1: '#FFFFFF',
          2: '#f0f7f8',
        },
        // Role-based border color (used as border-border-light in templates).
        // No literal-color slots — text/dark surfaces use neutral-dark and
        // muted text uses neutral-mid; both trace to brand.dark / brand.muted.
        'border-light':'#4a6472',
      },
      fontFamily: {
        serif: ['Plus Jakarta Sans', 'Georgia', 'serif'],
        sans:  ['DM Sans',    'system-ui', 'sans-serif'],
      },
    },
  },
};
