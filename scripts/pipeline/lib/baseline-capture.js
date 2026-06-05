/**
 * Handoff baseline snapshot — founding-client measurement for case studies.
 * Called when publish ship gates pass.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { upsertAccount } from './airtable.js';

const REAUDIT_DAYS = 75; // ~60–90 day window

/**
 * @param {object} args
 * @param {string} args.slug
 * @param {string} args.practiceUrl
 * @param {string} args.pipelineDir — clients/<slug>/_pipeline
 * @param {string} args.repoRoot
 * @param {object|null} args.afterScores — post-build PageSpeed on preview
 */
export async function captureHandoffBaseline(args) {
  const { slug, practiceUrl, pipelineDir, repoRoot, afterScores } = args;
  const auditDataDir = resolve(repoRoot, '_audits', slug, '_data');
  const launchDate = new Date();
  const reauditDue = new Date(launchDate);
  reauditDue.setDate(reauditDue.getDate() + REAUDIT_DAYS);

  let oldPagespeed = null;
  const psPath = join(auditDataDir, 'pagespeed.json');
  if (existsSync(psPath)) {
    try {
      oldPagespeed = JSON.parse(await readFile(psPath, 'utf-8'));
    } catch { /* skip */ }
  }

  const baseline = {
    captured_at: launchDate.toISOString(),
    practice_url: practiceUrl || null,
    old_site: {
      url: practiceUrl || null,
      mobile_performance: oldPagespeed?.mobile?.performance ?? null,
      desktop_performance: oldPagespeed?.desktop?.performance ?? null,
      mobile_accessibility: oldPagespeed?.mobile?.accessibility ?? null,
      mobile_seo: oldPagespeed?.mobile?.seo ?? null,
    },
    new_site: {
      mobile_performance: afterScores?.mobile ?? null,
      desktop_performance: afterScores?.desktop ?? null,
      mobile_accessibility: afterScores?.accessibility ?? null,
      mobile_seo: afterScores?.seo ?? null,
    },
    rank_terms: [],
    rank_terms_note: 'Add 3–5 local search terms manually until GRADER keyword module ships.',
    calls_forms_baseline: null,
    calls_forms_note: 'Optional — record monthly form fills / calls if client shares.',
    launch_date: launchDate.toISOString().slice(0, 10),
    reaudit_due: reauditDue.toISOString().slice(0, 10),
  };

  await mkdir(pipelineDir, { recursive: true });
  await writeFile(
    resolve(pipelineDir, 'baseline.json'),
    JSON.stringify(baseline, null, 2),
    'utf-8',
  );

  const rankPlaceholder = baseline.rank_terms.length
    ? baseline.rank_terms.join(', ')
    : '(add 3–5 local terms in Airtable)';

  await upsertAccount({
    slug,
    practiceUrl,
    baselineMobilePagespeed: baseline.old_site.mobile_performance,
    baselineRanks: rankPlaceholder,
    launchDate: baseline.launch_date,
    reauditDue: baseline.reaudit_due,
  });

  return baseline;
}
