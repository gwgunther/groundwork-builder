/**
 * managed-file.js
 *
 * Lets the agent own specific sections of generated files (between
 * AGENT_MANAGED_START / AGENT_MANAGED_END markers) while leaving
 * user edits outside those markers untouched.
 *
 * Ported from typeui.sh's updateSkillFile.ts pattern.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname }           from 'node:path';

const MANAGED_BLOCK_START = '<!-- AGENT_MANAGED_START -->';
const MANAGED_BLOCK_END   = '<!-- AGENT_MANAGED_END -->';

function extractManagedBlock(content) {
  const s = content.indexOf(MANAGED_BLOCK_START);
  const e = content.indexOf(MANAGED_BLOCK_END);
  if (s === -1 || e === -1 || e < s) return null;
  return content.slice(s, e + MANAGED_BLOCK_END.length);
}

function mergeWithManagedBlock(existing, generatedBlock) {
  const s = existing.indexOf(MANAGED_BLOCK_START);
  const e = existing.indexOf(MANAGED_BLOCK_END);

  if (s === -1 || e === -1 || e < s) {
    // No existing block — append
    const base = existing.trimEnd();
    return base ? `${base}\n\n${generatedBlock}\n` : `${generatedBlock}\n`;
  }

  // Surgically replace the managed block
  const before = existing.slice(0, s).trimEnd();
  const after  = existing.slice(e + MANAGED_BLOCK_END.length).trimStart();
  return [[before, generatedBlock, after].filter(Boolean).join('\n\n'), ''].join('\n');
}

/**
 * Upsert a managed-block file.
 *
 * @param {string}  projectRoot     - absolute path to the project
 * @param {string}  relativePath    - file path relative to projectRoot
 * @param {string}  generatedContent - new content (must contain managed markers OR will be wrapped)
 * @param {boolean} [dryRun]        - if true, return preview without writing
 * @returns {Promise<{absPath:string, changed:boolean, preview?:string}>}
 */
export async function upsertManagedFile(projectRoot, relativePath, generatedContent, dryRun = false) {
  const absPath = resolve(projectRoot, relativePath);
  await mkdir(dirname(absPath), { recursive: true });

  let existing = '';
  try {
    existing = await readFile(absPath, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const generatedBlock = extractManagedBlock(generatedContent) ?? generatedContent;
  const nextContent    = mergeWithManagedBlock(existing, generatedBlock);
  const changed        = existing !== nextContent;

  if (!dryRun && changed) await writeFile(absPath, nextContent, 'utf8');

  return { absPath, changed, preview: dryRun ? nextContent : undefined };
}

export function wrapInManagedBlock(content) {
  return `${MANAGED_BLOCK_START}\n${content}\n${MANAGED_BLOCK_END}`;
}
