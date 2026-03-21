/**
 * Pipeline artifact writer — breadcrumbs for each pipeline step.
 *
 * Each step writes a JSON file to _pipeline/ so you can review
 * what happened, what decisions were made, and what confidence levels
 * each extraction achieved.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Create an artifact writer bound to a specific output directory.
 *
 * @param {string} outputDir - Root of the generated project
 * @returns {object} Writer with writeStep() and writeSummary() methods
 */
export function createArtifactWriter(outputDir) {
  const pipelineDir = resolve(outputDir, '_pipeline');
  let initialized = false;

  async function ensureDir() {
    if (!initialized) {
      await mkdir(pipelineDir, { recursive: true });
      initialized = true;
    }
  }

  return {
    /**
     * Write a pipeline step artifact.
     *
     * @param {string} id         - Step identifier (e.g. '01-scrape', '02-audit')
     * @param {object} payload    - Step data to persist
     * @param {number} [startTime] - Date.now() when step started (for duration calc)
     */
    async writeStep(id, payload, startTime) {
      await ensureDir();

      const artifact = {
        step: id,
        timestamp: new Date().toISOString(),
        duration_ms: startTime ? Date.now() - startTime : null,
        ...payload,
      };

      const filePath = resolve(pipelineDir, `${id}.json`);
      await writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
    },

    /**
     * Write the final pipeline summary.
     *
     * @param {object} stats - Build summary stats
     */
    async writeSummary(stats) {
      await ensureDir();

      const summary = {
        step: 'summary',
        timestamp: new Date().toISOString(),
        ...stats,
      };

      const filePath = resolve(pipelineDir, 'summary.json');
      await writeFile(filePath, JSON.stringify(summary, null, 2), 'utf-8');
    },
  };
}
