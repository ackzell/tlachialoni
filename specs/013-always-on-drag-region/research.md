# Phase 0 Research: Always-On Drag Region

The Technical Context had no `NEEDS CLARIFICATION` markers: the runtime, storage,
and shell architecture are fixed by 001/004/009/012, and the product decisions were
resolved while specifying (band height 36px; proximity ≤4px and dwell ≥400ms to
reveal; 600ms grace to dismiss; traffic lights track the strip surface including a
peek; `⌘B` remains the sticky pin; sensing by a main-process cursor check). The
decisions below are the implementation choices that follow, plus the two spike
items that must be retired before UI work.

## 1. Sensing the pointer without a `no-drag` sensor strip

- **Decision**: a main-process proximity check polls `screen.getCursorScreenPoint()`
  and compares it with `win.getContentBounds()` at ~150ms while the window is focused
  and visible. Reveal on `atEdge` (≤4px) or `inBand` dwell (≥400ms); dismiss 600ms
  after leaving the band.
- **Rationale**: Electron's docs state that draggable areas ignore *all* pointer
  events — "a button element that overlaps a draggable region will not emit mouse
  clicks or mouse enter/exit events." A renderer-only sensor therefore cannot see the
  pointer over the band, and a thin `no-drag` sensor would create a drag dead zone at
  the very top plus a strip that dismisses while its controls are used. Polling keeps
  the whole band draggable and lets the strip stay open while the pointer is anywhere
  in it. The cost is one cheap native coordinate read and four integer comparisons at
  ~6.7Hz, scoped to a focused window and stopped on blur/hide/close.
- **Alternatives considered**:
  - *Thin `no-drag` sensor strip at the top* (rejected: 4px drag dead zone, and the
    strip dismisses as soon as the pointer moves down to its own controls).
  - *JS-driven window drag* (rejected: no Electron API to start a native window drag,
    and `setBounds`-per-mousemove is janky under fast movement, which is worse than
    the documented native region).
  - *Renderer hover on the band* (rejected by the pointer-events rule above).
  - *A native global mouse monitor* (rejected: a new native dependency for something
    a 150ms interval covers).

## 2. Shell modes: keep the overlay visible as a band

- **Decision**: replace the `hidden` shell mode with a permanent `band` mode. The
  shell view is `{0, 0, width, DRAG_BAND_HEIGHT}` and visible whenever no full-window
  surface is up; `full` still covers the window for palette/veil/failure/status.
  `stripVisible` no longer selects a mode; it selects what the renderer paints inside
  the band (pinned vs hidden), alongside the transient peek.
- **Rationale**: the draggable region must exist whenever the user can drag, so the
  view that hosts it cannot be hidden. Collapsing the two states (`strip`/`hidden`)
  into one `band` mode also removes a whole class of relayout/settle coordination for
  the strip: hiding the strip is now a renderer transition only, with no bounds
  change. The settle protocol is retained solely for `full → band` collapses.
- **Alternatives considered**:
  - *Keep `hidden` and hide the view, toggling it visible on a timer for drag*
    (rejected: the view must already be visible to receive the mouse-down that starts
    a drag; showing it on hover is the same overlay cost without the reliability).
  - *A second, always-on view just for the band* (rejected: two shell views render
    the same strip and would need their own coordination for no benefit).

## 3. Peek as transient state on a dedicated channel

- **Decision**: peek is a boolean owned by main and pushed on a new
  `strip:peek` channel. The renderer holds it in `useShell` and combines it with
  `state.stripVisible` through the shared `isStripSurfaceVisible` predicate. Peek is
  never added to `state:changed`, `getState()`, or the persisted record.
- **Rationale**: 012 deliberately froze the renderer's `state:changed` shape as the
  window record view. Peek is ephemeral and has nothing to do with the record, so
  keeping it off that channel avoids a schema question and keeps restored state
  unambiguous. The shared predicate still guarantees the renderer's strip and main's
  traffic lights cannot disagree (009 FR-004).
- **Alternatives considered**: add `peeking` to the state view (rejected: it is not
  state and would invite persisting it); a per-window IPC `invoke` poll from the
  renderer (rejected: push is already the pattern and avoids extra IPC).

## 4. Traffic lights track a peek

- **Decision**: extend `isStripSurfaceVisible` to
  `(state.stripVisible || state.peeking) && !paletteOpen`, and have main call it in
  `syncWindowButtons`. Lights therefore appear during a peek and leave when it ends.
- **Rationale**: spec Q2 chose consistency with 009 — the lights belong to the strip
  surface, and a peek is a strip surface. Reserving the left inset only while the
  strip is visible (already the behavior) keeps the band full-width when there are no
  lights.
- **Alternatives considered**: lights only for the pinned strip (rejected by the spec
  decision, and it would make the peeked strip look different from the pinned one).

## 5. Keyboard completeness and constitution I

- **Decision**: the band and peek are accelerators; `⌘B` (pin) and the palette remain
  the complete keyboard paths. Carry a PATCH-level clarification to Principle I that
  "chrome" means painted surfaces and that an invisible, pointer-only drag region is
  allowed.
- **Rationale**: Principle III forbids a capability that depends on discovering a
  hidden mouse target; here nothing is *only* reachable by mouse — dragging, showing
  the strip, and every command remain keyboard-reachable. Principle I's zero-pixel
  claim holds because the band paints nothing; the clarification removes the ambiguity
  between "surface" and "interaction region."
- **Alternatives considered**: do nothing and rely on interpretation (rejected: the
  principle names the drag strip specifically, so leaving it unamended invites a
  future reviewer to read this as a violation).

## 6. Spike: cursor proximity at the edge and across displays

- **Decision (to retire in M0)**: validate that `screen.getCursorScreenPoint()` and
  `win.getContentBounds()` agree at the top screen edge, on a secondary display, and
  under Retina scaling, and that a 150ms interval is responsive enough for SC-002.
- **Rationale**: the whole reveal/dismiss behavior rests on this comparison. If it is
  unreliable, the documented fallback is a `no-drag` sensor strip with the known
  dead-zone/dismissal trade-off, and the plan's interaction promise is adjusted.
- **Alternatives considered**: none that remove the native call — this is the
  cheapest reliable probe available without a new dependency.

## 7. Spike: double-click-to-zoom in a drag region

- **Decision (to retire in M0)**: determine empirically whether macOS applies its
  title-bar double-click preference to a custom `app-region: drag` region. If it
  does, FR-013 is free. If not, FR-013 is dropped; a JS `dblclick` cannot be used
  because the region ignores pointer events.
- **Rationale**: FR-013 is a SHOULD and must not be faked. A `no-drag` hit area for
  double-click would break the core drag requirement, so dropping the behavior is the
  honest outcome.
- **Alternatives considered**: a hidden `no-drag` double-click zone (rejected: it
  reintroduces the drag dead zone this feature exists to remove).

## 8. Lifecycle, pause, and multi-window safety

- **Decision**: the sensor interval runs for the window's lifetime and is cleared
  only on close. Each tick pauses itself when the window is hidden or unfocused, and
  also while a full surface (palette, loading, failure, extension status, dev
  preview) is up; a separate `dragging` flag is true for ≤200ms after a `move`. When
  paused, peek clears and the tracker resets; when dragging, the tracker holds the
  current peek state (it neither reveals a hidden strip nor dismisses a visible one),
  then normal pointer rules resume once the drag settles. Every window owns its own
  tracker and peek flag.
- **Rationale**: macOS moves a window to another Space without reliably re-emitting
  `focus`/`show`, so tearing the sampler down on `blur`/`hide` left the strip
  permanently unrevealed after a Space change until the window was refocused. Keeping
  one cheap timer alive and pausing inside the tick is self-healing and still costs
  nothing while the window is hidden or unfocused.
- **Alternatives considered**: keep the interval always running and let the tracker
  ignore inputs (rejected: pointless wakeups for a background window); force the
  strip revealed during a drag (rejected by the user: a drag must not create a
  titlebar that was not already showing).
