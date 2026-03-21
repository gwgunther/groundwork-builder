/**
 * Preset loader — dynamically imports a vertical preset by name.
 *
 * Returns a normalised object with all the domain knowledge a pipeline
 * module needs, so no module has to import dental-specific code directly.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a vertical preset by name.
 *
 * @param {string} presetName - Preset directory name (e.g. 'dental')
 * @returns {object} Normalised preset object
 */
export async function loadPreset(presetName = 'dental') {
  const presetPath = resolve(__dirname, '..', '..', '..', 'presets', presetName, 'index.js');

  let preset;
  try {
    preset = await import(presetPath);
  } catch (err) {
    throw new Error(
      `Failed to load preset "${presetName}" from ${presetPath}: ${err.message}\n` +
      `Available presets live in presets/<name>/index.js`,
    );
  }

  return {
    name: presetName,

    /** Taxonomy: service definitions + matcher function */
    taxonomy: {
      services: preset.SERVICES,
      matchService: preset.matchServiceTaxonomy,
    },

    /** Authority article rules + category helpers */
    articleRules: {
      rules: preset.AUTHORITY_ARTICLE_RULES,
      categoryMap: preset.CATEGORY_MAP,
      deriveCategory: preset.deriveCategory,
    },

    /** Schema.org / vertical config */
    schema: preset.SCHEMA_CONFIG,

    /** Scraper crawl configuration */
    crawl: {
      priorityPaths: preset.PRIORITY_PATHS,
    },

    /** Service hub definitions + display descriptions */
    hubs: {
      definitions: preset.SERVICE_HUBS,
      descriptions: preset.SERVICE_DESCRIPTIONS,
    },

    /** Redirect mapping rules */
    redirectRules: preset.REDIRECT_RULES,
  };
}
