#!/usr/bin/env node
/**
 * make-paste-prompt.mjs — assemble the paste-ready Claude Design extraction prompt.
 *
 * Inlines docs/design-catalog/schema.json into the fenced prompt from
 * extraction-prompt.md, writes the result to docs/design-catalog/_paste-prompt.txt,
 * and copies it to the clipboard (macOS pbcopy) when available.
 *
 * Usage:  npm run catalog:prompt
 * Then in Claude Design: paste + attach the reference screenshot(s).
 * SCHEMA.md and the de-branding checklist are for humans — do NOT paste them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir  = join(root, 'docs', 'design-catalog');

const promptMd = await readFile(join(dir, 'extraction-prompt.md'), 'utf8');
const schema   = (await readFile(join(dir, 'schema.json'), 'utf8')).trim();

// Extract the fenced prompt block (the part meant for Claude Design).
const fence = promptMd.match(/```\n([\s\S]*?)\n```/);
if (!fence) { console.error('No fenced prompt block found in extraction-prompt.md'); process.exit(1); }

const SLOT = '[paste docs/design-catalog/schema.json here]';
if (!fence[1].includes(SLOT)) { console.error(`Slot "${SLOT}" not found in the fenced prompt`); process.exit(1); }
const assembled = fence[1].replace(SLOT, schema);

const outPath = join(dir, '_paste-prompt.txt');
await writeFile(outPath, assembled, 'utf8');
console.log(`Wrote ${outPath} (${assembled.length.toLocaleString()} chars)`);

// Best-effort clipboard copy (macOS).
try {
  const pb = spawn('pbcopy');
  pb.stdin.end(assembled);
  await new Promise((res, rej) => { pb.on('close', c => c === 0 ? res() : rej()); pb.on('error', rej); });
  console.log('Copied to clipboard — paste into Claude Design with your reference screenshot(s).');
} catch {
  console.log('Clipboard copy unavailable — copy the file contents manually.');
}
