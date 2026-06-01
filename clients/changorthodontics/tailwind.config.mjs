/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#1B3A6B',
          secondary: '#2D5A9E',
          light:     '#F2F5FA',
          accent:    '#C4962A',
          highlight: '#C4962A',
        },
        neutral: {
          dark:   '#0F1E35',
          mid:    '#5A6E87',
          light:  '#F2F5FA',
          border: '#5A6E87',
        },
        surface: {
          1: '#FFFFFF',
          2: '#F2F5FA',
        },
        // Role-based border color (used as border-border-light in templates).
        // No literal-color slots — text/dark surfaces use neutral-dark and
        // muted text uses neutral-mid; both trace to brand.dark / brand.muted.
        'border-light':'#5A6E87',
      },
      fontFamily: {
        serif: ['Space Grotesk', 'Georgia', 'serif'],
        sans:  ['Inter',    'system-ui', 'sans-serif'],
      },
    },
  },
};
