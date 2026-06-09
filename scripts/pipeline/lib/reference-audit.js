/**
 * reference-audit.js — Correctness/taste partition of the design hard penalties,
 * plus prompt directives that re-point the auditors when a build follows a
 * curated catalog reference (docs/design-catalog/SCHEMA.md §5).
 *
 * The premise: the auditors were built to police UNCURATED AI generation. A
 * curated reference is pre-vetted design — so for reference-led builds the
 * auditors demote from taste-makers to fidelity/correctness QA. A reference may
 * sanction specific TASTE bans it legitimately uses (suppressed for its builds);
 * CORRECTNESS bans are never suppressible.
 *
 * Single source of truth for the partition. design-principles-core.md §B states
 * the same split in prose; if you change one, change both.
 */

/** Bans that are objectively wrong regardless of taste. NEVER suppressible. */
export const CORRECTNESS_BANS = [
  'off-topic or wrong hero image (binding/fidelity error)',
  'placeholder / Lorem / TODO text',
  'gray text on a colored background (AA contrast failure)',
  'WCAG AA violations: body < 4.5:1, large/UI < 3:1, missing focus states',
];

/**
 * Taste bans — defaults for uncurated output, suppressible per-build via a
 * catalog entry's audit.sanctionedPatterns. Keys are the ONLY legal ids in
 * sanctionedPatterns (enforced by docs/design-catalog/schema.json).
 */
export const TASTE_PATTERNS = {
  'pure-black':              'pure black #000 text/background',
  'inter-display':           'Inter/Roboto/system-default as the display face on a premium/warm brand',
  'centered-over-dark-hero': 'centered-text-over-dark-photo hero',
  'three-equal-cards':       '3 identical service cards in an equal row',
  'gradient-accent':         'visible purple/neon gradient accent',
  'emoji-in-content':        'emoji in content',
  'nested-cards':            'cards nested inside cards',
  'icon-tile-above-heading': 'a rounded-square icon tile stacked above every heading',
  'side-accent-border':      'left side-accent borders on cards',
  'gray-glow-shadow':        'gray drop-shadow "glows" / dark outer glows',
};

/**
 * Validate + normalize a catalog entry's audit block.
 * Unknown sanctioned ids are dropped with a warning (a reference can never
 * suppress a correctness ban because no id exists for one).
 * @returns {{sanctionedPatterns: string[], fidelityChecks: string[]} | null}
 */
export function normalizeReferenceAudit(audit) {
  if (!audit || typeof audit !== 'object') return null;
  const sanctioned = (Array.isArray(audit.sanctionedPatterns) ? audit.sanctionedPatterns : [])
    .filter(id => {
      const known = Object.hasOwn(TASTE_PATTERNS, id);
      if (!known) console.warn(`[reference-audit] unknown sanctioned pattern "${id}" — dropped (correctness bans are not suppressible)`);
      return known;
    });
  const checks = (Array.isArray(audit.fidelityChecks) ? audit.fidelityChecks : [])
    .filter(c => typeof c === 'string' && c.trim());
  if (!sanctioned.length && !checks.length) return null;
  return { sanctionedPatterns: sanctioned, fidelityChecks: checks };
}

/**
 * Render the prompt directives for the JUDGE (skill-critique).
 * Empty string when there is no reference audit (uncurated build → unchanged behavior).
 */
export function renderJudgeDirectives(referenceAudit) {
  const a = normalizeReferenceAudit(referenceAudit);
  if (!a) return '';
  const L = ['\n## Reference Design Directives (curated build)',
    'This build follows a hand-curated reference design. The reference IS the design intent.',
    'Judge fidelity to the reference + technical correctness — do NOT re-litigate taste choices the reference made deliberately.'];
  if (a.sanctionedPatterns.length) {
    L.push('\nSANCTIONED PATTERNS — this reference deliberately uses the following. Do NOT penalize them or cite them as violations; judge only whether each is executed WELL:');
    for (const id of a.sanctionedPatterns) L.push(`- ${id}: ${TASTE_PATTERNS[id]}`);
  }
  L.push('\nCorrectness bans still apply in full (never suppressed): ' + CORRECTNESS_BANS.join('; ') + '.');
  if (a.fidelityChecks.length) {
    L.push('\nFIDELITY CHECKS — score each as pass/fail in the "fidelity" output field. A failed check means the build deviated from the reference and MUST drive next_action:');
    for (const c of a.fidelityChecks) L.push(`- ${c}`);
  }
  return L.join('\n');
}

/**
 * Render the prompt directives for FIXER skills (bolder, colorize, layout, polish, typeset).
 * Stops a fixer from "correcting" a curated design back toward generic-safe.
 */
export function renderFixerDirectives(referenceAudit) {
  const a = normalizeReferenceAudit(referenceAudit);
  if (!a) return '';
  const L = ['\n## Reference Design Directives (curated build)',
    'This build follows a hand-curated reference design. Your job is to ENFORCE that design, not redesign it.'];
  if (a.sanctionedPatterns.length) {
    L.push('The following patterns are DELIBERATE choices of the reference — do NOT remove, replace, or "fix" them. Improve their execution only:');
    for (const id of a.sanctionedPatterns) L.push(`- ${id}: ${TASTE_PATTERNS[id]}`);
  }
  if (a.fidelityChecks.length) {
    L.push('Every change you propose must keep these true:');
    for (const c of a.fidelityChecks) L.push(`- ${c}`);
  }
  return L.join('\n');
}

export default { CORRECTNESS_BANS, TASTE_PATTERNS, normalizeReferenceAudit, renderJudgeDirectives, renderFixerDirectives };
