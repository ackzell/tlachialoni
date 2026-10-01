/**
 * Pure builder for the macOS Dock icon menu (specs/017-macos-dock-menu).
 *
 * macOS/AppKit appends its own native window list — with the key window checked —
 * to every app's Dock menu, so this menu deliberately adds **only** the
 * app-specific items: New Window and the recent projects. Adding our own window
 * list duplicated the system one (see research.md "Post-implementation
 * correction").
 *
 * Recents are grouped by origin and labelled exactly as the command palette
 * groups them (`src/renderer/src/composables/useCommands.ts`): a `host:port` group
 * with its pages beneath, so `localhost:3000` and `localhost:5173` stay apart.
 *
 * Kept free of runtime Electron so the menu's shape is unit-testable; the window
 * manager owns the one `app.dock.setMenu` call and the action routing
 * (contracts/dock-menu.md).
 */

import type { MenuItemConstructorOptions } from "electron";
import { recentHost } from "../state/schema";

/** One recent project as the Dock menu sees it. */
export interface DockRecentEntry {
  /** The recent target the item opens; its labels are derived from the url. */
  url: string;
}

/** What each Dock menu item does; owned by the window manager. */
export interface DockMenuActions {
  /** Opens an additional window (the `window.new` path). */
  newWindow: () => void;
  /** Opens a window on this recent target. */
  openRecent: (url: string) => void;
}

/** One origin's recents, newest first. */
export interface DockRecentGroup {
  /** Group key: the origin (`http://localhost:5173`). */
  origin: string;
  /** Group label: `host:port`, matching the palette's host row. */
  label: string;
  /** That origin's recents, newest first. */
  items: DockRecentEntry[];
}

/** `host:port`, or the raw string when it does not parse (palette parity). */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Path (plus query/hash), or the raw string when it does not parse (palette parity). */
function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/**
 * Label for a collapsed one-entry group: the host alone for a root target
 * (`localhost:3000`), or host plus path when the path adds information
 * (`localhost:3000/dashboard`). Parsed once so an unparseable url cannot double.
 */
function singleLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path === "/" ? parsed.host : `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

/**
 * Collapses recents into one group per origin, newest first, the same shape the
 * command palette shows. Grouping by origin — not hostname — keeps
 * `localhost:3000` and `localhost:5173` apart, which is how dev servers differ.
 */
export function groupRecentsByOrigin(recents: readonly DockRecentEntry[]): DockRecentGroup[] {
  const order: string[] = [];
  const groups = new Map<string, DockRecentEntry[]>();
  for (const recent of recents) {
    // `recentHost` is the app's single origin key (shared with the recents cap).
    const origin = recentHost(recent.url);
    let list = groups.get(origin);
    if (!list) {
      list = [];
      groups.set(origin, list);
      order.push(origin);
    }
    list.push(recent);
  }
  return order.map((origin) => {
    const items = groups.get(origin) ?? [];
    const newest = items[0];
    return { origin, label: newest ? hostOf(newest.url) : origin, items };
  });
}

/**
 * Builds the Dock menu template: **New Window**, then a **Recent** submenu when
 * there are recents, with one submenu per origin. The recent section is omitted
 * when empty so no bare separator or placeholder ever shows (FR-002, FR-006,
 * FR-015). The open window list is intentionally NOT built here — macOS provides
 * it.
 */
export function buildDockMenuTemplate(
  recents: readonly DockRecentEntry[],
  actions: DockMenuActions,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    { label: "New Window", click: () => actions.newWindow() },
  ];

  if (recents.length > 0) {
    template.push({ type: "separator" });
    template.push({
      label: "Recent",
      submenu: groupRecentsByOrigin(recents).map((group): MenuItemConstructorOptions => {
        const only = group.items[0];
        // A group with a single entry never needs another level of drill-down:
        // show it as a leaf, labeled by host (plus path when it adds detail).
        if (group.items.length === 1 && only) {
          return { label: singleLabel(only.url), click: () => actions.openRecent(only.url) };
        }
        return {
          label: group.label,
          submenu: group.items.map((recent): MenuItemConstructorOptions => ({
            label: pathOf(recent.url),
            click: () => actions.openRecent(recent.url),
          })),
        };
      }),
    });
  }

  return template;
}
