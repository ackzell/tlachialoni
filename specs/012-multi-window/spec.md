# Feature Specification: Multi-Window Instances

**Feature Branch**: `012-multi-window`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "the app must be able to open more instances. if there are more than 1 frontend dev environments running at the same time they should be able to be opened independently / no tabs are required yet, but the ability to open a new window from a current one should be supported / command + n / file -> new window"

## Context

The tool has always been described as one frameless window rendering one local
target, with parallel projects expected to run as separate independent instances
(constitution V; FR-023 of `specs/001-minimal-browser/`). In practice that
independence has only ever meant starting the whole application again as another
process — there is no way to open a second window *from* a running window, and on
macOS re-launching the app simply reactivates the window you already have.

This feature closes that gap: a **New Window** action opens an additional window
that behaves as its own instance. A developer can point one window at
`http://localhost:3000` and another at `http://localhost:5173` and work in both at
once, with neither affecting the other, and the set of windows is restored on the
next launch. **Tabs are explicitly out of scope** — one target per window remains
the rule; the need for parallel projects is met by more windows, not by
multiplexing inside one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a new window from the current one (Priority: P1)

A developer is viewing a running app and wants a second, separate viewport without
lost state or a restart. They press `⌘N` (or choose **File → New Window**) and a
new window appears alongside the one they were using, ready for a target: the
location entry is already in front of them, so they can type a second server
address immediately.

**Why this priority**: This is the explicit request and the smallest useful slice
— it makes parallel development possible without relaunching the app.

**Independent Test**: With one window open, invoke New Window; confirm a second
window appears with the location entry focused, and the first window remains open
and unchanged.

**Acceptance Scenarios**:

1. **Given** one window is open, **When** the developer presses `⌘N`, **Then** a
   second window opens with the location entry focused and the first window stays
   open.
2. **Given** one window is open, **When** the developer picks **File → New
   Window**, **Then** the same second window opens.
3. **Given** the command palette is open, **When** the developer searches, **Then**
   New Window is listed as a runnable command, and running it opens a window.
4. **Given** a newly opened window, **When** the developer types a target and
   submits it, **Then** that window loads the target and the other windows are
   untouched.
5. **Given** a newly opened window, **When** the developer dismisses the location
   entry without choosing a target, **Then** the window remains open and can be
   retargeted later with `⌘L` or `⌘P`.
6. **Given** focus is inside the DevTools panel, **When** the developer presses
   `⌘N`, **Then** a new window still opens.

---

### User Story 2 - Windows are fully independent (Priority: P1)

A developer opens two windows on two different dev servers and works in both:
navigating, reloading, changing history, toggling DevTools or the strip, or hitting
a failure/loading state in one window leaves the other exactly as it was.

**Why this priority**: "Opened independently" is the core value; a second window
that mirrors or controls the first would not solve the problem.

**Independent Test**: Open two windows, point them at different targets, and
perform every per-window action in one; assert the other's page URL and surfaces
never change.

**Acceptance Scenarios**:

1. **Given** two windows on different targets, **When** the developer navigates or
   reloads in one, **Then** the other's displayed page is unchanged.
2. **Given** two windows, **When** the developer opens/closes/docks DevTools,
   toggles the strip, or changes the theme or color mode in one, **Then** the other's
   DevTools, strip, and theme are unchanged.
3. **Given** two windows, **When** one target is unreachable, **Then** only that
   window shows the failure view; the other is unaffected.
4. **Given** two windows, **When** the developer closes one, **Then** the other
   remains open and fully functional.
5. **Given** three or more windows, **When** the developer acts in any one, **Then**
   every other window is unchanged.

---

### User Story 3 - Windows are remembered across launches (Priority: P2)

A developer keeps two windows open on two projects, quits, and relaunches the app
later. The same windows come back at the positions they were left in, each still
showing its project.

**Why this priority**: Persistence makes a multi-window workspace reusable rather
than something rebuilt by hand every morning. It is valuable but not required for
the core parallel-workflow win.

**Independent Test**: Open two windows at deliberately different positions with
different targets, quit, relaunch, and confirm both windows return at their saved
positions with their targets.

**Acceptance Scenarios**:

1. **Given** two open windows with distinct targets, positions, and themes,
   **When** the developer quits and relaunches, **Then** both windows reopen at
   their saved positions, each showing its saved target and theme.
2. **Given** a window that had no target (a freshly opened, unsubmitted window),
   **When** the developer quits and relaunches, **Then** that window reopens
   without a target and offers the location entry again.
3. **Given** a first-ever launch with no saved windows, **When** the app starts,
   **Then** a single window opens at the default target.
4. **Given** a saved position that would be off-screen or invalid, **When** the app
   restores it, **Then** the window appears at a visible default position instead.

---

### User Story 4 - New Window is discoverable and consistent with the app (Priority: P2)

The action sits in a conventional **File** menu, carries the `⌘N` accelerator, and
is otherwise governed by the same rules as every other capability (keyboard-
reachable, palette-listed), while per-window and shared preferences keep behaving
as specified.

**Why this priority**: Constitution III requires keyboard + palette reachability;
the menu placement is what the developer asked for. Valuable but secondary to the
window actually working.

**Independent Test**: Confirm File → New Window, `⌘N`, and the palette entry all
trigger the same action; confirm installed extensions and recents stay shared and
consistent across windows, while theme, color mode, DevTools, and the strip stay
per-window.

**Acceptance Scenarios**:

1. **Given** the menu bar, **When** the File menu is opened, **Then** it contains
   New Window (with `⌘N`) and Close Window (with `⌘W`).
2. **Given** two windows, **When** the developer changes the theme or color mode in
   one, **Then** only that window changes; the other keeps its own theme.
3. **Given** an installed extension, **When** a new window is opened, **Then** the
   extension is active in the new window's page as well.
4. **Given** two windows, **When** a target is loaded in one, **Then** it is
   available in the other window's recents.

---

### Edge Cases

- **Last window closed**: the app quits; there is no "running with no window" state.
- **Blank window dismissed**: a new window whose location entry is dismissed
  without a target stays open and blank until retargeted; it must never be stuck.
- **Positioning**: a new window with no saved position must not open exactly on top
  of the window it came from.
- **Restore vs. create**: restored windows use their saved positions; only newly
  created windows cascade.
- **Per-window surfaces**: DevTools, the strip, the theme variant, and the color
  mode are window-local; changing any of them in one window must never change
  another.
- **Theme scope**: the color mode applies to the tool's own surfaces (window
  background, palette, strip, shell). The guest page's `prefers-color-scheme` and
  the docked DevTools' internal theme follow the operating system, not a window's
  override.
- **Two windows, same target**: both may view the same origin; neither should break
  the other.
- **Rapid `⌘N`**: repeated invocations open additional windows without disturbing
  existing ones (no cap this iteration).
- **Popups from the guest** stay out of the tool (001 FR-015), unchanged per window.
- **Closing the last window does not strand hidden surfaces** (palette, DevTools,
  loading/failure view) in a half-open state.
- **Corrupt or missing saved geometry** falls back to a visible default rather than
  opening a window off-screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide a **New Window** action that opens an
  additional window while keeping the current window open.
- **FR-002**: New Window MUST be triggered by the `⌘N` accelerator and by a
  **File → New Window** menu item.
- **FR-003**: New Window MUST be listed in the command palette and runnable from
  it, like every other shell capability (constitution III).
- **FR-004**: Each window MUST render exactly one http/https target; the tool MUST
  NOT add tabs or target multiplexing within a window (constitution V).
- **FR-005**: Windows MUST be mutually independent: navigation, history, reload,
  DevTools open/dock state, strip visibility, theme variant, color mode, extension
  status, and loading/failure surfaces in one window MUST NOT change any other
  window.
- **FR-006**: The `⌘N` accelerator MUST fire even while focus is inside the docked
  DevTools panel.
- **FR-007**: Closing one window MUST NOT close, reload, or otherwise disturb any
  other window; the application MUST quit only when the last window is closed.
- **FR-008**: Shared preferences MUST continue to be shared across windows
  (installed extensions), and recents MUST continue to merge so a target loaded in
  any window is available in every window.
- **FR-009**: Per-window state (the target being viewed, the window's own position
  and size, DevTools open state and dock side, strip visibility, theme variant, and
  color mode) MUST be independent between windows; changing any of these in one
  window MUST NOT change another.
- **FR-010**: The File menu MUST contain New Window, and Close Window MUST be
  reachable from the menu bar with its `⌘W` accelerator; the native Window menu
  MUST retain Minimize/Zoom/Front.
- **FR-011**: A window opened via New Window MUST start with no target and with the
  location entry (target input) focused and ready for input.
- **FR-012**: Dismissing the location entry without a target MUST leave the window
  open and retargetable via `⌘L` or `⌘P`; it MUST NOT close or crash.
- **FR-013**: The first window of a launch with no saved windows MUST open at the
  default target `http://localhost:3000`, preserving today's cold-start behavior.
- **FR-014**: Each window's position, size, theme, and (when it had one) target MUST
  be persisted per window, and on the next launch each saved window MUST be restored
  at its saved position with its saved target and theme.
- **FR-015**: On launch the application MUST restore the set of windows from the
  last session; if there is no saved set, it MUST open a single window per FR-013.
- **FR-016**: Newly created windows MUST be placed so they do not perfectly occlude
  the window they were opened from (cascade) when no saved position applies.
- **FR-017**: Saved window geometry that is missing, malformed, or off-screen MUST
  fall back to a visible default position.

### Key Entities *(include if feature involves data)*

- **Window**: an independent viewport that owns exactly one target and its own
  transient shell surface state (palette, DevTools, strip, loading/failure), plus
  its own theme (variant and color mode).
- **Window record**: the persisted shape of a window — its position and size, its
  target when one was chosen, its DevTools/strip state, and its theme — used to
  restore the workspace on the next launch.
- **Target**: the single http/https address a window renders; independent per
  window, shared only through the recents history.
- **Shared preferences**: values that intentionally apply app-wide (installed
  extensions, recents) as opposed to per-window state. Theme variant, color mode,
  DevTools open state, dock side, and strip visibility are per-window.
- **Command**: a catalog entry (id, label, accelerator, group) that both the
  keyboard dispatcher and the palette read, so New Window cannot exist in only one
  surface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can have at least three windows open simultaneously,
  each showing a different local target, and view all of them side by side.
- **SC-002**: 100% of per-window actions tested (navigate, reload, back/forward,
  DevTools toggle/dock, strip toggle, theme preview, failure/loading) produce zero
  observable change in a second window.
- **SC-003**: Opening a new window takes a single action (`⌘N`, menu, or palette
  row), the original window is still present and interactive afterward, and the new
  window's location entry is focused.
- **SC-004**: Installed extensions and recents are consistent across all open
  windows after any of them changes, while theme, color mode, DevTools, and the
  strip remain per-window.
- **SC-005**: After quitting with N windows open and relaunching, the same N windows
  reappear at their saved positions with their saved targets.
- **SC-006**: Typecheck, lint, build, and the full unit suite remain green.

## Assumptions

- macOS remains the only shipping target; menu behavior follows macOS conventions.
- The New Window action is a command in the existing catalog (`other` group), not a
  new palette group.
- The first window of a fresh install keeps the documented default target
  (`http://localhost:3000`); the blank-with-location treatment applies to windows
  created via New Window and to restored windows that never had a target.
- Newly created windows cascade from the current one; restored windows use their
  saved geometry.
- Persisting a per-window set (position/size + target + DevTools open/dock + strip
  + theme variant/color mode) changes the persisted state shape and implies a
  schema version bump; the shared extension list keeps its last-writer-wins
  semantics and recents keep merging.
- **Theme scope**: each window's theme variant and color mode are its own, but the
  guest page's `prefers-color-scheme` and the docked DevTools' internal theme
  follow the operating system (Electron's color-mode switch is process-wide), so a
  window's explicit dark/light override does not change them.
- **Deliberate change from 001**: `specs/001-minimal-browser/` treated DevTools
  open state, dock side, strip visibility, theme variant, and color mode as shared
  across instances. With several windows in one process, sharing them would break
  the P1 independence requirement, so they become per-window. This supersedes 001's
  data-model concurrency note and warrants a PATCH-level constitution amendment
  (001 FR-004, FR-016/FR-017, State foundation).
- Closing the last window quits the app, preserving today's behavior.
- Separate OS processes remain possible as before; this feature adds in-app windows
  and does not remove that capability.
- A cap on the number of simultaneous windows is not required this iteration.
- Popups/`window.open` from the guest still route to the system browser, unchanged
  (001 FR-015).
