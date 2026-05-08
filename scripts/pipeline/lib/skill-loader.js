/**
 * skill-loader.js
 *
 * Runtime loader for skill .md files. Each skill is a portable Markdown
 * document with YAML frontmatter (metadata) + a "## PROMPT" section
 * (the actual prompt template). Variables in the prompt use `{{path}}`
 * mustache-style substitution from a context object.
 *
 * The .md file is the SOURCE OF TRUTH — the JS callers pass a context
 * object and get back the fully-rendered prompt string. To improve a
 * prompt, edit the .md; no code change required.
 *
 * Skill file format:
 *
 *     ---
 *     tier: L1
 *     maturity: working
 *     phase: Generate
 *     source: scripts/pipeline/skills/skill-generate.js
 *     function: heroContentBrief
 *     ---
 *
 *     # Skill: Hero Content Generation
 *
 *     ## Responsibility
 *     ...
 *
 *     ## Evaluation criteria
 *     ...
 *
 *     ## PROMPT
 *
 *     The actual prompt template here. Use {{practice.name}} for
 *     substitution. Conditionals are NOT supported — prepare clean
 *     values in the JS caller and pass them in the context.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the skills/ directory relative to this file.
// scripts/pipeline/lib/skill-loader.js → ../../skills/ → groundwork-builder/skills/
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(__dirname, '..', '..', '..', 'skills');

// In-memory cache keyed by skill path
const cache = new Map();

/**
 * Load a skill markdown file and return its parsed shape.
 *
 * @param {string} skillPath  - relative path under skills/, no extension
 *                              (e.g. "content/hero")
 * @returns {Promise<{ frontmatter: object, body: string, prompt: string|null, raw: string }>}
 */
export async function loadSkill(skillPath) {
  if (cache.has(skillPath)) return cache.get(skillPath);

  const file = resolve(SKILLS_ROOT, `${skillPath}.md`);
  let raw;
  try {
    raw = await readFile(file, 'utf-8');
  } catch (err) {
    throw new Error(`skill-loader: could not read skill "${skillPath}" at ${file}: ${err.message}`);
  }

  const parsed = parse(raw);
  cache.set(skillPath, parsed);
  return parsed;
}

/**
 * Convenience: load a skill and render its prompt with a context.
 * Throws if the skill has no PROMPT section.
 *
 * @param {string} skillPath  - e.g. "content/hero"
 * @param {object} context    - flat or nested values, accessed via dot paths
 * @returns {Promise<string>} - rendered prompt
 */
export async function renderSkillPrompt(skillPath, context = {}) {
  const skill = await loadSkill(skillPath);
  if (!skill.prompt) {
    throw new Error(`skill-loader: skill "${skillPath}" has no ## PROMPT section`);
  }
  return render(skill.prompt, context);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Split raw markdown into frontmatter (YAML between --- lines), body,
 * and the prompt template (everything after the "## PROMPT" heading).
 */
function parse(raw) {
  let body = raw;
  let frontmatter = {};

  // Frontmatter: must start with --- on the first line
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---\n', 4);
    if (end !== -1) {
      const yaml = raw.slice(4, end);
      frontmatter = parseSimpleYaml(yaml);
      body = raw.slice(end + 5);
    }
  }

  // Extract the prompt section: everything after a "## PROMPT" heading.
  // (Case-insensitive, allows extra whitespace.)
  let prompt = null;
  const promptMatch = body.match(/\n##\s+PROMPT\s*\n([\s\S]*)$/i);
  if (promptMatch) {
    prompt = promptMatch[1].trim();
  }

  return { frontmatter, body, prompt, raw };
}

/**
 * Tiny YAML parser — only handles flat `key: value` pairs.
 * (Skill frontmatter never needs nested structures.)
 */
function parseSimpleYaml(yaml) {
  const out = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    // Strip optional surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mustache-style rendering — {{path.to.value}} substitution
// ---------------------------------------------------------------------------

/**
 * Render a template by replacing {{path}} occurrences with values from context.
 *
 * - Resolves dot-paths (e.g. {{practice.name}}, {{dna.designTokens.heroLayout}})
 * - Missing values → empty string (NOT undefined; produces clean prompts)
 * - For values that contain unsafe characters (backticks, ${}), substitution
 *   is verbatim — the prompt is plain text, not JS, so this is fine.
 */
export function render(template, context = {}) {
  return template.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_, path) => {
    const value = resolvePath(context, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

// ---------------------------------------------------------------------------
// Catalog: list every skill on disk + parse its frontmatter
// (used by the skill-catalog generator to build SKILLS.md)
// ---------------------------------------------------------------------------

/**
 * Walk the skills/ directory and return every skill's metadata.
 * Returns: [{ skillPath, frontmatter, hasPrompt, promptLength }]
 */
export async function listAllSkills() {
  const { readdir } = await import('node:fs/promises');
  const out = [];

  async function walk(dir, prefix = '') {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      const rel  = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(full, rel);
      } else if (e.name.endsWith('.md')) {
        const skillPath = rel.replace(/\.md$/, '');
        try {
          const skill = await loadSkill(skillPath);
          out.push({
            skillPath,
            frontmatter: skill.frontmatter,
            hasPrompt: !!skill.prompt,
            promptLength: skill.prompt?.length || 0,
          });
        } catch (err) {
          // Skill that fails to parse — surface but don't crash the catalog
          out.push({ skillPath, frontmatter: { error: err.message }, hasPrompt: false, promptLength: 0 });
        }
      }
    }
  }

  await walk(SKILLS_ROOT);
  return out.sort((a, b) => a.skillPath.localeCompare(b.skillPath));
}

export { SKILLS_ROOT };
