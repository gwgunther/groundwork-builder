/**
 * Dental preset — barrel re-export.
 *
 * This is the entry point loaded by preset-loader.js.
 * All dental-specific knowledge lives in sibling files.
 */

export { SERVICES, matchServiceTaxonomy } from './taxonomy.js';
export { AUTHORITY_ARTICLE_RULES, CATEGORY_MAP, deriveCategory } from './article-rules.js';
export { SCHEMA_CONFIG } from './schema-config.js';
export { PRIORITY_PATHS } from './priority-paths.js';
export { SERVICE_HUBS, SERVICE_DESCRIPTIONS } from './service-hubs.js';
export { REDIRECT_RULES } from './redirect-rules.js';
