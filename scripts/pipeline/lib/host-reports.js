/**
 * Host the audit + before/after reports on groundworkdental.com.
 *
 * Copies the rendered HTML files (and screenshot) into the
 * groundwork-dental repo's public/audits/<slug>/ folder, commits and
 * pushes — Cloudflare Pages auto-deploys.
 *
 * Layout under public/audits/<slug>/:
 *   index.html          — sales audit one-pager (lead-capture CTA). The page
 *                         a prospect lands on from an email link.
 *   audit-report.html   — the full deep-dive tabbed report. Filename kept
 *                         as-is so the summary's "See all N issues →"
 *                         relative link resolves without rewriting templates.
 *   before-after.html   — the diff report (present only after a build)
 *   homepage.png        — homepage screenshot (if captured)
 *
 * Public URLs:
 *   https://groundworkdental.com/audits/<slug>/                — summary
 *   https://groundworkdental.com/audits/<slug>/audit-report    — full report
 *   https://groundworkdental.com/audits/<slug>/before-after    — diff (post-build)
 *
 * Same pattern publish.js already uses for pitch pages.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIPELINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dentalRepoPath() {
  return process.env.GROUNDWORK_DENTAL_PATH
    || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'groundwork-dental');
}

function baseDomain() {
  return process.env.GROUNDWORK_SUBDOMAIN || 'groundworkdental.com';
}

/**
 * @typedef {object} HostedReportPaths
 * @property {string|null} indexUrl         — public URL for the customer-facing summary (audits/<slug>/)
 * @property {string|null} fullReportUrl    — public URL for the deep-dive tabbed report
 * @property {string|null} beforeAfterUrl   — public URL for the before/after report
 * @property {boolean}     pushed           — was groundwork-dental git-pushed?
 * @property {string|null} skippedReason    — null if hosted, else why not
 */

/**
 * Copy audit-report.html + audit-summary.html (+ homepage.png if present)
 * into groundwork-dental and git-push. Returns the public URLs.
 *
 * Called after audit-site.js finishes successfully.
 *
 * @param {object} args
 * @param {string} args.auditDir   — local _audits/<slug>/ path
 * @param {string} args.slug       — canonical slug
 * @returns {Promise<HostedReportPaths>}
 */
export async function hostAuditReport({ auditDir, slug }) {
  const dentalPath = dentalRepoPath();
  const out = {
    indexUrl:       null,
    fullReportUrl:  null,
    beforeAfterUrl: null,
    pushed:         false,
    skippedReason:  null,
  };

  if (!existsSync(dentalPath)) {
    out.skippedReason = `groundwork-dental not found at ${dentalPath}`;
    return out;
  }
  if (!auditDir || !existsSync(auditDir)) {
    out.skippedReason = `audit dir not found at ${auditDir}`;
    return out;
  }

  const destDir = resolve(dentalPath, 'public', 'audits', slug);
  await mkdir(destDir, { recursive: true });

  const copies = [
    // Customer-facing summary lands at the index URL — that's the page a
    // prospect opens from an email. The dense tabbed full-report stays at
    // its own URL, linked from the summary's "See all N issues →" CTA.
    { from: join(auditDir, 'audit-summary.html'),      to: join(destDir, 'index.html') },
    { from: join(auditDir, 'audit-report.html'),       to: join(destDir, 'audit-report.html') },
    { from: join(auditDir, 'audit-report-after.html'), to: join(destDir, 'before-after.html') },
    { from: join(auditDir, 'homepage.png'),            to: join(destDir, 'homepage.png') },
  ];
  for (const { from, to } of copies) {
    if (existsSync(from)) await copyFile(from, to);
  }

  await copyPreviewRequestApi(dentalPath);

  const domain = baseDomain();
  out.indexUrl       = `https://${domain}/audits/${slug}/`;
  out.fullReportUrl  = `https://${domain}/audits/${slug}/audit-report`;
  if (existsSync(join(destDir, 'before-after.html'))) {
    out.beforeAfterUrl = `https://${domain}/audits/${slug}/before-after`;
  }

  // Commit + push. Non-fatal on failure — local files still copied.
  try {
    gitCommitPush(dentalPath, `feat: add audit report for ${slug}`, [`public/audits/${slug}`]);
    out.pushed = true;
  } catch (err) {
    out.skippedReason = `git push failed: ${err.message}`;
  }
  return out;
}

/**
 * After a build + rescan: re-host so the before/after report is published.
 * Same as hostAuditReport but with a different commit message.
 */
export async function hostBeforeAfterReport({ auditDir, slug }) {
  const out = await hostAuditReport({ auditDir, slug });
  return out;
}

/** Deploy POST /api/audit-preview-request for audit one-pager lead capture. */
async function copyPreviewRequestApi(dentalPath) {
  const destLib = resolve(dentalPath, 'functions', 'lib');
  const destApi = resolve(dentalPath, 'functions', 'api');
  await mkdir(destLib, { recursive: true });
  await mkdir(destApi, { recursive: true });

  const libFiles = ['audit-preview-cf.js', 'audit-preview-request.js', 'airtable.js'];
  for (const name of libFiles) {
    const from = join(PIPELINE_ROOT, 'lib', name);
    if (existsSync(from)) {
      await copyFile(from, join(destLib, name));
    }
  }

  const apiFrom = join(
    PIPELINE_ROOT,
    'templates',
    'groundwork-dental',
    'functions',
    'api',
    'audit-preview-request.js',
  );
  if (existsSync(apiFrom)) {
    await copyFile(apiFrom, join(destApi, 'audit-preview-request.js'));
  }
}

function gitCommitPush(repoPath, message, paths = []) {
  const addTargets = paths.length > 0 ? paths.join(' ') : '.';
  execSync(`git -C "${repoPath}" add ${addTargets}`, { stdio: 'pipe' });
  const status = execSync(`git -C "${repoPath}" status --porcelain`, { stdio: 'pipe' }).toString().trim();
  if (!status) return;  // nothing to commit
  execSync(`git -C "${repoPath}" commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  execSync(`git -C "${repoPath}" push`, { stdio: 'pipe' });
}
