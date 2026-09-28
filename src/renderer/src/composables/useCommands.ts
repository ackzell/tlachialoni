/**
 * Fuzzy filtering and command palettes rows. Reads the shared command catalog so
 * the palette can never drift from the keybinding registry (FR-020).
 */

import { PALETTE_COMMANDS, type CommandDef } from "@shared/commands";
import { parseExtensionId } from "@shared/extension-id";
import type { InstalledExtension } from "@shared/extensions";

export interface FuzzyMatch {
  /** Higher is better; 0 means the query is not a subsequence of the text. */
  score: number;
  /** Indices into `text` of the matched characters, ascending. Empty for a blank query. */
  indices: number[];
}

/**
 * Case-insensitive subsequence match. Every character of `query` must appear in
 * `text`, in order; adjacent hits score higher than scattered ones so prefix and
 * contiguous matches rank first. Returns the matched indices too, so the palette
 * can emphasize exactly the characters that matched.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  const q = query.toLowerCase().trim();
  if (!q) return { score: 1, indices: [] };
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += last === ti - 1 ? 3 : 1;
      last = ti;
      indices.push(ti);
      qi++;
    }
  }
  return qi === q.length ? { score, indices } : { score: 0, indices: [] };
}

export function fuzzyScore(query: string, text: string): number {
  return fuzzyMatch(query, text).score;
}

export interface Row {
  kind: "target" | "command" | "recent" | "extension";
  id: string;
  /**
   * Stable DOM identity for the row. Unlike `id`, this never collides across
   * row kinds and never changes while the row persists — the typed-target row
   * keeps one key for the whole typing session even though its label changes.
   */
  key: string;
  label: string;
  /** Character indices in `label` matched by the query, for emphasis. */
  matches?: number[];
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
  extensions: readonly InstalledExtension[] = [],
): Row[] {
  const rows: Row[] = [];
  const trimmed = query.trim();

  if (trimmed) {
    // A pasted store URL or ID becomes the install row itself, instead of a
    // useless (and rejected) "Open <url>" target row, so Enter installs it.
    const storeId = parseExtensionId(trimmed);
    if (storeId) {
      rows.push({
        kind: "extension",
        id: "extensions.install",
        key: "extension.install",
        label: `Install extension ${storeId}`,
        detail: "from Chrome Web Store",
        arg: storeId,
      });
    } else {
      rows.push({
        kind: "target",
        id: "target.navigate",
        key: "target.typed",
        label: `Open ${trimmed}`,
        detail: "navigate",
      });
    }
  } else {
    for (const recent of recents) {
      rows.push({
        kind: "recent",
        id: "target.navigate",
        key: `target.recent:${recent.url}`,
        label: recent.url,
        detail: "recent",
        arg: recent.url,
      });
    }
  }

  // Installed extensions: a toggle row always, a remove row always, and an
  // update row only for store installs matched by the query.
  for (const extension of extensions) {
    const toggleLabel = `Extension: ${extension.name}`;
    const toggle = fuzzyMatch(trimmed, toggleLabel);
    if (!trimmed || toggle.score > 0) {
      rows.push({
        kind: "extension",
        id: "extensions.toggle",
        key: `extension:toggle:${extension.slug}`,
        label: toggleLabel,
        matches: toggle.indices,
        detail: extension.enabled ? "enabled" : "disabled",
        arg: extension.slug,
      });
    }

    const removeLabel = `Remove Extension: ${extension.name}`;
    const remove = fuzzyMatch(trimmed, removeLabel);
    if (!trimmed || remove.score > 0) {
      rows.push({
        kind: "extension",
        id: "extensions.remove",
        key: `extension:remove:${extension.slug}`,
        label: removeLabel,
        matches: remove.indices,
        detail: "remove",
        arg: extension.slug,
      });
    }

    if (extension.source === "store") {
      const updateLabel = `Update Extension: ${extension.name}`;
      const update = fuzzyMatch(trimmed, updateLabel);
      if (trimmed && update.score > 0) {
        rows.push({
          kind: "extension",
          id: "extensions.update",
          key: `extension:update:${extension.slug}`,
          label: updateLabel,
          matches: update.indices,
          detail: "store",
          arg: extension.slug,
        });
      }
    }
  }

  const scored = commands
    .map((command) => ({ command, match: fuzzyMatch(trimmed, command.label) }))
    .filter((entry) => entry.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score);

  for (const { command, match } of scored) {
    let detail: string | undefined;
    if (command.id === "theme.cycleMode" && theme) {
      detail = `mode: ${theme.colorMode}`;
    } else if (theme && command.id === `theme.variant.${theme.variant}`) {
      detail = "current";
    }
    rows.push({
      kind: "command",
      id: command.id,
      key: `command:${command.id}`,
      label: command.label,
      matches: match.indices,
      accelerator: command.acceleratorLabel,
      detail,
    });
  }

  return rows;
}
