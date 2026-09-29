import { describe, expect, it } from "vitest";
import {
  cascadeBounds,
  ensureVisibleBounds,
  framesEqual,
  type WorkArea,
} from "../../src/main/shell/geometry";

const area: WorkArea = { x: 0, y: 0, width: 2000, height: 1200 };

describe("cascadeBounds", () => {
  it("offsets a new window from its parent so it does not perfect-occlude it", () => {
    const parent = { x: 100, y: 100, width: 800, height: 600 };
    expect(cascadeBounds(parent, area)).toEqual({ x: 132, y: 132, width: 800, height: 600 });
  });

  it("centers a new window when there is no parent", () => {
    expect(cascadeBounds(null, area)).toEqual({
      x: 280,
      y: 150,
      width: 1440,
      height: 900,
    });
  });

  it("keeps the cascaded window inside the work area", () => {
    const parent = { x: 1600, y: 900, width: 800, height: 600 };
    const cascaded = cascadeBounds(parent, area);
    expect(cascaded.x + cascaded.width).toBeLessThanOrEqual(area.width);
    expect(cascaded.y + cascaded.height).toBeLessThanOrEqual(area.height);
  });
});

describe("ensureVisibleBounds", () => {
  it("keeps a saved frame that intersects a display", () => {
    const saved = { x: 100, y: 100, width: 800, height: 600 };
    expect(ensureVisibleBounds(saved, [area])).toEqual(saved);
  });

  it("falls back to a visible default for a missing frame", () => {
    const bounds = ensureVisibleBounds(null, [area]);
    expect(bounds).toMatchObject({ width: 1440, height: 900 });
    expect(bounds.x).toBeGreaterThanOrEqual(area.x);
    expect(bounds.y).toBeGreaterThanOrEqual(area.y);
  });

  it("recenters a frame that is off every display", () => {
    const offscreen = { x: 5000, y: 5000, width: 800, height: 600 };
    const bounds = ensureVisibleBounds(offscreen, [area]);
    expect(bounds).toEqual({ x: 280, y: 150, width: 1440, height: 900 });
  });

  it("clamps width and height to the minimum size", () => {
    const tiny = { x: 10, y: 10, width: 10, height: 10 };
    expect(ensureVisibleBounds(tiny, [area])).toEqual({
      x: 10,
      y: 10,
      width: 480,
      height: 360,
    });
  });
});

describe("framesEqual", () => {
  it("is true for identical position and size", () => {
    expect(
      framesEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 }),
    ).toBe(true);
  });

  it("is false when macOS repositioned the frame", () => {
    expect(
      framesEqual(
        { x: 2208, y: 217, width: 1440, height: 900 },
        { x: 2411, y: 320, width: 1440, height: 900 },
      ),
    ).toBe(false);
  });
});
