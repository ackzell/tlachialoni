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
