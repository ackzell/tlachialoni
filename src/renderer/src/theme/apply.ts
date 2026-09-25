/**
 * Shell theme: applies Tlapalli tokens as CSS custom properties.
 * All shell colors come from these variables (constitution VI).
 */

import { TLAPALLI_TOKENS } from "@shared/theme-tokens";

export type ResolvedMode = "dark" | "light";

export function applyTheme(variant: string, resolved: ResolvedMode): void {
  const byMode = (TLAPALLI_TOKENS as Record<string, Record<string, Record<string, string>>>)[
    variant
  ];
  const tokens = byMode?.[resolved] ?? TLAPALLI_TOKENS.obsidian.dark;

  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.dataset.variant = variant;
  root.dataset.mode = resolved;
  root.style.colorScheme = resolved;
}
