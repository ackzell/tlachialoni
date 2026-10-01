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
 * It is intentionally thin: it is both the draggable region and the pointer-proximity
 * trigger, so keeping it short leaves the guest page clickable just below the top
 * edge. The CSS in `DragBand.vue` must stay in step.
 */
export const DRAG_BAND_HEIGHT = 10;

/**
 * Height of the painted strip surface (target + controls) when it is shown. The
 * shell overlay grows from `DRAG_BAND_HEIGHT` to this while the strip is pinned or
 * peeking, so the strip renders in full instead of being clipped, then shrinks back
 * when it is dismissed. The CSS in `DragStrip.vue` must stay in step.
 */
export const STRIP_HEIGHT = 30;

/** Whether the target `state` should have the strip surface on screen. */
export function isStripSurfaceVisible(
  state: { stripVisible: boolean; peeking?: boolean; titlebarMode?: boolean },
  paletteOpen: boolean,
): boolean {
  // Titlebar mode docks the strip permanently (specs/016): it is always on screen,
  // including over full-window surfaces, so the pin/peek and palette-suppression
  // rules do not apply.
  if (state.titlebarMode === true) return true;
  return (state.stripVisible || state.peeking === true) && !paletteOpen;
}

/**
 * Vertical inset of the guest content when the strip is docked (titlebar mode);
 * zero in the default overlay. Main insets the site view by this and the renderer
 * offsets its full-window surfaces by the same value, so the page always begins
 * below the strip and nothing is covered.
 */
export function titlebarInset(titlebarMode: boolean): number {
  return titlebarMode ? STRIP_HEIGHT : 0;
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
