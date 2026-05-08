/**
 * storage.js — Unified storage abstraction: GCS + local.
 *
 * Project:  groundwork-dental
 * Bucket:   builder-data
 *
 * GCS path structure:
 *   {client-slug}/runs/{run-id}/01-bronze.json
 *   {client-slug}/runs/{run-id}/03-content.json
 *   {client-slug}/images/{filename}
 *   _library/{fingerprint-slug}.json
 *
 * Configuration (set in .env):
 *   GOOGLE_CLOUD_STORAGE_BUCKET=builder-data
 *   GOOGLE_CLOUD_CREDENTIALS_JSON={"type":"service_account",...}   ← inline JSON key
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json               ← file path (alternative)
 *
 * Always writes locally. GCS upload is parallel + best-effort (non-blocking).
 * If GCS is not configured, local-only mode runs silently.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const GCS_BUCKET  = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'builder-data';
const GCS_PROJECT = process.env.GOOGLE_CLOUD_PROJECT        || 'groundwork-dental';

let _gcsClient  = null;
let _gcsEnabled = null; // null = not yet checked

// ---------------------------------------------------------------------------
// GCS client — lazy init, credential-method auto-detect
// ---------------------------------------------------------------------------

async function getGcsClient() {
  if (_gcsEnabled === false) return null;
  if (_gcsClient) return _gcsClient;

  try {
    const { Storage } = await import('@google-cloud/storage');

    // Method 1: Inline JSON credentials from env (preferred for hosted environments)
    const inlineJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
    if (inlineJson) {
      let credentials;
      try {
        credentials = JSON.parse(inlineJson);
      } catch {
        console.warn('  [storage] GOOGLE_CLOUD_CREDENTIALS_JSON is not valid JSON — skipping GCS');
        _gcsEnabled = false;
        return null;
      }
      _gcsClient = new Storage({ projectId: GCS_PROJECT, credentials });
      _gcsEnabled = true;
      return _gcsClient;
    }

    // Method 2: File path via GOOGLE_APPLICATION_CREDENTIALS (ADC)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _gcsClient = new Storage({ projectId: GCS_PROJECT });
      _gcsEnabled = true;
      return _gcsClient;
    }

    // No credentials configured — local-only mode
    _gcsEnabled = false;
    return null;

  } catch (err) {
    console.warn(`  [storage] GCS init failed: ${err.message} — local-only mode`);
    _gcsEnabled = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/**
 * Write content to local path (always) and GCS (when configured, non-blocking).
 *
 * @param {string} gcsPath   - GCS object key, e.g. "springs-dental/runs/20260425/01-bronze.json"
 * @param {string|Buffer} content
 * @param {string} localPath - Absolute local file path
 */
export async function storageWrite(gcsPath, content, localPath) {
  // Always write locally first
  await mkdir(dirname(localPath), { recursive: true });
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await writeFile(localPath, buf);

  // GCS — fire-and-forget (non-blocking)
  gcsUpload(gcsPath, buf).catch(err =>
    console.warn(`  [storage] GCS upload failed (${gcsPath}): ${err.message}`)
  );
}

/**
 * Upload a file to GCS only (already exists locally — e.g. downloaded images).
 * Non-blocking.
 */
export function storageUpload(gcsPath, localPath) {
  return gcsUpload(gcsPath, localPath, true).catch(err =>
    console.warn(`  [storage] GCS upload failed (${gcsPath}): ${err.message}`)
  );
}

async function gcsUpload(gcsPath, content, isFilePath = false) {
  const client = await getGcsClient();
  if (!client) return;

  const file = client.bucket(GCS_BUCKET).file(gcsPath);
  const mimeType = gcsPath.endsWith('.json') ? 'application/json'
    : gcsPath.endsWith('.html') ? 'text/html'
    : gcsPath.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
    : gcsPath.endsWith('.png') ? 'image/png'
    : gcsPath.endsWith('.webp') ? 'image/webp'
    : 'application/octet-stream';

  if (isFilePath) {
    await file.upload(content, { metadata: { contentType: mimeType } });
  } else {
    await file.save(content, { metadata: { contentType: mimeType } });
  }
}

export async function storageRead(localPath) {
  return readFile(localPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Run-scoped factory — bind a client slug + run ID for the entire pipeline run
// ---------------------------------------------------------------------------

/**
 * Create a storage instance bound to a specific client run.
 * All paths are automatically namespaced under {clientSlug}/runs/{runId}/.
 *
 * @param {string} clientSlug  - e.g. "spring-st-dentistry"
 * @param {string} [runId]     - e.g. "20260425-143022" (auto-generated if omitted)
 * @returns {RunStorage}
 */
export function createRunStorage(clientSlug, runId) {
  const id = runId || new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-').replace(/-$/, '');
  const prefix = `${clientSlug}/runs/${id}`;

  return {
    runId: id,
    clientSlug,

    /** Write a pipeline artifact JSON file */
    async writeArtifact(name, content, localPath) {
      const gcsPath = `${prefix}/${name}`;
      await storageWrite(gcsPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2), localPath);
    },

    /** Upload an image file that already exists locally */
    uploadImage(filename, localPath) {
      return storageUpload(`${clientSlug}/images/${filename}`, localPath);
    },

    /** Upload the design trace HTML */
    uploadTrace(localPath) {
      return storageUpload(`${prefix}/design-trace.html`, localPath);
    },

    /** GCS path prefix for this run (useful for linking in reports) */
    gcsPrefix: prefix,

    /** Public-ish GCS console URL for this run */
    gcsUrl: `https://console.cloud.google.com/storage/browser/${GCS_BUCKET}/${prefix}`,
  };
}

// ---------------------------------------------------------------------------
// Library storage — design fingerprints (shared across environments)
// ---------------------------------------------------------------------------

/**
 * Write a design library fingerprint to GCS.
 * Called by distill-design.js after saving locally.
 */
export async function libraryWrite(slug, content, localPath) {
  await storageWrite(`_library/${slug}.json`, content, localPath);
}

/**
 * Check if GCS is configured and reachable.
 * Returns { enabled: bool, bucket, project }
 */
export async function storageStatus() {
  const client = await getGcsClient();
  return {
    enabled: !!client,
    bucket:  GCS_BUCKET,
    project: GCS_PROJECT,
    method:  process.env.GOOGLE_CLOUD_CREDENTIALS_JSON ? 'inline-json'
           : process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'file-path'
           : 'none',
  };
}
