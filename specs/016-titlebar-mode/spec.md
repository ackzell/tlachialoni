# Feature Specification: Titlebar Mode

**Feature Branch**: `016-titlebar-mode`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "a feature that toggles \"focus mode\" or something similar. A mode that renders the dragstrip (title bar) permanently and pushes the guest page below it so everything is accessible. this is independent and an alternative to the current mode, where the guest page is full and the titlebar shows and retracts on top of it"

## Context

Today the window is chromeless: the guest page fills the window edge to edge and
the strip (target text plus reload/back/forward/DevTools controls, and the macOS
window controls) is a transient overlay. It appears when the pointer reaches the
top band or after a brief dwell, a `⌘B` pin can hold it on screen, and it
otherwise leaves zero painted tool chrome over the page
(`specs/013-always-on-drag-region/`, constitution I). That default is the
**focus** layout: nothing on screen competes with the guest page.

The overlay model has a cost the developer can feel during hands-on debugging: the
strip either covers the top of the page for a few seconds or requires a deliberate
hover/pin to use. This feature adds a second, opt-in layout the developer can
switch to — **titlebar mode** — in which the strip is rendered permanently as a
real docked title bar and the guest page is laid out in the space below it. Nothing
is ever covered: the target text and every control are always visible and
clickable, and the top of the page is always reachable because the page starts
below the strip rather than underneath it.

Titlebar mode is an **alternative** to the default focus/overlay behavior, not a
replacement. It is independent per window, and it is opt-in; the default remains
the zero-chrome overlay so the constitution's chromeless-by-default posture is
preserved. It is toggled with `⌘⇧F`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Toggle titlebar mode and work with a permanent strip (Priority: P1)

The developer wants the strip to stay put while they work. They enable titlebar
mode; the strip renders as a docked title bar across the top of the window and the
guest page is pushed below it. From then on the target text, the strip controls,
and the macOS window controls are visible and usable at all times, with no hover,
no dwell, and no `⌘B` pin required.

**Why this priority**: This is the request. It gives the developer a stable,
always-available control surface for a session without giving up the chromeless
default for everyone else.

**Independent Test**: Cold-launch a window, enable titlebar mode with `⌘⇧F`, move
the pointer away from the top and confirm the strip stays; click each strip control
and confirm it actuates; confirm the page is fully visible below the strip.

**Acceptance Scenarios**:

1. **Given** a window in the default focus/overlay mode, **When** the developer
   presses `⌘⇧F`, **Then** the strip appears as a docked title bar at the top and
   remains visible regardless of pointer position.
2. **Given** titlebar mode is on, **When** the pointer moves anywhere in the window
   (including away from the top edge), **Then** the strip does not dismiss.
3. **Given** titlebar mode is on, **When** the developer activates a strip control
   (e.g. reload, back/forward, toggle DevTools), **Then** the control actuates and
   the strip stays in place.
4. **Given** titlebar mode is on, **When** the developer presses `⌘⇧F` again,
   **Then** the strip returns to the current overlay behavior and the guest page
   returns to filling the window edge to edge.

---

### User Story 2 - The guest page is pushed below, never covered (Priority: P1)

Because the strip is a real docked bar rather than an overlay, the guest page is
laid out in the area beneath it. The top of the page — headings, nav bars,
first-line controls — is never hidden behind the strip, and the page is not
translated or clipped to make room; it simply has the remaining space.

**Why this priority**: "Pushes the guest page below it so everything is
accessible" is the defining property that separates titlebar mode from a permanent
overlay. Without it the mode would just be a pinned overlay.

**Independent Test**: With titlebar mode on, load a page whose first row is
interactive and confirm the row is fully visible and clickable; scroll and confirm
no content is obscured; toggle the mode and confirm the page is not reloaded.

**Acceptance Scenarios**:

1. **Given** titlebar mode is on, **When** the guest page renders, **Then** the page
   begins below the strip and no part of it is covered by tool chrome.
2. **Given** titlebar mode is on, **When** the developer interacts with content at
   the very top of the page, **Then** that content receives the input.
3. **Given** titlebar mode is on, **When** the developer scrolls the page, **Then**
   the page's own scroll extent accounts for the reduced viewport and nothing is
   clipped behind the strip.
4. **Given** the mode is toggled on or off, **When** the layout changes, **Then**
   the guest page is not reloaded and its scroll position, history, and form state
   are preserved.

---

### User Story 3 - Reach titlebar mode from the keyboard and palette (Priority: P2)

The developer toggles titlebar mode with `⌘⇧F` or by running the command from the
command palette, consistent with every other shell capability.

**Why this priority**: The window has no menus or visible buttons by default; a
keyboard-complete path is what makes the mode discoverable and livable
(constitution III).

**Independent Test**: Press `⌘⇧F` and confirm the mode toggles; open the palette
and confirm the command is listed and toggles the mode; confirm no hidden mouse
target is the only route.

**Acceptance Scenarios**:

1. **Given** a focused window, **When** `⌘⇧F` is pressed, **Then** titlebar mode
   toggles.
2. **Given** the command palette is open, **When** the developer searches for
   titlebar mode, **Then** a toggle command is listed and activating it toggles the
   mode.
3. **Given** titlebar mode is on, **When** `⌘⇧F` or the palette command is used
   again, **Then** the mode turns off.

---

### User Story 4 - The mode is per window and remembered (Priority: P3)

The developer runs several windows for several dev servers. Each window chooses its
own layout, the choice survives relaunch, and a new window starts in the default
zero-chrome layout.

**Why this priority**: It matches the existing per-window independence of target,
geometry, DevTools, and strip state (constitution V), but it is a refinement of the
core experience rather than its prerequisite.

**Independent Test**: Enable titlebar mode in one window, confirm a second window is
unaffected; relaunch and confirm the first window restores titlebar mode; open a
new window and confirm it starts in overlay mode.

**Acceptance Scenarios**:

1. **Given** two windows, **When** titlebar mode is enabled in one, **Then** the
   other window's layout is unchanged.
2. **Given** a window with titlebar mode on, **When** the app is relaunched,
   **Then** that window reopens with titlebar mode on.
3. **Given** the app is running, **When** a new window is opened, **Then** it starts
   in the default overlay mode.

---

### Edge Cases

- **Very short window**: the strip keeps a fixed height; if the window is shrunk so
  far that the content would be too small to use, the window respects the app's
  minimum size so the strip and a usable content area both remain.
- **Docked DevTools**: DevTools (bottom, right, or left) is part of the pushed
  content, so the strip spans the full window width above both the guest page and
  the docked DevTools; opening, closing, or re-docking DevTools never covers the
  strip.
- **Full-window surfaces** (command palette, loading veil, failure view, extension
  status): these occupy the content area below the docked strip and do not hide it,
  so the window stays controlled and the strip stays reachable while they are up.
- **macOS fullscreen**: the strip stays docked and its controls stay usable; the OS
  may hide the traffic lights, but the strip remains and the layout does not break
  when entering or leaving fullscreen.
- **Traffic lights**: in titlebar mode the macOS window controls are always shown
  within the strip, with the same reserved inset as a pinned strip today.
- **Resizing**: while the mode is on, resizing the window keeps the strip height
  constant and gives the remainder to the content, with no gap or overlap.
- **Toggling while a surface is up**: toggling titlebar mode while the palette or
  another surface is open applies the layout without dismissing the surface.
- **Reduced motion**: the toggle transition collapses to an instant change under
  `prefers-reduced-motion` and never blocks input.
- **Guest page reload**: navigating or reloading the page in titlebar mode does not
  change the layout.
- **Multiple displays / Spaces**: moving the window to another display does not
  alter the docked layout.
- **`⌘B` while in titlebar mode**: the strip is already permanent, so the transient
  pin has no visible effect; leaving titlebar mode restores `⌘B`'s usual behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The tool MUST provide a "titlebar mode" that, when enabled for a
  window, renders the strip permanently as a docked title bar at the top of the
  window.
- **FR-002**: In titlebar mode the strip MUST be visible and interactive at all
  times, independent of pointer position; hover reveal, dwell reveal, and dismissal
  MUST not apply.
- **FR-003**: The docked strip MUST present the same information and controls as the
  current strip — the target text, reload/hard reload, back/forward, and the
  DevTools toggle — and MUST show the macOS window controls.
- **FR-004**: The guest page MUST be laid out below the strip, never underneath it;
  no part of the page may be covered by tool chrome in titlebar mode.
- **FR-005**: The guest page MUST occupy the remaining area of the window (its
  viewport reflects the reduced height) rather than being translated, scaled, or
  clipped to fake the inset.
- **FR-006**: Enabling or disabling titlebar mode MUST NOT modify the guest page
  (constitution II) and MUST NOT reload it or discard its state (scroll, history,
  form input).
- **FR-007**: Titlebar mode MUST be toggled with `⌘⇧F` and ALSO be listed in the
  command palette (constitution III); it MUST NOT depend on discovering a hidden
  mouse target. The key binding MUST be documented.
- **FR-008**: Titlebar-mode state MUST be per window and MUST persist across
  relaunch; each window toggles independently (constitution V). A newly opened
  window MUST start in the default overlay mode.
- **FR-009**: Disabling titlebar mode MUST return the window to the existing overlay
  behavior (proximity/dwell reveal, `⌘B` pin, always-on drag band) without losing
  target, DevTools, or other per-window state.
- **FR-010**: In titlebar mode the window MUST remain draggable from the strip, and
  the strip's controls MUST remain clickable; dragging MUST NOT dismiss or hide the
  strip.
- **FR-011**: Docked DevTools MUST sit within the pushed content area below the
  strip; the strip MUST span the full window width above the guest page and the
  docked DevTools.
- **FR-012**: Full-window shell surfaces (command palette, loading veil, failure
  view, extension status) MUST occupy the content area below the strip and MUST NOT
  permanently hide or displace the docked strip.
- **FR-013**: On window resize, the strip MUST keep a constant height and the content
  area MUST fill the remainder with no gap or overlap; the window MUST enforce a
  minimum size that keeps both the strip and a usable content area present.
- **FR-014**: The toggle transition MUST respect `prefers-reduced-motion` and the
  shared motion tokens, and motion MUST never block interaction.
- **FR-015**: While titlebar mode is on, the transient `⌘B` pin has no visible
  effect (the strip is already permanent); turning titlebar mode off restores
  `⌘B`'s existing behavior unchanged.
- **FR-016**: macOS fullscreen MUST keep the strip docked and its controls usable,
  and re-applying the mode on leaving fullscreen MUST restore the docked layout.
- **FR-017**: Titlebar mode and the default focus/overlay mode MUST be mutually
  exclusive and independent: enabling one disables the other's behavior, and no
  state from one mode may leak into the other.

### Key Entities

- **Titlebar mode**: the per-window, persisted layout state in which the strip is
  docked and the content is pushed below it; toggled with `⌘⇧F`.
- **Docked strip**: the permanently rendered title bar containing the target text,
  controls, and macOS window controls.
- **Content area**: the region below the docked strip that holds the guest page and
  any docked DevTools; its size is the window minus the strip height.
- **Default focus/overlay mode**: the existing chromeless behavior (always-on drag
  band, proximity/dwell reveal, `⌘B` pin) that titlebar mode is an alternative to.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From any window, a developer can turn titlebar mode on or off with a
  single `⌘⇧F` press, and the layout settles within 1 second.
- **SC-002**: In titlebar mode, 100% of the top of the guest page is reachable and
  clickable; no tool chrome covers any page pixel.
- **SC-003**: Toggling titlebar mode on and off never reloads the guest page and
  preserves its scroll position and history in every attempt.
- **SC-004**: With titlebar mode on, the strip is visible continuously for a full
  work session and each of its controls actuates in one click, with no accidental
  dismissal.
- **SC-005**: Titlebar-mode state survives relaunch and is independent across
  windows in every tested case; a new window always starts in overlay mode.
- **SC-006**: Resizing a window in titlebar mode keeps a constant strip height and
  leaves no gap or overlap between the strip and the content.
- **SC-007**: The toggle is listed in the command palette and reachable by `⌘⇧F` in
  100% of attempts.
- **SC-008**: No guest-page modification attributable to titlebar mode is observable
  (constitution II), and idle resource use with the mode on is not observably higher
  than with the overlay mode.

## Assumptions

- Titlebar mode is an opt-in, per-window choice; the default remains the zero-chrome
  focus/overlay layout so the constitution's chromeless-by-default posture is
  preserved. The permanent chrome exists only while the developer has explicitly
  chosen it, and it may warrant a PATCH-level clarification to constitution I.
- "Focus mode" names the existing default (no distracting chrome); the new mode is
  named "titlebar mode" for the permanent docked title bar it introduces.
- macOS is the only shipping target; the mode is described and tuned for macOS
  window controls and conventions.
- The docked strip uses the same height as the current strip (~30–36px), and that
  height stays constant across resizes; the guest page receives the remainder.
- Per-window persistence follows the existing model for target, geometry, DevTools,
  and strip state; it is not a global setting.
- The existing `⌘B` pin is meaningful only in overlay mode; in titlebar mode it is
  superseded, and its behavior returns unchanged when titlebar mode is turned off.
- Full-window surfaces continue to own the content area; in titlebar mode they do
  not cover the strip.
- Toggling the mode is a layout change only and does not navigate, reload, or reset
  the guest page.
- Exact transition timing and easing are tuning values, constrained by the shared
  motion tokens and `prefers-reduced-motion`.

## Dependencies

- The existing shell-mode state machine (`hidden` / `strip` / `full`) and the shared
  strip predicate, which titlebar mode extends with a docked layout state.
- `specs/013-always-on-drag-region/` — the always-on drag band and overlay
  reveal/dismiss behavior that titlebar mode is an alternative to.
- `specs/009-macos-traffic-lights/` — the traffic-light placement and reserved inset
  that the docked strip must reuse while permanently shown.
- `specs/008-surface-preview/` — the dev-only surface previews, which need to render
  correctly inside the pushed content area in titlebar mode.
- The guest-view and docked-DevTools layout, which must support insetting the content
  area beneath the strip without touching the guest page's DOM.
