/**
 * Content classifier (Step 5 — the JUDGMENT layer).
 *
 * Semantic classification that regex can't do robustly: is each provider active
 * / departing / incoming, and is each rescued content block evergreen or
 * ephemeral? Runs on a CHEAP model (Haiku) — it's bounded classification, not
 * nuanced generation. The deterministic placer (plan-content.js) consumes these
 * labels; coverage stays 100% regardless of how things classify (nothing is
 * dropped — ephemeral is flagged, not deleted), so a mis-label is a placement
 * nuance, never data loss.
 *
 * Returns: { providerStatus: { <idx>: 'active'|'departing'|'incoming' },
 *            itemLifespan:   { <idx>: 'evergreen'|'ephemeral' },
 *            reasons: {...} }
 *
 * Falls back to {} (planner then uses its regex heuristic) if no API/parse fail.
 */

import { callAnthropic, parseJsonStrict, MODELS } from '../ai-silver/shared.js';

const SYSTEM = `You classify dental-practice website content for an EVERGREEN rebuild (a durable site, free of time-sensitive notices).

You are given the practice's providers (with any status text) and its "rescued" content blocks. Classify each:

PROVIDERS — status:
  "departing"  = leaving/retiring/no longer practicing (e.g. "after 39 years, my decision to retire")
  "incoming"   = newly joined / just announced / replacing someone
  "active"     = currently practicing (default; long tenure ≠ departing — "35 years and still enjoy it" is ACTIVE)

CONTENT BLOCKS — lifespan:
  "ephemeral"  = time-sensitive / dated / would look stale on a durable site: retirement notices, "welcome Dr. X",
                 COVID/holiday/seasonal notices, limited-time promos, dated letters ("Dear Parents… this month…"),
                 event recaps, "now hiring", temporary closures.
  "evergreen"  = durable: philosophy, mission, technology, community involvement, what-to-expect, specialty explainers,
                 general practice values.

Judge by MEANING, not keywords. Output strict JSON only:
{
  "providers": [ { "index": 0, "status": "active|departing|incoming", "reason": "short" } ],
  "content":   [ { "index": 0, "lifespan": "evergreen|ephemeral", "reason": "short" } ]
}`;

export async function classifyContent(merged) {
  const doctors = merged.doctors || [];
  const items = merged.content?.additionalContent || [];
  if (!doctors.length && !items.length) return {};

  const input = {
    providers: doctors.map((d, i) => ({ index: i, name: d.name, statusNote: d.statusNote || null, credentials: d.credentials || null })),
    content: items.map((a, i) => ({ index: i, type: a.type, title: a.title || null, excerpt: (a.content || '').slice(0, 240) })),
  };

  let text;
  try {
    ({ text } = await callAnthropic({ model: MODELS.cheap, system: SYSTEM, prompt: JSON.stringify(input, null, 2), maxTokens: 1500 }));
  } catch { return {}; }

  let parsed;
  try { parsed = parseJsonStrict(text); } catch { return {}; }

  const providerStatus = {}, itemLifespan = {}, reasons = { providers: {}, content: {} };
  for (const p of (parsed.providers || [])) { if (p.index != null) { providerStatus[p.index] = p.status; reasons.providers[p.index] = p.reason; } }
  for (const c of (parsed.content || [])) { if (c.index != null) { itemLifespan[c.index] = c.lifespan; reasons.content[c.index] = c.reason; } }
  return { providerStatus, itemLifespan, reasons };
}
