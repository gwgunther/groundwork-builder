#!/usr/bin/env node
// Campaign runner — sources MANY metros unattended, one after another.
//
// Spawns `run.js --metro <key>` as a fresh child process per metro (clean
// memory + browser per metro; a crash in one never aborts the campaign), and
// tracks progress in _sourcing/campaign-progress.json so the WHOLE campaign is
// resumable — re-run it and it skips metros already completed.
//
// Usage:
//   node scripts/sourcing/campaign.js                  # all 100 metros, largest first
//   node scripts/sourcing/campaign.js --top 25         # just the 25 largest
//   node scripts/sourcing/campaign.js --metros dallas-tx,phoenix-az,tampa-fl
//   node scripts/sourcing/campaign.js --retry-failed   # re-attempt only previously-failed metros
//   node scripts/sourcing/campaign.js --limit 200      # passthrough to run.js (per-metro cap)
//
// Each metro's full log → _sourcing/logs/<key>.log. Live summary → stdout.
// Safe to Ctrl-C and re-run; safe to run overnight.

import './lib/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allMetros, getMetro } from './config/metros.js';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '../..');
const OUT = path.join(REPO_ROOT, '_sourcing');
const LOG_DIR = path.join(OUT, 'logs');
const PROGRESS = path.join(OUT, 'campaign-progress.json');

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { o[k] = next; i++; } else o[k] = true;
  }
  return o;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
  catch { return { done: [], failed: {} }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

// Decide which metros to run.
function selectMetros() {
  if (args.metros) {
    return String(args.metros).split(',').map((s) => s.trim()).filter(Boolean);
  }
  let list = allMetros().map((m) => m.key); // already largest-first
  if (args.top) list = list.slice(0, parseInt(args.top, 10));
  return list;
}

// Pass-through flags to run.js (e.g. --limit). --create-table is always on
// (idempotent: finds the canonical table, appends).
function runArgsFor(key) {
  const out = ['scripts/sourcing/run.js', '--metro', key, '--create-table'];
  if (args.limit) out.push('--limit', String(args.limit));
  if (args['no-screenshots']) out.push('--no-screenshots');
  if (args['no-lighthouse']) out.push('--no-lighthouse');
  return out;
}

function runMetro(key) {
  return new Promise((resolve) => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, `${key}.log`);
    const logFd = fs.openSync(logPath, 'a');
    const started = Date.now();
    const child = spawn('node', runArgsFor(key), {
      cwd: REPO_ROOT,
      stdio: ['ignore', logFd, logFd],
    });
    child.on('exit', (code) => {
      fs.closeSync(logFd);
      resolve({ code, secs: Math.round((Date.now() - started) / 1000) });
    });
    child.on('error', (err) => {
      try { fs.closeSync(logFd); } catch {}
      resolve({ code: -1, error: err.message, secs: 0 });
    });
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const progress = loadProgress();

  let metros = selectMetros();
  if (args['retry-failed']) {
    metros = Object.keys(progress.failed || {});
    if (!metros.length) { console.log('No failed metros to retry. Done.'); return; }
  }

  // Validate keys + drop already-done (unless retrying).
  const todo = [];
  for (const key of metros) {
    if (!getMetro(key)) { console.error(`⚠️  unknown metro key, skipping: ${key}`); continue; }
    if (!args['retry-failed'] && progress.done.includes(key)) continue;
    todo.push(key);
  }

  console.log(`━━━ Campaign: ${todo.length} metro(s) to run ━━━`);
  console.log(`(${progress.done.length} already done; logs → _sourcing/logs/<key>.log)\n`);

  for (let i = 0; i < todo.length; i++) {
    const key = todo[i];
    const label = getMetro(key).label;
    process.stdout.write(`[${i + 1}/${todo.length}] ${key.padEnd(30)} ${label} … `);
    const { code, secs, error } = await runMetro(key);

    if (code === 0) {
      if (!progress.done.includes(key)) progress.done.push(key);
      delete progress.failed[key];
      console.log(`✅ ${secs}s`);
    } else {
      progress.failed[key] = { code, error: error || null, at: new Date().toISOString() };
      console.log(`❌ exit ${code}${error ? ` (${error})` : ''} — see log, will retry next run`);
    }
    saveProgress(progress);
  }

  console.log(`\n━━━ Campaign pass complete ━━━`);
  console.log(`Done: ${progress.done.length}  ·  Failed: ${Object.keys(progress.failed).length}`);
  if (Object.keys(progress.failed).length) {
    console.log(`Retry failures with:  node scripts/sourcing/campaign.js --retry-failed`);
  }
}

main().catch((e) => { console.error('Campaign error:', e); process.exit(1); });
