// Vision scoring: calls Claude with the prompt + anchor images + target
// screenshots, parses + validates the JSON, returns sub-scores.
//
// All prompt construction lives in vision-prompt.js. This file is just the
// API wiring + validation + retry.

import fs from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

import {
  VISION_MODEL,
  VISION_TEMPERATURE,
  VISION_MAX_TOKENS,
  ANCHOR_SITES,
  buildVisionMessages,
} from './vision-prompt.js';

// Lazy-init so the API key is read at call time (after dotenv) not module-load.
let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from env');
  _client = new Anthropic({ apiKey });
  return _client;
}

let _cachedAnchors = null;

/**
 * Load the cached anchor PNGs from _sourcing/anchors/.
 * Throws if anchors haven't been captured yet — run capture-anchors.js first.
 */
export async function loadAnchors(anchorDir) {
  if (_cachedAnchors) return _cachedAnchors;

  const anchors = {};
  for (const key of Object.keys(ANCHOR_SITES)) {
    const file = path.join(anchorDir, `${key}.png`);
    try {
      const png = await fs.readFile(file);
      anchors[key] = { png, url: ANCHOR_SITES[key].url };
    } catch (e) {
      throw new Error(
        `Anchor file missing: ${file}\n` +
        `Run: node scripts/sourcing/lib/capture-anchors.js`,
      );
    }
  }
  _cachedAnchors = anchors;
  return anchors;
}

/**
 * Score one site's design via Claude vision.
 *
 * Returns one of:
 *   { ok: true, unrenderable: false, visualCraft, clarityHierarchy, modernity,
 *     observations, rationales, rawText }
 *   { ok: true, unrenderable: true, reason }
 *   { ok: false, error }
 *
 * On the success path: the three sub-scores are 1-5 integers; we also surface
 * the model's observations + per-sub-score rationale for human review.
 */
export async function scoreSite({ desktopPng, mobilePng, anchors }) {
  if (!desktopPng) return { ok: false, error: 'no desktop screenshot' };
  if (!mobilePng) return { ok: false, error: 'no mobile screenshot' };

  const messages = buildVisionMessages({ desktopPng, mobilePng, anchors });

  let response;
  try {
    response = await getClient().messages.create({
      model: VISION_MODEL,
      temperature: VISION_TEMPERATURE,
      max_tokens: VISION_MAX_TOKENS,
      messages,
    });
  } catch (e) {
    return { ok: false, error: `Anthropic API: ${e.message}` };
  }

  const text = response.content?.find((c) => c.type === 'text')?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}`, rawText: text };
  }

  if (parsed.unrenderable === true) {
    return { ok: true, unrenderable: true, reason: parsed.reason || 'unspecified' };
  }

  // Validate the score shape: all three present, each is { score: 1-5 }.
  const v = parsed.visual_craft?.score;
  const c = parsed.clarity_hierarchy?.score;
  const m = parsed.modernity?.score;
  if (![v, c, m].every((s) => Number.isInteger(s) && s >= 1 && s <= 5)) {
    return {
      ok: false,
      error: 'invalid score shape',
      rawText: text,
      parsed,
    };
  }

  return {
    ok: true,
    unrenderable: false,
    visualCraft: v,
    clarityHierarchy: c,
    modernity: m,
    observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    rationales: {
      visualCraft: parsed.visual_craft.rationale || '',
      clarityHierarchy: parsed.clarity_hierarchy.rationale || '',
      modernity: parsed.modernity.rationale || '',
    },
    rawText: text,
  };
}

/**
 * Map vision sub-scores (1-5 each) onto a 0-15 contribution to Design Score.
 * Linear: sum of three sub-scores (3-15) directly becomes the design-score addition.
 */
export function visionContribution({ visualCraft, clarityHierarchy, modernity }) {
  return visualCraft + clarityHierarchy + modernity; // 3-15 range
}

function stripCodeFences(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
