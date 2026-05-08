/**
 * skill-shape.js — Headless shape skill.
 *
 * Produces a structured design brief from silver/merged practice data and DNA.
 * Run at the start of a build — "understand before building." No screenshots
 * needed, no file changes emitted. Returns a brief object only.
 *
 * Input:  { dna, practice, merged }
 *   merged = full silver data (services, testimonials, aboutText, etc.)
 *
 * Output: { skill, summary, brief, meta }
 *   brief: { audience, primaryAction, designDirection, layoutStrategy,
 *             keyStates, copyRequirements, doRules, dontRules, openQuestions }
 */

import { renderDesignContext } from '../lib/render-design-context.js';

const MODEL = 'claude-sonnet-4-6';

export async function run({ dna, practice, merged = {} }) {
  const start   = Date.now();
  const context = renderDesignContext(dna, practice);

  const archetype        = dna?.archetype        || '(not specified)';
  const creativeDirection = dna?.creativeDirection || '(not specified)';
  const density          = dna?.density           || 'balanced';
  const heroVariant      = dna?.heroVariant        || '(not specified)';

  // Summarize merged data for the prompt — avoid dumping the whole object
  const services    = Array.isArray(merged?.services)    ? merged.services.slice(0, 8)    : [];
  const testimonials = Array.isArray(merged?.testimonials) ? merged.testimonials.slice(0, 3) : [];
  const aboutText   = merged?.aboutText   || merged?.about   || '';
  const tagline     = merged?.tagline     || merged?.headline || '';
  const insurance   = merged?.insurance   || merged?.acceptedInsurance || [];
  const specialties = merged?.specialties || merged?.conditions || [];

  const { callAnthropic } = await import('../lib/ai-call.js');
  const res = await callAnthropic({
    phase:     'skill:shape',
    model:     MODEL,
    maxTokens: 3000,
    messages:  [{
      role: 'user',
      content: [
        { type: 'text', text: context },
        {
          type: 'text',
          text: `## Practice Data

**Practice name:** ${practice?.name || '(not set)'}
**Doctor:** ${practice?.doctor || '(not set)'}
**City:** ${practice?.city || '(not set)'}
**Tagline/Headline:** ${tagline || '(none)'}

**About text (excerpt):**
${typeof aboutText === 'string' ? aboutText.slice(0, 800) : JSON.stringify(aboutText).slice(0, 800)}

**Services offered:**
${services.map(s => `- ${typeof s === 'string' ? s : s.name || JSON.stringify(s)}`).join('\n') || '(none)'}

**Specialties/Conditions treated:**
${specialties.slice(0, 10).map(s => `- ${typeof s === 'string' ? s : s.name || JSON.stringify(s)}`).join('\n') || '(none)'}

**Insurance accepted:**
${Array.isArray(insurance) ? insurance.slice(0, 6).join(', ') : String(insurance) || '(none)'}

**Sample testimonial:**
${testimonials[0] ? (typeof testimonials[0] === 'string' ? testimonials[0].slice(0, 300) : (testimonials[0].text || testimonials[0].body || '').slice(0, 300)) : '(none)'}

## DNA Summary

Archetype: ${archetype}
Creative direction: ${creativeDirection}
Density: ${density}
Hero variant: ${heroVariant}

## Task: Produce Design Brief

Generate a structured design brief that will guide all subsequent build decisions.
Be specific to this practice — not generic healthcare advice.

Return ONLY valid JSON:
{
  "audience": {
    "primary": "<who is the main visitor — be specific: age, concern, intent>",
    "secondary": "<referral sources, insurance holders, returning patients, etc.>",
    "anxieties": ["<what worries them>", "<what might make them leave>"],
    "motivators": ["<what makes them book>"]
  },
  "primaryAction": {
    "cta_label": "<exact button text for main CTA>",
    "cta_destination": "<what happens when they click: phone, form, portal>",
    "secondary_cta": "<secondary action if applicable>"
  },
  "designDirection": {
    "mood": "<3-5 adjectives specific to this practice's archetype and specialty>",
    "visual_references": ["<a real-world design reference, not a competitor>"],
    "avoid": ["<visual directions that would feel wrong for this specialty/archetype>"]
  },
  "layoutStrategy": {
    "hero_approach": "<what the hero should communicate first and how>",
    "section_order": ["<hero>", "<trust signal>", "<services>", "..."],
    "information_hierarchy": "<what must be above fold vs. below>"
  },
  "keyStates": [
    { "state": "<name>", "description": "<what the UI shows in this state>" }
  ],
  "copyRequirements": {
    "headline_direction": "<tone and approach for the hero headline>",
    "must_mention": ["<insurance>", "<location>", "<specific service if prominent>"],
    "avoid_phrases": ["<generic healthcare clichés to avoid>"]
  },
  "doRules": ["<specific design action>"],
  "dontRules": ["<specific anti-pattern to avoid>"],
  "openQuestions": ["<a genuine unknown that would improve the design if answered>"]
}`,
        },
      ],
    }],
  });

  const text   = res.text;
  const brief  = parseJson(text);

  const audienceSummary = brief?.audience?.primary || 'audience brief generated';
  const ctaLabel        = brief?.primaryAction?.cta_label || 'CTA defined';

  return {
    skill:   'shape',
    summary: `Design brief for ${practice?.name || 'practice'}: ${audienceSummary}. Primary CTA: "${ctaLabel}".`,
    brief,
    meta: { model: MODEL, duration_ms: Date.now() - start, tokens: res.usage },
  };
}

function parseJson(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const f = text.indexOf('{'), l = text.lastIndexOf('}');
  if (f !== -1 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch {} }
  return null;
}
