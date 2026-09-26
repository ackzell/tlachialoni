/**
 * Fuzzy filtering and command palettes rows. Reads the shared command catalog so
 * the palette can never drift from the keybinding registry (FR-020).
 */

import { PALETTE_COMMANDS, type CommandDef } from "@shared/commands";

export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += last === ti - 1 ? 3 : 1;
      last = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export interface Row {
  kind: "target" | "command" | "recent";
  id: string;
  label: string;
  detail?: string;
  accelerator?: string;
  arg?: string;
}

export interface ThemeFlags {
  variant: string;
  colorMode: string;
}

export function buildRows(
  query: string,
  recents: readonly { url: string }[],
  commands: CommandDef[] = PALETTE_COMMANDS,
  theme?: ThemeFlags,
): Row[] {
  const rows: Row[] = [];
  const trimmed = query.trim();

  if (trimmed) {
    rows.push({
      kind: "target",
      id: "target.navigate",
      label: `Open ${trimmed}`,
      detail: "navigate",
    });
  } else {
    for (const recent of recents) {
      rows.push({
        kind: "recent",
        id: "target.navigate",
        label: recent.url,
        detail: "recent",
        arg: recent.url,
      });
    }
  }

  const scored = commands
    .map((command) => ({ command, score: fuzzyScore(trimmed, command.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { command } of scored) {
    let detail: string | undefined;
    if (command.id === "theme.cycleMode" && theme) {
      detail = `mode: ${theme.colorMode}`;
    } else if (theme && command.id === `theme.variant.${theme.variant}`) {
      detail = "current";
    }
    rows.push({
      kind: "command",
      id: command.id,
      label: command.label,
      accelerator: command.acceleratorLabel,
      detail,
    });
  }

  return rows;
}
