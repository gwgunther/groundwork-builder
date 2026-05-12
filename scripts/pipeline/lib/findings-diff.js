/**
 * Findings Diff — pure functions for comparing before/after scanner runs.
 *
 * The grader's pitch is "here's what was broken (before), here's what we fixed
 * (after)." The same scanners run twice — once on the existing site, once on
 * the built preview — and findings flip state by id. This module produces the
 * canonical diff artifact that powers the before/after report.
 */

import { aggregateGrowthScore } from './findings.js';

/**
 * Index a findings array by id. Last wins on collision (shouldn't happen, but
 * worth being explicit about).
 */
function indexById(findings) {
  const map = new Map();
  for (const f of findings || []) {
    if (f?.id) map.set(f.id, f);
  }
  return map;
}

/**
 * Diff two findings sets by id.
 *
 * Output shape (per finding):
 *   {
 *     id, category, title, benefit, weight, fix_action,
 *     before: { state, severity, detail, count, affectedPages },
 *     after:  { state, severity, detail, count, affectedPages } | null,
 *     transition: 'fixed' | 'still-issue' | 'regressed' | 'unchanged' | 'new' | 'removed',
 *   }
 *
 * Transitions:
 *   - 'fixed'        — before=issue,  after=fixed         (the headline win)
 *   - 'still-issue'  — before=issue,  after=issue
 *   - 'regressed'    — before=fixed,  after=issue         (worse after build — flag)
 *   - 'unchanged'    — before=fixed,  after=fixed
 *   - 'new'          — appears only in after              (new check or new issue)
 *   - 'removed'      — appears only in before             (scanner didn't run)
 */
export function diffFindings(beforeArr, afterArr) {
  const beforeIdx = indexById(beforeArr);
  const afterIdx  = indexById(afterArr);
  const allIds = new Set([...beforeIdx.keys(), ...afterIdx.keys()]);

  const diffs = [];
  for (const id of allIds) {
    const b = beforeIdx.get(id);
    const a = afterIdx.get(id);

    const carry = b || a;  // for stable metadata
    const beforeSlice = b ? snapshot(b) : null;
    const afterSlice  = a ? snapshot(a) : null;

    diffs.push({
      id,
      category:   carry.category,
      title:      carry.title,
      benefit:    carry.benefit,
      weight:     carry.weight ?? 1.0,
      fix_action: carry.fix_action ?? null,
      fixed_copy: carry.fixed_copy ?? null,
      before:     beforeSlice,
      after:      afterSlice,
      transition: classifyTransition(beforeSlice, afterSlice),
    });
  }
  return diffs;
}

function snapshot(f) {
  return {
    state:         f.state,
    severity:      f.severity,
    detail:        f.detail,
    count:         f.count ?? null,
    affectedPages: f.affectedPages ?? [],
  };
}

function classifyTransition(b, a) {
  if (b && !a) return 'removed';
  if (!b && a) return 'new';
  if (!b && !a) return 'unchanged';
  if (b.state === 'issue' && a.state === 'fixed') return 'fixed';
  if (b.state === 'issue' && a.state === 'issue') return 'still-issue';
  if (b.state === 'fixed' && a.state === 'issue') return 'regressed';
  return 'unchanged';
}

/**
 * Summary stats for the diff: how many flipped, how many remain, score delta.
 */
export function summarizeDiff(diffs) {
  const counts = {
    fixed:        0,
    'still-issue': 0,
    regressed:    0,
    unchanged:    0,
    new:          0,
    removed:      0,
  };
  for (const d of diffs) counts[d.transition] = (counts[d.transition] ?? 0) + 1;

  const beforeFindings = diffs.filter(d => d.before).map(d => ({
    state: d.before.state, weight: d.weight,
  }));
  const afterFindings = diffs.filter(d => d.after).map(d => ({
    state: d.after.state, weight: d.weight,
  }));
  const beforeScore = aggregateGrowthScore(beforeFindings);
  const afterScore  = aggregateGrowthScore(afterFindings);

  return {
    counts,
    beforeScore,
    afterScore,
    delta: (beforeScore != null && afterScore != null) ? afterScore - beforeScore : null,
  };
}
