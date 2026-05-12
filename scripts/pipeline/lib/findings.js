/**
 * Findings helpers — schema enrichment + scoring.
 *
 * The Finding shape (extends what tech-audit.js already emits):
 *   {
 *     id, category, severity, title, detail, benefit, affectedPages, count,   // existing
 *     state:       'issue' | 'fixed' | 'not_applicable',                       // new
 *     weight:      number,                                                    // new
 *     fixed_copy:  string | null,                                             // new
 *     fix_action:  { kind, target } | null,                                   // new
 *     evidence:    { before?: unknown, after?: unknown } | undefined,         // new (optional)
 *   }
 */

import { getCatalogEntry } from '../findings-catalog.js';

/**
 * Map current severity → grader state.
 * Detectors today emit severity ('critical' | 'warning' | 'passed').
 * The grader thinks in states ('issue' | 'fixed' | 'not_applicable').
 */
function deriveState(severity) {
  if (severity === 'passed') return 'fixed';
  if (severity === 'critical' || severity === 'warning') return 'issue';
  return 'not_applicable';
}

/**
 * Enrich a raw detector finding with catalog metadata + state.
 * Pure function — does not mutate input.
 */
export function enrichFinding(raw) {
  const entry = getCatalogEntry(raw.id);
  return {
    ...raw,
    state:      raw.state      || deriveState(raw.severity),
    weight:     raw.weight     ?? entry.weight,
    fixed_copy: raw.fixed_copy ?? entry.fixed_copy,
    fix_action: raw.fix_action ?? entry.fix_action,
  };
}

export function enrichFindings(findings) {
  return findings.map(enrichFinding);
}

/**
 * Growth Score: weighted percentage of findings in 'fixed' state.
 * Ignores 'not_applicable'.
 *
 *   score = round(100 * sum(weight where fixed) / sum(weight where applicable))
 *
 * Returns null if no applicable findings (avoid divide-by-zero).
 */
export function aggregateGrowthScore(findings) {
  let earned = 0;
  let possible = 0;
  for (const f of findings) {
    if (f.state === 'not_applicable') continue;
    const w = f.weight ?? 1.0;
    possible += w;
    if (f.state === 'fixed') earned += w;
  }
  if (possible === 0) return null;
  return Math.round(100 * earned / possible);
}

/**
 * Flip a finding's state based on a fresh detector result.
 * Used by the re-scan pass: same id, new pass/fail, populate evidence.after.
 */
export function flipState(prev, freshSeverity, after = undefined) {
  return {
    ...prev,
    severity: freshSeverity,
    state: deriveState(freshSeverity),
    evidence: {
      ...(prev.evidence || {}),
      ...(after !== undefined ? { after } : {}),
    },
  };
}
