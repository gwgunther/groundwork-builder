/**
 * Pass: brand — colors, fonts, logo, tagline.
 *
 * Pulls from homepage HTML signals + CSS color list bronze provides + homepage
 * font-family declarations (extracted via a per-page font scan we do in-line).
 */

import { loadPrompt, fillTemplate, runPassCall, renderPagesAsContext, MODELS } from '../shared.js';

export const name = 'brand';

export function selectPages(bronze) {
  const home = bronze.pages.find(p => p.path === '/' || p.path === '');
  return home ? [home] : [];
}

/**
 * Fetch the homepage HTML directly and extract:
 *   - Google Fonts <link> hrefs (family= param)
 *   - font-family declarations inside <style> blocks
 *   - logo image src
 * This gives the model real font signal to work from.
 */
async function probeHomepageBrandSignals(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 GroundworkScraper' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    const fonts = new Set();
    // <link href="...fonts.googleapis.com/...?family=Inter:..."/>
    for (const m of html.matchAll(/fonts\.googleapis\.com\/[^"']*?family=([^"'&]+)/gi)) {
      // family=Inter:wght@400;700&family=Lora:ital@0;1
      const fams = decodeURIComponent(m[1]).split('|');
      for (const f of fams) fonts.add(f.split(':')[0].replace(/\+/g, ' '));
    }
    for (const m of html.matchAll(/family=([^"'&]+)/gi)) {
      const fams = decodeURIComponent(m[1]).split('|');
      for (const f of fams) fonts.add(f.split(':')[0].replace(/\+/g, ' '));
    }
    // font-family declarations
    const ffMatches = [];
    for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) {
      const list = m[1].split(',').map(s => s.replace(/['"]/g, '').trim()).filter(Boolean);
      ffMatches.push(...list);
    }
    return { googleFonts: [...fonts], fontFamilyDeclarations: [...new Set(ffMatches)].slice(0, 40) };
  } catch {
    return {};
  }
}

export async function run({ bronze, pages }) {
  if (pages.length === 0) return {};
  const signals = await probeHomepageBrandSignals(bronze.baseUrl);
  const tmpl = await loadPrompt('brand');
  const prompt = fillTemplate(tmpl, {
    baseUrl: bronze.baseUrl,
    pageContext: renderPagesAsContext(pages, { bodyChars: 4000, paragraphs: 10, images: 20, includeJsonLd: false }),
    cssColors: JSON.stringify((bronze.siteAssets?.cssColors || []).slice(0, 40), null, 2),
    cssUrl: bronze.siteAssets?.externalCssUrl || null,
    googleFonts: JSON.stringify(signals.googleFonts || [], null, 2),
    fontFamilyDeclarations: JSON.stringify(signals.fontFamilyDeclarations || [], null, 2),
  });
  const { slice } = await runPassCall({ name, model: MODELS.cheap, prompt, maxTokens: 2000 });
  return slice;
}
