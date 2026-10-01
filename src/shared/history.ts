/**
 * History-navigation types shared by the main process and the shell renderer
 * (specs/015-trackpad-swipe-navigation).
 *
 * The armed signal is transient: main owns it, pushes it on the `history:armed`
 * channel, and the renderer mounts the edge overlay from the same predicate main
 * uses to grow the shell, so the surface and its render condition cannot drift
 * (mirrors 009 FR-004).
 */

/** Which way a swipe would move history. */
export type HistoryDirection = "back" | "forward";

/** A live "navigation is armed" signal: which way, and how close to committing. */
export interface HistoryArmed {
  direction: HistoryDirection;
  /** 0 at the arm distance, 1 at the commit distance. */
  progress: number;
}

/**
 * Whether the armed navigation overlay should be visible: it shows only while a
 * gesture is armed, and the command palette suppresses it (the palette owns the
 * window while it is open).
 */
export function isHistoryArmedVisible(armed: HistoryArmed | null, paletteOpen: boolean): boolean {
  return armed !== null && !paletteOpen;
}
