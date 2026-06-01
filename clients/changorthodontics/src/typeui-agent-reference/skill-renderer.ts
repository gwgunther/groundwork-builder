// SOURCE: typeui-main/src/renderers/shared.ts
// WHY THIS MATTERS: This is the renderer pattern — it takes a structured
// design system object and converts it into a formatted, opinionated prompt/
// document that an AI agent uses as its design guide.
//
// For your website builder agent, adapt this pattern to render your design
// context into the system prompt or page-generation instructions. The
// "Guideline Authoring Workflow" and "Quality Gates" sections are particularly
// good guardrails to bake into your agent's design generation loop.

import { DesignSystem } from "./design-system-schema";

const MANAGED_BLOCK_START = "<!-- TYPEUI_SH_MANAGED_START -->";
const MANAGED_BLOCK_END = "<!-- TYPEUI_SH_MANAGED_END -->";

function list(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

// Renders a full design system spec as a structured markdown prompt.
// Your agent can use this output as a system prompt section or as a
// persistent context document for multi-step site generation.
export function renderDesignSystemPrompt(design: DesignSystem, agentName = "Website Builder"): string {
  return [
    MANAGED_BLOCK_START,
    `# ${design.productName} Design System (${agentName})`,
    "",
    "## Mission",
    `You are an expert web designer and frontend engineer for ${design.productName}.`,
    "Create practical, implementation-ready UI that follows these design guidelines precisely.",
    "",
    "## Brand",
    design.brandSummary,
    "",
    "## Style Foundations",
    `- Visual style: ${design.visualStyle}`,
    `- Typography scale: ${design.typographyScale}`,
    `- Color palette: ${design.colorPalette}`,
    `- Spacing scale: ${design.spacingScale}`,
    "",
    "## Accessibility",
    design.accessibilityRequirements,
    "",
    "## Writing Tone",
    design.writingTone,
    "",
    "## Rules: Do",
    list(design.doRules),
    "",
    "## Rules: Don't",
    list(design.dontRules),
    "",
    "## Expected Behavior",
    "- Follow the foundations first, then component consistency.",
    "- When uncertain, prioritize accessibility and clarity over novelty.",
    "- Provide concrete defaults and explain trade-offs when alternatives are possible.",
    "- Keep guidance opinionated, concise, and implementation-focused.",
    "",
    "## Page Generation Workflow",
    "1. Restate the design intent in one sentence before generating code.",
    "2. Define tokens and foundational constraints before component-level output.",
    "3. Specify component anatomy, states, variants, and interaction behavior.",
    "4. Include accessibility acceptance criteria.",
    "5. Add anti-patterns and notes for inconsistent UI.",
    "6. End with a QA checklist that can be executed in code review.",
    "",
    "## Required Output Structure",
    "When generating pages or components, use this structure:",
    "- Context and goals",
    "- Design tokens and foundations",
    "- Component-level rules (anatomy, variants, states, responsive behavior)",
    "- Accessibility requirements and testable acceptance criteria",
    "- Content and tone standards with examples",
    "- Anti-patterns and prohibited implementations",
    "- QA checklist",
    "",
    "## Component Rule Expectations",
    "- Define required states: default, hover, focus-visible, active, disabled, loading, error (as relevant).",
    "- Describe interaction behavior for keyboard, pointer, and touch.",
    "- State spacing, typography, and color-token usage explicitly.",
    "- Include responsive behavior and edge cases (long labels, empty states, overflow).",
    "",
    "## Quality Gates",
    "- No rule should depend on ambiguous adjectives alone; anchor each rule to a token, threshold, or example.",
    "- Every accessibility statement must be testable in implementation.",
    "- Prefer system consistency over one-off local optimizations.",
    "- Flag conflicts between aesthetics and accessibility, then prioritize accessibility.",
    "",
    "## Constraint Language",
    '- Use "must" for non-negotiable rules and "should" for recommendations.',
    "- Pair every do-rule with at least one concrete don't-example.",
    "- If introducing a new pattern, include migration guidance for existing components.",
    "",
    MANAGED_BLOCK_END
  ].join("\n");
}
