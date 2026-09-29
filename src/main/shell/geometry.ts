/**
 * Pure window-geometry helpers: where a new window appears, and whether a saved
 * frame is still on a connected display. Kept free of Electron so it is
 * unit-testable (specs/012-multi-window).
 */

import { DEFAULT_HEIGHT, DEFAULT_WIDTH, MIN_HEIGHT, MIN_WIDTH, type Bounds } from "../state/schema";

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function centered(width: number, height: number, area: WorkArea | undefined): Bounds {
  if (!area) return { x: 0, y: 0, width, height };
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

/** Clamps a frame to fit within `area`, never shrinking below the minimum size. */
function clampToArea(bounds: Bounds, area: WorkArea): Bounds {
  const width = Math.max(MIN_WIDTH, Math.min(bounds.width, Math.max(MIN_WIDTH, area.width)));
  const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, Math.max(MIN_HEIGHT, area.height)));
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  return {
    x: Math.min(Math.max(bounds.x, area.x), maxX),
    y: Math.min(Math.max(bounds.y, area.y), maxY),
    width,
    height,
  };
}

function intersects(bounds: Bounds, area: WorkArea): boolean {
  return (
    bounds.x < area.x + area.width &&
    bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height &&
    bounds.y + bounds.height > area.y
  );
}

/**
 * Places a newly created window. With a source frame, the new window is offset so
 * it does not perfectly occlude its parent (FR-016); without one it is centered.
 */
export function cascadeBounds(from: Bounds | null, area: WorkArea, offset = 32): Bounds {
  if (!from) return centered(DEFAULT_WIDTH, DEFAULT_HEIGHT, area);
  return clampToArea(
    {
      x: from.x + offset,
      y: from.y + offset,
      width: from.width,
      height: from.height,
    },
    area,
  );
}

/** Whether two frames are identical in both position and size. */
export function framesEqual(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Whether a saved frame is still usable: it must intersect a connected display's
 * work area. Missing or off-screen frames fall back to a visible default
 * (FR-017); a usable frame keeps its position but is clamped to the minimum size.
 */
export function ensureVisibleBounds(bounds: Bounds | null, areas: WorkArea[]): Bounds {
  if (!bounds) return centered(DEFAULT_WIDTH, DEFAULT_HEIGHT, areas[0]);
  const clamped: Bounds = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(MIN_WIDTH, bounds.width),
    height: Math.max(MIN_HEIGHT, bounds.height),
  };
  if (areas.some((area) => intersects(clamped, area))) return clamped;
  return centered(DEFAULT_WIDTH, DEFAULT_HEIGHT, areas[0]);
}
