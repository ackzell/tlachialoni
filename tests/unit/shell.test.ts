import { describe, expect, it } from "vitest";
import { DRAG_BAND_HEIGHT, isStripSurfaceVisible } from "@shared/shell";

describe("isStripSurfaceVisible", () => {
  it("shows the strip when it is pinned and no palette is open", () => {
    expect(isStripSurfaceVisible({ stripVisible: true }, false)).toBe(true);
  });

  it("hides the strip when it is not pinned and not peeking", () => {
    expect(isStripSurfaceVisible({ stripVisible: false }, false)).toBe(false);
  });

  it("hides the strip while the command palette is open", () => {
    expect(isStripSurfaceVisible({ stripVisible: true }, true)).toBe(false);
  });

  it("shows the strip while it is peeking, even when not pinned", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, peeking: true }, false)).toBe(true);
  });

  it("shows the strip when it is both pinned and peeking", () => {
    expect(isStripSurfaceVisible({ stripVisible: true, peeking: true }, false)).toBe(true);
  });

  it("hides a peek while the command palette is open", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, peeking: true }, true)).toBe(false);
  });

  it("does not let peeking: false force visibility", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, peeking: false }, false)).toBe(false);
  });

  it("treats a missing peeking field as not peeking", () => {
    expect(isStripSurfaceVisible({ stripVisible: false }, false)).toBe(false);
  });

  it("ignores other state fields", () => {
    const state = { stripVisible: true, target: "http://localhost:3000/", peeking: false };
    expect(isStripSurfaceVisible(state, false)).toBe(true);
  });
});

describe("DRAG_BAND_HEIGHT", () => {
  it("matches the strip height the shell renders", () => {
    expect(DRAG_BAND_HEIGHT).toBe(36);
  });
});
