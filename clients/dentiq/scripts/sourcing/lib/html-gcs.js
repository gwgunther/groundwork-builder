// Persist rendered HTML to GCS (gzipped) so we can re-score the entire
// corpus against new detectors WITHOUT re-crawling.
//
// Cost is negligible: gzipped dental homepages are ~5–50KB; 5k sites ≈
// 50–250MB total → pennies/month. The HTML is already in memory from the
// Playwright capture, so there's no extra fetch.
//
// Stored at: sourcing/html/{placeId}.html.gz  (Content-Encoding: gzip)
// Returns the gs:// path (not a signed URL — this is for our own re-processing,
// not for Airtable display). The Airtable field just records the pointer.

import { gzipSync } from 'node:zlib';
import { Storage } from '@google-cloud/storage';

const BUCKET = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'builder-data';
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'groundwork-dental';
const PREFIX = 'sourcing/html';

let _client = null;
let _enabled = null;

function getClient() {
  if (_enabled === false) return null;
  if (_client) return _client;
  try {
    const retryOptions = { maxRetries: 1, totalTimeout: 15 }; // fail fast on GCS flakiness
    const inline = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
    if (inline) _client = new Storage({ projectId: PROJECT, credentials: JSON.parse(inline), retryOptions });
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) _client = new Storage({ projectId: PROJECT, retryOptions });
    else { _enabled = false; return null; }
    _enabled = true;
    return _client;
  } catch {
    _enabled = false;
    return null;
  }
}

// Hard cap so a slow GCS call can't eat the per-practice budget.
const UPLOAD_TIMEOUT_MS = 25_000;
function withUploadTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), UPLOAD_TIMEOUT_MS).unref()),
  ]);
}

/**
 * Upload gzipped rendered HTML. Returns { gcsPath, bytes } or null.
 *
 * @param {object} args
 * @param {string} args.placeId
 * @param {string} args.html
 */
/**
 * Upload a checkpoint JSON to GCS for offsite durability. Best-effort,
 * non-blocking — local checkpoint is the source of truth, this is the backup.
 * Returns gs:// path or null.
 */
export async function uploadCheckpoint({ placeId, record }) {
  const client = getClient();
  if (!client || !placeId) return null;
  const objectPath = `sourcing/checkpoints/${placeId}.json`;
  return withUploadTimeout((async () => {
    try {
      await client.bucket(BUCKET).file(objectPath).save(
        JSON.stringify(record),
        { resumable: false, metadata: { contentType: 'application/json' } },
      );
      return `gs://${BUCKET}/${objectPath}`;
    } catch (e) {
      console.warn(`  [checkpoint-gcs] upload failed (${objectPath}): ${e.message}`);
      return null;
    }
  })());
}

export async function uploadHtml({ placeId, html }) {
  const client = getClient();
  if (!client || !html) return null;

  const objectPath = `${PREFIX}/${placeId}.html.gz`;
  return withUploadTimeout((async () => {
    try {
      const gz = gzipSync(Buffer.from(html, 'utf8'));
      const file = client.bucket(BUCKET).file(objectPath);
      await file.save(gz, {
        resumable: false,
        metadata: { contentType: 'text/html', contentEncoding: 'gzip' },
      });
      return { gcsPath: `gs://${BUCKET}/${objectPath}`, bytes: gz.length };
    } catch (e) {
      console.warn(`  [html-gcs] upload failed (${objectPath}): ${e.message}`);
      return null;
    }
  })());
}
