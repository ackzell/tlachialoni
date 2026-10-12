/**
 * The single zoom model shared by the main process and tests (specs/023).
 *
 * Zoom is a discrete index into a fixed ladder of browser-standard factors, so
 * every input — keyboard, palette, Command + wheel, or a trackpad pinch — lands
 * on the same recognizable percentage and persists exactly. Chromium clamps
 * `setZoomFactor` to 0.25–5.0, which is exactly this ladder's range.
 */

export const ZOOM_STEPS: readonly number[] = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
];

/** 100%. */
export const DEFAULT_ZOOM_INDEX = ZOOM_STEPS.indexOf(1);

/** Coerces any value to a valid ladder index, falling back to the default. */
export function clampZoomIndex(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_ZOOM_INDEX;
  return Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(value)));
}

/** The rendering factor for a ladder index (`zoomPercent / 100`). */
export function zoomFactor(index: number): number {
  return ZOOM_STEPS[clampZoomIndex(index)]!;
}

/** The whole-number percentage shown by the indicator. */
export function zoomPercent(index: number): number {
  return Math.round(zoomFactor(index) * 100);
}

/** Moves `delta` steps along the ladder, clamping at both ends. */
export function stepZoom(index: number, delta: number): number {
  return clampZoomIndex(clampZoomIndex(index) + delta);
}
