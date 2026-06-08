// Upload sourcing screenshots to GCS and mint signed URLs for Airtable.
//
// Why signed URLs: Airtable attachment fields require a publicly-FETCHABLE
// URL — it downloads the file server-side at write time and stores its own
// copy. A signed URL (time-limited, no public bucket needed) is perfect:
// Airtable fetches immediately on upsert, so even a short expiry is fine,
// and the bucket stays private.
//
// Reuses the project's GCS credentials (GOOGLE_APPLICATION_CREDENTIALS or
// GOOGLE_CLOUD_CREDENTIALS_JSON) and bucket (GOOGLE_CLOUD_STORAGE_BUCKET).

import { Storage } from '@google-cloud/storage';

const BUCKET = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'builder-data';
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'groundwork-dental';
const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — generous; Airtable copies on write anyway
const GCS_PREFIX = 'sourcing/screenshots';

let _client = null;
let _enabled = null;

function getClient() {
  if (_enabled === false) return null;
  if (_client) return _client;
  try {
    // retryOptions: fail fast — don't let the client's default backoff/retry
    // storm hang an upload for tens of seconds during GCS flakiness.
    const retryOptions = { maxRetries: 1, totalTimeout: 15 };
    const inline = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
    if (inline) {
      _client = new Storage({ projectId: PROJECT, credentials: JSON.parse(inline), retryOptions });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _client = new Storage({ projectId: PROJECT, retryOptions });
    } else {
      _enabled = false;
      return null;
    }
    _enabled = true;
    return _client;
  } catch (e) {
    console.warn(`  [screenshots-gcs] init failed: ${e.message}`);
    _enabled = false;
    return null;
  }
}

export function gcsConfigured() {
  return getClient() !== null;
}

/**
 * Upload a PNG buffer to GCS and return a signed read URL.
 *
 * @param {object} args
 * @param {string} args.placeId
 * @param {'desktop'|'mobile'} args.kind
 * @param {Buffer} args.png
 * @returns {Promise<string|null>} signed URL, or null if GCS unavailable / failed
 */
// Limit concurrent uploads — with concurrency=4 workers each pushing desktop +
// mobile, unbounded parallel uploads saturate the connection and trip the
// per-upload timeout. A small queue keeps throughput without the false-null
// race where the timeout fires but the upload completes a moment later.
const MAX_CONCURRENT_UPLOADS = 2;
let _inFlight = 0;
const _uploadQueue = [];

function acquireUploadSlot() {
  if (_inFlight < MAX_CONCURRENT_UPLOADS) {
    _inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _uploadQueue.push(resolve));
}

function releaseUploadSlot() {
  _inFlight--;
  const next = _uploadQueue.shift();
  if (next) { _inFlight++; next(); }
}

// Hard cap on any single upload so GCS slowness can't eat the per-practice
// budget. Backfillable later via --sync-only.
const UPLOAD_TIMEOUT_MS = 45_000;

function withUploadTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => {
      reject(new Error(`upload timed out after ${UPLOAD_TIMEOUT_MS}ms`));
    }, UPLOAD_TIMEOUT_MS).unref()),
  ]).catch((e) => {
    console.warn(`  [gcs] ${e.message} (${label})`);
    return null;
  });
}

export async function uploadScreenshot({ placeId, kind, png }) {
  const client = getClient();
  if (!client || !png) return null;

  const objectPath = `${GCS_PREFIX}/${placeId}-${kind}.png`;
  await acquireUploadSlot();
  try {
    return await withUploadTimeout((async () => {
      try {
        const file = client.bucket(BUCKET).file(objectPath);
        await file.save(png, { metadata: { contentType: 'image/png' }, resumable: false });
        const [url] = await file.getSignedUrl({
          version: 'v4', action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS,
        });
        return url;
      } catch (e) {
        console.warn(`  [screenshots-gcs] upload failed (${objectPath}): ${e.message}`);
        return null;
      }
    })(), objectPath);
  } finally {
    releaseUploadSlot();
  }
}
