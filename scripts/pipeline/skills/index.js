/**
 * skills/index.js — Skill registry for the designer agent.
 *
 * Each skill is a headless JSON-IO function: run(input) → output
 * The agent picks skills based on rubric scores and the skills-registry.json tiers.
 */

export { run as runCritique  } from './skill-critique.js';
export { run as runTypeset   } from './skill-typeset.js';
export { run as runColorize  } from './skill-colorize.js';
export { run as runLayout    } from './skill-layout.js';
export { run as runPolish    } from './skill-polish.js';
export { run as runShape     } from './skill-shape.js';
export { run as runGenerate  } from './skill-generate.js';
export { run as runImagery   } from './skill-imagery.js';
export { run as runBolder    } from './skill-bolder.js';

export const SKILL_MAP = {
  critique:  () => import('./skill-critique.js').then(m => m.run),
  typeset:   () => import('./skill-typeset.js').then(m => m.run),
  colorize:  () => import('./skill-colorize.js').then(m => m.run),
  layout:    () => import('./skill-layout.js').then(m => m.run),
  polish:    () => import('./skill-polish.js').then(m => m.run),
  shape:     () => import('./skill-shape.js').then(m => m.run),
  generate:  () => import('./skill-generate.js').then(m => m.run),
  imagery:   () => import('./skill-imagery.js').then(m => m.run),
  bolder:    () => import('./skill-bolder.js').then(m => m.run),
};

/**
 * Run a skill by name.
 * @param {string} skillId
 * @param {object} input
 */
export async function runSkill(skillId, input) {
  const loader = SKILL_MAP[skillId];
  if (!loader) throw new Error(`Unknown skill: ${skillId}. Valid: ${Object.keys(SKILL_MAP).join(', ')}`);
  const fn = await loader();
  return fn(input);
}
