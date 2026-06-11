/**
 * Robots Scanner — checks whether the existing site's robots.txt blocks
 * AI search crawlers. One fetch per run; no other network.
 *
 * AEO-critical: if GPTBot, ClaudeBot, PerplexityBot, etc. are disallowed,
 * the practice is invisible to AI answer engines no matter how good the
 * content is. Security plugins and CDN bot-protection settings commonly
 * block these bots without the owner knowing.
 *
 * Export:
 *   runRobotsScan(url) → Promise<{ findings, summary, meta }>
 */

import { enrichFindings } from './findings.js';

// Crawlers that feed AI answer engines. Token = the User-agent value bots
// send and robots.txt groups match on (case-insensitive).
const AI_BOTS = [
  { token: 'GPTBot',            engine: 'ChatGPT (training + search index)' },
  { token: 'OAI-SearchBot',     engine: 'ChatGPT Search' },
  { token: 'ChatGPT-User',      engine: 'ChatGPT live browsing' },
  { token: 'ClaudeBot',         engine: 'Claude' },
  { token: 'PerplexityBot',     engine: 'Perplexity' },
  { token: 'Google-Extended',   engine: 'Gemini grounding' },
  { token: 'Applebot-Extended', engine: 'Apple Intelligence' },
  { token: 'Bytespider',        engine: 'ByteDance / Doubao' },
];

/**
 * Parse robots.txt into groups: [{ agents: string[], disallows: string[], allows: string[] }].
 * Follows the common interpretation of RFC 9309: consecutive User-agent
 * lines share the rule block that follows them.
 */
export function parseRobotsTxt(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();

    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], disallows: [], allows: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (field === 'disallow' || field === 'allow')) {
      if (field === 'disallow') current.disallows.push(value);
      else current.allows.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/**
 * Is `botToken` blocked from the site root by these robots.txt groups?
 * Per RFC 9309 a bot obeys the most specific matching group — a group
 * naming the bot wins over `*`. "Blocked" here means the effective group
 * disallows "/" without a counteracting root Allow.
 */
export function isBotBlocked(groups, botToken) {
  const token = botToken.toLowerCase();
  const specific = groups.filter(g => g.agents.some(a => a === token));
  const wildcard = groups.filter(g => g.agents.includes('*'));
  const effective = specific.length > 0 ? specific : wildcard;
  if (effective.length === 0) return false;

  const disallowsRoot = effective.some(g => g.disallows.some(d => d === '/'));
  const allowsRoot    = effective.some(g => g.allows.some(a => a === '/'));
  return disallowsRoot && !allowsRoot;
}

/**
 * @param {string} url - audited site URL
 * @returns {Promise<{ findings: object[], summary: object, meta: object }>}
 */
export async function runRobotsScan(url) {
  let origin;
  try { origin = new URL(url).origin; }
  catch { origin = null; }

  let robotsTxt = null;
  let fetchError = null;
  if (origin) {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) robotsTxt = await res.text();
      else if (res.status === 404) robotsTxt = '';   // no robots.txt = allow all
      else fetchError = `HTTP ${res.status}`;
    } catch (err) {
      fetchError = err.message;
    }
  }

  const raw = [];
  let blocked = [];

  if (robotsTxt === null) {
    // Could not determine — emit a passed/not_applicable finding rather than
    // guessing. A fetch failure is not evidence of blocking.
    raw.push({
      id: 'robots-blocks-ai-bots',
      category: 'aeo',
      severity: 'passed',
      state: 'not_applicable',
      title: 'AI crawler access',
      detail: `robots.txt could not be checked${fetchError ? ` (${fetchError})` : ''}.`,
      benefit: 'AI answer engines (ChatGPT, Perplexity, Claude, Gemini) can only cite a site their crawlers are allowed to read.',
      affectedPages: [],
      count: 0,
    });
  } else {
    const groups = parseRobotsTxt(robotsTxt);
    blocked = AI_BOTS.filter(bot => isBotBlocked(groups, bot.token));

    raw.push({
      id: 'robots-blocks-ai-bots',
      category: 'aeo',
      severity: blocked.length > 0 ? 'critical' : 'passed',
      title: 'AI crawler access',
      detail: blocked.length > 0
        ? `robots.txt blocks ${blocked.length} AI crawler${blocked.length === 1 ? '' : 's'}: ${blocked.map(b => b.token).join(', ')}. The site cannot appear in answers from ${blocked.map(b => b.engine.split(' ')[0]).join(', ')} regardless of content quality.`
        : 'robots.txt allows all major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, and others).',
      benefit: 'AI answer engines (ChatGPT, Perplexity, Claude, Gemini) can only cite a site their crawlers are allowed to read. Blocking them — often a security-plugin default — makes every other AEO improvement moot.',
      affectedPages: [],
      count: blocked.length,
    });
  }

  const findings = enrichFindings(raw);
  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    passed:   findings.filter(f => f.severity === 'passed').length,
  };

  return {
    findings,
    summary,
    meta: {
      fetched: robotsTxt !== null,
      fetchError,
      blockedBots: blocked.map(b => b.token),
      checkedBots: AI_BOTS.map(b => b.token),
    },
  };
}
