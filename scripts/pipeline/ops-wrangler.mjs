#!/usr/bin/env node
/**
 * ops-wrangler.mjs
 * Runs wrangler inside workers/ops-dashboard with env vars already loaded
 * (node --env-file=.env handles the loading before this script runs).
 */
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(__dirname, '../../workers/ops-dashboard');
const cmd = process.argv[2] ?? 'deploy'; // 'deploy' | 'dev'

execFileSync('npx', ['wrangler', cmd], {
  cwd: workerDir,
  stdio: 'inherit',
  env: process.env,
});
