// Robust .env loader for the sourcing pipeline.
//
// Why this exists: some execution environments (CI, the Claude Code harness,
// certain shells) export variables like ANTHROPIC_API_KEY as EMPTY strings.
// Plain `dotenv.config()` will NOT overwrite a variable that is already
// present in process.env — even when it's empty — so the real value in .env
// silently never loads.
//
// This loader fills in any var that is missing OR empty from .env, without
// clobbering vars that already hold a real value. Import this once at the
// top of every entry-point script:  import './lib/env.js'
//
// (Path-resolves .env from the repo root regardless of cwd.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../../..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

if (fs.existsSync(ENV_PATH)) {
  const parsed = dotenv.parse(fs.readFileSync(ENV_PATH));
  for (const [k, v] of Object.entries(parsed)) {
    const current = process.env[k];
    if (current === undefined || current === '') {
      process.env[k] = v;
    }
  }
}
