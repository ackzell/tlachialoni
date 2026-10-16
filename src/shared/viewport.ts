/**
 * The viewport-size model shared by the main process and tests (specs/024).
 *
 * The indicator reports the guest page's layout viewport in CSS pixels — the same
 * quantity the built-in DevTools resize readout shows — so the two always agree.
 * Only formatting/clamping lives here, keeping `window.ts` thin and the value
 * testable without Electron.
 */

/** A guest page layout viewport, in whole CSS pixels. */
export interface ViewportSize {
  /** Content-area width. */
  width: number;
  /** Content-area height. */
  height: number;
}

/**
 * Coerces any read to a valid size: whole, non-negative pixels. Guards the
 * indicator against ever rendering `NaN` or a negative dimension.
 */
export function normalizeViewportSize(size: { width: number; height: number }): ViewportSize {
  return {
    width: clampDimension(size.width),
    height: clampDimension(size.height),
  };
}

/** The rendered text, e.g. `1280 × 720` (multiplication sign U+00D7). */
export function formatViewportSize(size: { width: number; height: number }): string {
  const { width, height } = normalizeViewportSize(size);
  return `${width} × ${height}`;
}

/**
 * Whether two reads are the same size, so a redundant resize that does not change
 * the size never re-shows or flickers the indicator. `null` compares by identity.
 */
export function viewportSizeEquals(a: ViewportSize | null, b: ViewportSize | null): boolean {
  if (a === null || b === null) return a === b;
  return a.width === b.width && a.height === b.height;
}

function clampDimension(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
