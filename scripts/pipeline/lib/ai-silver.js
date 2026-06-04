/**
 * Silver Transform — public entry point.
 *
 * Multi-pass extraction lives in lib/ai-silver/. This module re-exports
 * extractSilver from there so every existing importer keeps working.
 *
 * Legacy single-pass implementation is preserved at ai-silver.legacy.js
 * for reference / rollback.
 */

export { extractSilver } from './ai-silver/index.js';
