/**
 * Publish — deploys a built client site and generates the pitch page.
 *
 * Steps (in order):
 *   1. Generate pitch.html from _pipeline/ artifacts
 *   2. Copy pitch.html to groundwork-dental/public/pitch/<slug>/index.html
 *   3. Git commit + push monorepo (groundwork-builder) — triggers CF Pages deploy
 *   4. Git commit + push groundwork-dental — pitch page goes live
 *   5. Create Cloudflare Pages project (if not exists) + add subdomain
 *   6. Write Airtable row (client tracker)
 *
 * Usage:
 *   import { publish } from './publish.js';
 *   await publish({ outputDir, slug, practiceUrl, previewUrl });
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN     — CF API token with Pages:Edit permission
 *   CLOUDFLARE_ACCOUNT_ID    — CF account ID
 *   GROUNDWORK_DENTAL_PATH   — absolute path to groundwork-dental repo (optional, defaults below)
 *   AIRTABLE_API_KEY            — Airtable personal access token
 *   AIRTABLE_BASE_ID            — Airtable base ID
 *   AIRTABLE_ACCOUNTS_TABLE     — Accounts table name
 *   AIRTABLE_AUDITS_TABLE       — Audits table name
 *   AIRTABLE_BUILDS_TABLE       — Builds table name
 *   GROUNDWORK_SUBDOMAIN        — base subdomain (default: groundworkdental.com)
 *   GITHUB_REPO_OWNER        — GitHub repo owner (default: gwgunther)
 *   GITHUB_REPO_NAME         — GitHub repo name (default: groundwork-builder)
 */

import { execSync }                        from 'node:child_process';
import { copyFile, mkdir, readFile }       from 'node:fs/promises';
import { existsSync }                      from 'node:fs';
import { resolve, dirname, basename }      from 'node:path';
import { generatePitchPage }              from './pitch-generator.js';
import { upsertAccount, createBuild, findLatestAuditBySlug } from './airtable.js';

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function publish(opts = {}) {
  const {
    outputDir,                                    // absolute path to clients/<slug>/
    slug,                                         // chang-orthodontics
    practiceUrl  = null,                          // changorthodontics.com
    previewUrl   = null,                          // changorthodontics.groundworkdental.com (auto-derived if null)
    ctaUrl       = null,                          // override CTA link on pitch page
    gcsPrefix    = null,                          // e.g. 'chang-orthodontics/runs/2026-...'
  } = opts;

  if (!outputDir) throw new Error('publish: outputDir is required');
  if (!slug)      throw new Error('publish: slug is required');

  const pipelineDir = resolve(outputDir, '_pipeline');

  const baseDomain  = process.env.GROUNDWORK_SUBDOMAIN || 'groundworkdental.com';
  const resolvedPreviewUrl = previewUrl || `${slug}.${baseDomain}`;
  const pitchUrl    = `${baseDomain}/pitch/${slug}`;

  console.log('');
  console.log('[Publish] Starting publish pipeline...');
  console.log(`  slug:       ${slug}`);
  console.log(`  preview:    ${resolvedPreviewUrl}`);
  console.log(`  pitch:      ${pitchUrl}`);

  const results = {
    pitchHtml:      null,
    pitchLive:      null,
    cfProject:      null,
    cfDomain:       null,
    airtable:       null,
    gitBuilder:     null,
    gitDental:      null,
  };

  // 1a. Run PageSpeed on the deployed preview URL to get real after-scores
  let afterScores = null;
  try {
    console.log(`  Running PageSpeed on rebuilt site (${resolvedPreviewUrl})...`);
    const { runPageSpeed, extractScoreReasons } = await import('./pagespeed.js');
    const ps = await runPageSpeed(`https://${resolvedPreviewUrl}`);
    afterScores = {
      mobile:  ps.mobile?.performance  ?? null,
      desktop: ps.desktop?.performance ?? null,
      seo:     ps.mobile?.seo          ?? null,
      // Top reasons score isn't 100 (honest tradeoffs)
      reasons: extractScoreReasons(ps.mobile, 3),
    };
    console.log(`  ✓ After scores — Mobile: ${afterScores.mobile} Desktop: ${afterScores.desktop}`);
    // Write to pipeline so pitch can read it later
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      resolve(pipelineDir, '03-pagespeed-after.json'),
      JSON.stringify({ step: '03-pagespeed-after', timestamp: new Date().toISOString(), output: afterScores }, null, 2)
    );
  } catch (err) {
    console.warn(`  ⚠ After PageSpeed skipped: ${err.message}`);
  }

  // 1a.5 Run the full re-scan against the deployed preview. Re-runs every
  // scanner (tech, trust, hosting, GBP, conversion) and diffs against the
  // original audit's findings.json. Produces audit-report-after.html with
  // the before/after pairs, plus the Fixed/Still/Regressed counts we'll
  // push to the Build row in step 6.
  //
  // Needs the audit's data dir — we derive it from the slug since publish
  // is always called with the same slug audit-site.js uses for outputs.
  let rescanResult = null;
  try {
    console.log(`  Running rescan vs. original audit...`);
    const { runRescan } = await import('./rescan-core.js');
    const auditDir = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '_audits', slug);
    rescanResult = await runRescan({
      auditDir,
      previewUrl:  `https://${resolvedPreviewUrl}`,
    });
    if (rescanResult) {
      const c = rescanResult.summary.counts;
      console.log(`  ✓ Rescan: ${c.fixed} fixed · ${c['still-issue']} still issue · ${c.regressed} regressed`);
    } else {
      console.log(`  ⚠ Rescan skipped — original audit findings not found at expected path`);
    }
  } catch (err) {
    console.warn(`  ⚠ Rescan failed (non-fatal): ${err.message}`);
  }

  // 1a.6 Re-host the now-updated audit report folder. The rescan produced
  // audit-report-after.html → groundwork-dental/public/audits/<slug>/before-after.html.
  // Same path that hosted the original audit report; we just re-push.
  let hostedReports = { indexUrl: null, beforeAfterUrl: null, skippedReason: null };
  try {
    const { hostAuditReport } = await import('./host-reports.js');
    const auditDir = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '_audits', slug);
    hostedReports = await hostAuditReport({ auditDir, slug });
    if (hostedReports.pushed && hostedReports.beforeAfterUrl) {
      console.log(`  ✓ Before/after report: ${hostedReports.beforeAfterUrl}`);
    }
  } catch (err) {
    console.warn(`  ⚠ Host before/after failed (non-fatal): ${err.message}`);
  }

  // 1b. Generate pitch.html (with real after-scores if available)
  try {
    results.pitchHtml = await generatePitchPage(pipelineDir, {
      previewUrl: resolvedPreviewUrl,
      slug,
      pitchUrl,
      ctaUrl,
      afterScores,
    });
    console.log(`  ✓ Pitch page generated: ${results.pitchHtml}`);
  } catch (err) {
    console.warn(`  ⚠ Pitch generation failed: ${err.message}`);
  }

  // 2. Copy pitch.html to groundwork-dental repo
  try {
    const dentalPath = process.env.GROUNDWORK_DENTAL_PATH
      || resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', 'groundwork-dental');

    if (existsSync(dentalPath)) {
      const destDir = resolve(dentalPath, 'public', 'pitch', slug);
      await mkdir(destDir, { recursive: true });
      const destFile = resolve(destDir, 'index.html');
      await copyFile(results.pitchHtml, destFile);
      results.pitchLive = destFile;
      console.log(`  ✓ Pitch copied to groundwork-dental: public/pitch/${slug}/index.html`);
    } else {
      console.warn(`  ⚠ groundwork-dental not found at ${dentalPath} — skipping pitch copy`);
    }
  } catch (err) {
    console.warn(`  ⚠ Pitch copy failed: ${err.message}`);
  }

  // 3. Git push monorepo (groundwork-builder)
  try {
    const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
    gitCommitPush(repoRoot, `feat: add ${slug} client site`, [
      `clients/${slug}`,
    ]);
    results.gitBuilder = 'pushed';
    console.log(`  ✓ Monorepo pushed → CF Pages will auto-deploy ${slug}`);
  } catch (err) {
    console.warn(`  ⚠ Monorepo push failed: ${err.message}`);
  }

  // 4. Git push groundwork-dental (pitch page)
  try {
    const dentalPath = process.env.GROUNDWORK_DENTAL_PATH
      || resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', 'groundwork-dental');
    if (results.pitchLive && existsSync(dentalPath)) {
      gitCommitPush(dentalPath, `feat: add pitch page for ${slug}`, [
        `public/pitch/${slug}`,
      ]);
      results.gitDental = 'pushed';
      console.log(`  ✓ groundwork-dental pushed → pitch page will go live`);
    }
  } catch (err) {
    console.warn(`  ⚠ groundwork-dental push failed: ${err.message}`);
  }

  // 5. Cloudflare Pages — create project + add custom domain
  try {
    const cfResult = await ensureCfPagesProject({ slug, baseDomain });
    results.cfProject = cfResult.project;
    results.cfDomain  = cfResult.domain;
    console.log(`  ✓ CF Pages: ${cfResult.created ? 'created' : 'already exists'} — ${resolvedPreviewUrl}`);
  } catch (err) {
    console.warn(`  ⚠ Cloudflare setup failed: ${err.message}`);
  }

  // 6. Airtable — record this build as a new Build row linked to its
  // Source Audit (looked up by slug) and the Account.
  try {
    const tracked = await recordBuildRun({
      slug,
      practiceUrl,
      resolvedPreviewUrl,
      pitchUrl,
      pipelineDir,
      gcsPrefix,
      afterScores,
      rescanCounts: rescanResult?.summary?.counts || null,
    });
    results.airtable = tracked.buildId;
    if (tracked.buildId) {
      const linked = tracked.sourceAuditId ? ` · Source Audit ${tracked.sourceAuditId}` : ' · no prior Audit found';
      console.log(`  ✓ Airtable: Build ${tracked.buildId} created (Account ${tracked.accountId}, Lifecycle: Pitched${linked})`);
    } else {
      console.log(`  ⚠ Airtable disabled (env vars missing) — skipped tracking`);
    }
  } catch (err) {
    console.warn(`  ⚠ Airtable write failed: ${err.message}`);
  }

  console.log('');
  console.log('[Publish] Done.');
  console.log(`  Preview:  https://${resolvedPreviewUrl}`);
  console.log(`  Pitch:    https://${pitchUrl}`);
  console.log('');

  return results;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitCommitPush(repoPath, message, paths = []) {
  const addTargets = paths.length > 0 ? paths.join(' ') : '.';
  execSync(`git -C "${repoPath}" add ${addTargets}`, { stdio: 'pipe' });

  // Check if there's anything to commit
  const status = execSync(`git -C "${repoPath}" status --porcelain`, { stdio: 'pipe' }).toString().trim();
  if (!status) {
    console.log(`    (nothing new to commit in ${basename(repoPath)})`);
    return;
  }

  execSync(`git -C "${repoPath}" commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  execSync(`git -C "${repoPath}" push`, { stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Cloudflare Pages
// ---------------------------------------------------------------------------

async function ensureCfPagesProject({ slug, baseDomain }) {
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'gwgunther';
  const repoName  = process.env.GITHUB_REPO_NAME  || 'groundwork-builder';

  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  };
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;

  // Check if project already exists
  const listRes  = await fetch(`${base}/${slug}`, { headers });
  const existing = await listRes.json();
  let created = false;

  if (!existing.success) {
    // Create the project
    const createRes = await fetch(base, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        name:              slug,
        production_branch: 'main',
        source: {
          type:   'github',
          config: {
            owner:             repoOwner,
            repo_name:         repoName,
            production_branch: 'main',
            root_dir:          `clients/${slug}`,
          },
        },
        build_config: {
          build_command:   'npm run build',
          destination_dir: 'dist',
          root_dir:        `clients/${slug}`,
        },
      }),
    });
    const createData = await createRes.json();
    if (!createData.success) {
      throw new Error(`CF create failed: ${JSON.stringify(createData.errors)}`);
    }
    created = true;
  }

  // Add custom subdomain (idempotent — CF ignores if already exists)
  const subdomain = `${slug}.${baseDomain}`;
  const domainRes = await fetch(`${base}/${slug}/domains`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ name: subdomain }),
  });
  const domainData = await domainRes.json();
  // 409 = already exists, which is fine
  if (!domainData.success && domainData.errors?.[0]?.code !== 8000018) {
    console.warn(`    CF domain warning: ${JSON.stringify(domainData.errors)}`);
  }

  return { project: slug, domain: subdomain, created };
}

// ---------------------------------------------------------------------------
// Airtable — two-table model (Accounts + Runs)
// ---------------------------------------------------------------------------

/**
 * Record a build as a new Run row linked to the Account.
 *
 * Steps:
 *   1. Upsert the Account by slug. If audit ran first (PR #24), this updates
 *      the existing row with anything new + flips Lifecycle Stage to 'Pitched'.
 *      If audit was skipped, this creates the Account row from scratch.
 *   2. Look up the latest Audit row for this slug to set Source Audit.
 *   3. Create a new Build row, linked to Account + (optionally) Source Audit.
 *
 * Returns { accountId, buildId, sourceAuditId } — any may be null if
 * Airtable is disabled or no prior audit exists.
 */
async function recordBuildRun({ slug, practiceUrl, resolvedPreviewUrl, pitchUrl, pipelineDir, gcsPrefix, afterScores, rescanCounts }) {
  // Load merged.json for contact details to refresh on the Account
  let merged = {};
  try {
    const raw = JSON.parse(await readFile(resolve(pipelineDir, '06-merge.json'), 'utf-8'));
    merged = raw.output || raw;
  } catch { /* optional */ }

  // Cost ledger from this build's AI calls (best-effort)
  let costEst = null;
  try {
    const { getCostLedger } = await import('./ai-call.js');
    const ledger = getCostLedger();
    if (ledger.callCount > 0) costEst = Number(ledger.totalCost.toFixed(2));
  } catch { /* non-fatal */ }

  // GitHub folder URL — derive from env so it's a clickable link in Airtable
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'gwgunther';
  const repoName  = process.env.GITHUB_REPO_NAME  || 'groundwork-builder';
  const githubFolderUrl = `https://github.com/${repoOwner}/${repoName}/tree/main/clients/${slug}`;

  // GCS folder — convert prefix to a clickable Cloud Console URL
  const gcsBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'builder-data';
  const gcsRunFolder = gcsPrefix
    ? `https://console.cloud.google.com/storage/browser/${gcsBucket}/${gcsPrefix}`
    : null;

  // 1. Upsert Account — flip lifecycle to Pitched
  const accountId = await upsertAccount({
    slug,
    practiceUrl,
    practiceName:   merged.practice?.name  || null,
    businessEmail:  merged.practice?.email || null,
    phone:          merged.practice?.phone || null,
    city:           merged.address?.city   || null,
    state:          merged.address?.state  || null,
    lifecycleStage: 'Pitched',
  });

  if (!accountId) {
    return { accountId: null, buildId: null, sourceAuditId: null };
  }

  // 2. Find the most recent Audit for this slug — sets Source Audit on
  // the new Build. May be null if someone built without auditing first.
  const sourceAuditId = await findLatestAuditBySlug(slug);

  // 3. Create the Build row
  const buildId = await createBuild({
    accountId,
    sourceAuditId,
    buildSlug:       slug,
    status:          'Pitched',
    websiteUrl:      practiceUrl,
    previewUrl:      `https://${resolvedPreviewUrl}`,
    pitchUrl:        `https://${pitchUrl}`,
    githubFolderUrl,
    gcsRunFolder,
    // After-build PageSpeed scores from the live preview
    mobileScore:     afterScores?.mobile  ?? null,
    desktopScore:    afterScores?.desktop ?? null,
    // Rescan diff vs. the Source Audit
    fixedCount:      rescanCounts?.fixed ?? null,
    stillIssueCount: rescanCounts?.['still-issue'] ?? null,
    regressedCount:  rescanCounts?.regressed ?? null,
    rescannedAt:     (afterScores || rescanCounts) ? new Date().toISOString() : null,
    costEst,
  });

  return { accountId, buildId, sourceAuditId };
}
