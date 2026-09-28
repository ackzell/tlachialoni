/**
 * Shell-surface predicates shared by the main process and the shell renderer.
 *
 * The drag strip's visibility is the one piece of shell state both sides must
 * agree on: the renderer mounts `DragStrip` from it, and main mirrors it to show
 * or hide macOS's native traffic lights (specs/009-macos-traffic-lights). Keeping
 * the rule here means the surface and its controls can never drift apart.
 */

/** Whether the target `state` should have the drag strip surface on screen. */
export function isStripSurfaceVisible(
  state: { stripVisible: boolean },
  paletteOpen: boolean,
): boolean {
  return state.stripVisible && !paletteOpen;
}
