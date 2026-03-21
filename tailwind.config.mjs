/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // TODO: Replace with practice brand colors
        brand: {
          primary: '#1B3A5C',   // Main brand color (e.g. navy, forest green)
          secondary: '#2E6DA4', // Secondary brand color
          light: '#EBF2FA',     // Light tint for backgrounds
          accent: '#C9A84C',    // Accent color (gold, coral, etc.)
          highlight: '#4A8FA0', // Highlight color (teal, blue, etc.)
        },
        neutral: {
          dark: '#1A1A1A',
          mid: '#4A4A4A',
          light: '#F8F9FA',
          border: '#E0E0E0',
        },
        surface: {
          1: '#FFFFFF',
          2: '#F7F6F3',
        },
        charcoal: '#111111',
        'mid-gray': '#666666',
        'border-light': '#E5E4E0',
      },
      fontFamily: {
        // TODO: Replace with practice fonts (update Google Fonts link in BaseLayout.astro)
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
};
