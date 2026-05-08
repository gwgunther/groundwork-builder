/**
 * render-design-context.js
 *
 * Converts a DesignDNA + practice data into a structured markdown prompt section.
 * Every skill and agent call should prepend this to its user prompt so the
 * model has consistent, token-dense context about constraints.
 *
 * Adapted from typeui.sh's renderDesignSystemPrompt() pattern.
 */

const MANAGED_BLOCK_START = '<!-- AGENT_MANAGED_START -->';
const MANAGED_BLOCK_END   = '<!-- AGENT_MANAGED_END -->';

function list(items = []) {
  return items.map(i => `- ${i}`).join('\n');
}

/**
 * Render a DesignDNA + practice brief into a structured prompt context block.
 *
 * @param {object} dna      - DesignDNA from ai-director.js
 * @param {object} practice - { name, doctor, city, writingTone, brandSummary }
 * @returns {string}        - Markdown block, wrapped in AGENT_MANAGED markers
 */
export function renderDesignContext(dna, practice = {}) {
  const {
    archetype        = '(none)',
    heroVariant      = '(none)',
    density          = 'balanced',
    motion           = 'subtle',
    radius           = 'md',
    cardTreatment    = 'bordered-flat',
    doRules          = [],
    dontRules        = [],
    typographyScale  = '',
    colorPalette     = '',
    spacingScale     = '',
    writingTone      = '',
    brandSummary     = '',
    creativeDirection = '',
    divergenceRationale = '',
  } = dna || {};

  const practiceLabel = [practice.name, practice.city].filter(Boolean).join(', ');

  const lines = [
    MANAGED_BLOCK_START,
    `# Design Context — ${practiceLabel || 'Practice Site'}`,
    '',
    '## Brand',
    brandSummary || `${practiceLabel} — ${archetype} design, ${density} density.`,
    '',
    '## Creative Direction',
    creativeDirection || '(none set)',
    '',
    '## Style Foundations',
    `- Archetype:       ${archetype}`,
    `- Hero variant:    ${heroVariant}`,
    `- Card treatment:  ${cardTreatment}`,
    `- Density:         ${density}`,
    `- Motion:          ${motion}`,
    `- Border radius:   ${radius}`,
    typographyScale ? `- Typography scale: ${typographyScale}` : null,
    colorPalette    ? `- Color palette:    ${colorPalette}`    : null,
    spacingScale    ? `- Spacing scale:    ${spacingScale}`    : null,
    '',
    '## Writing Tone',
    writingTone || 'Warm, clear, locally grounded. Specific over generic.',
    '',
    doRules.length ? '## Rules: Must Do' : null,
    doRules.length ? list(doRules)       : null,
    doRules.length ? ''                  : null,
    dontRules.length ? '## Rules: Must Not Do' : null,
    dontRules.length ? list(dontRules)          : null,
    dontRules.length ? ''                       : null,
    '## Quality Gates (every skill output must pass)',
    '- No rule depends on ambiguous adjectives alone — anchor to a token, size, or example.',
    '- Every accessibility statement is testable: contrast ratio ≥ 4.5:1 body, ≥ 3:1 large.',
    '- Phone number must be click-to-call in the mobile header.',
    '- No section renders with placeholder dashes or null values visible to the user.',
    '- Design must diverge from own-build fingerprints — same archetype+hero combo is a failure.',
    '',
    '## Divergence Rationale',
    divergenceRationale || '(first build)',
    MANAGED_BLOCK_END,
  ].filter(l => l !== null);

  return lines.join('\n');
}

/**
 * Wrap any agent-generated content block in managed markers
 * so upsertManagedFile can surgically replace it on re-runs.
 */
export function wrapInManagedBlock(content) {
  return `${MANAGED_BLOCK_START}\n${content}\n${MANAGED_BLOCK_END}`;
}
