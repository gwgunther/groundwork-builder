# Legacy prompt files (archived)

These prompt files were the runtime source of truth for `ai-design.js`,
`ai-audit.js`, and `ai-content.js` until the **skill-loader migration**.

**As of the migration:**
- `design-map.md` → moved into `skills/design/design-extract.md` (## PROMPT section)
- `site-audit.md` → moved into `skills/audit/site-audit.md` (## PROMPT section)
- `content-map.md` → moved into `skills/content/content-map.md` (## PROMPT section)

The `.js` files now load via `renderSkillPrompt(...)` from `skill-loader.js`.

These files are kept here for historical reference only. **They are not loaded
at runtime.** Edits here have no effect.

To improve a prompt, edit the `## PROMPT` section of the corresponding skill `.md`.
