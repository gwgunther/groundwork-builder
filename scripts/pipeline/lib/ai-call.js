/**
 * Shared Anthropic API call wrapper.
 *
 * Three responsibilities:
 *   1. **Retry** — one retry with backoff on transient errors (5xx, 429,
 *      network). 4xx (auth, bad request) are bugs; never retried.
 *   2. **Cost accounting** — every call reports its token usage, accumulated
 *      into a process-wide ledger that build-site can read at the end.
 *   3. **Debug dumps** — when GROUNDWORK_DEBUG_PROMPTS=1, every prompt and
 *      response is written to `_pipeline/_debug/<phase>-<n>.md` for later
 *      inspection. Off by default.
 *
 * Pricing (claude-sonnet-4-6, as of 2026-04):
 *   $3 per 1M input tokens, $15 per 1M output tokens.
 *   Cache reads count as input but at a discount (used by some skills).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const PRICE_INPUT_PER_M  = 3.00;
const PRICE_OUTPUT_PER_M = 15.00;

// Process-wide ledger, read by build-site at the end of the run.
const _ledger = {
  calls: [],
  totalInputTokens:  0,
  totalOutputTokens: 0,
  totalCost:         0,
};

let _debugCounter = 0;

/**
 * @param {object} args
 * @param {string} args.phase           - Short phase name for the ledger ("audit", "brand", "content", "section:hero", etc.)
 * @param {string} args.model           - Anthropic model id
 * @param {number} args.maxTokens
 * @param {Array}  args.messages        - Anthropic Messages API shape
 * @param {string} [args.system]        - Optional system prompt
 * @param {number} [args.temperature]   - Pass-through to Anthropic API
 * @param {object} [args.extra]         - Any other native API params (top_p, top_k, stop_sequences, …)
 * @param {object} [opts]
 * @param {string} [opts.outputDir]     - Used for debug dumps; if omitted, dumps go to /tmp
 * @param {boolean} [opts.parseJson]    - Convenience: returns parsed JSON if the response is JSON-shaped
 * @returns {Promise<{ text: string, content: any, parsed?: any, usage: object, cost: number, model: string }>}
 */
export async function callAnthropic({ phase, model, maxTokens = 4096, messages, system, temperature, extra }, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const requestBody = { model, max_tokens: maxTokens, messages, ...(extra || {}) };
  if (system) requestBody.system = system;
  if (typeof temperature === 'number') requestBody.temperature = temperature;

  let response;
  let attempt = 0;
  const maxAttempts = 4; // initial + 3 retries on transient errors

  while (attempt < maxAttempts) {
    attempt++;
    try {
      response = await client.messages.create(requestBody);
      break;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const transient = !status || status === 429 || (status >= 500 && status < 600);
      if (!transient || attempt >= maxAttempts) throw err;
      // Exponential backoff: 1.5s, 4s, 10s. Large prompts (75K+ chars) on
      // flaky connections sometimes need multiple retries before the request
      // actually lands, so we're more patient than the original 1.5s × 1.
      const backoffMs = [1500, 4000, 10000][attempt - 1] || 10000;
      console.warn(`  [ai-call:${phase}] transient error (status ${status || 'network'}, attempt ${attempt}/${maxAttempts}); retrying in ${backoffMs}ms…`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }

  const text = (response.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const content = response.content || [];
  const usage = response.usage || {};
  const inputTokens  = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const outputTokens = usage.output_tokens || 0;
  const cost = (inputTokens * PRICE_INPUT_PER_M / 1_000_000) + (outputTokens * PRICE_OUTPUT_PER_M / 1_000_000);

  _ledger.calls.push({
    phase,
    model,
    inputTokens,
    outputTokens,
    cost: +cost.toFixed(4),
    attempts: attempt,
  });
  _ledger.totalInputTokens  += inputTokens;
  _ledger.totalOutputTokens += outputTokens;
  _ledger.totalCost         += cost;

  // Optional debug dump
  if (process.env.GROUNDWORK_DEBUG_PROMPTS === '1') {
    await dumpDebug({ phase, model, messages, system, text, usage, cost, outputDir: opts.outputDir });
  }

  // Optional JSON convenience parse
  let parsed;
  if (opts.parseJson) {
    parsed = tryParseJson(text);
  }

  return { text, content, parsed, usage, cost: +cost.toFixed(4), model: response.model || model };
}

/**
 * Returns the cost ledger snapshot. build-site reads this at end-of-run for
 * the cost summary.
 */
export function getCostLedger() {
  return {
    calls:             [..._ledger.calls],
    totalInputTokens:  _ledger.totalInputTokens,
    totalOutputTokens: _ledger.totalOutputTokens,
    totalCost:         +_ledger.totalCost.toFixed(4),
    callCount:         _ledger.calls.length,
  };
}

/**
 * Reset the ledger (used in tests; not called in normal pipeline runs).
 */
export function resetCostLedger() {
  _ledger.calls.length = 0;
  _ledger.totalInputTokens = 0;
  _ledger.totalOutputTokens = 0;
  _ledger.totalCost = 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseJson(text) {
  let t = (text || '').trim();
  // Strip markdown fences if present
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  // Try to find a JSON object anywhere in the text
  const f = t.indexOf('{'), l = t.lastIndexOf('}');
  if (f !== -1 && l > f) {
    try { return JSON.parse(t.slice(f, l + 1)); } catch {}
  }
  return null;
}

async function dumpDebug({ phase, model, messages, system, text, usage, cost, outputDir }) {
  const debugDir = outputDir
    ? resolve(outputDir, '_pipeline', '_debug')
    : '/tmp/groundwork-debug';
  try {
    await mkdir(debugDir, { recursive: true });
    const idx = String(++_debugCounter).padStart(3, '0');
    const safePhase = String(phase).replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = join(debugDir, `${idx}-${safePhase}.md`);

    const promptDump = messages.map((m, i) => {
      const content = typeof m.content === 'string' ? m.content :
        (m.content || []).map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n\n');
      return `### Message ${i + 1} (${m.role})\n\n${content}`;
    }).join('\n\n---\n\n');

    const md = `# AI Call: ${phase}

- **Model:** ${model}
- **Input tokens:** ${usage.input_tokens || 0}${usage.cache_read_input_tokens ? ` (+ ${usage.cache_read_input_tokens} cached)` : ''}
- **Output tokens:** ${usage.output_tokens || 0}
- **Cost:** $${(+cost).toFixed(4)}

${system ? `## System prompt\n\n${system}\n\n---\n\n` : ''}## Request

${promptDump}

---

## Response

${text}
`;
    await writeFile(file, md, 'utf8');
  } catch {
    // Best-effort; don't break the pipeline on a debug-write failure.
  }
}
