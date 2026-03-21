/**
 * Validator — install deps, run the Astro build, and scan the output
 * for leftover placeholder tokens that still need manual attention.
 */

import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';

/**
 * Validate the generated project by building it and scanning for placeholders.
 *
 * @param {string} outputDir - Root of the generated Astro project
 * @returns {{ buildSuccess: boolean, placeholders: Array<{file: string, pattern: string}>, errors: string[] }}
 */
export async function validate(outputDir) {
  const absDir = resolve(outputDir);
  const results = { buildSuccess: false, placeholders: [], errors: [] };

  // -----------------------------------------------------------------------
  // Step 1: Install dependencies
  // -----------------------------------------------------------------------
  console.log('  Installing dependencies...');
  try {
    execSync('npm install --silent', {
      cwd: absDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (err) {
    const stderr = err.stderr?.toString().slice(0, 500) || err.message;
    results.errors.push(`npm install failed: ${stderr}`);
    return results;
  }

  // -----------------------------------------------------------------------
  // Step 2: Build the Astro site
  // -----------------------------------------------------------------------
  console.log('  Building site...');
  try {
    execSync('npm run build', {
      cwd: absDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
    results.buildSuccess = true;
    console.log('  Build succeeded.');
  } catch (err) {
    const stderr = err.stderr?.toString().slice(0, 500) || err.message;
    results.errors.push(`Build failed: ${stderr}`);
    return results;
  }

  // -----------------------------------------------------------------------
  // Step 3: Scan rendered HTML for leftover placeholder tokens
  // -----------------------------------------------------------------------
  console.log('  Scanning for leftover placeholders...');

  const PLACEHOLDER_PATTERNS = [
    /\[PRACTICE_NAME\]/,
    /\[DOMAIN\]/,
    /\[FIRST_NAME\]/,
    /\[LAST_NAME\]/,
    /\[CREDENTIALS\]/,
    /\[STREET_ADDRESS\]/,
    /\[CITY\]/,
    /\[STATE\]/,
    /\[ZIP\]/,
    /\[X\]\+/,
    /\[YOUR_GOOGLE/,
    /\[University Name\]/,
    /\[Graduation Year\]/,
  ];

  const htmlFiles = await glob(resolve(absDir, 'dist/**/*.html'));

  for (const file of htmlFiles) {
    const content = await readFile(file, 'utf-8');
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(content)) {
        const relPath = file.replace(absDir + '/', '');
        results.placeholders.push({ file: relPath, pattern: pattern.source });
      }
    }
  }

  if (results.placeholders.length > 0) {
    console.log(`  Found ${results.placeholders.length} leftover placeholder(s).`);
  } else {
    console.log('  No leftover placeholders found.');
  }

  return results;
}
