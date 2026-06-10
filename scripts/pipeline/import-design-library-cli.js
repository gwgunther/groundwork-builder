#!/usr/bin/env node
/**
 * Import curated inspo + anti design fingerprints into _memory/library/.
 *
 * Usage:
 *   node scripts/pipeline/import-design-library-cli.js
 *   node scripts/pipeline/import-design-library-cli.js --dry-run
 *   node scripts/pipeline/import-design-library-cli.js --force
 *   node scripts/pipeline/import-design-library-cli.js --only inspo-linear,anti-purple-gradient
 *   node scripts/pipeline/import-design-library-cli.js --validate
 */
import { validateCatalog } from './lib/design-library-catalog.js';
import { importDesignLibrary } from './lib/import-design-library.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { dryRun: false, force: false, only: null, validate: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else if (a === '--validate') o.validate = true;
    else if (a === '--only') o.only = args[++i]?.split(',').map(s => s.trim()).filter(Boolean);
  }
  return o;
}

function printPlan(plan) {
  if (plan.write.length) {
    console.log('\nWould write:');
    for (const e of plan.write) console.log(`  + ${e.slug} (${e.tag})`);
  }
  if (plan.skip.length) {
    console.log('\nSkipped:');
    for (const s of plan.skip) console.log(`  ~ ${s.slug}: ${s.reason}`);
  }
  if (plan.blocked.length) {
    console.log('\nBlocked:');
    for (const b of plan.blocked) console.log(`  ! ${b.slug}: ${b.reason}`);
  }
}

(async () => {
  const opts = parseArgs();

  if (opts.validate) {
    const { valid, errors } = await validateCatalog();
    if (valid) {
      console.log('[design-library] catalog validation: OK');
      process.exit(0);
    }
    console.error('[design-library] catalog validation FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[design-library] import${opts.dryRun ? ' (dry-run)' : ''}${opts.force ? ' (force)' : ''}...`);
  const result = await importDesignLibrary(opts);
  printPlan(result.plan);

  if (result.dryRun) {
    console.log(`\n[design-library] dry-run complete: would write ${result.totals.wouldWrite}, skip ${result.totals.skipped}, block ${result.totals.blocked}`);
  } else {
    console.log(`\n[design-library] done: wrote ${result.totals.written}, skipped ${result.totals.skipped}, blocked ${result.totals.blocked}`);
  }
})().catch(err => {
  console.error('[design-library] failed:', err.message);
  process.exit(1);
});
