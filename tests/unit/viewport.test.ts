import { describe, expect, it } from "vitest";
import {
  formatViewportSize,
  normalizeViewportSize,
  viewportSizeEquals,
} from "../../src/shared/viewport";

describe("formatViewportSize", () => {
  it("renders width × height with the multiplication sign", () => {
    expect(formatViewportSize({ width: 1280, height: 720 })).toBe("1280 × 720");
  });

  it("rounds fractional pixels to whole numbers", () => {
    expect(formatViewportSize({ width: 1280.4, height: 720.6 })).toBe("1280 × 721");
  });

  it("clamps non-finite and negative values to zero", () => {
    expect(formatViewportSize({ width: Number.NaN, height: -10 })).toBe("0 × 0");
    expect(formatViewportSize({ width: Number.POSITIVE_INFINITY, height: 480 })).toBe("0 × 480");
  });
});

describe("normalizeViewportSize", () => {
  it("returns whole non-negative pixels", () => {
    expect(normalizeViewportSize({ width: 100.5, height: -3 })).toEqual({ width: 101, height: 0 });
  });
});

describe("viewportSizeEquals", () => {
  it("is true for identical sizes", () => {
    expect(viewportSizeEquals({ width: 800, height: 600 }, { width: 800, height: 600 })).toBe(true);
  });

  it("is false when either side differs or is null", () => {
    expect(viewportSizeEquals({ width: 800, height: 600 }, { width: 800, height: 601 })).toBe(
      false,
    );
    expect(viewportSizeEquals(null, { width: 800, height: 600 })).toBe(false);
    expect(viewportSizeEquals(null, null)).toBe(true);
  });
});
