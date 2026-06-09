/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#2a6b5e',
          secondary: '#1a4a40',
          light:     '#f2f7f5',
          accent:    '#c9a96e',
          highlight: '#896b33',
        },
        neutral: {
          dark:   '#1e2d2b',
          text:   '#2e3d3b',
          mid:    '#68716f',
          light:  '#f2f7f5',
          border: '#dce8e4',
        },
        surface: {
          1: '#fafcfb',
          2: '#f2f7f5',
        },
        // Role-based border color (used as border-border-light in templates).
        // Traces to brand-dna's dedicated border role (falls back to muted).
        'border-light':'#dce8e4',
      },
      fontFamily: {
        serif: ['Manrope', 'Georgia', 'serif'],
        sans:  ['Mulish',    'system-ui', 'sans-serif'],
      },
    },
  },
};
