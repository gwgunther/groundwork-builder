#!/usr/bin/env node
/**
 * Groundwork Builder — Rescue Build (CLI)
 *
 * Re-runs the post-deploy steps for a Build that finished with null
 * after-scores. This happens when waitForDeploy() times out: the site
 * eventually goes live (CF Pages just took longer than the cap), but
 * the publish run skipped PageSpeed + rescan + audit-folder re-host
 * + Airtable update.
 *
 * Useful for:
 *   - First-build cold starts that exceed the waitForDeploy cap
 *   - Backfilling old Build rows when fixes land
 *   - Re-running diff against a now-live preview after manual intervention
 *
 * Usage:
 *   node scripts/pipeline/rescue-build.js --slug <slug> --build-id <recXXX>
 *   node scripts/pipeline/rescue-build.js --slug lbpds --build-id reczjqfQ8n7ZS01sh
 *
 * Reads:
 *   _audits/<slug>/_data/findings.json   (the original audit findings)
 *
 * Writes:
 *   _audits/<slug>/audit-report-after.html  (rescan output)
 *   _audits/<slug>/_data/findings-after.json
 *   _audits/<slug>/_data/findings-diff.json
 *   groundwork-dental/public/audits/<slug>/before-after.html  (hosted)
 *   Airtable Build row (Mobile/Desktop scores, diff counts, Rescanned At)
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'),
  override: true,
});

import { runPageSpeed, extractScoreReasons } from './lib/pagespeed.js';
import { runRescan } from './lib/rescan-core.js';
import { hostAuditReport } from './lib/host-reports.js';
import { updateBuild } from './lib/airtable.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { slug: null, buildId: null, previewUrl: null };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--slug':         opts.slug       = args[++i]; break;
      case '--build-id':     opts.buildId    = args[++i]; break;
      case '--preview-url':  opts.previewUrl = args[++i]; break;
      case '--help':
        console.log('Usage: rescue-build.js --slug <slug> --build-id <recXXX> [--preview-url <url>]');
        process.exit(0);
    }
  }
  if (!opts.slug || !opts.buildId) {
    console.error('Error: --slug and --build-id are required.');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const baseDomain = process.env.GROUNDWORK_SUBDOMAIN || 'groundworkdental.com';
  const previewUrl = opts.previewUrl || `https://${opts.slug}.${baseDomain}`;
  const repoRoot   = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const auditDir   = resolve(repoRoot, '_audits', opts.slug);

  console.log('');
  console.log('=== Groundwork Builder — Rescue Build ===');
  console.log(`  slug:      ${opts.slug}`);
  console.log(`  build:     ${opts.buildId}`);
  console.log(`  preview:   ${previewUrl}`);
  console.log(`  auditDir:  ${auditDir}`);
  console.log('');

  // 1. PageSpeed on the now-live preview
  let afterScores = null;
  try {
    console.log('[1/4] Running PageSpeed...');
    const ps = await runPageSpeed(previewUrl);
    afterScores = {
      mobile:  ps.mobile?.performance  ?? null,
      desktop: ps.desktop?.performance ?? null,
      seo:     ps.mobile?.seo          ?? null,
      reasons: extractScoreReasons(ps.mobile, 3),
    };
    console.log(`      ✓ Mobile ${afterScores.mobile}  Desktop ${afterScores.desktop}`);
  } catch (err) {
    console.warn(`      ⚠ PageSpeed failed: ${err.message}`);
  }

  // 2. Rescan vs the original audit
  let rescanCounts = null;
  try {
    console.log('[2/4] Running rescan...');
    const result = await runRescan({ auditDir, previewUrl });
    if (result) {
      rescanCounts = result.summary.counts;
      console.log(`      ✓ ${rescanCounts.fixed} fixed · ${rescanCounts['still-issue']} still issue · ${rescanCounts.regressed} regressed`);
    } else {
      console.warn(`      ⚠ Rescan returned null — findings.json missing?`);
    }
  } catch (err) {
    console.warn(`      ⚠ Rescan failed: ${err.message}`);
  }

  // 3. Re-host audit folder so before-after.html goes live
  try {
    console.log('[3/4] Hosting updated audit folder...');
    const hosted = await hostAuditReport({ auditDir, slug: opts.slug });
    if (hosted.beforeAfterUrl) {
      console.log(`      ✓ Before/after: ${hosted.beforeAfterUrl}`);
    } else if (hosted.skippedReason) {
      console.warn(`      ⚠ Skipped: ${hosted.skippedReason}`);
    }
  } catch (err) {
    console.warn(`      ⚠ Host failed: ${err.message}`);
  }

  // 4. Patch the Airtable Build row
  try {
    console.log('[4/4] Updating Airtable Build row...');
    const updated = await updateBuild(opts.buildId, {
      mobileScore:     afterScores?.mobile  ?? null,
      desktopScore:    afterScores?.desktop ?? null,
      fixedCount:      rescanCounts?.fixed ?? null,
      stillIssueCount: rescanCounts?.['still-issue'] ?? null,
      regressedCount:  rescanCounts?.regressed ?? null,
      rescannedAt:     new Date().toISOString(),
    });
    if (updated) {
      console.log(`      ✓ Build ${opts.buildId} patched`);
    } else {
      console.warn(`      ⚠ updateBuild returned null — Airtable disabled?`);
    }
  } catch (err) {
    console.warn(`      ⚠ Airtable update failed: ${err.message}`);
  }

  console.log('');
  console.log('=== Done ===');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
