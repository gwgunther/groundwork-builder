/**
 * Pipeline artifact writer — breadcrumbs for each pipeline step.
 *
 * Each step writes a JSON file to _pipeline/ locally AND uploads to GCS
 * when storage is configured (non-blocking).
 *
 * Usage:
 *   const artifacts = createArtifactWriter(outputDir, runStorage);
 *   await artifacts.writeStep('01-scrape', { input, output }, startTime);
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Create an artifact writer bound to a specific output directory.
 *
 * @param {string} outputDir    - Root of the generated project
 * @param {object} [runStorage] - Optional run storage from createRunStorage()
 */
export function createArtifactWriter(outputDir, runStorage = null) {
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
     * Write a pipeline step artifact locally + upload to GCS.
     *
     * @param {string} id          - Step identifier (e.g. '01-scrape', '02-audit')
     * @param {object} payload     - Step data to persist
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
      const json = JSON.stringify(artifact, null, 2);
      await writeFile(filePath, json, 'utf-8');

      // GCS upload — non-blocking
      if (runStorage) {
        runStorage.writeArtifact(`${id}.json`, json, filePath).catch(() => {});
      }
    },

    /**
     * Write the final pipeline summary locally + upload to GCS.
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
      const json = JSON.stringify(summary, null, 2);
      await writeFile(filePath, json, 'utf-8');

      if (runStorage) {
        runStorage.writeArtifact('summary.json', json, filePath).catch(() => {});
      }
    },

    /** Expose the run storage for callers that need it (e.g. image uploader) */
    runStorage,
  };
}
