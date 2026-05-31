/**
 * Airtable client — two-table tracking layer for the grader/builder pipeline.
 *
 * Tables:
 *   Accounts — one row per practice (identity, lifecycle, contact)
 *   Runs     — one row per pipeline invocation (snapshot of metrics + URLs)
 *
 * Required env vars:
 *   AIRTABLE_API_KEY
 *   AIRTABLE_BASE_ID
 *   AIRTABLE_ACCOUNTS_TABLE   (e.g. "Accounts")
 *   AIRTABLE_RUNS_TABLE       (e.g. "Runs")
 *
 * If any are unset, every export becomes a no-op that returns null. Lets
 * audit/build runs continue locally without Airtable when offline or in
 * unit tests.
 */

const BASE        = 'https://api.airtable.com/v0';
const SOURCE_MAP  = {
  // map our canonical source names → existing single-select options in Airtable
  // (existing options: 'Customer Submission', 'Manual Entry')
  'self-serve': 'Customer Submission',
  'manual':     'Manual Entry',
  'biz-dev':    'Manual Entry',   // closest existing option
  'system':     'Manual Entry',
};

function config() {
  return {
    apiKey:    process.env.AIRTABLE_API_KEY,
    baseId:    process.env.AIRTABLE_BASE_ID,
    accounts:  process.env.AIRTABLE_ACCOUNTS_TABLE,
    runs:      process.env.AIRTABLE_RUNS_TABLE,
  };
}

function enabled() {
  const c = config();
  return !!(c.apiKey && c.baseId && c.accounts && c.runs);
}

async function airReq(method, table, pathOrBody = null, body = null) {
  const c = config();
  let url = `${BASE}/${c.baseId}/${encodeURIComponent(table)}`;
  let payload = null;
  if (typeof pathOrBody === 'string') {
    url += pathOrBody;
    payload = body;
  } else if (pathOrBody && typeof pathOrBody === 'object') {
    payload = pathOrBody;
  }
  const opts = {
    method,
    headers: {
      Authorization: 'Bearer ' + c.apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (payload) opts.body = JSON.stringify(payload);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Airtable ${method} ${table}: ${data.error.type} — ${data.error.message}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Find an Account by slug, or create one. Returns the Airtable record id.
 *
 * @param {object} args
 * @param {string} args.slug              - canonical slug, unique key
 * @param {string} [args.practiceUrl]
 * @param {string} [args.practiceName]
 * @param {string} [args.email]
 * @param {string} [args.phone]
 * @param {string} [args.city]
 * @param {string} [args.state]
 * @param {string} [args.source]          - 'self-serve' | 'manual' | 'biz-dev'
 * @param {string} [args.lifecycleStage]  - e.g. 'Audited' (set on first audit)
 * @returns {Promise<string|null>} Account record id, or null when Airtable is disabled
 */
export async function upsertAccount(args = {}) {
  if (!enabled()) return null;
  const { slug } = args;
  if (!slug) throw new Error('upsertAccount: slug is required');

  const c = config();
  // Look up by Slug
  const filter = encodeURIComponent(`{Slug}="${slug.replace(/"/g, '\\"')}"`);
  const search = await airReq('GET', c.accounts, `?filterByFormula=${filter}&maxRecords=1`);
  const existing = search.records?.[0];

  const fields = buildAccountFields(args);
  if (existing) {
    // Update only the fields we have new values for; preserve existing data.
    const updated = await airReq('PATCH', c.accounts, `/${existing.id}`, { fields });
    return updated.id;
  }
  // Create new — slug is required
  fields.Slug = slug;
  const created = await airReq('POST', c.accounts, { fields });
  return created.id;
}

function buildAccountFields({
  practiceUrl, practiceName, email, phone, city, state, source, lifecycleStage,
}) {
  const f = {};
  if (practiceUrl)    f['Practice URL']   = practiceUrl;
  if (practiceName)   f['Practice Name']  = practiceName;
  if (email)          f['Email']          = email;
  if (phone)          f['Phone']          = phone;
  if (city)           f['City']           = city;
  if (state)          f['State']          = state;
  if (source)         f['Source']         = source;
  if (lifecycleStage) f['Lifecycle Stage'] = lifecycleStage;
  return f;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * Create a Run row linked to an Account. Always creates a new row (history is
 * preserved — re-audits and re-builds get distinct rows).
 *
 * @param {object} args
 * @param {string} args.accountId         - record id from upsertAccount()
 * @param {string} args.runType           - 'audit' | 'build' | 'rescan'
 * @param {string} args.status            - 'Running' | 'Done' | 'Failed'
 * @param {string} [args.websiteUrl]      - original site URL
 * @param {string} [args.source]          - 'self-serve' | 'manual' | 'biz-dev' | 'system'
 * @param {object} [args.audit]           - { totalChecks, passed, critical, warnings, mobileScore, desktopScore, gbpReviews, gbpRating, auditReportUrl }
 * @param {object} [args.build]           - { buildSlug, previewUrl, pitchUrl, githubFolderUrl, gcsRunFolder }
 * @param {object} [args.rescan]          - { fixedCount, stillIssueCount, regressedCount }
 * @param {number} [args.costEst]
 * @param {string} [args.errorDetail]
 * @returns {Promise<string|null>}
 */
export async function createRun(args = {}) {
  if (!enabled()) return null;
  const { accountId, runType, status } = args;
  if (!accountId) throw new Error('createRun: accountId is required');
  if (!runType)   throw new Error('createRun: runType is required');
  if (!status)    throw new Error('createRun: status is required');

  const c = config();
  const fields = buildRunFields(args, accountId);
  const created = await airReq('POST', c.runs, { fields });
  return created.id;
}

/**
 * Update a Run row by id. Used to flip Status → Done/Failed and write
 * post-run metrics (audit counts, build URLs, etc.) once the pipeline
 * finishes.
 */
export async function updateRun(runId, args = {}) {
  if (!enabled()) return null;
  if (!runId) throw new Error('updateRun: runId is required');
  const c = config();
  const fields = buildRunFields(args, null);
  // Don't overwrite Account on update.
  delete fields.Account;
  const updated = await airReq('PATCH', c.runs, `/${runId}`, { fields });
  return updated.id;
}

function buildRunFields(args, accountId) {
  const {
    runType, status, websiteUrl, source,
    audit = {}, build = {}, rescan = {},
    costEst, errorDetail,
  } = args;
  const f = {};
  if (accountId)       f['Account']           = [accountId];
  if (runType)         f['Run Type']          = runType;
  if (status)          f['Status']            = status;
  if (websiteUrl)      f['Website URL']       = websiteUrl;
  if (source)          f['Submission Method'] = SOURCE_MAP[source] || source;
  if (status === 'Done' || status === 'Failed') {
    f['Completed At'] = new Date().toISOString();
  }
  // Audit fields
  if (audit.totalChecks  != null) f['Total Checks']      = audit.totalChecks;
  if (audit.passed       != null) f['Passed']            = audit.passed;
  if (audit.critical     != null) f['Critical']          = audit.critical;
  if (audit.warnings     != null) f['Warnings']          = audit.warnings;
  if (audit.mobileScore  != null) f['Mobile Score']      = audit.mobileScore;
  if (audit.desktopScore != null) f['Desktop Score']     = audit.desktopScore;
  if (audit.gbpReviews   != null) f['GBP Reviews']       = audit.gbpReviews;
  if (audit.gbpRating    != null) f['GBP Rating']        = audit.gbpRating;
  if (audit.auditReportUrl)       f['Audit Report Link'] = audit.auditReportUrl;
  // Build fields
  if (build.buildSlug)            f['Build Slug']        = build.buildSlug;
  if (build.previewUrl)           f['Preview URL']       = build.previewUrl;
  if (build.pitchUrl)             f['Pitch URL']         = build.pitchUrl;
  if (build.githubFolderUrl)      f['GitHub Folder URL'] = build.githubFolderUrl;
  if (build.gcsRunFolder)         f['GCS Run Folder']    = build.gcsRunFolder;
  // Rescan fields
  if (rescan.fixedCount       != null) f['Fixed Count']        = rescan.fixedCount;
  if (rescan.stillIssueCount  != null) f['Still Issue Count']  = rescan.stillIssueCount;
  if (rescan.regressedCount   != null) f['Regressed Count']    = rescan.regressedCount;
  // Misc
  if (costEst    != null)        f['Cost Est ($)'] = costEst;
  if (errorDetail)               f['Error Detail'] = errorDetail;
  return f;
}

// ---------------------------------------------------------------------------
// Convenience: full audit cycle in one call
// ---------------------------------------------------------------------------

/**
 * Upsert account + create audit Run + return both ids. Use at the START
 * of an audit run when you only have inputs (url, email, source). Returns
 * `{ accountId, runId }` — pass `runId` to `updateRun()` when the audit
 * finishes with the metrics.
 */
export async function startAuditRun({ slug, practiceUrl, email, source }) {
  if (!enabled()) return { accountId: null, runId: null };
  const accountId = await upsertAccount({
    slug, practiceUrl, email, source,
    lifecycleStage: 'Prospect',
  });
  const runId = await createRun({
    accountId,
    runType: 'audit',
    status:  'Running',
    websiteUrl: practiceUrl,
    source,
  });
  return { accountId, runId };
}
