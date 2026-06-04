/**
 * Pass: design — OBSERVE the site's current visual design (not redesign it).
 *
 * Vision-augmented: feeds homepage screenshots + exact computed design tokens +
 * the CSS color/font signals to the model, producing a `currentDesign` profile
 * of what the site ACTUALLY looks like today. This is observation, the same
 * nature as every other synthesize pass — the redesign step (downstream) reads
 * this and decides the NEW brand separately, non-destructively.
 */

import { loadPrompt, fillTemplate, runPassCall, MODELS } from '../shared.js';
import { captureDesign, loadCachedScreenshots } from '../design-capture.js';

export const name = 'design';

export function selectPages(bronze) {
  const home = bronze.pages.find(p => p.path === '/' || p.path === '');
  return home ? [home] : [];
}

export async function run({ bronze }) {
  const url = bronze.baseUrl;
  if (!url) return {};

  // Prefer screenshots + tokens cached in bronze (raw observation). Only launch
  // a live browser if bronze didn't capture them (e.g. older bronze).
  const cachedShots = bronze.siteAssets?.screenshots || [];
  let cap;
  const loaded = await loadCachedScreenshots(cachedShots);
  if (loaded.length) {
    cap = { screenshots: loaded, tokens: bronze.siteAssets?.designTokens || null };
  } else {
    cap = await captureDesign(url);
  }
  if (!cap.screenshots.length && !cap.tokens) {
    // No visual signal at all — emit nothing rather than guess.
    return { currentDesign: null };
  }

  const tmpl = await loadPrompt('design');
  const prompt = fillTemplate(tmpl, {
    baseUrl: url,
    cssColors: JSON.stringify((bronze.siteAssets?.cssColors || []).slice(0, 40)),
    computedTokens: JSON.stringify(cap.tokens || {}, null, 2),
  });

  const { slice } = await runPassCall({
    name,
    model: MODELS.default,
    prompt,
    maxTokens: 2000,
    images: cap.screenshots.map(s => ({ data: s.data, mediaType: s.mediaType })),
  });

  const cd = slice.currentDesign || slice;
  // Attach the captured tokens (exact values) alongside the model's reading.
  if (cd && typeof cd === 'object') cd.computedTokens = cap.tokens || null;
  return { currentDesign: cd || null };
}
