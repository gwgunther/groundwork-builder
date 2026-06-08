/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#2a6b5e',
          secondary: '#3d8c7a',
          light:     '#f3f7f5',
          accent:    '#c9a96e',
          highlight: '#c9a96e',
        },
        neutral: {
          dark:   '#1e2d2b',
          text:   '#2e3d3a',
          mid:    '#7c8683',
          light:  '#f3f7f5',
          border: '#dce8e4',
        },
        surface: {
          1: '#fafcfb',
          2: '#f3f7f5',
        },
        // Role-based border color (used as border-border-light in templates).
        // Traces to brand-dna's dedicated border role (falls back to muted).
        'border-light':'#dce8e4',
      },
      fontFamily: {
        serif: ['Epilogue', 'Georgia', 'serif'],
        sans:  ['Public Sans',    'system-ui', 'sans-serif'],
      },
    },
  },
};
