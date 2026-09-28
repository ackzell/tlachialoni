import { describe, expect, it } from "vitest";
import { buildRows, fuzzyScore } from "../../src/renderer/src/composables/useCommands";

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
