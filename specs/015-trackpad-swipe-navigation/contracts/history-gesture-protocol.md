# Contract: History Gesture Protocol

Defines the runtime interface between the Electron input stream, the main-process
gesture detector, and the shell renderer for two-finger history navigation. Every
value here is transient; nothing is persisted.

## Shared type and predicate (authoritative)

`src/shared/history.ts`:

```ts
export type HistoryDirection = "back" | "forward";

export interface HistoryArmed {
  direction: HistoryDirection;
  /** 0 at the arm distance, 1 at the commit distance. */
  progress: number;
}

export function isHistoryArmedVisible(
  armed: HistoryArmed | null,
  paletteOpen: boolean,
): boolean {
  return armed !== null && !paletteOpen;
}
```

- **Consumers**: the shell renderer (whether `HistoryOverlay` mounts) and main
  (`desiredShellMode`, whether the overlay forces the shell to `full`). Both MUST use
  this function so the two cannot disagree (mirrors 009 FR-004).
- The palette suppresses the overlay; the loading veil, failure view, extension
  status, and dev previews also suppress it because detection is paused while they
  own input, so arm is already `null`.
- Direction fixes the edge: `back` → left edge, `forward` → right edge.

## IPC channel

| Channel | Direction | Payload | Frequency |
| --- | --- | --- | --- |
| `history:armed` | main → shell renderer | `HistoryArmed \| null` | On every arm/direction change and once when the shell becomes ready |

- The payload is an inert `{ direction, progress }` object or `null`. It grants no
  capability and carries no page data.
- Delivered through the existing queued `sendToShell` path, so an arm that precedes
  the renderer subscription is not lost; no new preload method is required (the
  generic `on(channel, callback)` bridge already covers it).
- Renderer handling: `useShell` stores the value in a `historyArmed` ref and exposes
  it; `App.vue` passes it through `isHistoryArmedVisible`.

## Detector contract

`src/main/shell/history-gesture.ts` — pure, no timers, time injected:

```ts
export interface GestureSample {
  deltaX: number;      // normalized: positive = toward Back
  deltaY: number;
  scrollable: boolean; // overscroll gate: true = page consumed the scroll
  canGoBack: boolean;
  canGoForward: boolean;
  now: number;         // monotonic ms
}

export interface GestureOutcome {
  armed: HistoryDirection | null;
  commit: HistoryDirection | null;
}

export class HistoryGesture {
  begin(): void;
  update(sample: GestureSample): GestureOutcome;
  end(): GestureOutcome;
  reset(): GestureOutcome;
}
```

Behavior (constants: `dominantRatio`, `armDistance`, `commitDistance >
armDistance`, `releaseOffset < armDistance`, `idleMs`, `swipeGuardMs`):

| Condition | Result |
| --- | --- |
| Not dominant-horizontal (`|sumX| <= |sumY| * dominantRatio`) | no arm, no commit |
| `scrollable === true` (gate available) | no arm, no commit |
| Dominant-horizontal, past `armDistance`, history in direction | `armed = direction`, `progress ∈ [0,1]` |
| History unavailable in the direction | no arm (FR-008) |
| Past `commitDistance` and `committed === false` | `commit = direction` once; arm clears |
| Further travel after commit | no further commit until the next `begin()` |
| `end()` | arm clears; no commit |
| Reversal below `releaseOffset` | arm clears without commit |
| `reset()` | arm clears, accumulators reset, a fresh `begin()` is required |

The controller is fed by the main-process adapter, which maps the Electron stream to
these calls; it never sees Electron event objects.

## Input adapter contract (`src/main/shell/window.ts`)

- Source: `siteView.webContents.on("input-event", handler)`.
- Accept only trackpad input: precise `mouseWheel` (`hasPreciseScrollingDeltas`) and
  the `gestureScrollBegin` / `gestureScrollUpdate` / `gestureScrollEnd` phases.
  `deltaX` / `deltaY` / `canScroll` are read by direct property access (native
  getters; not visible to `JSON.stringify`, per `specs/002-trackpad-navigation`).
- Normalize the platform sign so `deltaX > 0` means toward Back (the M0 spike fixes
  the constant); feed `begin()` on a begin/idle-start, `update()` per event, and
  `end()` on an explicit end, `gestureFlingStart`, or `idleMs` of silence.
- Non-precise (mouse-wheel) input and `gesturePinch*` / touch events are ignored.
- `scrollable` is derived from `canScroll` when present; when the spike shows it is
  unreliable, the adapter reports `true`/`false` per the fallback rule and the
  dominant-axis + distance + single-fire guards carry the protection.

## Main lifecycle contract

- On an `armed` change: store it, `sendToShell("history:armed", armed)`, and
  `relayout()` — growing the shell to `full` at once when armed and deferring the
  shrink through the settle protocol when cleared.
- On `commit`: run the existing `view.back` / `view.forward` command (the same path
  as `⌘←`/`⌘→` and the mouse buttons), then clear the arm.
- `reset()` (arm cleared, no navigation) on: `win` `blur`, `hide`, and `close`; a
  guest `did-navigate` / `did-navigate-in-page`; the palette opening; a loading veil,
  failure view, extension status, or dev preview taking the window; and window
  teardown. The `input-event` listener is removed on close.
- The existing `win.on("swipe")` navigation is guarded: a `swipe` arriving within
  `swipeGuardMs` of a trackpad gesture stream is ignored (the detector already owns
  it); a discrete mouse-driver `swipe` still navigates. `app-command` is unchanged.
- Every value in this contract is per `AppWindow`.

## Failure / edge behavior

- If the shell renderer is not ready, `history:armed` is queued (existing behavior).
- If history is unavailable in the swiped direction, the gesture is treated as an
  ordinary scroll and no overlay appears (FR-008).
- If focus is inside docked DevTools, the scroll is delivered to DevTools'
  webContents, which this listener does not observe, so guest history is not moved
  (FR-016).
- A window losing focus mid-gesture resets and clears the overlay (FR-006).
- A margin-jitter gesture near `armDistance` does not strobe: `releaseOffset`
  provides hysteresis.
- Reduced motion only changes the overlay's appear/clear transition; navigation
  behavior and end states are identical.
