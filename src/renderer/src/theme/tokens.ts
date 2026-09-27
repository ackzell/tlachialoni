/**
 * The CSS variable contract the shell consumes (contracts/theme-tokens.md).
 * Values live in the generated @shared/theme-tokens module.
 */
export const TOKEN_VARIABLES = [
  "--tb-bg",
  "--tb-bg-elevated",
  "--tb-surface",
  "--tb-fg",
  "--tb-fg-muted",
  "--tb-fg-subtle",
  "--tb-border",
  "--tb-accent",
  "--tb-signature",
  "--tb-selection",
  "--tb-hover",
  "--tb-error",
  "--tb-progress",
] as const;
