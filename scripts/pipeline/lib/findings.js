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
function deriveState(severity, explicitState) {
  if (explicitState) return explicitState;
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
    state:      deriveState(raw.severity, raw.state),
    weight:     raw.weight     ?? entry.weight,
    fixed_copy: raw.fixed_copy ?? entry.fixed_copy,
    fix_action: raw.fix_action ?? entry.fix_action,
  };
}

export function enrichFindings(findings) {
  return findings.map(enrichFinding);
}

/**
 * Aggregate findings into objective counts — what the report actually shows.
 *
 * No subjective scoring. Each value is something the prospect could verify
 * themselves by counting cards.
 *
 *   total      — every applicable finding (excludes not_applicable)
 *   passed     — state === 'fixed'
 *   issues     — state === 'issue' (sum of critical + warnings)
 *   critical   — state === 'issue' AND severity === 'critical'
 *   warnings   — state === 'issue' AND severity === 'warning'
 */
export function summarizeFindings(findings) {
  let total = 0, passed = 0, critical = 0, warnings = 0;
  for (const f of findings || []) {
    if (f.state === 'not_applicable') continue;
    total += 1;
    if (f.state === 'fixed') {
      passed += 1;
    } else if (f.state === 'issue') {
      if (f.severity === 'critical') critical += 1;
      else warnings += 1;
    }
  }
  return { total, passed, issues: critical + warnings, critical, warnings };
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
