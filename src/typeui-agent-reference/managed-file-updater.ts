// SOURCE: typeui-main/src/io/updateSkillFile.ts
// WHY THIS MATTERS: The managed block system. When your website builder agent
// generates files and a user makes custom edits, this pattern lets the agent
// update its "owned" sections without clobbering user changes.
//
// Key concept: the agent "owns" content between MANAGED_START / MANAGED_END
// comment markers. Everything outside those markers is user territory.
// On re-generation, only the managed block is replaced — user edits survive.

import fs from "node:fs/promises";
import path from "node:path";

const MANAGED_BLOCK_START = "<!-- AGENT_MANAGED_START -->";
const MANAGED_BLOCK_END = "<!-- AGENT_MANAGED_END -->";

// Extracts just the managed block from a file's content.
function extractManagedBlock(content: string): string | null {
  const startIdx = content.indexOf(MANAGED_BLOCK_START);
  const endIdx = content.indexOf(MANAGED_BLOCK_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  return content.slice(startIdx, endIdx + MANAGED_BLOCK_END.length);
}

// Extracts YAML frontmatter (--- ... ---) from content if present.
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match?.[0] ?? null;
}

function removeLeadingFrontmatter(content: string): string {
  const frontmatter = extractFrontmatter(content);
  return frontmatter ? content.slice(frontmatter.length) : content;
}

function applyFrontmatter(content: string, frontmatter: string): string {
  const withoutFrontmatter = removeLeadingFrontmatter(content).trimStart();
  const normalized = frontmatter.trimEnd();
  if (!withoutFrontmatter) return `${normalized}\n`;
  return `${normalized}\n\n${withoutFrontmatter}`;
}

// Core merge logic: replaces the managed block in existing content,
// leaving everything outside the markers untouched.
function mergeWithManagedBlock(existing: string, generatedBlock: string): string {
  const startIdx = existing.indexOf(MANAGED_BLOCK_START);
  const endIdx = existing.indexOf(MANAGED_BLOCK_END);

  // No existing managed block — append to end
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    const base = existing.trimEnd();
    if (!base) return `${generatedBlock}\n`;
    return `${base}\n\n${generatedBlock}\n`;
  }

  // Has existing managed block — surgically replace it
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx + MANAGED_BLOCK_END.length).trimStart();

  const merged = [before, generatedBlock, after].filter(Boolean).join("\n\n");
  return `${merged}\n`;
}

// Main export: upserts a file with a managed block.
// - If file doesn't exist, creates it.
// - If file exists with a managed block, replaces only that block.
// - If file exists without a managed block, appends the new block.
// - dryRun=true previews without writing.
export async function upsertManagedFile(
  projectRoot: string,
  relativePath: string,
  generatedContent: string,
  dryRun = false
): Promise<{ absPath: string; changed: boolean; preview?: string }> {
  const absPath = path.resolve(projectRoot, relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(absPath, "utf8");
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw error;
  }

  const generatedBlock = extractManagedBlock(generatedContent) ?? generatedContent;
  const generatedFrontmatter = extractFrontmatter(generatedContent);

  let nextContent = mergeWithManagedBlock(existing, generatedBlock);
  if (generatedFrontmatter) {
    nextContent = applyFrontmatter(nextContent, generatedFrontmatter);
  }

  const changed = existing !== nextContent;

  if (!dryRun && changed) {
    await fs.writeFile(absPath, nextContent, "utf8");
  }

  return { absPath, changed, preview: dryRun ? nextContent : undefined };
}

// Wrap any agent-generated content in managed markers so it can be
// selectively updated later without touching user edits.
export function wrapInManagedBlock(content: string): string {
  return `${MANAGED_BLOCK_START}\n${content}\n${MANAGED_BLOCK_END}`;
}
