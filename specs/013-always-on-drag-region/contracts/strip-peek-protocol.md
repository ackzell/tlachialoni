# Contract: Strip Peek Protocol

Defines the runtime interface between the main process, the shell renderer, and the
macOS window controls for the always-on drag region. Peek is transient; nothing here
is persisted.

## Shared predicate (authoritative)

`src/shared/shell.ts`:

```ts
export const DRAG_BAND_HEIGHT = 36;

export function isStripSurfaceVisible(
  state: { stripVisible: boolean; peeking?: boolean },
  paletteOpen: boolean,
): boolean {
  return (state.stripVisible || state.peeking === true) && !paletteOpen;
}
```

- **Consumers**: the shell renderer (whether `DragStrip` mounts) and main
  (`syncWindowButtons`, whether the traffic lights show). Both MUST use this function
  so the two cannot disagree (spec FR-008, 009 FR-004).
- `stripVisible` is the persisted pin (`⌘B`). `peeking` is the transient hover
  reveal. `paletteOpen` still suppresses both.
- Loading veil and failure view are intentionally absent from the predicate: as in
  009, the strip paints above them and the controls track the strip, not the surface
  mode.

## IPC channel

| Channel | Direction | Payload | Frequency |
| --- | --- | --- | --- |
| `strip:peek` | main → shell renderer | `boolean` | On every peek change, and once when the shell becomes ready |

- The payload is a single boolean. It grants no capability and carries no data beyond
  the reveal state.
- The channel is delivered through the existing queued `sendToShell` path, so an
  early peek (before the renderer subscribes) is not lost.
- No new preload method is required: the generic `on(channel, callback)` bridge and
  the `env.d.ts` API already cover it.
- Renderer handling: `useShell` stores the value in a `peeking` ref and exposes it;
  `App.vue` passes it to the shared predicate.

## Proximity tracker contract

`src/main/shell/proximity.ts` — pure, no timers, time injected:

```ts
export interface ProximitySample {
  cursor: { x: number; y: number };   // screen DIP
  bounds: { x: number; y: number; width: number; height: number }; // screen DIP
  now: number;                        // monotonic ms
  paused: boolean;                    // unfocused / full surface
  dragging?: boolean;                 // window move (or future double-click): hold
}

export class ProximityTracker {
  update(sample: ProximitySample): boolean; // returns the new peeking value
  reset(): void;
}
```

Behavior (constants: `proximity` 4, `dwellMs` 400, `graceMs` 600):

| Condition | Result |
| --- | --- |
| `paused` | `peeking = false`; all timers reset |
| `dragging` | current `peeking` held; no reveal, no dismissal |
| Cursor within band and `relY <= proximity` | `peeking = true` immediately |
| Cursor within band, below proximity, for `>= dwellMs` | `peeking = true` |
| Cursor within band while peeking | `peeking` stays `true`; dismissal cancelled |
| Cursor outside band while peeking | starts/continues the grace timer |
| Grace elapsed `>= graceMs` while outside | `peeking = false` |
| Cursor outside band while hidden | `peeking` stays `false` |

"Within band" means `0 <= relX < width` and `0 <= relY < bandHeight`, where
`relX = cursor.x - bounds.x` and `relY = cursor.y - bounds.y`.

## Main lifecycle contract

- The polling interval (`pollMs` = 150) runs for the window's lifetime and is
  cleared only on close; each tick pauses itself when the window is hidden or
  unfocused, and it never runs for a destroyed window. It is deliberately not
  stopped on blur/hide, so moving the window to another macOS Space cannot leave the
  strip permanently unrevealed.
- `paused` is true when any of: the window is not focused; or the palette, loading
  veil, failure view, extension status, or a dev preview is active.
- `dragging` is true for 200ms after a window `move`; while true the tracker holds
  the current peek state (no reveal, no dismissal). When the drag settles, the
  pointer-in-band rule resumes, so a visible strip stays if the pointer is still on
  the titlebar and a hidden one can reveal by the normal hover rules.
- On a peek change, main sends `strip:peek` and re-evaluates the traffic lights via
  the shared predicate.
- `⌘B` (`strip.toggle`) patches `stripVisible`, broadcasts state, and re-evaluates
  the lights; it performs no bounds change and therefore no settle deferral.

## Failure / edge behavior

- If the shell renderer is not ready, `strip:peek` is queued (existing behavior).
- If a peek is in progress and the palette opens, main clears peek (paused), so the
  renderer and lights both hide the strip.
- A window move holds the strip's current state: a hidden strip stays hidden, while
  a visible one stays visible and never dismisses mid-drag; the pointer-in-band rule
  resumes afterwards (FR-016).
- Multi-window: every value and timer in this contract is per `AppWindow`; no
  cross-window channel or shared flag is introduced.
