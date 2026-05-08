/**
 * Phase 2c: AI Design Extraction
 *
 * Analyzes the practice's EXISTING brand signals (scraped colors, fonts, vibe)
 * and documents what is currently there — without making creative decisions.
 *
 * Output feeds Phase 2d (AI Brand Direction), which decides whether to EVOLVE
 * the existing brand or START FRESH with a stronger direction.
 *
 * Does NOT recommend new palettes or fonts. Does NOT modify merged.brand.
 * That is the responsibility of ai-brand-direction.js.
 *
 * Outputs saved to _pipeline/04-design.json.
 */

import { renderSkillPrompt } from './skill-loader.js';

/**
 * Run AI design extraction.
 *
 * @param {object} scraped  - Raw scraped data (includes brand.colors, images.logo)
 * @param {object} merged   - Merged practice data (read-only in this step)
 * @param {object} audit    - AI audit output, may be null
 * @param {object} [opts]
 * @returns {object|null} Extraction output, or null if skipped
 */
export async function runDesignMapping(scraped, merged, audit, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set — skipping AI design extraction.');
    return null;
  }

  // Migrated to skill-loader: prompt now lives in skills/design/design-extract.md
  let prompt;
  try {
    prompt = await buildPrompt(scraped, merged, opts);
  } catch (err) {
    console.warn(`  Warning: Could not render design prompt: ${err.message}`);
    return null;
  }

  if (opts.verbose) {
    console.log('  [design] Prompt length:', prompt.length, 'chars');
  }

  const startTime = Date.now();

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const response = await callAnthropic({
      phase:     'design',
      model:     'claude-sonnet-4-6',
      maxTokens: 800,
      messages:  [{ role: 'user', content: prompt }],
    });

    const raw = response.text;
    const durationMs = Date.now() - startTime;

    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(`  [design] JSON parse failed: ${parseErr.message}`);
      if (opts.verbose) console.log('  [design] Raw output:', raw.slice(0, 400));
      return null;
    }

    // Normalize any hex values in the extracted palette
    if (parsed.existingPalette) {
      for (const [k, v] of Object.entries(parsed.existingPalette)) {
        if (typeof v === 'string' && v.startsWith('#')) {
          parsed.existingPalette[k] = normalizeHex(v);
        }
      }
    }

    parsed._meta = {
      model: response.model,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      duration_ms: durationMs,
    };

    // Expose top-level fields Brand Direction expects
    parsed.mood         = parsed.mood         || 'unknown';
    parsed.brandStrength = parsed.brandStrength || 'unknown';
    // Flatten for backwards compatibility — Brand Direction reads design.palette
    parsed.palette      = parsed.existingPalette || {};
    parsed.fonts        = parsed.existingFonts   || {};

    return parsed;
  } catch (err) {
    console.warn(`  [design] API call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

async function buildPrompt(scraped, merged, opts = {}) {
  const practice = merged.practice || {};
  const address  = merged.address  || {};
  const brand    = scraped?.brand  || merged.brand || {};
  const verticalName = opts.preset?.schema?.verticalName || 'Healthcare';

  // Color signals come from two places:
  //   1. silver.brand.colors (used to exist; now usually null since silver no
  //      longer extracts visual data — kept for back-compat).
  //   2. silver.bronzeAssets.cssColors (raw hex list from bronze's scrape of
  //      the site's external CSS). We pre-process this list deterministically
  //      to get the brand's likely-real colors, then surface to the model.
  let existingColors;
  if (brand.colors && Object.values(brand.colors).some(Boolean)) {
    existingColors = Object.entries(brand.colors)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  } else {
    const rawCss = scraped?.bronzeAssets?.cssColors || [];
    const top = rankCssColors(rawCss);
    existingColors = top.length > 0
      ? `Top colors found in CSS (filtered to brand-color candidates, ranked by frequency + saturation):\n${top.map((c, i) => `  ${i + 1}. ${c.hex} (count=${c.count}, sat=${c.saturation.toFixed(2)})`).join('\n')}`
      : 'No CSS color data available.';
  }

  const homepage = (scraped?.pageInventory || []).find(p => p.path === '/');
  const aestheticNotes = homepage
    ? `Homepage H1: "${homepage.h1 || '—'}"\nHomepage meta: "${homepage.metaDesc || '—'}"\nTop headings: ${(homepage.h2s || []).slice(0, 3).join(', ')}`
    : 'No homepage data available.';

  return renderSkillPrompt('design/design-extract', {
    verticalName,
    practiceName:   practice.name      || '[Practice Name]',
    city:           address.city       || '[City]',
    state:          address.state      || '[State]',
    existingColors,
    logoUrl:        brand.logoPath     || scraped?.images?.logo || 'Not found',
    aestheticNotes,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHex(val) {
  if (!val) return null;
  const match = String(val).match(/#([0-9a-fA-F]{3,8})/);
  return match ? `#${match[1]}` : null;
}

/**
 * Rank raw CSS colors from bronze and return the top brand-color candidates.
 *
 * Filters:
 *   - drops near-white (>= 0.95 lightness) and near-black (<= 0.05 lightness)
 *   - drops fully-desaturated grays (saturation < 0.10)
 *   - normalizes #rgb → #rrggbb, lowercases
 *   - clusters perceptually-similar colors (Δ < 16 across RGB channels)
 *
 * Ranks remaining colors by frequency × saturation so a single saturated
 * brand color beats a mass of slight gray variations.
 *
 * @param {string[]} rawColors - hex strings (may have duplicates, may be #rgb or #rrggbb)
 * @param {number}   [topN=8]
 * @returns {Array<{ hex: string, count: number, saturation: number, lightness: number }>}
 */
export function rankCssColors(rawColors, topN = 8) {
  if (!Array.isArray(rawColors) || rawColors.length === 0) return [];

  // Normalize + count
  const counts = new Map();
  for (const raw of rawColors) {
    const hex = normalizeHexFull(raw);
    if (!hex) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  // Compute HSL + filter
  const candidates = [];
  for (const [hex, count] of counts) {
    const { r, g, b } = hexToRgb(hex);
    const { s, l } = rgbToHsl(r, g, b);
    if (l >= 0.95 || l <= 0.05) continue;     // near-white / near-black
    if (s < 0.10) continue;                    // gray
    candidates.push({ hex, count, saturation: s, lightness: l });
  }

  // Cluster perceptually-similar colors — keep the most-frequent representative
  candidates.sort((a, b) => b.count - a.count);
  const clustered = [];
  for (const c of candidates) {
    const dup = clustered.find(k => rgbDistance(c.hex, k.hex) < 16);
    if (dup) {
      dup.count += c.count;
    } else {
      clustered.push({ ...c });
    }
  }

  // Final ranking: frequency × saturation
  clustered.sort((a, b) => (b.count * b.saturation) - (a.count * a.saturation));
  return clustered.slice(0, topN);
}

function normalizeHexFull(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return `#${h}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }
  return { s, l };
}

function rgbDistance(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}
