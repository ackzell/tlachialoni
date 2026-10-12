# Feature Specification: Guest Page Zoom

**Feature Branch**: `023-guest-page-zoom`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "we want the ability to zoom in and out in the guest page by using control + + and control + -, as well as control + 0 to reset it. it should be available on the command palette too and an indicator of what the zoom level is should appear briefly when zooming in and out on the bottom right corner as as very subtle indicator that the action was taken"

## Clarifications

### Session 2026-10-11

- Q: Should Guest Page Zoom also add pointer gestures — Command + mouse wheel and trackpad pinch — in addition to the keyboard shortcuts and palette entries already in the spec? → A: Yes, add both Command + mouse wheel and trackpad pinch.
- Q: How should the continuous wheel and pinch gestures map onto zoom levels? → A: Same discrete ladder as the keyboard/palette — one wheel notch advances one step, pinch accumulates to steps, and the result persists per window and shows the same indicator. (The exact gesture feel — wheel notch size, pinch threshold, sensitivity — is provisional and will be tuned and verified by manual testing; see Assumptions.)
- Q: When the pointer is over the docked DevTools panel, or DevTools has keyboard focus, what should Command + wheel and pinch do? → A: Guest page only — over DevTools or with DevTools focused the gesture is left to DevTools and never changes the guest page's zoom.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keyboard Zoom (Priority: P1)

A developer is looking at an application that renders too small or too large for comfortable
reading. Without leaving the keyboard, they press Command and `+` to scale the page up, or
Command and `-` to scale it down, and the guest page content redraws at the new scale. When
they want to get back to normal, they press Command and `0`.

**Why this priority**: This is the core of the request. Zoom via a keyboard shortcut is the
fastest, most frequent use of the feature and delivers value on its own, before any palette
entry or on-screen indicator exists.

**Independent Test**: With a target loaded, press Command `+` several times and confirm the
page renders larger; press Command `-` and confirm it renders smaller; press Command `0` and
confirm it returns to the default scale.

**Acceptance Scenarios**:

1. **Given** a guest page at the default scale, **When** the developer presses Command `+`,
   **Then** the page content renders one step larger.
2. **Given** a guest page at any scale above the minimum, **When** the developer presses
   Command `-`, **Then** the page content renders one step smaller.
3. **Given** a guest page at any scale other than the default, **When** the developer presses
   Command `0`, **Then** the page returns to the default scale.
4. **Given** the guest page has keyboard focus (e.g. a focused text field), **When** the
   developer presses a zoom shortcut, **Then** the zoom still applies to the page rather than
   being swallowed by the page's own content.
5. **Given** a guest page already at the maximum scale, **When** the developer presses
   Command `+`, **Then** the scale stays at the maximum and no error is shown.

---

### User Story 2 - Zoom from the Command Palette (Priority: P2)

A developer who does not remember the shortcut, or who prefers the palette, opens the command
palette and finds Zoom In, Zoom Out, and Reset Zoom among the view commands. Selecting one
applies the same zoom behavior as the shortcut.

**Why this priority**: The project requires every shell capability to be reachable from the
palette. It builds directly on the P1 behavior and is independently demonstrable once the
palette entries exist.

**Independent Test**: Open the palette, run "Zoom In" and confirm the page scales up; run
"Reset Zoom" and confirm it returns to default. The full behavior is observable without
touching the keyboard shortcuts.

**Acceptance Scenarios**:

1. **Given** the command palette is open, **When** the developer searches for "zoom", **Then**
   Zoom In, Zoom Out, and Reset Zoom are offered.
2. **Given** one of the zoom commands is highlighted, **When** the developer selects it,
   **Then** the guest page changes scale exactly as the equivalent keyboard shortcut would.
3. **Given** the command palette lists a zoom command, **When** it is displayed, **Then** the
   command shows its keyboard shortcut next to it.

---

### User Story 3 - Wheel and Pinch Zoom (Priority: P3)

A developer with a hand on the mouse or trackpad zooms without reaching for the keyboard: they
hold Command and roll the mouse wheel up to scale the page up (or down to scale it down), or they
spread two fingers on the trackpad (“pinch out”) to scale up and pinch them together to scale
down. Each gesture moves the page by the same steps the keyboard uses, and the same indicator
confirms it.

**Why this priority**: Pointer gestures are the most natural way to zoom on macOS and cover mouse
and trackpad users who are not on the keyboard. They are accelerators on top of the required
keyboard and palette paths, so they can ship after those and never become the only way to zoom.

**Independent Test**: With the guest page focused, hold Command and roll the wheel up and confirm
the page grows one step with the indicator shown; roll down and confirm it shrinks. Then spread two
fingers to confirm the page grows, and pinch them together to confirm it shrinks.

**Acceptance Scenarios**:

1. **Given** a guest page under the pointer, **When** the developer holds Command and rolls the
   wheel up, **Then** the page renders one step larger and the indicator shows the new level.
2. **Given** a guest page under the pointer, **When** the developer holds Command and rolls the
   wheel down, **Then** the page renders one step smaller.
3. **Given** a guest page under the pointer, **When** the developer pinches out (spreads two
   fingers), **Then** the page renders larger.
4. **Given** a guest page under the pointer, **When** the developer pinches in (brings two fingers
   together), **Then** the page renders smaller.
5. **Given** a guest page already at the maximum (or minimum), **When** the developer gestures
   further in that direction, **Then** the level clamps and no error is shown.
6. **Given** the pointer is over the docked DevTools panel or DevTools has keyboard focus,
   **When** the developer performs a wheel or pinch gesture, **Then** the guest page's zoom does
   not change; the gesture belongs to DevTools.
7. **Given** the developer scrolls the page with two fingers without Command, **When** the gesture
   happens, **Then** the page scrolls as before and its zoom does not change.

---

### User Story 4 - Transient Zoom Indicator (Priority: P3)

After any zoom action, a small, subtle indicator appears in the bottom-right corner of the
window showing the current zoom level as a percentage. It fades away on its own after a
moment, so it confirms the action without becoming permanent chrome.

**Why this priority**: It is a confirmation affordance. Zoom still works and is useful without
it, so it is deliberately the lowest priority and can ship after the controls themselves.

**Independent Test**: Trigger any zoom action and observe a percentage indicator appear in the
bottom-right corner and disappear within a couple of seconds; confirm it never blocks clicks
on the page while visible.

**Acceptance Scenarios**:

1. **Given** a guest page at 100%, **When** the developer zooms in once, **Then** an indicator
   reading the new level (for example "110%") appears in the bottom-right corner.
2. **Given** the indicator is showing, **When** a short, bounded time passes with no further
   zoom actions, **Then** it disappears on its own.
3. **Given** the developer zooms repeatedly in quick succession, **When** each action happens,
   **Then** the indicator updates to the latest level and its dismissal timer restarts.
4. **Given** the indicator is visible, **When** the developer clicks where it overlays the
   page, **Then** the click reaches the page underneath rather than the indicator.

---

### Edge Cases

- **Boundary reached**: pressing zoom in at the maximum (or zoom out at the minimum) leaves the
  level unchanged; the indicator still reflects the current level so the developer sees it did
  not move.
- **Reset when already default**: pressing Command `0` at 100% is a no-op that still shows the
  "100%" indicator as feedback.
- **Rapid repeated presses**: many zoom actions in a row must not queue up stale indicator
  timeouts or cause visible flicker; only the latest level is shown.
- **No target loaded / failure view**: zoom shortcuts are harmless and do not crash or apply to
  the empty or failure surface; page zoom resumes when a target commits.
- **Multiple windows**: each window keeps its own zoom level; zooming one window never changes
  another.
- **Guest page defines its own Command-key shortcuts**: the shell's zoom shortcuts take
  precedence over the page's handlers so zoom is deterministic.
- **DevTools focused**: with DevTools docked and focused, the zoom shortcuts still target the
  guest page and never rescale the shell surfaces or DevTools.
- **Plain scroll vs zoom scroll**: scrolling with two fingers (or a mouse wheel) without Command
  scrolls the page and never changes its zoom.
- **Trackpad Command + scroll**: holding Command while scrolling with two fingers behaves exactly
  like Command + mouse wheel, so laptop users get the same zoom as a mouse user.
- **Gesture over the docked DevTools**: a wheel or pinch gesture over the DevTools panel (or while
  DevTools is focused) is left to DevTools and never changes the guest page's zoom.
- **Gesture while the palette is open**: the palette owns keyboard and pointer input while it is
  open, so gestures do not change the page's zoom beneath it.
- **Gesture over a page element that consumes the same chord**: the shell's Command + wheel zoom
  takes precedence over the page's own handling, so the level stays deterministic — the same
  precedence the keyboard shortcuts already have.
- **Continuous gesture at a boundary**: a long pinch or many wheel notches stop at the ladder ends
  and keep the indicator at the clamped level.
- **Reduced motion**: when the developer prefers reduced motion, the indicator still appears
  and disappears, using a non-animated (instant) show/hide.
- **Window resize while zoomed**: resizing the window preserves the current zoom level.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a zoom-in capability that increases the guest page's
  rendering scale by one step, up to a defined maximum.
- **FR-002**: The system MUST provide a zoom-out capability that decreases the guest page's
  rendering scale by one step, down to a defined minimum.
- **FR-003**: The system MUST provide a reset capability that returns the guest page to the
  default scale (100%) in a single action.
- **FR-004**: The zoom-in, zoom-out, and reset capabilities MUST each be bound to a keyboard
  shortcut using the Command modifier with `+`, `-`, and `0` respectively.
- **FR-005**: The zoom shortcuts MUST take effect while the guest page has keyboard focus and
  MUST take precedence over any conflicting handlers in the guest page.
- **FR-006**: Each zoom capability MUST also be listed in the command palette under the view
  group, showing its keyboard shortcut, and selecting it MUST apply the same behavior as the
  shortcut.
- **FR-007**: Changing the zoom level MUST display a transient indicator in the bottom-right
  corner of the window showing the current level as a percentage.
- **FR-008**: The indicator MUST auto-dismiss after a short, bounded delay and MUST NOT persist
  as permanent chrome.
- **FR-009**: The indicator MUST NOT intercept pointer input; clicks and scrolls over it MUST
  reach the guest page.
- **FR-010**: Zoom MUST affect only the guest page content and MUST NOT rescale the shell's own
  surfaces (command palette, indicator, strip/titlebar, failure view) or the docked DevTools.
- **FR-011**: The zoom level MUST be per-window state, independent across concurrently open
  windows.
- **FR-012**: The zoom level MUST persist per window across application relaunches.
- **FR-013**: Zoom steps MUST follow the standard browser zoom ladder between the defined
  minimum and maximum (a bounded set of discrete levels, not an unbounded continuous scale).
- **FR-014**: When a zoom capability is used at its boundary, the level MUST clamp to the
  nearest valid level without error, and the indicator MUST reflect the resulting level.
- **FR-015**: The keyboard shortcuts and palette entries MUST be available regardless of which
  shell surface currently has focus (guest page, palette, or docked DevTools).
- **FR-016**: The system MUST zoom the guest page in or out when the developer holds the Command
  modifier and rolls the mouse wheel (up zooms in, down zooms out).
- **FR-017**: The system MUST zoom the guest page in or out in response to a trackpad pinch
  (spreading two fingers zooms in, bringing them together zooms out).
- **FR-018**: Gesture zoom MUST move along the same discrete ladder as the keyboard and palette and
  MUST update the same per-window level and the same indicator; it MUST NOT introduce a separate
  continuous scale.
- **FR-019**: Gesture zoom MUST apply only when the pointer is over the guest page and DevTools is
  neither hovered nor focused; otherwise the gesture MUST be left to DevTools and MUST NOT change
  the guest page's zoom.
- **FR-020**: Scrolling without the Command modifier MUST keep scrolling the page (and horizontal
  swipes MUST keep driving history navigation); such input MUST NOT change the zoom level.
- **FR-021**: Pointer gestures MUST be accelerators only — the keyboard shortcuts and palette
  entries MUST remain sufficient to reach every zoom level on their own.

### Key Entities *(include if this feature involves data)*

- **Zoom Level**: The current rendering scale of a window's guest page, expressed as a
  percentage. It has a default (100%), a minimum, a maximum, and an ordered set of discrete
  steps between them. It is owned per window and persists across relaunches. It can be changed by
  the keyboard shortcuts, the palette commands, or the pointer gestures, all of which move it
  along the same steps.
- **Zoom Indicator**: A transient, non-interactive overlay summarizing the current Zoom Level;
  it has a trigger (any zoom change) and a bounded lifetime after which it disappears.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can change the page scale using only the keyboard, reaching the
  desired level in one keypress per step with no mouse involved.
- **SC-002**: Reset returns the page to 100% in exactly one action from any zoom level.
- **SC-003**: 100% of the zoom capabilities (in, out, reset) are reachable from the command
  palette and are discoverable by searching for "zoom".
- **SC-004**: The zoom indicator becomes visible within 100 ms of a zoom action and fully
  disappears within 2 seconds of the last action.
- **SC-005**: While the indicator is visible, 100% of clicks and scrolls over its area reach
  the guest page; the indicator blocks no interaction.
- **SC-006**: Zoom levels applied in one window are reproduced exactly after that window is
  relaunched, and zooming one window never alters another open window's level.
- **SC-007**: With all shell surfaces dismissed, the visible tool chrome remains zero pixels
  except during the brief indicator window, preserving the chromeless default.
- **SC-008**: A developer can change the page scale using only the mouse or trackpad (Command +
  wheel, and pinch), reaching any ladder level with no keyboard input.
- **SC-009**: 100% of Command + wheel and pinch gestures performed over the guest page change its
  zoom, and 100% of the same gestures performed over the docked DevTools leave the guest page's
  zoom unchanged.
- **SC-010**: Plain two-finger scrolling and horizontal swipe navigation keep their existing
  behavior; across a session of mixed input there are zero unintended zooms or unintended history
  navigations.

## Assumptions

- The modifier is the Command key (`⌘`), consistent with the tool's other shortcuts and the
  developer's intent. The three bindings are Command `+`, Command `-`, and Command `0`.
- The zoom ladder matches standard browser steps (25%–500%: 25, 33, 50, 67, 75, 80, 90, 100,
  110, 125, 150, 175, 200, 250, 300, 400, 500), with 100% as the default.
- "Guest page" means the inspected target's content only; the shell and docked DevTools are
  never zoomed.
- Zoom is per-window and persists across relaunches, consistent with the tool's other
  per-window state. It is not remembered per site or per origin.
- The indicator shows a whole-number percentage, sits in the bottom-right corner, is visually
  understated (low emphasis, small), and stays for roughly one to two seconds.
- Command + mouse wheel and trackpad pinch are in scope and feed the same discrete ladder as the
  keyboard and palette, so a gesture produces the identical level, persistence, and indicator.
- The exact gesture feel — how much wheel travel is one step, the pinch accumulation threshold, and
  the sensitivity — was tuned and verified by manual testing during implementation; this spec fixes
  the model (discrete ladder) and precedence (guest page only), not the precise sensitivity.
- Holding Command while scrolling with two fingers on a trackpad is treated as Command + mouse
  wheel, so trackpad and mouse users get the same zoom.
- Zoom applies to whatever the guest page renders, including pages the developer chose to run
  installed extensions in; the tool adds no per-site zoom exceptions.
