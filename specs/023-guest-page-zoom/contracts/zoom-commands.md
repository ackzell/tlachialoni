# Contract: Zoom Commands and Indicator

This contract fixes the externally observable interface of the feature: the catalog command ids and
accelerators, the dispatch precedence, the one IPC event the shell consumes, and the shell-mode
behavior. It is the reference the implementation and its tests are checked against.

---

## 1. Command catalog additions

Added to `COMMANDS` (`src/shared/commands.ts`), all in the `view` group and all `palette: true`.

| id | label | `acceleratorLabel` | `accelerator` | Applies |
|----|-------|--------------------|---------------|---------|
| `view.zoomIn` | `Zoom In` | `⌘+` | `{ meta: true, code: "Equal", shiftInsensitive: true, menuAccelerator: "CommandOrControl+Plus" }` | one ladder step up |
| `view.zoomOut` | `Zoom Out` | `⌘−` | `{ meta: true, code: "Minus", menuAccelerator: "CommandOrControl+-" }` | one ladder step down |
| `view.zoomReset` | `Reset Zoom` | `⌘0` | `{ meta: true, code: "Digit0", menuAccelerator: "CommandOrControl+0" }` | back to 100% |

**Invariants**:
- Every zoom command is reachable from the palette (Principle III, FR-006) and carries a visible
  accelerator (FR-004, FR-006.3).
- Selecting a palette row and pressing its shortcut produce identical effects (US2 acceptance 2).
- The zoom commands are appended to the `View` `MENU_SECTIONS` entry in `src/main/index.ts`
  (discoverability + DevTools-focus path).

### Accelerator type extension

```ts
export interface Accelerator {
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  code: string; // KeyboardEvent.code
  /** When true, the Shift modifier is not significant for matching. */
  shiftInsensitive?: boolean;
  /** Overrides the OS-menu accelerator string when `code` has no Electron name. */
  menuAccelerator?: string;
}
```

`commandForInput` compares `meta`, `alt`, and `code` exactly, and compares `shift` exactly **unless**
`shiftInsensitive` is set, in which case Shift is ignored.

---

## 2. Dispatch and precedence

Extends `specs/001-minimal-browser/contracts/commands-and-keys.md` §"Dispatch and precedence".

1. Zoom shortcuts are matched by `commandForInput` in the shared dispatcher, so page focus and
   DevTools focus both resolve them (the dispatcher is attached to the site view and, while DevTools
   is open, to the DevTools webContents).
2. Zoom shortcuts are **not** yielded to editable focus (unlike `⌘←`/`⌘→`): a focused text field must
   not defeat page zoom (US1 acceptance 4).
3. The `⌘=` chord (no Shift) is handled by the `before-input-event` path because the OS menu does not
   claim it; the `⌘⇧=` chord (which types `+`) is claimed by the View menu's
   `CommandOrControl+Plus` accelerator. Exactly one of the two paths runs per physical press.
4. A single physical press advances exactly one ladder step in every focus context (page focused,
   DevTools focused). This is a verified invariant, not an assumption (research §6).

---

## 3. IPC contract: `zoom:changed`

Main → shell, one-way, no request/response. Reuses the generic `on` bridge already exposed by
`src/preload/shell.ts`; no new preload API is added.

| Direction | Channel | Payload | Meaning |
|-----------|---------|---------|---------|
| main → shell | `zoom:changed` | `{ percent: number }` | A zoom change occurred; show/refresh the indicator at `percent`. |
| main → shell | `zoom:changed` | `null` | The indicator's lifetime elapsed; hide it. |

**Rules**:
- The event is emitted for **every** zoom change — keyboard or palette, including no-op boundary
  presses and a reset that lands on 100% (edge cases).
- Rapid changes emit `{ percent }` again and restart the display window; a stale `null` must never
  follow a newer `{ percent }` (main serializes them).
- The shell treats the event as presentation only; it never drives the zoom value.

---

## 4. Zoom application contract (main process)

- The guest view's webContents is set to `zoomMode = "isolated"` (NOT `manual` — manual changes the
  value but never repaints the page). Only the guest view is scaled
  (`setZoomFactor(ZOOM_STEPS[zoomIndex])`); the shell view and the DevTools webContents are never
  scaled (FR-010).
- After each top-level navigation commit, the persisted `zoomIndex` is re-applied so the window's
  scale survives navigation.
- Changing the zoom records `zoomIndex` to the window's `WindowRecord` (persisted, per window), but
  debounced (~300 ms after the last change, and on window close) so a gesture never fsyncs per step.
- The three handlers are idempotent with respect to state: applying the same step twice differs by
  exactly two ladder positions; a boundary step leaves `zoomIndex` unchanged.
- The three keyboard commands carry an OS menu accelerator **and** a `before-input-event` accelerator;
  a 20 ms dedupe collapses a single press that arrives on both paths into one step.

---

## 5. Shell-mode contract (transient indicator)

Extends the `desiredShellMode()` machine in `src/main/shell/window.ts`.

| Shell mode | When |
|------------|------|
| `full` | …or `zoomStatus !== null` (in addition to the existing palette / loading / failure / extension-status / history-armed / blank conditions). |
| `band` / `strip` | unchanged otherwise |

**Timeline of one zoom change**:

```
keypress ─▶ main sets zoomStatus, sends `zoom:changed {percent}`, relayout()  ─▶ shell "full"
         ─▶ renderer mounts ZoomIndicator (visible) ─▶ [~1.5 s] main clears zoomStatus,
            sends `zoom:changed null`, relayout(true)  ─▶ renderer leave animation ─▶ settled
            ─▶ shell collapses to the band
```

- The indicator lives in the shell overlay, so the shell must be `full` while it is visible; in the
  default `band` mode the shell covers only the top strip and cannot paint the bottom-right corner.
- The indicator is `pointer-events: none` and `aria-hidden="true"`; it must not block the guest page
  (FR-009). `.shell-root` already defaults to `pointer-events: none`; the indicator does not opt back
  in.
- The collapse is deferred (`relayout(true)`) and completes through the existing settle protocol
  (`notifyShellSettled`), so the leave animation is never cut.
- Under `prefers-reduced-motion`, show/hide are instant; state and timing are otherwise identical.

---

## 6. Persistence contract

- `WindowRecord` gains `zoomIndex: number`; `SCHEMA_VERSION` becomes `4`.
- Absent/invalid values sanitize to `DEFAULT_ZOOM_INDEX` (100%). Older documents upgrade silently,
  exactly like `titlebarMode`.
- New windows created via `WindowManager` start at the default index.

---

## 7. Pointer gesture contract

Gestures are an additional trigger for the *same* zoom operations as the commands; they add no new
zoom model. They are captured **natively** by the `NSEvent` monitor in `native/swipe-navigation`
(never in the guest page), which reports them to JS via `onZoom`; `SwipeNavigation` routes each to the
window under the pointer.

| Input over the guest page | Effect |
|---------------------------|--------|
| Command + wheel up (and Command + two-finger scroll up) | one ladder step up (`view.zoomIn`) |
| Command + wheel down (and Command + two-finger scroll down) | one ladder step down (`view.zoomOut`) |
| Pinch out / spread two fingers | zoom in, accumulating to ladder steps (`view.zoomIn`) |
| Pinch in / bring two fingers together | zoom out, accumulating to ladder steps (`view.zoomOut`) |
| Wheel / two-finger scroll **without** Command | page scroll, unchanged |
| Horizontal two-finger swipe | history navigation, unchanged (specs/015) |

**Rules**:
- The monitor swallows Command + scroll and magnify (including a Command + scroll gesture's momentum),
  so neither reaches the page or the swipe logic.
- A wheel event with no phase/momentum is a mouse notch; a phased stream is a trackpad; the two have
  **opposite `deltaY` signs**, so only the trackpad path is negated.
- Accumulation thresholds: mouse `12`, trackpad `120`, pinch `0.3`; a 160 ms idle resets the leftover.
- A gesture produces the identical level, persistence, and indicator as the equivalent command
  (FR-018); it moves along the discrete ladder and never a continuous factor.
- Gestures apply only when the pointer is over the guest page and DevTools is neither hovered nor
  focused (FR-019); otherwise the gesture is left to DevTools.
- Gestures are accelerators only: the keyboard shortcuts and palette entries stay sufficient to
  reach every level (FR-021, Principle III).
