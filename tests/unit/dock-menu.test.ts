import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import {
  buildDockMenuTemplate,
  groupRecentsByOrigin,
  type DockMenuActions,
} from "../../src/main/shell/dock-menu";

function makeActions() {
  return {
    newWindow: vi.fn(),
    openRecent: vi.fn(),
  } satisfies DockMenuActions;
}

/** Invokes a menu item's click handler, ignoring the Electron callback args. */
function fire(item: MenuItemConstructorOptions): void {
  (item.click as (() => void) | undefined)?.();
}

function submenuOf(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return item.submenu as MenuItemConstructorOptions[];
}

/** The "Recent" submenu, or undefined when recents are empty. */
function recentSubmenu(
  template: MenuItemConstructorOptions[],
): MenuItemConstructorOptions | undefined {
  return template.find((item) => item.label === "Recent");
}

/** Newest-first, as `StateStore.recents` holds them. */
const mixed = [
  { url: "http://localhost:3000/api/health" },
  { url: "http://localhost:5173/dashboard" },
  { url: "http://localhost:3000/" },
  { url: "http://localhost:5173/" },
];

describe("buildDockMenuTemplate", () => {
  it("lists New Window first and routes its click to newWindow", () => {
    const actions = makeActions();
    const template = buildDockMenuTemplate([], actions);

    expect(template).toHaveLength(1);
    expect(template[0].label).toBe("New Window");
    fire(template[0]);
    expect(actions.newWindow).toHaveBeenCalledTimes(1);
  });

  it("does not add its own window list, leaving that to macOS", () => {
    const template = buildDockMenuTemplate(mixed, makeActions());

    expect(template.map((item) => item.label ?? "—")).toEqual(["New Window", "—", "Recent"]);
  });

  it("omits the recent section (and its separator) when there are no recents", () => {
    const template = buildDockMenuTemplate([], makeActions());

    expect(template).toHaveLength(1);
    expect(recentSubmenu(template)).toBeUndefined();
  });

  it("groups recents by origin, newest first, keeping dev servers apart", () => {
    const recent = recentSubmenu(buildDockMenuTemplate(mixed, makeActions()));
    const groups = submenuOf(recent as MenuItemConstructorOptions);

    expect(groups.map((group) => group.label)).toEqual(["localhost:3000", "localhost:5173"]);
    expect(groups[0].submenu).toBeDefined();
    expect(submenuOf(groups[0]).map((item) => item.label)).toEqual(["/api/health", "/"]);
  });

  it("opens the recent a menu item was composed from", () => {
    const actions = makeActions();
    const groups = submenuOf(
      recentSubmenu(buildDockMenuTemplate(mixed, actions)) as MenuItemConstructorOptions,
    );

    fire(submenuOf(groups[1])[0]);
    expect(actions.openRecent).toHaveBeenCalledWith("http://localhost:5173/dashboard");
  });

  it("collapses a single-entry group to a leaf labeled by host", () => {
    const actions = makeActions();
    const groups = submenuOf(
      recentSubmenu(
        buildDockMenuTemplate([{ url: "http://localhost:3000/" }], actions),
      ) as MenuItemConstructorOptions,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("localhost:3000");
    expect(groups[0].submenu).toBeUndefined();
    fire(groups[0]);
    expect(actions.openRecent).toHaveBeenCalledWith("http://localhost:3000/");
  });

  it("keeps the path on a collapsed leaf when it adds information", () => {
    const groups = submenuOf(
      recentSubmenu(
        buildDockMenuTemplate([{ url: "http://localhost:5173/dashboard" }], makeActions()),
      ) as MenuItemConstructorOptions,
    );

    expect(groups[0].label).toBe("localhost:5173/dashboard");
  });

  it("mixes a collapsed leaf with a drilled-down origin", () => {
    const groups = submenuOf(
      recentSubmenu(
        buildDockMenuTemplate(
          [
            { url: "http://localhost:3000/" },
            { url: "http://localhost:5173/a" },
            { url: "http://localhost:5173/b" },
          ],
          makeActions(),
        ),
      ) as MenuItemConstructorOptions,
    );

    expect(groups.map((group) => group.label)).toEqual(["localhost:3000", "localhost:5173"]);
    expect(groups[0].submenu).toBeUndefined();
    expect(submenuOf(groups[1]).map((item) => item.label)).toEqual(["/a", "/b"]);
  });

  it("falls back to the raw url when a recent does not parse", () => {
    const groups = submenuOf(
      recentSubmenu(
        buildDockMenuTemplate([{ url: "not-a-url" }], makeActions()),
      ) as MenuItemConstructorOptions,
    );

    expect(groups[0].label).toBe("not-a-url");
  });
});

describe("groupRecentsByOrigin", () => {
  it("keys groups by origin and orders them by first appearance", () => {
    expect(groupRecentsByOrigin(mixed).map((group) => group.origin)).toEqual([
      "http://localhost:3000",
      "http://localhost:5173",
    ]);
  });

  it("keeps each origin's recents in the order given", () => {
    const [first] = groupRecentsByOrigin(mixed);

    expect(first.items.map((item) => item.url)).toEqual([
      "http://localhost:3000/api/health",
      "http://localhost:3000/",
    ]);
  });
});
