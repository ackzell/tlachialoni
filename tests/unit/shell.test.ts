import { describe, expect, it } from "vitest";
import {
  DRAG_BAND_HEIGHT,
  STRIP_HEIGHT,
  isBlankSurfaceVisible,
  isStripSurfaceVisible,
  titlebarInset,
} from "@shared/shell";

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

describe("isStripSurfaceVisible with titlebar mode", () => {
  it("shows the strip whenever titlebar mode is on", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, titlebarMode: true }, false)).toBe(true);
  });

  it("keeps the strip while the command palette is open in titlebar mode", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, titlebarMode: true }, true)).toBe(true);
  });

  it("does not require a pin or a peek in titlebar mode", () => {
    expect(
      isStripSurfaceVisible({ stripVisible: false, peeking: false, titlebarMode: true }, false),
    ).toBe(true);
  });

  it("falls back to the overlay rule when titlebar mode is off", () => {
    expect(isStripSurfaceVisible({ stripVisible: false, titlebarMode: false }, false)).toBe(false);
    expect(isStripSurfaceVisible({ stripVisible: true, titlebarMode: false }, true)).toBe(false);
    expect(
      isStripSurfaceVisible({ stripVisible: false, peeking: true, titlebarMode: false }, true),
    ).toBe(false);
  });
});

describe("DRAG_BAND_HEIGHT", () => {
  it("stays thin so the page below the top edge stays clickable", () => {
    expect(DRAG_BAND_HEIGHT).toBe(10);
  });
});

describe("STRIP_HEIGHT", () => {
  it("is tall enough for the painted strip and taller than the band", () => {
    expect(STRIP_HEIGHT).toBe(30);
    expect(STRIP_HEIGHT).toBeGreaterThan(DRAG_BAND_HEIGHT);
  });
});

describe("titlebarInset", () => {
  it("insets the guest content by the strip height in titlebar mode", () => {
    expect(titlebarInset(true)).toBe(STRIP_HEIGHT);
  });

  it("is zero in the default overlay layout", () => {
    expect(titlebarInset(false)).toBe(0);
  });
});

describe("isBlankSurfaceVisible", () => {
  it("shows the blank surface when the window has no target", () => {
    expect(isBlankSurfaceVisible({ target: null })).toBe(true);
  });

  it("hides the blank surface once a target is set", () => {
    expect(isBlankSurfaceVisible({ target: "http://localhost:3000/" })).toBe(false);
  });

  it("treats a missing target as blank", () => {
    expect(isBlankSurfaceVisible({} as { target: string | null })).toBe(true);
  });
});
