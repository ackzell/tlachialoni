/**
 * Fuzzy filtering and command palettes rows. Reads the shared command catalog so
 * the palette can never drift from the keybinding registry (FR-020).
 */

import {
  COMMAND_GROUPS,
  PALETTE_COMMANDS,
  type CommandDef,
  type CommandGroup,
  type Scope,
} from "@shared/commands";
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

export interface RecentLike {
  url: string;
  lastOpenedAt?: number;
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
  /** Palette group the row belongs to, for ordering and (later) headers. */
  group: CommandGroup;
  label: string;
  /** Character indices in `label` matched by the query, for emphasis. */
  matches?: number[];
  detail?: string;
  accelerator?: string;
  arg?: string;
  /**
   * Short persistent marker rendered before `detail` (e.g. `MV3`). Unlike
   * `detail`, which describes the row's current action, a badge states a standing
   * property of the thing — it stays put instead of being replaced by whatever
   * the row does (specs/018, FR-010).
   */
  badge?: string;
  /** Host-grouped recent: the origin this row summarizes. */
  host?: string;
  /** Host-grouped recent: whether the row can expand into its pages. */
  expandable?: boolean;
  /** Host-grouped recent: whether the pages are currently shown below it. */
  expanded?: boolean;
  /** Host-grouped recent: number of pages under this origin. */
  childCount?: number;
  /** Indentation depth (0 for a host row, 1 for its pages). */
  depth?: number;
}

export interface ThemeFlags {
  variant: string;
  colorMode: string;
}

/** View state the palette supplies on top of the catalog. */
export interface PaletteView {
  /** Active scope; defaults to "all". */
  scope?: Scope;
  /** Origins whose recent pages are currently expanded. */
  expandedHosts?: readonly string[];
}

/** Group order used when flattening rows, so All lists groups in a fixed order. */
const GROUP_ORDER: CommandGroup[] = COMMAND_GROUPS.map((group) => group.id);

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** `host:port`, or the raw string when it does not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Path (plus query/hash) of a recent, or the raw string when it does not parse. */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/**
 * Collapses recents into one row per origin (newest first), expanding a host's
 * pages underneath it when requested. Grouping by origin — not hostname — keeps
 * `localhost:3000` and `localhost:5173` apart, which is how dev servers differ.
 */
function recentRows(recents: readonly RecentLike[], expanded: ReadonlySet<string>): Row[] {
  const order: string[] = [];
  const groups = new Map<string, RecentLike[]>();
  for (const recent of recents) {
    const origin = originOf(recent.url);
    let list = groups.get(origin);
    if (!list) {
      list = [];
      groups.set(origin, list);
      order.push(origin);
    }
    list.push(recent);
  }

  const rows: Row[] = [];
  for (const origin of order) {
    const list = groups.get(origin) ?? [];
    const newest = list[0];
    if (!newest) continue;
    const isExpanded = expanded.has(origin);
    rows.push({
      kind: "recent",
      id: "target.navigate",
      key: `host:${origin}`,
      group: "location",
      label: hostOf(newest.url),
      detail: pathOf(newest.url),
      arg: newest.url,
      host: origin,
      expandable: list.length > 1,
      expanded: isExpanded,
      childCount: list.length,
    });
    if (isExpanded) {
      for (const recent of list) {
        rows.push({
          kind: "recent",
          id: "target.navigate",
          key: `target.recent:${recent.url}`,
          group: "location",
          label: pathOf(recent.url),
          detail: "recent",
          arg: recent.url,
          host: origin,
          depth: 1,
        });
      }
    }
  }
  return rows;
}

export function buildRows(
  query: string,
  recents: readonly RecentLike[],
  commands: CommandDef[] = PALETTE_COMMANDS,
  theme?: ThemeFlags,
  extensions: readonly InstalledExtension[] = [],
  view: PaletteView = {},
): Row[] {
  const scope: Scope = view.scope ?? "all";
  const expanded = new Set(view.expandedHosts ?? []);
  const trimmed = query.trim();
  const inScope = (group: CommandGroup): boolean => scope === "all" || scope === group;

  const buckets: Record<CommandGroup, Row[]> = {
    location: [],
    theme: [],
    view: [],
    devtools: [],
    extensions: [],
    other: [],
  };

  // ---- location: typed target + recents -----------------------------------
  if (trimmed) {
    const storeId = parseExtensionId(trimmed);
    if (storeId) {
      if (inScope("extensions")) {
        buckets.extensions.push({
          kind: "extension",
          id: "extensions.install",
          key: "extension.install",
          group: "extensions",
          label: `Install extension ${storeId}`,
          detail: "from Chrome Web Store",
          arg: storeId,
        });
      }
    } else if (inScope("location")) {
      buckets.location.push({
        kind: "target",
        id: "target.navigate",
        key: "target.typed",
        group: "location",
        label: `Open ${trimmed}`,
        detail: "navigate",
      });
      // History is searchable too: typing a port surfaces that recent page.
      for (const recent of recents) {
        const match = fuzzyMatch(trimmed, recent.url);
        if (match.score > 0) {
          buckets.location.push({
            kind: "recent",
            id: "target.navigate",
            key: `target.recent:${recent.url}`,
            group: "location",
            label: recent.url,
            matches: match.indices,
            detail: "recent",
            arg: recent.url,
          });
        }
      }
    }
  } else if (inScope("location")) {
    buckets.location.push(...recentRows(recents, expanded));
  }

  // ---- extensions (dynamic rows) ------------------------------------------
  if (inScope("extensions")) {
    // A toggle row always, a remove row always, and an update row only for store
    // installs matched by the query.
    for (const extension of extensions) {
      const toggleLabel = `Extension: ${extension.name}`;
      const toggle = fuzzyMatch(trimmed, toggleLabel);
      if (!trimmed || toggle.score > 0) {
        buckets.extensions.push({
          kind: "extension",
          id: "extensions.toggle",
          key: `extension:toggle:${extension.slug}`,
          group: "extensions",
          label: toggleLabel,
          matches: toggle.indices,
          detail: extension.enabled ? "enabled" : "disabled",
          // The standing reminder that this one's background service worker
          // will not run, replacing the one-time install warning (FR-010).
          badge: extension.mv3ServiceWorker ? "MV3" : undefined,
          arg: extension.slug,
        });
      }

      const removeLabel = `Remove Extension: ${extension.name}`;
      const remove = fuzzyMatch(trimmed, removeLabel);
      if (!trimmed || remove.score > 0) {
        buckets.extensions.push({
          kind: "extension",
          id: "extensions.remove",
          key: `extension:remove:${extension.slug}`,
          group: "extensions",
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
          buckets.extensions.push({
            kind: "extension",
            id: "extensions.update",
            key: `extension:update:${extension.slug}`,
            group: "extensions",
            label: updateLabel,
            matches: update.indices,
            detail: "store",
            arg: extension.slug,
          });
        }
      }
    }
  }

  // ---- commands, scoped and sorted by group then score --------------------
  const scored = commands
    .map((command, index) => ({ command, index, match: fuzzyMatch(trimmed, command.label) }))
    .filter((entry) => entry.match.score > 0 && inScope(entry.command.group))
    .sort((a, b) => {
      const groupDelta =
        GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group);
      if (groupDelta !== 0) return groupDelta;
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      return a.index - b.index;
    });

  for (const { command, match } of scored) {
    let detail: string | undefined;
    if (command.id === "theme.cycleMode" && theme) {
      detail = `mode: ${theme.colorMode}`;
    } else if (theme && command.id === `theme.variant.${theme.variant}`) {
      detail = "current";
    }
    buckets[command.group].push({
      kind: "command",
      id: command.id,
      key: `command:${command.id}`,
      group: command.group,
      label: command.label,
      matches: match.indices,
      accelerator: command.acceleratorLabel,
      detail,
    });
  }

  return GROUP_ORDER.flatMap((group) => buckets[group]);
}
