import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  COMMAND_GROUPS,
  PALETTE_COMMANDS,
  SCOPES,
  commandForInput,
  nextScope,
  scopeLabel,
} from "@shared/commands";
import { buildRows, fuzzyMatch, fuzzyScore } from "../../src/renderer/src/composables/useCommands";

describe("command catalog", () => {
  it("binds ⌘J to the focus toggle", () => {
    const command = COMMANDS.find((entry) => entry.id === "focus.toggle");
    expect(command).toMatchObject({
      palette: true,
      acceleratorLabel: "⌘J",
      accelerator: { meta: true, code: "KeyJ" },
    });
  });

  it("matches the focus toggle from a raw key input", () => {
    const input = {
      type: "keyDown",
      meta: true,
      shift: false,
      alt: false,
      control: false,
      code: "KeyJ",
    };
    expect(commandForInput(input)?.id).toBe("focus.toggle");
  });

  it("exposes the focus toggle in the palette", () => {
    expect(PALETTE_COMMANDS.some((entry) => entry.id === "focus.toggle")).toBe(true);
  });

  it("keeps the store install command out of the palette", () => {
    // A store install is offered only when the input is a store URL/ID, so a
    // standalone entry would be a confusing dead row.
    expect(COMMANDS.some((entry) => entry.id === "extensions.install")).toBe(true);
    expect(PALETTE_COMMANDS.some((entry) => entry.id === "extensions.install")).toBe(false);
  });

  it("binds ⌘T to the theme palette command", () => {
    const command = COMMANDS.find((entry) => entry.id === "palette.openTheme");
    expect(command).toMatchObject({
      palette: true,
      acceleratorLabel: "⌘T",
      accelerator: { meta: true, code: "KeyT" },
    });
    const input = {
      type: "keyDown",
      meta: true,
      shift: false,
      alt: false,
      control: false,
      code: "KeyT",
    };
    expect(commandForInput(input)?.id).toBe("palette.openTheme");
  });

  it("assigns every command a declared group", () => {
    const ids = new Set(COMMAND_GROUPS.map((group) => group.id));
    for (const command of COMMANDS) expect(ids.has(command.group)).toBe(true);
  });
});

describe("palette scopes", () => {
  it("orders scopes as All followed by the declared groups", () => {
    expect(SCOPES[0]).toBe("all");
    expect(SCOPES.slice(1)).toEqual(COMMAND_GROUPS.map((group) => group.id));
  });

  it("cycles scopes in declaration order and wraps", () => {
    expect(nextScope("all")).toBe(COMMAND_GROUPS[0].id);
    expect(nextScope(COMMAND_GROUPS[0].id, -1)).toBe("all");
    expect(nextScope(SCOPES[SCOPES.length - 1]!)).toBe("all");
  });

  it("labels scopes", () => {
    expect(scopeLabel("all")).toBe("All");
    expect(scopeLabel("theme")).toBe("Theme");
  });
});

describe("scoped rows", () => {
  it("lists only the active group's rows when scoped", () => {
    const rows = buildRows("", [], undefined, { variant: "jade", colorMode: "system" }, [], {
      scope: "theme",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.group === "theme")).toBe(true);
  });

  it("returns nothing for a query with no in-group match (so the palette falls back)", () => {
    expect(buildRows("reload", [], undefined, undefined, [], { scope: "theme" })).toEqual([]);
  });

  it("offers the typed target row only in Location / All", () => {
    expect(
      buildRows(":5173", [], undefined, undefined, [], { scope: "location" })[0],
    ).toMatchObject({ key: "target.typed" });
    expect(buildRows(":5173", [], undefined, undefined, [], { scope: "view" })).toEqual([]);
  });

  it("offers a pasted store install only in Extensions / All", () => {
    const id = "fmkadmapgofadopljbjfkapdkoienihi";
    expect(buildRows(id, [], undefined, undefined, [], { scope: "extensions" })[0]).toMatchObject({
      id: "extensions.install",
    });
    expect(buildRows(id, [], undefined, undefined, [], { scope: "location" })).toEqual([]);
  });

  it("orders All rows by the declared group order", () => {
    const order = COMMAND_GROUPS.map((group) => group.id);
    const rows = buildRows("", [], undefined, { variant: "jade", colorMode: "system" });
    for (let i = 1; i < rows.length; i++) {
      expect(order.indexOf(rows[i]!.group)).toBeGreaterThanOrEqual(
        order.indexOf(rows[i - 1]!.group),
      );
    }
  });
});

describe("host-grouped recents", () => {
  const recent = (url: string, lastOpenedAt = 1) => ({ url, lastOpenedAt });

  it("collapses one origin's pages into a single expandable host row", () => {
    const rows = buildRows("", [
      recent("http://localhost:5173/"),
      recent("http://localhost:5173/dashboard", 2),
      recent("http://localhost:3000/"),
    ]);
    const hosts = rows.filter((row) => row.kind === "recent" && !row.depth);
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toMatchObject({
      host: "http://localhost:5173",
      childCount: 2,
      expandable: true,
    });
    expect(hosts[1]).toMatchObject({ childCount: 1, expandable: false });
  });

  it("lists an origin's pages as child rows when expanded", () => {
    const expanded = buildRows(
      "",
      [recent("http://localhost:5173/"), recent("http://localhost:5173/dashboard", 2)],
      undefined,
      undefined,
      [],
      { expandedHosts: ["http://localhost:5173"] },
    );
    const children = expanded.filter((row) => row.depth === 1);
    expect(children).toHaveLength(2);
    expect(children.every((row) => row.host === "http://localhost:5173")).toBe(true);
    expect(new Set(expanded.map((row) => row.key)).size).toBe(expanded.length);
  });

  it("searches pages flat while typing, without host rows", () => {
    const rows = buildRows("5173", [
      recent("http://localhost:5173/"),
      recent("http://localhost:3000/"),
    ]);
    expect(rows.some((row) => row.kind === "recent" && row.childCount)).toBe(false);
    expect(rows.some((row) => row.kind === "recent" && row.arg?.includes("5173"))).toBe(true);
  });
});

describe("palette rows", () => {
  it("lists every theme variant command", () => {
    const rows = buildRows("theme", [], undefined, { variant: "jade", colorMode: "system" });
    const variants = rows.filter((row) => row.id.startsWith("theme.variant."));
    expect(variants).toHaveLength(8);
  });

  it("annotates the cycle-mode row with the engaged mode", () => {
    const rows = buildRows("", [], undefined, { variant: "jade", colorMode: "light" });
    expect(rows.find((row) => row.id === "theme.cycleMode")?.detail).toBe("mode: light");
  });

  it("marks only the persisted variant as current", () => {
    const rows = buildRows("", [], undefined, { variant: "jade", colorMode: "system" });
    expect(rows.find((row) => row.id === "theme.variant.jade")?.detail).toBe("current");
    expect(rows.find((row) => row.id === "theme.variant.gold")?.detail).toBeUndefined();
  });

  it("omits theme annotations when no theme state is supplied", () => {
    const rows = buildRows("", []);
    expect(rows.find((row) => row.id === "theme.cycleMode")?.detail).toBeUndefined();
  });

  it("scores fuzzy matches and rejects non-matches", () => {
    expect(fuzzyScore("theme", "Theme: Jade")).toBeGreaterThan(0);
    expect(fuzzyScore("zzz", "Theme: Jade")).toBe(0);
  });

  it("reports the indices of the characters a query matched", () => {
    const match = fuzzyMatch("theme", "Theme: Jade");
    expect(match.indices.map((i) => "Theme: Jade"[i])).toEqual(["T", "h", "e", "m", "e"]);
  });

  it("reports no indices for a non-match or a blank query", () => {
    expect(fuzzyMatch("zzz", "Theme: Jade")).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch("   ", "Theme: Jade")).toEqual({ score: 1, indices: [] });
  });

  it("carries match indices on command rows for emphasis, preserving casing", () => {
    const row = buildRows("reload", []).find((entry) => entry.id === "view.reload");
    const hit = row?.matches?.map((i) => row.label[i]).join("");
    expect(hit?.toLowerCase()).toBe("reload");
  });
});

describe("extension rows", () => {
  const id = "fmkadmapgofadopljbjfkapdkoienihi";
  const extension = {
    slug: id,
    id,
    name: "React Developer Tools",
    version: "8.0.0",
    source: "store" as const,
    enabled: true,
    installedAt: 1,
  };

  it("makes the store install the default row for a pasted store URL", () => {
    const rows = buildRows(`https://chromewebstore.google.com/detail/react-devtools/${id}`, []);
    expect(rows[0]).toMatchObject({ kind: "extension", id: "extensions.install", arg: id });
    // The useless (and non-local) target row is not offered for a store URL.
    expect(rows.some((row) => row.key === "target.typed")).toBe(false);
  });

  it("makes the store install the default row for a raw id", () => {
    expect(buildRows(id, [])[0]).toMatchObject({ id: "extensions.install", arg: id });
  });

  it("offers no store-install row for a non-store query", () => {
    expect(buildRows("install", []).some((row) => row.id === "extensions.install")).toBe(false);
  });

  it("keeps the typed-target row for ordinary input", () => {
    expect(buildRows(":5173", [])[0]).toMatchObject({
      id: "target.navigate",
      key: "target.typed",
    });
  });

  it("lists toggle and remove rows for an installed extension", () => {
    const rows = buildRows("react", [], undefined, undefined, [extension]);
    expect(rows.find((row) => row.id === "extensions.toggle")).toMatchObject({
      arg: id,
      detail: "enabled",
    });
    expect(rows.find((row) => row.id === "extensions.remove")).toMatchObject({ arg: id });
  });

  it("namespaces extension row keys so they cannot collide", () => {
    const rows = buildRows("", [], undefined, undefined, [extension]);
    const keys = rows.filter((row) => row.kind === "extension").map((row) => row.key);
    expect(keys).toContain(`extension:toggle:${id}`);
    expect(keys).toContain(`extension:remove:${id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("palette row identity", () => {
  // Rows are keyed by `key`, not by `id + label`. A key that changes while the
  // row persists makes Vue mount a new element per keystroke, which previously
  // accumulated duplicate rows (specs/005-row-animation-spike).
  it("keeps the typed-target row's key stable while typing", () => {
    const keys = ["d", "de", "dev", "devt"].map((query) => buildRows(query, [])[0]?.key);
    expect(keys).toEqual(["target.typed", "target.typed", "target.typed", "target.typed"]);
  });

  it("changes the typed-target row's label while keeping its id and key", () => {
    const first = buildRows("loc", [])[0];
    const second = buildRows("localhost", [])[0];
    expect(first?.label).not.toBe(second?.label);
    expect(first?.id).toBe("target.navigate");
    expect(second?.id).toBe("target.navigate");
    expect(first?.key).toBe(second?.key);
  });

  it("gives every row a distinct key", () => {
    for (const query of ["", "theme", "devtools"]) {
      const keys = buildRows(query, [{ url: "http://localhost:3000/" }]).map((row) => row.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keys recents by URL so two recents are distinct", () => {
    const rows = buildRows("", [
      { url: "http://localhost:3000/" },
      { url: "http://localhost:5173/" },
    ]);
    const recents = rows.filter((row) => row.kind === "recent");
    expect(recents).toHaveLength(2);
    expect(recents[0]?.key).not.toBe(recents[1]?.key);
    // Both still navigate through the same command id.
    expect(recents.every((row) => row.id === "target.navigate")).toBe(true);
  });

  it("namespaces command keys so they cannot collide with target rows", () => {
    const rows = buildRows("reload", []);
    const command = rows.find((row) => row.id === "view.reload");
    expect(command?.key).toBe("command:view.reload");
  });

  it("keeps command keys stable across queries", () => {
    const before = buildRows("rel", []).find((row) => row.id === "view.reload")?.key;
    const after = buildRows("reload", []).find((row) => row.id === "view.reload")?.key;
    expect(before).toBe(after);
    expect(before).toBe("command:view.reload");
  });
});
