# Feature Specification: macOS Dock Window Management

**Feature Branch**: `017-macos-dock-menu`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Implement native macOS Dock window management, similar to VS Code.

Requirements:

* Add a Dock menu that includes:

  * "New Window"
  * all currently open app windows, allowing each to be activated/focused
  * macOS recent documents/projects where appropriate
* Keep the Dock window list synchronized as windows are created, closed, or renamed.
* Clicking the Dock icon should follow normal macOS app behavior: activate an existing window, or create a new one when appropriate.
* Use Electron's native macOS Dock APIs and the existing `BaseWindow` architecture.
* Keep the implementation isolated to the main-process shell/window management code; do not introduce renderer-side coupling.
* Preserve the existing window lifecycle and behavior on non-macOS platforms.
* Follow the existing project conventions and keep the implementation minimal."

## Context

The app already opens several independent windows from a single process
(spec `012-multi-window`), but macOS surfaces none of them at the Dock.
Right-clicking the Dock icon offers only OS defaults, and while the app is
running there is no way to jump straight to a specific window, open a new one, or
reopen a recent project without activating the app first. VS Code's Dock menu is
the reference: New Window, every open window as a directly activatable entry, and
recent projects.

This feature adds that macOS-native surface. It is a shell affordance layered on
the existing window set: it reads the same windows the window manager already
owns and routes its actions back through the same window-creation and focus
paths. It introduces no renderer coupling and changes nothing on non-macOS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and activate any open window from the Dock (Priority: P1)

A developer with several windows open right-clicks the Dock icon and sees each
window listed by name. Choosing one brings that window to the front — restoring
it if minimized or hidden — and leaves every other window untouched. The list
always matches what is actually open: opening, closing, or renaming a window
updates it. macOS maintains this window list natively (see Assumptions); the
application does not build its own.

**Why this priority**: Direct activation is the core value of a Dock window list
and the smallest useful slice: it removes the need to hunt through Mission
Control or the Window menu.

**Independent Test**: Open three windows with distinct titles, right-click the
Dock icon, choose the second, and confirm it becomes frontmost and unchanged
while the others are untouched; then close one and rename another and confirm the
menu reflects both.

**Acceptance Scenarios**:

1. **Given** three open windows, **When** the Dock icon is right-clicked, **Then**
   all three are listed and each is identifiable by its window title.
2. **Given** the Dock menu is open, **When** a listed window is chosen, **Then**
   that window is focused and brought to the front.
3. **Given** a listed window is minimized or hidden, **When** it is chosen,
   **Then** it is restored and focused.
4. **Given** one window is open, **When** a new window is created, **Then** the
   next time the Dock menu is opened it lists both.
5. **Given** two windows, **When** one is closed, **Then** the next Dock menu
   shows only the remaining one.
6. **Given** a window whose page title changes, **When** the Dock menu is
   reopened, **Then** the entry shows the new title.
7. **Given** the Dock menu is opened, **When** a window was destroyed since the
   last menu was built, **Then** no entry refers to it.

---

### User Story 2 - New Window from the Dock (Priority: P1)

A developer wants a fresh viewport. They right-click the Dock icon and choose New
Window; a new window opens ready for a target, exactly as the in-app New Window
command does, and any existing windows stay open.

**Why this priority**: The explicit request names New Window, and it is the one
action that must also work when the app has no open windows.

**Independent Test**: With one window open, choose New Window from the Dock menu;
confirm a second window appears with the location entry focused and the first is
unchanged. Repeat with no windows open.

**Acceptance Scenarios**:

1. **Given** one open window, **When** New Window is chosen from the Dock menu,
   **Then** an additional window opens with the location entry focused and the
   existing window stays open.
2. **Given** the app is running with no open windows (macOS), **When** New Window
   is chosen, **Then** one new window opens.
3. **Given** the Dock menu's New Window is used, **Then** the resulting window
   behaves identically to the in-app New Window command.

---

### User Story 3 - Reopen a recent project from the Dock (Priority: P2)

A developer who previously worked on several local targets wants to get back to
one quickly. The Dock menu offers the same recent projects the command palette
shows, grouped by origin so two dev servers never blur together; choosing one opens
a window on that target.

**Why this priority**: Recents make the Dock a launchpad for the day's work
rather than only a switchboard for what happens to be open now. Valuable but
secondary to listing and creating windows.

**Independent Test**: Load two distinct targets, open the Dock menu, choose a
recent, and confirm a window opens on that target.

**Acceptance Scenarios**:

1. **Given** at least one recent project, **When** the Dock menu is opened,
   **Then** the recents are available there, grouped by origin.
2. **Given** a recent project is chosen, **When** it opens, **Then** a window
   loads that target.
3. **Given** no recent projects, **When** the Dock menu is opened, **Then** the
   recents section is absent with no empty placeholder.
4. **Given** many recents, **When** the Dock menu is opened, **Then** the list is
   bounded (same cap as the palette) and shows no duplicates.
5. **Given** an origin with a single recent, **When** the Dock menu is opened,
   **Then** that origin is one selectable entry, not an extra drill-down level.

---

### User Story 4 - Clicking the Dock icon behaves like a native macOS app (Priority: P2)

A developer clicks the Dock icon. If a window is available it comes to the front;
if the app is running with no window open, a window opens — matching native
macOS apps and VS Code.

**Why this priority**: It is what makes the Dock icon itself useful and is
explicitly requested, but the menu already covers the primary flows.

**Independent Test**: With windows open, click the Dock icon and confirm an
existing window is frontmost; close all windows without quitting, click the
icon, and confirm a window opens.

**Acceptance Scenarios**:

1. **Given** one or more windows, **When** the Dock icon is clicked, **Then** an
   existing window is brought to the front.
2. **Given** the app is running with no open windows, **When** the Dock icon is
   clicked, **Then** a new window opens.
3. **Given** the app launches fresh with no saved windows, **Then** the normal
   startup window appears (existing behavior).

---

### Edge Cases

- **No open windows while running**: the Dock menu still offers New Window and
  recents; the icon click creates a window.
- **No recents**: recents section omitted, never an empty header or disabled row.
- **Blank/untitled window** (no target): shown with a generic label rather than
  an empty entry.
- **Duplicate window titles**: entries remain distinguishable by order; choosing
  any activates the correct window.
- **Windows at the cap (16)**: the list stays bounded and usable.
- **Window minimized, hidden, or on another Space**: choosing it restores and
  brings it forward following macOS conventions.
- **Rapid create/close/rename**: the menu never lists a destroyed window and
  never omits a live one.
- **Titles with separators, ampersands, or long text**: displayed safely without
  altering menu structure.
- **Non-macOS platforms**: no Dock menu is created and the window lifecycle (quit
  on last close) is unchanged.
- **App is quitting**: no Dock action can resurrect a window mid-teardown.
- **Recent target now unreachable**: still listed; choosing it shows the normal
  failure view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On macOS, the application MUST present a Dock menu (shown when the
  Dock icon is right-clicked).
- **FR-002**: The Dock menu MUST include a New Window action that opens an
  additional window without closing or disturbing existing windows.
- **FR-003**: The application's Dock menu MUST show every currently open window,
  each identifiable by its window title. (macOS provides this native window list.)
- **FR-004**: Choosing a listed window MUST bring that window to the front and
  focus it, restoring it if minimized or hidden, without changing any other
  window. (Provided by the macOS window list.)
- **FR-005**: The window list MUST stay synchronized with the real window set as
  windows are created, closed, or renamed. (macOS maintains it; no
  application-side synchronization is required.)
- **FR-006**: The Dock menu MUST offer the application's recent projects — the
  same shared URL list the command palette shows — grouped by origin in the same
  shape the palette uses (a `host:port` group with its pages beneath), and choosing
  any entry MUST open a window on that target.
- **FR-007**: Clicking the Dock icon MUST bring an existing window to the front
  when one is available.
- **FR-008**: Clicking the Dock icon MUST open a new window when the application
  is running with no open windows.
- **FR-009**: On macOS, closing the last window MUST leave the application running
  (standard macOS Dock behavior) so the Dock icon and its menu remain available;
  on non-macOS the existing quit-on-last-window behavior MUST be preserved.
- **FR-010**: The Dock menu MUST reflect the current window set at the time it is
  opened; it MUST NOT show destroyed windows or omit live ones. (The macOS window
  list satisfies this.)
- **FR-011**: The Dock menu's New Window action MUST behave identically to the
  existing New Window command.
- **FR-012**: Recent entries offered in the Dock menu MUST be bounded to the same
  cap as the palette (30 overall, 5 per origin) and free of duplicates. An origin
  with only one recent MUST NOT be presented behind an extra drill-down level.
- **FR-013**: The feature MUST be confined to the main-process shell/window
  management code and MUST NOT add renderer coupling or modify guest pages.
- **FR-014**: On non-macOS platforms, no Dock menu MUST be created and all
  existing window lifecycle and behavior MUST be unchanged.
- **FR-015**: The Dock menu MUST degrade gracefully when there are no windows or
  no recents, omitting empty sections.

### Key Entities *(include if feature involves data)*

- **Dock menu**: the macOS Dock icon's context menu; rebuilt from current
  application state.
- **Open window**: an independent application window, identified for the menu by
  its displayed title.
- **Recent project**: a previously opened target recorded in the shared recents
  history (the same list the command palette shows); selecting one opens a window
  on it.
- **Window set**: the ordered collection of live windows owned by the window
  manager; the source of truth for the menu's window list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With at least three windows open, 100% of them appear in the Dock
  menu by title, and choosing any one makes it frontmost in under one second.
- **SC-002**: Across 20 consecutive create/close/rename operations, the Dock menu
  shows zero stale entries and zero missing windows.
- **SC-003**: Choosing New Window from the Dock menu opens exactly one additional
  window in 100% of attempts, with all pre-existing windows still open.
- **SC-004**: Clicking the Dock icon focuses an existing window when one is open
  and opens a new window when none is, in under one second, in 100% of attempts.
- **SC-005**: Choosing a recent project opens a window on that target in 100% of
  attempts; with no recents, no recents section is shown.
- **SC-006**: Behavior on non-macOS platforms is unchanged: no Dock menu, and the
  app still quits when the last window closes.
- **SC-007**: Typecheck, lint, build, and the full unit suite remain green.

## Assumptions

- macOS is the only platform with Dock menu behavior; all other platforms behave
  exactly as today.
- The open-window list in the Dock menu is **provided natively by macOS** (with the
  key window checked), so the application adds only New Window and the recent
  projects rather than duplicating it. This was corrected after the first
  implementation shipped a duplicate list (see research.md "Post-implementation
  correction").
- "Recent documents/projects" maps to the application's existing shared recents
  list of local targets — the same set the command palette lists. The app has no
  file-document model, so the OS-level "Recent Documents" list (which consumes
  file paths) is not used.
- A window's menu label is its displayed title; a blank/untitled window gets a
  generic label.
- The Dock menu is rebuilt from live state whenever it could have changed (window
  created, closed, renamed, or activated), rather than mutated in place.
- Recent entries reuse the existing recents cap and de-duplication.
- New Window from the Dock has the same semantics as the existing New Window
  command (a blank window with the location entry armed).
- **Deliberate change from 012**: macOS no longer quits when the last window
  closes, so the Dock affordance survives; this is required for standard macOS
  Dock behavior. 012's "closing the last window quits the app" remains true on
  non-macOS.
- The Dock menu is an OS-level surface, not shell chrome; the zero-pixel chrome
  principle (constitution I) is unaffected, and the capability it exposes (New
  Window) remains keyboard- and palette-reachable (constitution III).
