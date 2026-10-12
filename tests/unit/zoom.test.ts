import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM_INDEX,
  ZOOM_STEPS,
  clampZoomIndex,
  stepZoom,
  zoomFactor,
  zoomPercent,
} from "../../src/shared/zoom";

describe("zoom ladder", () => {
  it("is the browser-standard 25%–500% ladder with 100% as the default", () => {
    expect(ZOOM_STEPS[0]).toBe(0.25);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(5);
    expect(ZOOM_STEPS[DEFAULT_ZOOM_INDEX]).toBe(1);
  });

  it("reports every step as a whole-number percentage", () => {
    expect(zoomPercent(DEFAULT_ZOOM_INDEX)).toBe(100);
    expect(ZOOM_STEPS.map(zoomPercent).every((percent) => Number.isInteger(percent))).toBe(true);
  });
});

describe("clampZoomIndex", () => {
  it("clamps out-of-range values and rounds fractional ones", () => {
    expect(clampZoomIndex(-3)).toBe(0);
    expect(clampZoomIndex(999)).toBe(ZOOM_STEPS.length - 1);
    expect(clampZoomIndex(7.4)).toBe(7);
  });

  it("falls back to the default for a non-number", () => {
    expect(clampZoomIndex(Number.NaN)).toBe(DEFAULT_ZOOM_INDEX);
    expect(clampZoomIndex("nope" as unknown as number)).toBe(DEFAULT_ZOOM_INDEX);
  });
});

describe("stepZoom", () => {
  it("moves one step and clamps at both ends", () => {
    expect(stepZoom(DEFAULT_ZOOM_INDEX, 1)).toBe(DEFAULT_ZOOM_INDEX + 1);
    expect(stepZoom(DEFAULT_ZOOM_INDEX, -1)).toBe(DEFAULT_ZOOM_INDEX - 1);
    expect(stepZoom(0, -1)).toBe(0);
    expect(stepZoom(ZOOM_STEPS.length - 1, 1)).toBe(ZOOM_STEPS.length - 1);
  });

  it("supports a multi-step move (one mouse notch)", () => {
    expect(stepZoom(DEFAULT_ZOOM_INDEX, 2)).toBe(DEFAULT_ZOOM_INDEX + 2);
    expect(stepZoom(0, 5)).toBe(5);
  });
});

describe("zoomFactor", () => {
  it("returns a ladder member, clamped at both ends", () => {
    expect(zoomFactor(DEFAULT_ZOOM_INDEX)).toBe(1);
    expect(zoomFactor(-1)).toBe(ZOOM_STEPS[0]);
    expect(zoomFactor(999)).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  });
});
