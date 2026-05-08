/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:     '#174d8f',
          secondary:   '#0b2d5e',
          light:       '#eef4fc',
          accent:      '#c49451',
          accentText:  '#a67c3a',
        },
        neutral: {
          dark:   '#0d1e35',
          mid:    '#3d5068',
          light:  '#eef4fc',
          border: '#c2cdd9',
        },
        surface: {
          1: '#FFFFFF',
          2: '#eef4fc',
          3: '#0b2d5e',
        },
        'border-light': '#c2cdd9',
      },
      fontFamily: {
        serif: ['Space Grotesk', 'Georgia', 'serif'],
        sans:  ['Inter',    'system-ui', 'sans-serif'],
      },
    },
  },
};
