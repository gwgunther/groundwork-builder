/**
 * palette-library.js — 30 curated, mood-tagged color palettes.
 *
 * Each palette provides a full 5-color system ready for the design step.
 * The design step selects palettes matching the practice mood, then adapts
 * them to incorporate the scraped brand colors.
 *
 * Moods: calm | refined | editorial | bold | warm | clinical | luxury
 */

export const PALETTES = [
  // ── CALM / COASTAL ──────────────────────────────────────────────────────
  { id: 'coastal-deep',    mood: ['calm'],
    primary:'#0e6d8e', secondary:'#1a4a4e', light:'#f0f8fb', accent:'#4db8d4', highlight:'#a8dce8',
    description: 'Deep teal coastal clarity' },
  { id: 'sage-mist',       mood: ['calm','warm'],
    primary:'#4a7c6f', secondary:'#2d5a50', light:'#f4faf7', accent:'#8bbfb5', highlight:'#c8e6e0',
    description: 'Sage green spa tranquility' },
  { id: 'slate-calm',      mood: ['calm','refined'],
    primary:'#3d5a73', secondary:'#1e3347', light:'#f2f6fa', accent:'#7ba8c4', highlight:'#b8d4e8',
    description: 'Slate blue professionalism' },
  { id: 'seafoam-light',   mood: ['calm'],
    primary:'#2a8f82', secondary:'#1a5e56', light:'#f0faf8', accent:'#5cc4b6', highlight:'#a0dfd7',
    description: 'Seafoam freshness' },
  { id: 'morning-sky',     mood: ['calm','clinical'],
    primary:'#4a7fb5', secondary:'#2d5a8a', light:'#f0f6fd', accent:'#7eaad9', highlight:'#b6d2f0',
    description: 'Clear sky blue trust' },

  // ── REFINED / ELEVATED ──────────────────────────────────────────────────
  { id: 'midnight-gold',   mood: ['refined','luxury'],
    primary:'#2c3e50', secondary:'#1a252f', light:'#fafaf8', accent:'#c9a84c', highlight:'#e8d5a3',
    description: 'Midnight navy with gold accents' },
  { id: 'plum-warm',       mood: ['refined'],
    primary:'#6b4c8a', secondary:'#4a2f6e', light:'#faf8fc', accent:'#a67ec4', highlight:'#d4bae8',
    description: 'Plum sophistication' },
  { id: 'forest-ink',      mood: ['refined','editorial'],
    primary:'#2e4a38', secondary:'#1a3024', light:'#f4f8f4', accent:'#6a9e78', highlight:'#b0d0b8',
    description: 'Deep forest editorial' },
  { id: 'pewter-brass',    mood: ['refined'],
    primary:'#4a4a5a', secondary:'#2e2e3e', light:'#f8f8f6', accent:'#b8a060', highlight:'#ddd0a0',
    description: 'Pewter and brass finesse' },
  { id: 'bone-slate',      mood: ['refined','calm'],
    primary:'#5a6e7a', secondary:'#3a4e5a', light:'#f8f6f2', accent:'#94a8b4', highlight:'#c8d8e0',
    description: 'Warm bone and cool slate' },

  // ── EDITORIAL / BOLD-SERIF ───────────────────────────────────────────────
  { id: 'inky-red',        mood: ['editorial','bold'],
    primary:'#c0392b', secondary:'#922b21', light:'#fff8f7', accent:'#e07060', highlight:'#f0b0a8',
    description: 'Editorial ink red' },
  { id: 'charcoal-amber',  mood: ['editorial'],
    primary:'#2c2c2c', secondary:'#1a1a1a', light:'#faf8f4', accent:'#c45d3e', highlight:'#e8a880',
    description: 'Charcoal with warm amber' },
  { id: 'deep-teal-ink',   mood: ['editorial','refined'],
    primary:'#1a4a4e', secondary:'#0e2e32', light:'#f4faf9', accent:'#3d8a8e', highlight:'#80c0c4',
    description: 'Deep teal editorial voice' },
  { id: 'fig-cream',       mood: ['editorial','warm'],
    primary:'#5c3d2e', secondary:'#3a2418', light:'#fdf8f4', accent:'#a0705a', highlight:'#d4b8a8',
    description: 'Fig wood and cream' },
  { id: 'cobalt-paper',    mood: ['editorial','bold'],
    primary:'#1a3a8a', secondary:'#0e2465', light:'#f4f7ff', accent:'#4a6abf', highlight:'#94a8e0',
    description: 'Cobalt on cream paper' },

  // ── BOLD / ENERGETIC ────────────────────────────────────────────────────
  { id: 'coral-dark',      mood: ['bold','warm'],
    primary:'#e05640', secondary:'#b83a28', light:'#fff7f5', accent:'#f09080', highlight:'#f8c8c0',
    description: 'Warm coral energy' },
  { id: 'electric-navy',   mood: ['bold'],
    primary:'#1a2f8a', secondary:'#0e1e65', light:'#f0f2ff', accent:'#5a7adf', highlight:'#a0b0f0',
    description: 'Electric navy confidence' },
  { id: 'forest-bold',     mood: ['bold','warm'],
    primary:'#2e6b3e', secondary:'#1a4828', light:'#f2faf4', accent:'#5aaa70', highlight:'#a4d4b0',
    description: 'Bold forest green' },
  { id: 'terracotta-sand', mood: ['bold','warm'],
    primary:'#b85a38', secondary:'#8a3820', light:'#fdf6f2', accent:'#d49070', highlight:'#ecc8b0',
    description: 'Terracotta and sand warmth' },
  { id: 'aubergine',       mood: ['bold','luxury'],
    primary:'#4e2750', secondary:'#321838', light:'#fcf6fc', accent:'#a060a4', highlight:'#d4a8d8',
    description: 'Deep aubergine luxury' },

  // ── WARM / APPROACHABLE ─────────────────────────────────────────────────
  { id: 'honey-oak',       mood: ['warm'],
    primary:'#8a5c28', secondary:'#5e3c14', light:'#fef8f0', accent:'#c4944a', highlight:'#e8cfa0',
    description: 'Honey and oak warmth' },
  { id: 'blush-rose',      mood: ['warm','luxury'],
    primary:'#9a4a5e', secondary:'#6e2e40', light:'#fdf5f7', accent:'#c88098', highlight:'#e8b8c8',
    description: 'Blush rose sophistication' },
  { id: 'terracotta-sage', mood: ['warm','calm'],
    primary:'#c05840', secondary:'#8a3820', light:'#fdf5f2', accent:'#6b9e78', highlight:'#b0d0b8',
    description: 'Terracotta and sage balance' },
  { id: 'sunlit-amber',    mood: ['warm'],
    primary:'#c4780a', secondary:'#8a5006', light:'#fefaf0', accent:'#e8a840', highlight:'#f5d898',
    description: 'Sunlit amber optimism' },
  { id: 'peach-deep',      mood: ['warm','calm'],
    primary:'#c4704a', secondary:'#8a4830', light:'#fdf7f3', accent:'#e0a484', highlight:'#f0ccb8',
    description: 'Peach and deep earth' },

  // ── CLINICAL / CLEAN ────────────────────────────────────────────────────
  { id: 'clinical-blue',   mood: ['clinical','calm'],
    primary:'#1e5a9e', secondary:'#0e3870', light:'#f0f6ff', accent:'#5a9ad8', highlight:'#a8ccee',
    description: 'Clinical trust blue' },
  { id: 'clean-teal',      mood: ['clinical'],
    primary:'#008b8b', secondary:'#005a5a', light:'#f0fafa', accent:'#40b0b0', highlight:'#98d8d8',
    description: 'Clean medical teal' },
  { id: 'white-indigo',    mood: ['clinical','refined'],
    primary:'#3a4a8a', secondary:'#242e65', light:'#f6f7ff', accent:'#7080c0', highlight:'#b0b8e0',
    description: 'Clean indigo precision' },

  // ── LUXURY ──────────────────────────────────────────────────────────────
  { id: 'champagne-black', mood: ['luxury','refined'],
    primary:'#1a1a1a', secondary:'#0a0a0a', light:'#fdfcf8', accent:'#c8a84a', highlight:'#e8d898',
    description: 'Champagne and black luxury' },
  { id: 'deep-emerald',    mood: ['luxury','refined'],
    primary:'#0a4a2e', secondary:'#062a1a', light:'#f2faf5', accent:'#2a8a5a', highlight:'#80c4a4',
    description: 'Deep emerald prestige' },
];

/**
 * Get palettes matching a mood keyword.
 * Returns up to `limit` palettes, shuffled for variety.
 */
export function getPalettesForMood(mood = 'calm', limit = 5, usedIds = []) {
  const key = typeof mood === 'string' ? mood.toLowerCase() : 'calm';
  const moodWord = Object.keys({
    calm: 1, refined: 1, editorial: 1, bold: 1, warm: 1, clinical: 1, luxury: 1
  }).find(k => key.includes(k)) || 'calm';

  const candidates = PALETTES
    .filter(p => p.mood.includes(moodWord) && !usedIds.includes(p.id))
    .sort(() => Math.random() - 0.5);

  return candidates.slice(0, limit);
}

/**
 * Format palette options for injection into the design prompt.
 */
export function formatPaletteOptions(palettes) {
  return palettes.map(p =>
    `- ${p.id} (${p.description}): primary=${p.primary} secondary=${p.secondary} light=${p.light} accent=${p.accent} highlight=${p.highlight}`
  ).join('\n');
}
