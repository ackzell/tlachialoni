import { describe, expect, it } from "vitest";
import { isStripSurfaceVisible } from "@shared/shell";

describe("isStripSurfaceVisible", () => {
  it("shows the strip when it is toggled on and no palette is open", () => {
    expect(isStripSurfaceVisible({ stripVisible: true }, false)).toBe(true);
  });

  it("hides the strip when it is toggled off", () => {
    expect(isStripSurfaceVisible({ stripVisible: false }, false)).toBe(false);
  });

  it("hides the strip while the command palette is open", () => {
    expect(isStripSurfaceVisible({ stripVisible: true }, true)).toBe(false);
  });

  it("ignores other state fields", () => {
    const state = { stripVisible: true, target: "http://localhost:3000/" };
    expect(isStripSurfaceVisible(state, false)).toBe(true);
  });
});
