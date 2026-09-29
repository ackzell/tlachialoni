/**
 * Shell-surface predicates shared by the main process and the shell renderer.
 *
 * The strip's visibility is the one piece of shell state both sides must agree
 * on: the renderer mounts `DragStrip` from it, and main mirrors it to show or
 * hide macOS's native traffic lights. A strip is on screen when it is pinned
 * (`⌘B`, persisted) or transiently revealed by the pointer (specs/013), and the
 * palette always suppresses it. Keeping the rule here means the surface and its
 * controls can never drift apart.
 */

/**
 * Height of the always-available transparent drag band at the top of the window.
 * It matches the strip height; the CSS in `DragBand.vue` must stay in step.
 */
export const DRAG_BAND_HEIGHT = 36;

/** Whether the target `state` should have the strip surface on screen. */
export function isStripSurfaceVisible(
  state: { stripVisible: boolean; peeking?: boolean },
  paletteOpen: boolean,
): boolean {
  return (state.stripVisible || state.peeking === true) && !paletteOpen;
}

/**
 * Whether a window is the blank "new page": one that has never loaded a target
 * (a fresh New Window or a restored window that never had one). Main keeps the
 * shell full-window in this state so the blank surface stays painted after the
 * location palette is dismissed, and the renderer mounts that surface from this
 * same predicate, so the two can never drift.
 */
export function isBlankSurfaceVisible(state: { target: string | null }): boolean {
  return state.target == null;
}
