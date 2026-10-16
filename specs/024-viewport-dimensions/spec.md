# Feature Specification: Viewport Size Indicator

**Feature Branch**: `024-viewport-dimensions`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "the browser should show an indicator for the size of the window when it is resized. the 'native' indicator from devtools should match in values but not be displayed while resizing the page. this indicator will be presented whether the devtools is open or not just like the zoom indicator does."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the Viewport Size While Resizing (Priority: P1)

A developer drags the edge of the window to resize it, or clicks the green
traffic light to maximize it, or drags the divider of the docked DevTools panel.
As the page's viewport changes size, a small, understated indicator appears in the
guest page's top-right corner showing the current size of that viewport as
width × height (for example "1280 × 720"). The number updates live as the drag
continues, and the indicator fades away on its own shortly after the resizing
stops.

**Why this priority**: This is the core of the request. A developer sizing a
window to a target breakpoint needs to know the exact page dimensions; the
indicator delivering that number is the whole feature and is useful on its own.

**Independent Test**: With any window, drag an edge to resize it and confirm a
"width × height" indicator appears in the top-right corner, tracks the size
live, and disappears within a couple of seconds after the drag ends.

**Acceptance Scenarios**:

1. **Given** a window at any size, **When** the developer resizes it, **Then** a
   transient indicator appears in the guest page's top-right corner showing the
   viewport size as width × height in pixels.
2. **Given** the indicator is visible during a resize, **When** the window keeps
   changing size, **Then** the displayed numbers update live to the current size
   and the indicator's dismissal timer restarts.
3. **Given** the developer stops resizing, **When** a short, bounded time passes,
   **Then** the indicator disappears on its own.
4. **Given** any page state (blank/new window, loading, or the failure view),
   **When** the window is resized, **Then** the indicator still appears with the
   current viewport size.
5. **Given** the docked DevTools panel is open, **When** the window is resized,
   **Then** the indicator still appears showing the guest page's current size.
6. **Given** the DevTools panel is closed, **When** the window is resized,
   **Then** the indicator appears exactly as it does when DevTools is open.
7. **Given** the docked DevTools panel is open, **When** the developer drags the
   panel's divider to resize it, **Then** the indicator appears/updates with the
   page's new viewport size.

---

### User Story 2 - One Consistent, Non-Duplicated Size Readout (Priority: P2)

The tool has its own size readout, so the developer should not see two different
numbers for the same window. Whatever the built-in DevTools readout would report
for the page, the tool's own indicator reports the identical value, and the
DevTools readout is kept out of the way while the developer is resizing so only
one clean confirmation is on screen.

**Why this priority**: A size indicator is only trustworthy if its number is the
authoritative page size and if there is exactly one of them. This pins the value
to the same measurement DevTools uses and removes the duplicate readout, which is
what makes the indicator dependable — but it builds on the P1 behavior, so it
comes second.

**Independent Test**: Resize a window with DevTools docked and open; confirm the
tool's indicator shows a size equal to what DevTools reports for the same window,
and that the DevTools-native size readout does not appear during the resize.

**Acceptance Scenarios**:

1. **Given** a window being resized, **When** the developer compares the tool's
   indicator with the size DevTools reports for the same window, **Then** the two
   values are identical.
2. **Given** the docked DevTools is open, **When** the developer resizes the
   window, **Then** the DevTools-native size readout is not displayed during the
   resize; the tool's indicator is the only size confirmation shown.
3. **Given** the docked DevTools changes the page's available area (for example
   the panel is docked to a side or the bottom), **When** the window is resized,
   **Then** the reported size reflects the guest page's actual viewport, matching
   the DevTools value rather than the outer window frame.

---

### User Story 3 - A Transient, Non-Blocking Confirmation (Priority: P3)

The size indicator is a confirmation, not chrome. It never intercepts clicks or
scrolls meant for the page, it coexists with the existing zoom indicator without
covering it, and when nothing is happening the window shows zero painted chrome —
exactly like the zoom indicator it sits beside.

**Why this priority**: These properties keep the tool's chromeless, distraction-
free promise intact. The feature is still correct and useful without them, so
they are refinements layered on the core behavior.

**Independent Test**: Resize the window, then click and scroll where the
indicator sits and confirm the page receives the input; trigger a zoom so both
indicators are visible and confirm neither hides the other; confirm the window
returns to zero painted chrome once the indicator disappears.

**Acceptance Scenarios**:

1. **Given** the size indicator is visible, **When** the developer clicks or
   scrolls over it, **Then** the input reaches the guest page rather than the
   indicator.
2. **Given** a zoom action and a window resize occur close together, **When**
   both indicators are visible, **Then** neither indicator occludes the other.
3. **Given** all transient surfaces have been dismissed, **When** the window is
   idle, **Then** the visible tool chrome is zero pixels.
4. **Given** the developer prefers reduced motion, **When** the window is
   resized, **Then** the indicator still appears and disappears, using a
   non-animated (instant) show/hide.

---

### Edge Cases

- **Very small window**: resizing down to the minimum allowed window size shows
  that minimum viewport size rather than a negative or truncated value.
- **Very large window / fullscreen**: maximizing, entering fullscreen, or sizing
  to a large display shows the resulting large viewport size correctly.
- **System-driven resizes**: maximizing, restoring, exiting fullscreen, or a
  display change all count as resizes and show the indicator; moving the window
  without changing its size shows nothing.
- **Rapid repeated resizes**: many changes in quick succession keep a single
  indicator, show only the latest size, and never queue stale dismissal timers or
  flicker.
- **Resize while the indicator is already showing**: the existing indicator is
  reused and refreshed; a second one never appears.
- **Resize while a zoom indicator is showing**: both are visible and neither is
  covered by the other.
- **Resize while the command palette is open**: a window resize still shows the
  size indicator; the palette keeps ownership of keyboard and pointer input.
- **Resize with DevTools docked on the bottom or a side**: the reported size is
  the guest page's viewport after the DevTools dock is accounted for, matching
  the DevTools value. Dragging the DevTools panel's divider resizes the page's
  viewport and updates the indicator just like a window resize.
- **Resize in titlebar mode**: the Docked strip reduces the page area, and the
  reported size reflects the reduced guest viewport.
- **Resize a blank window / failure view**: the indicator appears normally; it is
  about window geometry, not page content.
- **Multiple windows**: resizing one window shows that window's size only and
  never affects another window's indicator.
- **No target loaded**: resizing never errors and never applies anything to the
  empty surface; the size is still reported.
- **Reduced motion**: show and hide are instant; the value and timing are
  otherwise identical.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a transient indicator showing the guest
  page's current viewport size whenever the window is resized.
- **FR-002**: The indicator MUST express the size as width × height in whole
  pixels (for example "1280 × 720").
- **FR-003**: The size the indicator reports and the size the DevTools-native
  readout reports MUST be the same quantity and MUST be equal for the same
  window.
- **FR-004**: The DevTools-native size readout MUST NOT be displayed while the
  window is being resized; the tool's own indicator replaces it.
- **FR-005**: The indicator MUST be presented whether the DevTools panel is open
  or closed, exactly as the zoom indicator is.
- **FR-006**: The indicator MUST update to the latest size continuously during a
  resize and MUST restart its dismissal timer on each size change.
- **FR-007**: The indicator MUST auto-dismiss after a short, bounded delay once
  resizing stops, and MUST NOT persist as permanent chrome.
- **FR-008**: The indicator MUST NOT intercept pointer input; clicks, scrolls,
  and gestures over it MUST reach the guest page. It is non-interactive and
  hidden from assistive technology.
- **FR-009**: The indicator MUST sit at the guest page's top-right corner (the
  zoom readout sits at the page's bottom-right corner) and MUST use the tool's own
  understated visual language. It renders in the shell overlay, so page zoom never
  scales it and the guest page itself is left untouched (constitution II);
  `insets` derived from the page's rect place it in the page's corner. It is
  pointer-through and removed when hidden.
- **FR-010**: The size indicator (top-right) and the zoom readout (bottom-right)
  occupy opposite corners of the page and MUST NOT occlude each other.
- **FR-011**: The reported size MUST be per window and live; it MUST NOT be
  persisted across relaunches, since it describes the window's current geometry.
- **FR-012**: The indicator MUST be presentation only: it MUST NOT rescale,
  reflow, or otherwise alter the guest page or the shell's other surfaces.
- **FR-013**: Any change to the guest page's viewport MUST trigger the indicator,
  including interactive edge dragging, maximizing, restoring, entering or exiting
  fullscreen, display changes, and a change to the size of the docked DevTools
  panel. Moving the window without a viewport change MUST NOT trigger it.
- **FR-014**: The size reported MUST be the guest page viewport (the content
  area), accounting for the tools' own insets such as a docked DevTools panel or
  a docked strip, so it matches the DevTools value rather than the outer window
  frame.
- **FR-015**: The feature MUST preserve the chromeless default: with all
  transient surfaces dismissed, the visible tool chrome MUST remain zero pixels.
- **FR-016**: When the developer prefers reduced motion, the indicator MUST still
  appear and disappear, using a non-animated (instant) show/hide.
- **FR-017**: The indicator MUST be available in development and packaged builds
  alike and MUST NOT require a target to be loaded.
- **FR-018**: The indicator MUST be driven by the page's reported viewport, so a
  resize of the docked DevTools panel (or a dock change) is reflected; it MUST
  render in the shell and MUST NOT modify the guest page's DOM, styles, or scripts.

### Key Entities *(include if this feature involves data)*

- **Viewport Size**: The guest page's renderable content area, expressed as
  width × height in whole pixels. It is the page's own reported layout viewport
  (its `innerWidth`/`innerHeight`), the same value the DevTools-native readout
  reports; it is per window and transient (never persisted).
- **Size Indicator**: A transient, non-interactive overlay summarizing the
  current Viewport Size. It renders in the shell (so page zoom never scales it),
  is placed at the guest page's **top-right** corner via insets derived from the
  page's rect, and is driven by the page's reported viewport — including a resize
  of the docked DevTools panel. It has a bounded lifetime after which it removes
  itself; the zoom readout sits at the page's bottom-right corner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of window resize operations show the size indicator, with the
  first value visible within 100 ms of the size beginning to change.
- **SC-002**: The size shown by the indicator equals the size DevTools reports
  for the same window in 100% of resizes (zero mismatches), whether DevTools is
  open or closed.
- **SC-003**: During a resize, the DevTools-native size readout is displayed zero
  times while the tool's indicator is on screen.
- **SC-004**: The indicator disappears within 2 seconds of the last size change,
  and the window returns to zero painted chrome once it is gone.
- **SC-005**: 100% of clicks, scrolls, and gestures performed over the visible
  indicator reach the guest page; the indicator blocks no interaction.
- **SC-006**: When the zoom indicator and the size indicator are visible
  simultaneously, each remains fully legible (zero occlusion).
- **SC-007**: With two or more windows open, resizing one window changes only
  that window's indicator; the others are unaffected in 100% of cases.
- **SC-008**: A developer can obtain the exact page size of a window in one
  gesture (a resize) without opening any panel, reading a menu, or typing.

## Assumptions

- **What is measured**: The reported size is the guest page's viewport (content
  area), width × height in pixels — the same quantity the DevTools-native readout
  reports. The request says "the size of the window" but also requires the value
  to match DevTools' native readout, which reports the page viewport; the two are
  reconciled by reporting the page viewport, since that is the size a developer
  checks against a breakpoint. The outer window frame is therefore not shown.
- **Format and placement**: The indicator shows width × height in whole pixels,
  sits at the page's top-right corner (the zoom readout at its bottom-right), and
  is visually understated (small, low emphasis, tabular numerals), matching the
  existing zoom readout.
- **Rendered in the shell**: Both readouts render in the shell overlay, never
  inside the page, so page zoom cannot scale them; `insets` derived from the page's
  reported viewport (× zoom) and the docked panel place them at the page's edges. In
  overlay mode the strip floats over the page's top edge, so the size readout drops
  below it; in titlebar mode the page already starts below the strip.
- **Lifetime**: Like the zoom readout, it stays for roughly one to two seconds
  after the last size change and then dismisses itself.
- **"Resize" meaning**: Any change to the page viewport counts (interactive window
  drag, maximize, restore, fullscreen, display change, a DevTools panel resize, or a
  dock change); moving the window without a viewport change is not a resize.
- **DevTools-native readout**: The built-in size readout that DevTools shows while
  resizing is suppressed so the tool's indicator is the only one shown; the tool
  does not otherwise change DevTools.
- **No persistence**: The size is transient by nature (it describes the current
  window), so nothing about it is stored across relaunches, unlike per-window
  zoom level.
- **Not a command**: The indicator is passive confirmation of a window action,
  not a capability the developer invokes, so it gets no command-palette entry
  (the keyboard-first palette principle governs commands, not confirmations —
  the zoom indicator likewise has none).
- **All page states**: The indicator is about window geometry, so it appears
  regardless of whether a target is loaded, loading, or showing the failure view.
- **Reduced motion**: When the developer prefers reduced motion, the indicator
  appears and disappears instantly, with no other behavioral difference.
- **Multiple windows**: Each window reports and shows its own size independently,
  consistent with the tool's per-window state model.
