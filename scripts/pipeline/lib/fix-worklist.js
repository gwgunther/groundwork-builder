/**
 * Fix Worklist — turns Findings into an actionable list for the builder.
 *
 * The grader emits Findings (signals: "is this broken?"). The builder needs
 * actions (instructions: "what should I run?"). Many findings map to the same
 * generator (e.g. missing-title and duplicate-titles both → 'page-titles'), so
 * we deduplicate by target and roll up the driving findings.
 *
 * Output shape (per worklist entry):
 *   {
 *     target:       string,        // generator/skill id from finding.fix_action.target
 *     kind:         string,        // 'generator' | 'gbp_api' | 'manual' | 'skill'
 *     finding_ids:  string[],      // every finding that demands this action
 *     total_weight: number,        // sum of weights of driving findings
 *     categories:   string[],      // distinct finding categories touched
 *   }
 *
 * Entries are ordered by total_weight descending — most impactful actions
 * first. Findings without a fix_action (or in non-issue state) are skipped.
 */

/**
 * Build a fix worklist from a combined findings array.
 *
 * @param {object[]} findings - any mix of scanner outputs, post-enrichFindings.
 * @returns {object[]} ordered worklist entries.
 */
export function buildFixWorklist(findings) {
  const byTarget = new Map();

  for (const f of findings || []) {
    if (f.state !== 'issue') continue;
    if (!f.fix_action?.target) continue;

    const key = `${f.fix_action.kind || 'generator'}::${f.fix_action.target}`;
    let entry = byTarget.get(key);
    if (!entry) {
      entry = {
        target:       f.fix_action.target,
        kind:         f.fix_action.kind || 'generator',
        finding_ids:  [],
        total_weight: 0,
        categories:   new Set(),
      };
      byTarget.set(key, entry);
    }
    entry.finding_ids.push(f.id);
    entry.total_weight += f.weight ?? 1.0;
    if (f.category) entry.categories.add(f.category);
  }

  return [...byTarget.values()]
    .map(e => ({
      target:       e.target,
      kind:         e.kind,
      finding_ids:  e.finding_ids,
      total_weight: Number(e.total_weight.toFixed(2)),
      categories:   [...e.categories],
    }))
    .sort((a, b) => b.total_weight - a.total_weight);
}

/**
 * Lightweight summary of the worklist — for CLI output and quick inspection.
 */
export function summarizeWorklist(worklist) {
  const byKind = {};
  let totalActions = 0;
  let totalFindings = 0;
  let totalWeight = 0;
  for (const e of worklist) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    totalActions += 1;
    totalFindings += e.finding_ids.length;
    totalWeight += e.total_weight;
  }
  return {
    totalActions,
    totalFindings,
    totalWeight: Number(totalWeight.toFixed(2)),
    byKind,
  };
}
