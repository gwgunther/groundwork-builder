# typeui-agent-reference

Reference patterns extracted from [typeui.sh](https://typeui.sh) for use in a Claude-based website builder agent.

## What's here

### `design-system-schema.ts`
The data shape for a complete design system. Use this as your agent's internal representation of a site's design intent — whether populated from user input, extracted from reference images, or inferred from inspiration sources.

Key fields: `visualStyle`, `typographyScale`, `colorPalette`, `spacingScale`, `accessibilityRequirements`, `writingTone`, `doRules`, `dontRules`.

### `skill-renderer.ts`
Converts a structured design system object into a formatted markdown prompt. Adapt this to inject design context into your agent's system prompt or page-generation instructions. The "Quality Gates" and "Guideline Authoring Workflow" sections are worth keeping — they make the agent's output more consistent and less ambiguous.

### `managed-file-updater.ts`
The managed block pattern. Lets your agent own specific sections of generated files (between `<!-- AGENT_MANAGED_START -->` and `<!-- AGENT_MANAGED_END -->` markers) while leaving user edits untouched. Critical if your builder does iterative regeneration on files users can customize.

## What to ignore from the original codebase

- `src/prompts/` — interactive CLI prompting for humans, not relevant to an agent
- `src/registry/` — fetches pre-built specs from GitHub, you're generating from inspiration refs instead
- `src/cli.ts` — CLI entry point, irrelevant to an agent context
- `src/renderers/claudeRenderer.ts` etc. — provider-specific wrappers around `shared.ts`, the shared renderer is all you need

## Recommended adaptation for a website builder agent

1. **Populate `DesignSystem`** from extracted design tokens (colors, fonts, spacing) parsed from the user's inspiration references — not from a human CLI wizard.
2. **Feed `renderDesignSystemPrompt()` output** into your agent's system prompt or as a persistent context document that gets referenced during page generation.
3. **Use `upsertManagedFile()`** when writing generated HTML/CSS/component files so that re-runs don't clobber sections users have customized.
4. **Store `doRules` / `dontRules`** as the primary guardrails — these are more reliable as generation constraints than purely descriptive prose instructions.
