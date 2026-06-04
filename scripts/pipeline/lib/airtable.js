/**
 * Airtable client — three-table tracking layer for the grader/builder pipeline.
 *
 * Tables:
 *   Accounts — one row per practice (identity, lifecycle, contact)
 *   Audits   — one row per audit run (findings, scores, GBP snapshot)
 *   Builds   — one row per generated site (deployed URLs, rescan diff,
 *              linked to its Source Audit)
 *
 * Required env vars:
 *   AIRTABLE_API_KEY
 *   AIRTABLE_BASE_ID
 *   AIRTABLE_ACCOUNTS_TABLE
 *   AIRTABLE_AUDITS_TABLE
 *   AIRTABLE_BUILDS_TABLE
 *
 * If any are unset, every export becomes a no-op that returns null. Lets
 * audit/build runs continue locally without Airtable when offline or in
 * unit tests.
 */

const BASE        = 'https://api.airtable.com/v0';
const SOURCE_MAP  = {
  // Canonical source → existing Submission Method options in Airtable
  'self-serve': 'Customer Submission',
  'manual':     'Manual Entry',
  'biz-dev':    'Manual Entry',
  'system':     'System Trigger',
};

function config() {
  return {
    apiKey:    process.env.AIRTABLE_API_KEY,
    baseId:    process.env.AIRTABLE_BASE_ID,
    accounts:  process.env.AIRTABLE_ACCOUNTS_TABLE,
    audits:    process.env.AIRTABLE_AUDITS_TABLE,
    builds:    process.env.AIRTABLE_BUILDS_TABLE,
  };
}

function enabled() {
  const c = config();
  return !!(c.apiKey && c.baseId && c.accounts && c.audits && c.builds);
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

export async function upsertAccount(args = {}) {
  if (!enabled()) return null;
  const { slug } = args;
  if (!slug) throw new Error('upsertAccount: slug is required');

  const c = config();
  const filter = encodeURIComponent(`{Slug}="${slug.replace(/"/g, '\\"')}"`);
  const search = await airReq('GET', c.accounts, `?filterByFormula=${filter}&maxRecords=1`);
  const existing = search.records?.[0];

  const fields = buildAccountFields(args);
  if (existing) {
    const updated = await airReq('PATCH', c.accounts, `/${existing.id}`, { fields });
    return updated.id;
  }
  fields.Slug = slug;
  const created = await airReq('POST', c.accounts, { fields });
  return created.id;
}

function buildAccountFields({
  practiceUrl, practiceName, businessEmail, contactEmail, contactName, phone, city, state, source, lifecycleStage,
}) {
  const f = {};
  if (practiceUrl)    f['Practice URL']    = practiceUrl;
  if (practiceName)   f['Practice Name']   = practiceName;
  if (businessEmail)  f['Business Email']  = businessEmail;
  if (contactEmail)   f['Contact Email']   = contactEmail;
  if (contactName)    f['Contact Name']    = contactName;
  if (phone)          f['Phone']           = phone;
  if (city)           f['City']            = city;
  if (state)          f['State']           = state;
  if (source)         f['Source']          = source;
  if (lifecycleStage) f['Lifecycle Stage'] = lifecycleStage;
  return f;
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------

/**
 * Create an Audit row linked to an Account. Sets Slug = account slug so
 * downstream builds can look it up (Source Audit).
 *
 * @returns {Promise<string|null>} Audit record id
 */
export async function createAudit(args = {}) {
  if (!enabled()) return null;
  const { accountId, slug, status } = args;
  if (!accountId) throw new Error('createAudit: accountId is required');
  if (!slug)      throw new Error('createAudit: slug is required');
  if (!status)    throw new Error('createAudit: status is required');

  const c = config();
  const fields = buildAuditFields(args, accountId);
  fields['Slug'] = slug;
  fields['Date Added'] = new Date().toISOString();
  const created = await airReq('POST', c.audits, { fields });
  return created.id;
}

export async function updateAudit(auditId, args = {}) {
  if (!enabled()) return null;
  if (!auditId) throw new Error('updateAudit: auditId is required');
  const c = config();
  const fields = buildAuditFields(args, null);
  delete fields.Account;  // never overwrite link on update
  const updated = await airReq('PATCH', c.audits, `/${auditId}`, { fields });
  return updated.id;
}

/**
 * Find the most recent Audit row for an account slug. Used by the build
 * pipeline to set Source Audit when publishing.
 *
 * @returns {Promise<string|null>}  audit record id, or null if none found
 */
export async function findLatestAuditBySlug(slug) {
  if (!enabled()) return null;
  if (!slug) return null;
  const c = config();
  const filter = encodeURIComponent(`{Slug}="${slug.replace(/"/g, '\\"')}"`);
  const search = await airReq(
    'GET',
    c.audits,
    `?filterByFormula=${filter}&sort[0][field]=Date Added&sort[0][direction]=desc&maxRecords=1`,
  );
  return search.records?.[0]?.id || null;
}

function buildAuditFields(args, accountId) {
  const {
    status, websiteUrl, source, contactEmail,
    totalChecks, passed, critical, warnings,
    mobileScore, desktopScore,
    gbpReviews, gbpRating,
    auditReportUrl, gcsRunFolder,
    errorDetail,
  } = args;
  const f = {};
  if (accountId)        f['Account']           = [accountId];
  if (status)           f['Status']            = status;
  if (websiteUrl)       f['Website URL']       = websiteUrl;
  if (source)           f['Submission Method'] = SOURCE_MAP[source] || source;
  if (contactEmail)     f['Contact Email']     = contactEmail;
  if (status === 'Audited' || status === 'Failed') {
    f['Completed At'] = new Date().toISOString();
  }
  if (totalChecks  != null) f['Total Checks']      = totalChecks;
  if (passed       != null) f['Passed']            = passed;
  if (critical     != null) f['Critical']          = critical;
  if (warnings     != null) f['Warnings']          = warnings;
  if (mobileScore  != null) f['Mobile Score']      = mobileScore;
  if (desktopScore != null) f['Desktop Score']     = desktopScore;
  if (gbpReviews   != null) f['GBP Reviews']       = gbpReviews;
  if (gbpRating    != null) f['GBP Rating']        = gbpRating;
  if (auditReportUrl)       f['Audit Report URL']  = auditReportUrl;
  if (gcsRunFolder)         f['GCS Run Folder']    = gcsRunFolder;
  if (errorDetail)          f['Error Detail']      = errorDetail;
  return f;
}

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

/**
 * Create a Build row, linked to an Account and (optionally) to a Source
 * Audit. The publish flow calls findLatestAuditBySlug() first to get the
 * source audit, then passes the id here as sourceAuditId.
 *
 * @returns {Promise<string|null>}  build record id
 */
export async function createBuild(args = {}) {
  if (!enabled()) return null;
  const { accountId, buildSlug, status } = args;
  if (!accountId) throw new Error('createBuild: accountId is required');
  if (!buildSlug) throw new Error('createBuild: buildSlug is required');
  if (!status)    throw new Error('createBuild: status is required');

  const c = config();
  const fields = buildBuildFields(args, accountId);
  fields['Build Slug'] = buildSlug;
  fields['Date Added'] = new Date().toISOString();
  const created = await airReq('POST', c.builds, { fields });
  return created.id;
}

export async function updateBuild(buildId, args = {}) {
  if (!enabled()) return null;
  if (!buildId) throw new Error('updateBuild: buildId is required');
  const c = config();
  const fields = buildBuildFields(args, null);
  delete fields.Account;
  delete fields['Source Audit'];
  const updated = await airReq('PATCH', c.builds, `/${buildId}`, { fields });
  return updated.id;
}

function buildBuildFields(args, accountId) {
  const {
    sourceAuditId, status, websiteUrl,
    previewUrl, pitchUrl, githubFolderUrl, gcsRunFolder,
    mobileScore, desktopScore,
    fixedCount, stillIssueCount, regressedCount,
    rescannedAt, costEst, errorDetail,
    requestNotes, contactName, contactEmail, contactPhone, contactRole,
  } = args;
  const f = {};
  if (accountId)     f['Account']      = [accountId];
  if (sourceAuditId) f['Source Audit'] = [sourceAuditId];
  if (status)        f['Status']       = status;
  if (websiteUrl)    f['Website URL']  = websiteUrl;
  if (requestNotes)  f['Request Notes'] = requestNotes;
  if (contactName)   f['Contact Name']  = contactName;
  if (contactEmail)  f['Contact Email'] = contactEmail;
  if (contactPhone)  f['Contact Phone'] = contactPhone;
  if (contactRole)   f['Contact Role']  = contactRole;
  if (status === 'Pitched' || status === 'Failed') {
    f['Completed At'] = new Date().toISOString();
  }
  if (previewUrl)       f['Preview URL']       = previewUrl;
  if (pitchUrl)         f['Pitch URL']         = pitchUrl;
  if (githubFolderUrl)  f['GitHub Folder URL'] = githubFolderUrl;
  if (gcsRunFolder)     f['GCS Run Folder']    = gcsRunFolder;
  if (mobileScore  != null) f['Mobile Score']       = mobileScore;
  if (desktopScore != null) f['Desktop Score']      = desktopScore;
  if (fixedCount       != null) f['Fixed Count']         = fixedCount;
  if (stillIssueCount  != null) f['Still Issue Count']   = stillIssueCount;
  if (regressedCount   != null) f['Regressed Count']     = regressedCount;
  if (rescannedAt)          f['Rescanned At'] = rescannedAt;
  if (costEst    != null)   f['Cost Est ($)'] = costEst;
  if (errorDetail)          f['Error Detail'] = errorDetail;
  return f;
}

// ---------------------------------------------------------------------------
// Convenience entry point
// ---------------------------------------------------------------------------

/**
 * Upsert account + create initial Running audit row. Called at the START
 * of audit-site.js so even early failures leave a tracked row.
 *
 * @returns {{ accountId: string|null, auditId: string|null }}
 */
export async function startAudit({ slug, practiceUrl, contactEmail, source }) {
  if (!enabled()) return { accountId: null, auditId: null };
  const accountId = await upsertAccount({
    slug, practiceUrl, contactEmail, source,
    lifecycleStage: 'Prospect',
  });
  const auditId = await createAudit({
    accountId,
    slug,
    status:       'Auditing',
    websiteUrl:   practiceUrl,
    source,
    contactEmail,
  });
  return { accountId, auditId };
}
