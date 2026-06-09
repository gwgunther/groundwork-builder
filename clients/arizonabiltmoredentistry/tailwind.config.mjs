/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#2a6b5e',
          secondary: '#1d4d43',
          light:     '#f2f7f6',
          accent:    '#c9a96e',
          highlight: '#896b33',
        },
        neutral: {
          dark:   '#1e2d2b',
          text:   '#2e3d3b',
          mid:    '#68716f',
          light:  '#f2f7f6',
          border: '#d6e4e1',
        },
        surface: {
          1: '#fafcfb',
          2: '#f2f7f6',
        },
        // Role-based border color (used as border-border-light in templates).
        // Traces to brand-dna's dedicated border role (falls back to muted).
        'border-light':'#d6e4e1',
      },
      fontFamily: {
        serif: ['Epilogue', 'Georgia', 'serif'],
        sans:  ['Public Sans',    'system-ui', 'sans-serif'],
      },
    },
  },
};
