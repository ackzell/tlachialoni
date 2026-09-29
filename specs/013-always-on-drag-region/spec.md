# Feature Specification: Always-On Drag Region

**Feature Branch**: `013-always-on-drag-region`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "after some use, realized that the dragstrip only being available when toggling the "titlebar" on and off is not a great experience. I would rather be able to drag the window no matter if the strip is visible or not. this frees me from having to first use the key bind to show it and then dragging it when it is not visible. if there are alternatives I want to hear them but I think with a "transparent drag strip" that is generous in size at the top of the window should be a good solution for this: one handed only the mouse required to drag the window around"

## Context

Today the window can only be moved while the drag strip is visible. The strip is
toggled with `⌘B` (`strip.toggle`), and in every other moment the shell overlay is
hidden entirely, so no draggable region exists and the frameless window cannot be
moved. Reaching for the window position therefore costs two steps: a keyboard
toggle to reveal the strip, then a drag. That is the friction this feature
removes.

The feature introduces a permanent, fully transparent drag band across the top of
the window. Dragging works at all times, with the pointer alone, whether the strip
is hidden, peeking, or pinned. In addition, the familiar strip (target and
controls) reveals itself on hover — either when the pointer comes very close to the
top edge or after it dwells in the band — and recedes when the pointer leaves. The
`⌘B` toggle is repurposed as a sticky pin that keeps the strip on screen.

Because a draggable region swallows pointer events, the band cannot itself sense
the pointer; a small proximity check owned by the main process provides the reveal
and dismissal signals (see Assumptions and Dependencies).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Move the window at any time, pointer only (Priority: P1)

The developer wants to reposition the window while working. Without touching the
keyboard, they move the pointer to the top of the window, press, and drag; the
window follows. This works whether the strip was hidden, peeking, or pinned.

**Why this priority**: This is the request. It removes the keyboard toggle from
the core window-management action and makes the chromeless window behave like any
other Mac window.

**Independent Test**: Cold-launch, leave the strip hidden, press inside the top
band and drag the window to a new position. Repeat with the strip pinned with
`⌘B`, and with the strip mid-peek. In every case the window moves.

**Acceptance Scenarios**:

1. **Given** the strip is hidden, **When** the pointer presses inside the top band
   and moves, **Then** the window moves with the pointer.
2. **Given** the strip is pinned with `⌘B`, **When** the pointer presses the strip
   background and moves, **Then** the window moves, and the strip's controls still
   click.
3. **Given** the strip is peeking (not pinned), **When** the pointer presses
   inside the strip and moves, **Then** the window moves without the strip
   dismissing mid-drag.
4. **Given** a cold launch, **When** the window is at rest, **Then** no band pixel
   is painted — the guest page still reaches the top edge and visible tool chrome
   is zero pixels.
5. **Given** the strip is hidden, **When** the pointer drags the window from the
   band, **Then** no strip appears during the drag.

---

### User Story 2 - The strip introduces itself on hover (Priority: P1)

The developer needs the target text or the reload/DevTools controls. They move the
pointer to the very top edge, or let it rest in the top band; the strip fades in,
showing the target and its controls. When the pointer leaves the top area, the
strip fades back out. Using a control does not dismiss the strip out from under
the pointer.

**Why this priority**: It preserves discoverability (Principle III) now that
dragging no longer requires showing the strip, and it gives the traffic lights a
home without permanent chrome.

**Independent Test**: With the strip hidden, move the pointer to within a few
pixels of the top edge and confirm the strip appears; move it down into the strip
and click Reload; then move it well away and confirm the strip disappears about a
second later. Repeat by dwelling in the band instead of touching the top edge.

**Acceptance Scenarios**:

1. **Given** the strip is hidden, **When** the pointer enters the top ~4px of the
   window, **Then** the strip reveals.
2. **Given** the strip is hidden, **When** the pointer rests inside the top band
   for ~400ms, **Then** the strip reveals.
3. **Given** the strip is peeking, **When** the pointer stays within the band or
   strip, **Then** the strip remains; **When** it leaves for ~600ms, **Then** the
   strip dismisses.
4. **Given** the strip is peeking, **When** the developer clicks Reload or Toggle
   DevTools, **Then** the control actuates and the strip is still present
   afterward.
5. **Given** the strip is peeking, **When** the pointer moves away, **Then** the
   window no longer shows the strip and no persisted setting changed.

---

### User Story 3 - `⌘B` pins the strip (Priority: P2)

The developer wants the strip to stay on screen while they work. `⌘B` still
toggles a sticky strip: pinned, it ignores the pointer-driven reveal/dismiss and
stays until toggled off; while hidden, it is revealed only transiently by hover.

**Why this priority**: It keeps the existing, documented toggle meaningful and
keeps the two reveal modes from fighting.

**Independent Test**: Press `⌘B`, move the pointer away, confirm the strip stays;
press `⌘B` again, confirm it leaves and hover only peeks it.

**Acceptance Scenarios**:

1. **Given** the strip is pinned, **When** the pointer leaves the top area,
   **Then** the strip remains.
2. **Given the strip is pinned, When the pointer enters the top band, Then** the
   peek timer has no additional visible effect.
3. **Given** the strip is hidden, **When** `⌘B` is pressed, **Then** the strip
   becomes pinned and persists across relaunch, exactly as today.
4. **Given** a transient peek, **When** the window is relaunched, **Then** the
   strip is hidden (the peek never persisted).

---

### User Story 4 - Double-click the band to zoom (Priority: P3)

The developer double-clicks the top band to zoom/maximize the window, matching the
macOS title-bar convention.

**Why this priority**: A natural refinement of the always-available band, but not
required for the core drag experience.

**Independent Test**: Double-click the band with the strip hidden and confirm the
window zooms; double-click again and confirm it restores.

**Acceptance Scenarios**:

1. **Given** the strip is hidden, **When** the band is double-clicked, **Then** the
   window zooms and restores on a second double-click, honoring the user's macOS
   title-bar double-click preference.

---

### Edge Cases

- **Full-window surfaces**: while the command palette, loading veil, failure view,
  or extension status is on screen, that surface covers the window and owns input;
  the band does not apply behind it. Closing the surface restores the band.
- **Docked DevTools**: the band spans the full window width above the docked
  DevTools; dragging from above the DevTools area still moves the window.
- **Active drag**: a drag holds the strip's current visibility — it never creates a
  reveal when the strip was hidden, and never dismisses one that was showing. Once
  the drag ends, the pointer-in-band rule resumes, so a visible strip stays while
  the pointer remains on the titlebar and dismisses a short grace after it leaves.
- **Multiple windows**: each window reveals, dismisses, and pins its own strip
  independently (Principle V); hovering one window never reveals another's strip.
- **Unfocused window**: proximity sensing is confined to the focused/visible
  window so a background window cannot light up; the band remains draggable.
- **Reduced motion**: the peek/recede transition collapses to an instant change
  under `prefers-reduced-motion`, and interaction is never blocked by motion.
- **Fullscreen**: macOS manages window controls in fullscreen; the band and its
  sensing re-apply when leaving fullscreen.
- **Pointer leaves via another display edge or a fast flick**: dismissal uses a
  grace period so an accidental exit does not flash the strip; a fast exit still
  hides it.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The window MUST provide a draggable region across the top of the
  window, at rest and while the strip is hidden, peeking, or pinned.
- **FR-002**: Dragging the window MUST require only the pointer — no keyboard step
  before the drag.
- **FR-003**: The always-available region MUST paint zero pixels; with the strip
  dismissed, visible tool chrome MUST remain zero pixels (constitution I).
- **FR-004**: The strip surface (target and controls) MUST reveal automatically
  when the pointer is within a few pixels of the window's top edge (proximity) OR
  after the pointer dwells inside the top band (dwell).
- **FR-005**: A revealed strip MUST remain while the pointer is inside the band or
  strip and MUST dismiss automatically a short grace period after the pointer
  leaves, without changing any persisted state.
- **FR-006**: The strip's controls MUST remain usable during a hover reveal; the
  strip MUST NOT dismiss while the pointer is engaging them.
- **FR-007**: `⌘B` MUST remain the sticky toggle for the strip; a pinned strip MUST
  ignore the pointer-driven reveal and dismiss, and its persisted behavior MUST be
  unchanged.
- **FR-008**: The macOS window controls MUST continue to track the strip surface,
  including a hover reveal, consistent with spec 009; the left inset MUST be
  reserved only while the controls are shown.
- **FR-009**: Proximity and dwell detection MUST be confined to the window's own
  top band; the feature MUST NOT capture or respond to pointers outside the
  window.
- **FR-010**: Detection MUST be scoped to focused, visible windows and stopped on
  blur/close, and MUST NOT perform per-frame work; idle resource use attributable
  to the feature MUST be negligible.
- **FR-011**: While a full-window shell surface (command palette, loading veil,
  failure view, extension status) is on screen, the band MUST NOT intercept input;
  that surface owns the window.
- **FR-012**: Each window MUST manage its own band, reveal, and pin state
  independently (constitution V).
- **FR-013**: Double-clicking the top band SHOULD zoom/maximize the window using
  the platform's title-bar behavior.
- **FR-014**: The reveal and dismiss transitions MUST respect
  `prefers-reduced-motion` and the shared motion tokens; motion MUST never block
  dragging or clicking.
- **FR-015**: The feature MUST NOT modify the guest page (constitution II).
- **FR-016**: Dragging the window MUST hold the strip's current visibility: a drag
  MUST NOT reveal the strip when it is hidden, and MUST NOT dismiss it when it is
  visible (pinned or peeking). After the drag, the pointer-in-band rule resumes.
  Any future double-click-to-zoom interaction MUST behave the same.

### Key Entities

- **Drag band**: the permanent, transparent, full-width strip at the top of the
  window that makes the window draggable at all times; paints no pixels.
- **Strip surface**: the visible target-and-controls strip, which can be pinned
  (persisted) or peeking (transient).
- **Peek state**: transient, renderer/main-only "the strip is currently revealed by
  hover"; never persisted.
- **Pin state**: the existing persisted `stripVisible` flag toggled by `⌘B`.
- **Proximity sensor**: the main-process cursor check against the window's top
  band that produces the reveal and dismissal signals.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From a cold launch with the strip hidden, the window can be moved by
  pressing anywhere in the top band and dragging, with no keyboard input.
- **SC-002**: Moving the pointer to the top edge reveals the strip within 0.5s, and
  dwelling in the band reveals it within 0.5s.
- **SC-003**: After the pointer leaves the band and strip, the strip is gone within
  1s, with no visible flicker during normal use.
- **SC-004**: A cold launch at rest shows zero visible tool chrome; the guest page
  reaches the top edge.
- **SC-005**: A developer can reveal the strip and actuate each of its controls
  using the pointer alone, in one continuous interaction, without the strip
  dismissing first.
- **SC-006**: `⌘B` pin/unpin and its persistence across relaunch behave exactly as
  before this feature.
- **SC-007**: Idle and in-use CPU attributable to proximity detection is not
  observable against the app's baseline (no per-frame work, no busy loop).

## Assumptions

- macOS is the only shipping target; other platforms' draggable regions still work
  via the same standard mechanism, but the controls and conventions are macOS
  specific.
- The drag band is the same height as the strip (36px) and spans the full window
  width; a "generous" top band means this full-height region, not a larger one.
- Proximity is defined as the pointer within ~4px of the window's top edge; dwell
  is ~400ms inside the band; dismissal grace is ~600ms after leaving. These are
  tuning constants, expected to be adjusted during implementation.
- Because a draggable region swallows pointer events, the band cannot sense the
  pointer itself; the reveal/dismiss signals come from a small main-process
  cursor-proximity check (chosen over a thin `no-drag` sensor, which would create a
  drag dead zone and dismiss the strip while its controls are used).
- The band makes the top 36px of the guest page non-clickable; this is the
  accepted cost of a title-bar-like drag surface and matches the current pinned
  strip behavior.
- The hover reveal is an accelerator, not the only path: `⌘B` and the command
  palette remain the keyboard-complete routes (constitution III).
- Constitution I's "hidden until explicitly toggled" is preserved in spirit: the
  band is not the strip and paints no pixels, though the always-present interaction
  surface may warrant a PATCH-level note to the constitution.

## Dependencies

- The existing shell overlay and shell-mode state machine (`hidden` / `strip` /
  `full`) in `src/main/shell/window.ts`, and the shared strip-surface predicate in
  `src/shared/shell.ts`.
- The traffic-light behavior from `specs/009-macos-traffic-lights/`, whose
  predicate this feature extends to cover a peek.
- A spike, per the constitution's spike-first rule, to confirm before UI work:
  that main-process cursor proximity reliably drives reveal/dismiss across the
  window's edge and multiple displays, and whether macOS natively zooms on a
  double-click inside a custom draggable region (or whether that is implemented in
  main).
