/**
 * Phase: AI Content Write
 *
 * Composes the actual copy for each page/section. Consumes the blueprint
 * produced by `ai-content-map.js` (audit phase) — the blueprint tells Write
 * what content to keep verbatim, what to optimize, and what to create from
 * scratch. Write's job is to execute on those decisions and produce the final
 * copy.
 *
 * Outputs a structured content map saved to _pipeline/03-content.json.
 * Also updates merged.content.generated so downstream steps can inject copy.
 *
 * The function is exported under TWO names:
 *   - `runContentWrite`   — canonical name (post-Map/Write split)
 *   - `runContentMapping` — back-compat alias (existing callers continue to
 *                            work; blueprint can be passed as the 5th param
 *                            below `opts`, or omitted for legacy single-pass
 *                            behaviour where Write does the audit inline).
 */

<<<<<<< HEAD
import { renderSkillPrompt } from './skill-loader.js';
=======
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(__dirname, '..', 'prompts', 'content-map.md');
const COPYWRITING_SKILL_PATH = resolve(__dirname, '..', 'skills', 'copywriting.md');
>>>>>>> origin/main

/**
 * Run Content Write.
 *
 * @param {object}  scraped   - Raw scraped data (includes pageInventory)
 * @param {object}  merged    - Merged practice data (silver + intake)
 * @param {object}  audit     - Site-audit output (may be null)
 * @param {object}  preset    - Loaded vertical preset
 * @param {object}  [opts]
 * @param {boolean} [opts.verbose]
 * @param {boolean} [opts.strict] - If true, refuse to fall back to legacy
 *                                  single-pass mode when `blueprint` is null.
 *                                  Set this in production paths where Map is
 *                                  expected to have run; protects against
 *                                  silent degradation if the upstream phase
 *                                  failed.
 * @param {object}  [blueprint] - Output of `runContentMap` (optional). When
 *                                provided, Write uses the audit's source
 *                                recommendations as primary guidance. When
 *                                absent (and strict mode is off), Write falls
 *                                back to inferring source/quality from the
 *                                same raw inputs (legacy single-pass mode).
 * @returns {object|null} Content map (homepage/about/services/faqs/...) or null
 */
export async function runContentWrite(scraped, merged, audit, preset, opts = {}, blueprint = null) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set — skipping Content Write.');
    return null;
  }

  if (!scraped) {
    console.log('  No scrape data — skipping Content Write.');
    return null;
  }

  // Strict mode: if the caller expected a blueprint but got null, refuse to
  // run rather than silently producing a less-consistent single-pass output.
  if (opts.strict && !blueprint) {
    console.warn('  [content-write] strict=true but no blueprint provided. Refusing single-pass fallback. Run Content Map first or pass strict=false to allow fallback.');
    return null;
  }

  let prompt;
  try {
    prompt = await buildPrompt(scraped, merged, audit, preset, blueprint);
  } catch (err) {
    console.warn(`  Warning: Could not render content prompt: ${err.message}`);
    return null;
  }

<<<<<<< HEAD
=======
  let copywritingSkill = '';
  try {
    copywritingSkill = await readFile(COPYWRITING_SKILL_PATH, 'utf-8');
  } catch {
    console.warn('  Warning: Could not load copywriting skill — proceeding without it.');
  }

  const prompt = buildPrompt(promptTemplate, scraped, merged, audit, preset, copywritingSkill);

>>>>>>> origin/main
  if (opts.verbose) {
    console.log('  [content] Prompt length:', prompt.length, 'chars');
  }

  const startTime = Date.now();

  try {
    const { callAnthropic } = await import('./ai-call.js');
    const result = await callAnthropic({
      phase:     'content',
      model:     'claude-sonnet-4-6',
      // Output is now substantially richer (additionalContent grounding,
      // differentiators woven, contentAudit entry per section, full service
      // map). For practices with 30+ services this can exceed 12k tokens.
      // Sonnet supports up to 64k output; 16384 is comfortable headroom.
      maxTokens: 16384,
      messages:  [{ role: 'user', content: prompt }],
    }, { parseJson: true });

    const durationMs = Date.now() - startTime;
    if (!result.parsed) {
      console.warn(`  [content] JSON parse failed. Output length: ${result.text?.length || 0} chars, output_tokens: ${result.usage?.output_tokens}, stop_reason: ${result.content?.stop_reason || 'unknown'}`);
      if (opts.verbose) {
        console.log('  [content] Raw output (last 300 chars):', result.text?.slice(-300));
      }
      return null;
    }
    result.parsed._meta = {
      model:         result.model,
      input_tokens:  result.usage?.input_tokens,
      output_tokens: result.usage?.output_tokens,
      duration_ms:   durationMs,
      cost:          result.cost,
    };
    return result.parsed;
  } catch (err) {
    console.warn(`  [content] API call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

<<<<<<< HEAD
/**
 * Back-compat alias. Existing callers (build-site.js, studio.js) continue
 * to use `runContentMapping(scraped, merged, audit, preset, opts)` and now
 * may also pass `blueprint` as the 6th arg. When omitted, the prompt falls
 * back to legacy single-pass behaviour (Write infers source/quality inline).
 */
export const runContentMapping = runContentWrite;

async function buildPrompt(scraped, merged, audit, preset, blueprint) {
=======
function buildPrompt(template, scraped, merged, audit, preset, copywritingSkill = '') {
>>>>>>> origin/main
  const practice = merged.practice || {};
  const doctor = merged.doctor || {};
  const services = merged.services || {};
  const content = merged.content || {};

  // Page inventory — condensed for prompt efficiency
  const pageInventory = buildPageInventorySummary(scraped.pageInventory || []);

  const verticalName = preset?.schema?.verticalName || 'Healthcare';

  // All scraped services — these are the actual pages on the original site
  const offeredServices = services.offered || [];
  const servicesList = offeredServices.map(s => s.name).join(', ') || 'General services';

  // Service slugs to generate content for — keyed exactly as slug so page-generator can match
  const serviceSlugsForContent = offeredServices.map(s => s.slug).filter(Boolean).join(', ');

  // Per-service scraped page content — feed the AI the actual text from each service page
  const servicePageContent = buildServicePageContent(offeredServices, scraped.pageInventory || []);

  // Silver three-tier inputs ───────────────────────────────────────────────
  // additionalContent: verbatim prose rescue, tagged by source page
  const additionalContentBlock = buildAdditionalContentBlock(merged.additionalContent || []);
  // differentiators: short why-us labels, tagged by source page
  const differentiatorsBlock = buildDifferentiatorsBlock(merged.differentiators || []);

  // Testimonials
  const testimonials = (content.testimonials || []).length > 0
    ? content.testimonials.map(t => `"${t.text}"${t.author ? ` — ${t.author}` : ''}`).join('\n')
    : 'None found on current site.';

  // Existing FAQs
  const existingFAQs = (content.faqs || []).length > 0
    ? content.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
    : 'None found on current site.';

  // Stats
  const stats = content.stats || {};
  const statsStr = [
    stats.yearsExperience ? `${stats.yearsExperience} years in practice` : null,
    stats.happyPatients ? `${stats.happyPatients} patients served` : null,
    stats.googleRating ? `${stats.googleRating} Google rating` : null,
    stats.fiveStarReviews ? `${stats.fiveStarReviews} five-star reviews` : null,
  ].filter(Boolean).join(', ') || 'None detected.';

  // Audit signals
  const primaryService = offeredServices[0]?.slug || 'general-dentistry';

<<<<<<< HEAD
  // Blueprint from Content Map (if upstream phase ran). Formatted as a tagged
  // block so the model uses Map's quality scores + source recommendations as
  // primary guidance for keep/optimize/create per section.
  const blueprintBlock = buildBlueprintBlock(blueprint);

  // Per-archetype tone calibration. Mirrors brand-direction's colorTempGuidance
  // pattern — derives a tone-guidance block from audit.tone.recommended (now a
  // constrained enum: warm | clinical | editorial | bold | refined). Tells the
  // model how copy SHOULD feel for THIS practice's archetype, parallel to how
  // brand-direction tells it how COLORS should feel.
  const toneGuidance = buildToneGuidance(audit?.tone?.recommended);

  return renderSkillPrompt('content/content-write', {
    verticalName,
    practiceName:        practice.name      || '[Practice Name]',
    domain:              practice.domain    || '[domain]',
    doctorName:          doctor.name        || '[Doctor Name]',
    credentials:         doctor.credentials || 'DDS',
    city:                merged.address?.city  || '[City]',
    state:               merged.address?.state || '[State]',
    phone:               practice.phone     || '[Phone]',
    servicesList,
    serviceSlugs:        serviceSlugsForContent,
    servicePageContent,
    additionalContentBlock,
    differentiatorsBlock,
    blueprintBlock,
    toneGuidance,
    primaryService,
    pageInventory,
    testimonials,
    existingFAQs,
    stats:               statsStr,
  });
}

/**
 * Per-archetype tone calibration. Renders a guidance block derived from the
 * audit's `tone.recommended` enum value. Mirrors brand-direction's
 * colorTempGuidance pattern — locks the editorial voice to the practice's
 * archetype family (warm-family vs editorial-bold) so copy doesn't drift
 * generic.
 *
 * Accepts free-form prose (legacy fixtures pre-enum-fix) and falls back to
 * keyword sniffing in that case.
 */
function buildToneGuidance(toneRaw) {
  if (!toneRaw) {
    return '(No tone signal from audit. Default to warm + practice-grounded — match the voice already present in additionalContent prose.)';
  }
  const tone = String(toneRaw).toLowerCase();
  // Match enum values first (audit-tone-enum-constrained outputs)
  let bucket;
  if (/^\s*warm\b/.test(tone) || /\b(family|community|approachable|welcoming|warm)\b/.test(tone)) {
    bucket = 'warm';
  } else if (/^\s*clinical\b/.test(tone) || /\b(clinical|precise|expert|specialist)\b/.test(tone)) {
    bucket = 'clinical';
  } else if (/^\s*editorial\b/.test(tone) || /\b(editorial|sophisticated|magazine)\b/.test(tone)) {
    bucket = 'editorial';
  } else if (/^\s*bold\b/.test(tone) || /\b(bold|confident|declarative|punchy)\b/.test(tone)) {
    bucket = 'bold';
  } else if (/^\s*refined\b/.test(tone) || /\b(refined|luxury|upscale|elegant)\b/.test(tone)) {
    bucket = 'refined';
  } else {
    bucket = 'warm';  // safe default
  }

  const GUIDANCE = {
    warm: `## Tone calibration: WARM (family/community archetype)

Copy should feel like a real person at this practice talking to a parent or neighbor — warm, conversational, low-friction.
- Use everyday phrasing: "your child's first visit", "we know going to the dentist isn't always fun", "feel free to reach out".
- Contractions are fine (we're, you'll). Active voice. Second person ("you / your child") not third ("the patient").
- Avoid clinical jargon unless the practice itself uses it. "Cleaning" beats "prophylaxis"; "filling" beats "restoration".
- Headlines can be a half-sentence ("A dental home for your whole family.") or a question ("New to the area? Let's say hello.").
- CTAs should feel like an invitation, not a transaction: "Book your visit", "Schedule a hello", "Meet our team".`,

    clinical: `## Tone calibration: CLINICAL (specialist archetype)

Copy should feel like a trained specialist explaining their practice — precise, confident, technically grounded without being cold.
- Use specific terminology when it matters ("class II malocclusion", "all-on-four implant arch"). Don't dumb it down, but define when needed.
- Avoid folksy phrases. No "our team is like family". The differentiator IS the expertise.
- Headlines are declarative and credentialed: "Board-certified periodontal surgery in Long Beach.", "Specialist orthodontics for adults and adolescents."
- Trust comes from credentials, technology, outcomes — surface those facts plainly.
- CTAs are direct and action-oriented: "Schedule a consultation", "Request your evaluation", "Begin treatment planning".`,

    editorial: `## Tone calibration: EDITORIAL (premium archetype)

Copy should feel like a thoughtful magazine feature about the practice — measured, observed, with a slight remove that conveys taste.
- Sentences vary in length deliberately. Some short. Then a longer, more considered phrase that earns the pause.
- Third-person observations occasionally ("The practice operates from a converted Craftsman on the corner of...") feel right; shift to second-person sparingly.
- Avoid imperative CTAs in body copy. The CTA earns its weight by being the only direct ask on the page.
- Headlines can be poetic or thematic: "Care designed around the patient.", "Twenty-five years of one practice's evolution."
- CTAs are still action-oriented but framed as choice, not push: "Plan your consultation", "Begin a conversation".`,

    bold: `## Tone calibration: BOLD (modern/specialist with strong identity)

Copy should feel high-contrast, declarative, no-fluff — confident enough to be brief.
- Short sentences. Strong verbs. Cut every adjective that doesn't add information.
- Headlines are often single-claim: "We straighten teeth in 18 months.", "Implants done in one visit." Specifics earn attention.
- Avoid hedging language ("we strive to", "we may be able to"). State what you do.
- CTAs are imperative + specific: "Get your treatment plan.", "Start now.", "Book — same week."
- Body copy can be 2-3 sentences per section. Density of information per word matters more than length.`,

    refined: `## Tone calibration: REFINED (luxury/upscale)

Copy should feel understated, considered — the practice doesn't need to oversell because the work speaks.
- Avoid superlatives ("best", "top-rated", "world-class"). Refined practices don't shout.
- Use specific, confident language: "Treatment is planned in three appointments." beats "We offer a personalized treatment plan tailored to your needs."
- Lots of white space in the writing — fewer sentences per section, each carrying weight.
- Headlines are minimal, often nominal phrases: "Restorative dentistry, considered.", "Our practice. Our principles."
- CTAs are quiet and specific: "Reserve your consultation", "Begin your treatment", "Speak with the practice".`,
  };

  return GUIDANCE[bucket];
}

/**
 * Format the upstream Map's blueprint as a per-section guidance block. When
 * the blueprint is null (Map phase didn't run), we emit a clear "no blueprint
 * — infer inline" hint so the prompt's fallback path activates.
 */
function buildBlueprintBlock(blueprint) {
  if (!blueprint || !blueprint.contentAudit) {
    return '(No blueprint provided — Map phase did not run. Infer source/quality/action inline using the rules below.)';
  }
  const lines = [];
  for (const [key, entry] of Object.entries(blueprint.contentAudit)) {
    const existing  = entry.existing == null ? 'null' : `"${String(entry.existing).slice(0, 200).replace(/"/g, '\\"')}${String(entry.existing).length > 200 ? '…' : ''}"`;
    const source    = entry.source    || 'null';
    const quality   = entry.quality   || '?';
    const action    = entry.action    || '?';
    const rationale = entry.rationale || '';
    lines.push(`- ${key}: ${action} (${quality}) ${rationale ? '— ' + rationale : ''}\n    source: ${source}\n    existing: ${existing}`);
  }
  if (blueprint.differentiatorMatches && Object.keys(blueprint.differentiatorMatches).length) {
    lines.push('');
    lines.push('Per-service differentiator matches (weave these into the matching service intros):');
    for (const [slug, labels] of Object.entries(blueprint.differentiatorMatches)) {
      if (Array.isArray(labels) && labels.length) {
        lines.push(`  ${slug}: ${labels.join(', ')}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Format silver's additionalContent[] as a tagged prose block for the prompt.
 * Each item shows type + source path + verbatim content so the model can
 * pick relevant blocks for hero/about/philosophy/etc.
 */
function buildAdditionalContentBlock(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'No verbatim prose rescued from this site.';
  }
  return items.map(item => {
    const header = `### [${item.type || 'other'}] ${item.title ? item.title + ' — ' : ''}from ${item.source || 'unknown'}`;
    const body   = (item.content || '').trim();
    return `${header}\n${body}`;
  }).join('\n\n---\n\n');
}

/**
 * Format silver's differentiators[] as a labeled list for the prompt.
 * Each entry shows type + label + source so the model can match a service to
 * a relevant differentiator (e.g. CEREC technology + dental crowns service).
 */
function buildDifferentiatorsBlock(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'No differentiators extracted from this site.';
  }
  return items.map(d => {
    const detail = d.detail ? ` — ${d.detail}` : '';
    const src    = d.source ? ` (${d.source})` : '';
    return `- [${d.type}] ${d.label}${detail}${src}`;
  }).join('\n');
}

/**
 * Match each service to its scraped page content so the AI uses real source material.
 * Matches on /services/{slug} or /services/{name-variant} paths.
 */
function buildServicePageContent(services, inventory) {
  if (!services.length || !inventory.length) return 'No service page content available.';

  const blocks = [];
  for (const svc of services) {
    // Find the matching page — try exact slug match, then name-based path match
    const page = inventory.find(p => {
      const path = (p.path || p.url || '').toLowerCase().replace(/\/+$/, '');
      return path === `/services/${svc.slug}` ||
             path.includes(`/services/${svc.slug}`) ||
             path.includes(`/services/${svc.name?.toLowerCase().replace(/\s+/g, '-')}`);
    });

    if (!page) continue;

    const lines = [`### ${svc.slug} (${svc.name})`];
    if (page.h1) lines.push(`H1: ${page.h1}`);
    if (page.metaDesc) lines.push(`Meta: ${page.metaDesc}`);
    if (page.paragraphs?.length) {
      page.paragraphs.slice(0, 4).forEach(p => lines.push(`  ${p.slice(0, 300)}`));
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.length > 0 ? blocks.join('\n\n') : 'No matching service pages found in crawl.';
=======
  return template
    .replace('{{copywritingGuidelines}}', copywritingSkill || '(No copywriting skill file found — use best judgment.)')
    .replace('{{practiceName}}', practice.name || '[Practice Name]')
    .replace('{{domain}}', practice.domain || '[domain]')
    .replace('{{doctorName}}', doctor.name || '[Doctor Name]')
    .replace('{{credentials}}', doctor.credentials || 'DDS')
    .replace('{{city}}', merged.address?.city || '[City]')
    .replace('{{state}}', merged.address?.state || '[State]')
    .replace('{{phone}}', practice.phone || '[Phone]')
    .replace('{{servicesList}}', servicesList)
    .replace('{{hubSlugs}}', hubSlugs)
    .replace('{{positioning}}', positioning)
    .replace('{{tone}}', tone)
    .replace('{{differentiators}}', differentiators)
    .replace('{{primaryService}}', primaryService)
    .replace('{{pageInventory}}', pageInventory)
    .replace('{{testimonials}}', testimonials)
    .replace('{{existingFAQs}}', existingFAQs)
    .replace('{{stats}}', statsStr);
>>>>>>> origin/main
}

function buildPageInventorySummary(inventory) {
  if (!inventory || inventory.length === 0) return 'No pages crawled.';

  return inventory.map(page => {
    const lines = [`### ${page.path || page.url}`];
    if (page.title) lines.push(`Title: ${page.title}`);
    if (page.h1) lines.push(`H1: ${page.h1}`);
    if (page.h2s?.length) lines.push(`H2s: ${page.h2s.join(' | ')}`);
    if (page.metaDesc) lines.push(`Meta: ${page.metaDesc}`);
    if (page.paragraphs?.length) {
      lines.push(`Content excerpts:`);
      page.paragraphs.slice(0, 3).forEach(p => lines.push(`  • ${p.slice(0, 200)}`));
    }
    lines.push(`Word count: ~${page.wordCount}`);
    return lines.join('\n');
  }).join('\n\n');
}
