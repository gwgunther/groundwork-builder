/**
 * seo-refs.js — Loads the SEO guidelines reference and exposes it to prompts.
 *
 * Mirrors `impeccable.js` but for SEO. The single doc lives at
 * `scripts/pipeline/reference/seo-guidelines.md`. Section types map to the
 * subset of the doc most relevant to that section, so we don't bloat the
 * generation prompt with everything.
 *
 * Exports:
 *   getSeoReferences(sectionTypes)  — section-relevant slice for skill-generate
 *   getAllSeoReferences()           — full doc, for the SEO QC step (future)
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dir, '../reference/seo-guidelines.md');

let _cachedDoc = null;

async function loadDoc() {
  if (_cachedDoc) return _cachedDoc;
  try {
    _cachedDoc = await readFile(DOC_PATH, 'utf8');
  } catch {
    _cachedDoc = '';
  }
  return _cachedDoc;
}

/**
 * Extract a level-2 section by heading text (case-insensitive).
 * Returns the section content including its `## Heading` line, or null.
 */
function extractSection(doc, headingText) {
  const lines = doc.split('\n');
  const start = lines.findIndex(l => /^##\s+/i.test(l) && l.toLowerCase().includes(headingText.toLowerCase()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Universal sections every section component should care about.
// ---------------------------------------------------------------------------

const UNIVERSAL = [
  'Universal page basics',
  'AI / LLM discoverability',
];

// Map section type → additional H2 headings from the doc to include.
// The order matters — universal first, then section-specific.
const SECTION_MAP = {
  hero:           ['On-page content quality', 'Section-specific notes'],
  services:       ['On-page content quality', 'Schema markup', 'Section-specific notes'],
  'doctor-intro': ['Schema markup', 'Section-specific notes'],
  reviews:        ['Schema markup', 'Section-specific notes'],
  faq:            ['Schema markup', 'Section-specific notes'],
  gallery:        [],
  cta:            ['Local SEO specifics'],
  nav:            ['Section-specific notes'],
  header:         ['Section-specific notes'],
  footer:         ['Schema markup', 'Local SEO specifics', 'Section-specific notes'],
  'stat-bar':     [],
};

/**
 * Returns SEO guidance relevant to the given section types.
 *
 * @param {string[]} sectionTypes
 * @returns {Promise<string>}
 */
export async function getSeoReferences(sectionTypes = []) {
  const doc = await loadDoc();
  if (!doc) return '';

  const wanted = new Set(UNIVERSAL);
  for (const s of sectionTypes) {
    for (const h of SECTION_MAP[s] || []) wanted.add(h);
  }

  const blocks = [];
  for (const heading of wanted) {
    const block = extractSection(doc, heading);
    if (block) blocks.push(block);
  }
  return blocks.join('\n\n---\n\n');
}

/**
 * Returns the full SEO doc (for the audit step).
 * @returns {Promise<string>}
 */
export async function getAllSeoReferences() {
  return await loadDoc();
}
