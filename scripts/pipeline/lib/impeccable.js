/**
 * impeccable.js — Loads and maps Impeccable design reference files.
 *
 * Reference files live at src/skills/impeccable/reference/*.md
 *
 * Exports:
 *   getReferences(sectionTypes)  — returns references relevant to the given section types
 *   getAllReferences()           — returns all references concatenated (for critique)
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
// The impeccable repo (git submodule) stores Claude references under .claude/skills/impeccable/reference/
const REFS_DIR = join(__dir, '../../../src/skills/impeccable/.claude/skills/impeccable/reference');

// Cache: filename (without .md) → content string
const _cache = new Map();

const ALL_REF_NAMES = [
  'typography',
  'color-and-contrast',
  'spatial-design',
  'motion-design',
  'interaction-design',
  'responsive-design',
  'ux-writing',
  'craft',
];

// Section type → reference file names (without .md)
const SECTION_MAP = {
  nav:           ['spatial-design', 'interaction-design', 'ux-writing'],
  header:        ['spatial-design', 'interaction-design', 'ux-writing'],
  hero:          ['spatial-design', 'typography', 'responsive-design'],
  services:      ['spatial-design', 'typography', 'ux-writing'],
  'doctor-intro':['typography', 'spatial-design', 'color-and-contrast'],
  about:         ['typography', 'spatial-design', 'color-and-contrast'],
  gallery:       ['spatial-design', 'responsive-design'],
  cta:           ['ux-writing', 'color-and-contrast', 'interaction-design'],
  footer:        ['spatial-design', 'ux-writing'],
  reviews:       ['typography', 'spatial-design', 'ux-writing'],
  faq:           ['typography', 'ux-writing', 'interaction-design'],
};

const DEFAULT_REFS = ['spatial-design', 'typography'];

/**
 * Load a single reference file, using cache after first read.
 * @param {string} name — e.g. 'typography'
 * @returns {Promise<string>}
 */
async function loadRef(name) {
  if (_cache.has(name)) return _cache.get(name);
  const filePath = join(REFS_DIR, `${name}.md`);
  const content = await readFile(filePath, 'utf8');
  const block = `# ${name}\n\n${content.trim()}`;
  _cache.set(name, block);
  return block;
}

/**
 * Returns concatenated reference content for a specific section type.
 * @param {string[]} sectionTypes — e.g. ['hero'], ['nav', 'header']
 * @returns {Promise<string>}
 */
export async function getReferences(sectionTypes = []) {
  // Collect unique ref names for all requested section types
  const refSet = new Set();
  for (const sectionType of sectionTypes) {
    const refs = SECTION_MAP[sectionType] || DEFAULT_REFS;
    for (const r of refs) refSet.add(r);
  }

  const blocks = await Promise.all([...refSet].map(loadRef));
  return blocks.join('\n\n---\n\n');
}

/**
 * Returns all references concatenated (for critique).
 * @returns {Promise<string>}
 */
export async function getAllReferences() {
  const blocks = await Promise.all(ALL_REF_NAMES.map(loadRef));
  return blocks.join('\n\n---\n\n');
}
