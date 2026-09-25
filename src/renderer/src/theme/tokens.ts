/**
 * The CSS variable contract the shell consumes (contracts/theme-tokens.md).
 * Values live in the generated @shared/theme-tokens module.
 */
export const TOKEN_VARIABLES = [
  "--lb-bg",
  "--lb-bg-elevated",
  "--lb-surface",
  "--lb-fg",
  "--lb-fg-muted",
  "--lb-fg-subtle",
  "--lb-border",
  "--lb-accent",
  "--lb-signature",
  "--lb-selection",
  "--lb-hover",
  "--lb-error",
  "--lb-progress",
] as const;
