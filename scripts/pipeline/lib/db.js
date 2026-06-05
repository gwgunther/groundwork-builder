/**
 * db.js — local file store for pipeline caches and run history.
 *
 * All data lives under _memory/ (see local-store.js). CRM is Airtable.
 * Re-exports local-store for backward compatibility with existing imports.
 */

export {
  insertRun,
  upsertDesignLibrary,
  queryDesignLibrary,
  loadDesignFingerprint,
  queryImageAnalyses,
  upsertImageAnalyses,
  closeDb,
} from './local-store.js';
