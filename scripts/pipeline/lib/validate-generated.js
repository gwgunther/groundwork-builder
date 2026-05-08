/**
 * Post-generation validation for AI-produced section components.
 *
 * The AI sometimes hallucinates resources — most commonly hardcoding image
 * paths like `/images/doctor-portrait.jpg` that don't exist on disk. The
 * pipeline shipped silently because the build step doesn't fail on broken
 * <img src>. This module catches those errors at generation time so we can
 * either replace the broken file with a fallback or surface a loud warning.
 *
 * Scope (intentionally narrow):
 *   - Walk every file the generator wrote in this run
 *   - Extract literal `<img src="…">` paths
 *   - For each path that looks local (starts with `/` and isn't a data: URL),
 *     verify the file exists at `public<src>`. If not, flag it.
 *
 * Returns a list of issues; the caller decides whether to fail, fall back, or
 * surface to the operator.
 */

import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {string[]} generatedFiles  - absolute paths of generated .astro files
 * @param {string} outputDir         - the project root containing `public/`
 * @returns {Promise<Array<{ file: string, issue: string, detail: string }>>}
 */
export async function validateGeneratedFiles(generatedFiles, outputDir) {
  const issues = [];

  for (const filePath of generatedFiles) {
    let src;
    try {
      src = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    // Issue 1: literal /images/foo.jpg style hardcoded paths that bypass imageRoles.
    // Captures src="/images/..." in static <img> tags. Excludes Astro template
    // expressions like src={heroImg}.
    const literalImgRegex = /<img[^>]*\ssrc=["'](\/[^"']+)["']/gi;
    let match;
    while ((match = literalImgRegex.exec(src)) !== null) {
      const path = match[1];
      // Skip data URIs and external URLs (shouldn't be here, but defensively)
      if (path.startsWith('//') || path.startsWith('data:')) continue;

      const absPath = resolve(outputDir, 'public', path.replace(/^\//, ''));
      try {
        await access(absPath);
      } catch {
        issues.push({
          file: filePath,
          issue: 'broken-image-src',
          detail: `<img src="${path}"> — file does not exist at public${path}. AI hardcoded a path; should use imageRoles + imagePath() instead.`,
        });
      }
    }

    // Issue 2: literal "Dr. {doctor.name}" pattern that double-prefixes when
    // doctor.name already includes "Dr.".
    const drDrRegex = /Dr\.\s*\{\s*doctor\.name\s*\}/g;
    if (drDrRegex.test(src)) {
      issues.push({
        file: filePath,
        issue: 'double-doctor-prefix',
        detail: '"Dr. {doctor.name}" produces "Dr. Dr. <Name>" because doctor.name already includes the title. Use {doctor.name} alone, or "Dr. {doctor.nameNoTitle}".',
      });
    }
  }

  return issues;
}

/**
 * Apply automatic fixes for issues we know how to repair safely.
 * Returns the count of fixes applied per file.
 */
export async function autofixGeneratedIssues(issues, outputDir) {
  const { writeFile, readFile } = await import('node:fs/promises');
  const fixesByFile = new Map();

  // Group by file
  const byFile = new Map();
  for (const iss of issues) {
    if (!byFile.has(iss.file)) byFile.set(iss.file, []);
    byFile.get(iss.file).push(iss);
  }

  for (const [filePath, fileIssues] of byFile.entries()) {
    let src = await readFile(filePath, 'utf8');
    let changed = false;

    for (const iss of fileIssues) {
      if (iss.issue === 'double-doctor-prefix') {
        // Safe rewrite: "Dr. {doctor.name}" → "{doctor.name}"
        const before = src;
        src = src.replace(/Dr\.\s*\{\s*doctor\.name\s*\}/g, '{doctor.name}');
        if (src !== before) {
          changed = true;
          fixesByFile.set(filePath, (fixesByFile.get(filePath) || 0) + 1);
        }
      }
      // broken-image-src: not safely auto-fixable (we don't know which imageRoles
      // key the AI meant). Surface as warning; let the caller decide whether to
      // replace with a stub or fail.
    }

    if (changed) await writeFile(filePath, src, 'utf8');
  }

  return fixesByFile;
}
