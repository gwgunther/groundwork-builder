// SOURCE: typeui-main/src/domain/designSystemSchema.ts
// WHY THIS MATTERS: Defines the complete data shape for a design system.
// For your website builder agent, this is the structure of the design context
// object your agent should carry and populate — either from user input or
// extracted from reference images/inspiration.

import { z } from "zod";

// Core design system data shape — adapt this as your agent's internal
// representation of a site's design intent.
export const DesignSystemSchema = z.object({
  productName: z.string().min(2),
  brandSummary: z.string(),
  visualStyle: z.string().min(3),        // e.g. "clean, minimal, professional"
  typographyScale: z.string().min(3),    // e.g. "12/16/20/24/32/48"
  colorPalette: z.string().min(3),       // e.g. "primary blue, warm white, soft gray"
  spacingScale: z.string().min(3),       // e.g. "4/8/16/24/32/48"
  accessibilityRequirements: z.string().min(3), // e.g. "WCAG 2.1 AA"
  writingTone: z.string().min(3),        // e.g. "warm, clear, jargon-free"
  doRules: z.array(z.string().min(1)).min(1),   // Explicit positive constraints
  dontRules: z.array(z.string().min(1)).min(1)  // Explicit negative constraints
});

export type DesignSystem = z.infer<typeof DesignSystemSchema>;

// Skill/component metadata — useful if your agent manages multiple named
// design contexts or page-level specifications.
export const SkillMetadataSchema = z.object({
  name: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/),
  description: z.string().trim().min(3).max(240)
    .refine((v) => !/[\r\n]/.test(v), "Must be single line")
});

// The flat list of fields — useful for iterating over or selectively updating
// parts of the design system.
export const DESIGN_SYSTEM_FIELDS = [
  "productName",
  "brandSummary",
  "visualStyle",
  "typographyScale",
  "colorPalette",
  "spacingScale",
  "accessibilityRequirements",
  "writingTone",
  "doRules",
  "dontRules"
] as const;

export type DesignSystemField = (typeof DESIGN_SYSTEM_FIELDS)[number];
