# Feature Specification: macOS Traffic Lights

**Feature Branch**: `009-macos-traffic-lights`

**Created**: 2026-09-28

**Status**: Active

**Input**: User description: "is there a way to bring back the traffic lights for mac os? if they were part of the drag strip and could come and go I think that would be acceptable. If there are alternatives I want to hear them."

## Context

Tlachialoni ships a frameless `BaseWindow` to honor **Chromeless by Default**
(constitution I). On macOS a frameless window also loses the standard window
controls — the "traffic lights" (close, minimize, zoom). Minimize and zoom had no
in-app path at all, and closing was only reachable through the strip's `Close`
button or the palette's `Close Window` command.

This feature restores the **genuine AppKit controls** — not custom HTML — as part
of the drag strip, so they appear and disappear with it. The strip already acts
as the window's title bar (it is the drag region, research §8), so the controls
belong to it, and the zero-chrome default is preserved: no strip, no lights.
Electron exposes the real controls on a frameless window through
`win.setWindowButtonVisibility`, so no reimplementation is involved. With the
native red control covering close, the strip's own ad-hoc `Close` button became
redundant and was removed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Native window controls where the title bar would be (Priority: P1)

The maintainer presses `⌘B` to reveal the strip. The three native macOS controls
appear inside it; dismissing the strip takes them away. They close, minimize, and
zoom the window exactly like any other Mac app, with native hover glyphs and
accessibility.

**Why this priority**: This is the request. It replaces an ad-hoc close affordance
with the platform-standard controls and adds minimize and zoom.

**Independent Test**: Run the dev build, press `⌘B`, and confirm the three controls
render inside the strip clear of the lock/target text and actuate the window; press
`⌘B` again and confirm they vanish with the strip.

**Acceptance Scenarios**:

1. **Given** the strip is hidden, **When** the window is inspected, **Then** no
   traffic lights are visible and the guest page reaches the top edge.
2. **Given** the strip is shown with `⌘B`, **Then** the three native controls
   appear inside the strip, clear of the lock and target text, and close,
   minimize, and zoom the window.
3. **Given** the strip is shown, **When** the command palette is opened, **Then**
   the strip and its controls hide together.
4. **Given** the palette is closed with the strip still toggled on, **Then** the
   strip and its controls return together.

---

### User Story 2 - The chromeless contract is unchanged (Priority: P1)

The controls are chrome, so they exist only while other shell chrome exists. A
cold launch, or any moment with the strip dismissed, shows zero tool chrome.

**Why this priority**: Constitution I forbids always-visible chrome; this feature
must not regress it — the reason always-on traffic lights were rejected.

**Independent Test**: Cold-launch and confirm no controls appear until `⌘B`; toggle
the strip off and confirm they leave with it.

**Acceptance Scenarios**:

1. **Given** a cold launch (strip hidden), **Then** the visible tool chrome is zero
   pixels — no controls.
2. **Given** the strip is hidden by any path (`⌘B`, opening the palette), **Then**
   the controls are not visible.

---

### Edge Cases

- **Palette over strip**: opening the palette hides both the strip and the controls
  (the strip's render condition already excludes the palette); closing it restores
  both.
- **Loading veil / failure view**: these force the shell full-window but do not
  change strip visibility, and the strip paints above them, so the controls track
  the strip rather than the surface mode.
- **Non-macOS**: the controls are a macOS-only concept; the native call is a no-op
  elsewhere and the reserved inset is cosmetic.
- **Fullscreen**: macOS manages control visibility in fullscreen; the app
  re-applies its own state on the next strip toggle.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When the strip surface is on screen, the window MUST show the
  standard macOS window controls (traffic lights) inside the strip.
- **FR-002**: When the strip surface is not on screen, the window MUST NOT show
  those controls.
- **FR-003**: The controls MUST be the genuine AppKit controls (window close,
  minimize, zoom), not a reimplementation in the shell.
- **FR-004**: A single shared predicate MUST define strip-surface visibility for
  both the renderer (whether `DragStrip` mounts) and main (whether the controls
  show), so the two cannot disagree.
- **FR-005**: The strip MUST reserve a left inset so the controls never overlap
  the lock icon or target text.
- **FR-006**: The feature MUST NOT introduce always-visible chrome; with the strip
  dismissed, visible tool chrome MUST remain zero pixels (constitution I).
- **FR-007**: Closing the window MUST remain reachable without the pointer-only
  controls: the palette's `Close Window` command remains as the keyboard path
  (constitution III). The native controls are an additional affordance, not the
  only path.

### Key Entities

- **Traffic lights**: the native macOS close/minimize/zoom controls, owned by the
  `NSWindow`, shown or hidden by main as the strip surface comes and goes.
- **Strip-surface predicate**: the shared rule (`stripVisible && !paletteOpen`)
  that both the renderer and main read (FR-004).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: One `⌘B` toggle shows or hides the controls along with the strip, with
  no overlap of the strip's text in either theme.
- **SC-002**: A cold launch presents zero visible window controls.
- **SC-003**: Clicking the controls closes, minimizes, and zooms the window with
  standard macOS behavior.

## Assumptions

- macOS 13+ is the only shipping target; other platforms are unaffected.
- The controls use AppKit's default position. Fine-grained positioning
  (`trafficLightPosition`) is out of scope because it requires switching the window
  away from `frame: false`; revisit only if the default reads off against the strip.
- The strip is the window's title bar, so it is the correct home for the controls.
