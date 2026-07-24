#!/usr/bin/env node
/**
 * Grade My Site — CLI entry for the self-serve grader.
 *
 * Usage:
 *   node scripts/pipeline/grade-site.js --url https://example-dental.com
 *   node scripts/pipeline/grade-site.js --url https://example.com --no-pagespeed
 *   node scripts/pipeline/grade-site.js --url https://example.com --out /tmp/grade.json
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });

import { gradeHomepage } from './lib/grade-homepage.js';
import { slugFromUrl } from './lib/slug.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: null, out: null, pagespeed: true, pretty: true };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url': opts.url = args[++i]; break;
      case '--out': opts.out = args[++i]; break;
      case '--no-pagespeed': opts.pagespeed = false; break;
      case '--compact': opts.pretty = false; break;
      case '--help':
        console.log(`Usage: node scripts/pipeline/grade-site.js --url <site> [--out file.json] [--no-pagespeed]`);
        process.exit(0);
        break;
      default:
        if (!opts.url && !args[i].startsWith('--')) opts.url = args[i];
        else console.warn(`Unknown flag: ${args[i]}`);
    }
  }
  if (!opts.url) {
    console.error('Error: --url is required');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  console.error(`[grade] Grading ${opts.url} (pagespeed=${opts.pagespeed})...`);
  const result = await gradeHomepage(opts.url, { pagespeed: opts.pagespeed });
  console.error(`[grade] Growth Score ${result.growthScore}/100 (${result.grade}) — ${result.summary.passed} passed / ${result.summary.issues} issues`);

  const json = JSON.stringify(result, null, opts.pretty ? 2 : 0);
  if (opts.out) {
    await mkdir(dirname(resolve(opts.out)), { recursive: true });
    await writeFile(opts.out, json);
    console.error(`[grade] Wrote ${opts.out}`);
  } else {
    console.log(json);
  }

  // Soft CRM breadcrumb when D1 is configured — non-fatal
  try {
    const { upsertAccount, startAudit, updateAudit } = await import('./lib/d1.js');
    const slug = slugFromUrl(result.url);
    if (slug) {
      await upsertAccount({
        slug,
        practiceName: result.meta?.title?.slice(0, 120) || slug,
        practiceUrl: result.url,
        source: 'self-serve',
        lifecycleStage: 'Prospect',
      });
      const started = await startAudit({ slug, practiceUrl: result.url, source: 'self-serve' });
      if (started?.auditId) {
        await updateAudit(started.auditId, {
          status: 'Audited',
          totalChecks: result.summary.total,
          passed: result.summary.passed,
          critical: result.summary.critical,
          warnings: result.summary.warnings,
          mobileScore: result.pagespeed?.mobile?.performance ?? result.growthScore,
          errorDetail: `Grade My Site: ${result.growthScore}/100 (${result.grade})`,
        });
        console.error(`[grade] D1 audit recorded for ${slug}`);
      }
    }
  } catch (err) {
    console.error(`[grade] D1 write skipped: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('[grade] FAILED:', err.message);
  process.exit(1);
});
