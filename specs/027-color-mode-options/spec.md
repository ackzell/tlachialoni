# Feature Specification: Color Mode Options

**Feature Branch**: `027-color-mode-options`

**Created**: 2026-10-25

**Status**: Implemented (2026-10-26)

**Input**: User description: "instead of a cycle mode, let's implement 3 options for the mode: light, dark and system. it makes more sense"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick a Mode Directly from the Palette (Priority: P1)

A developer wants the tool surfaces in dark mode. They open the command palette, type "dark", and see three choices: Light, Dark, and System. Dark is already marked as the active mode. They select Dark and the window changes immediately. No second selection is needed.

**Why this priority**: The cycle command forces the developer to guess or step through unwanted modes. Direct choice removes that guesswork. It is the whole point of the request and delivers value on its own.

**Independent Test**: Open the palette, search for the three mode names, and select each one. Confirm the window takes that appearance on the first selection and that the active mode is marked in the list.

**Acceptance Scenarios**:

1. **Given** the palette is open, **When** the developer searches "mode", **Then** Light, Dark, and System are offered as separate rows in the Theme group.
2. **Given** the palette shows the three mode rows, **When** it displays them, **Then** exactly one row is marked as the current mode.
3. **Given** the current mode is System, **When** the developer selects Dark, **Then** the window surfaces render dark on the first selection.
4. **Given** the current mode is Dark, **When** the developer selects Dark again, **Then** the appearance does not change and the marker stays on Dark.
5. **Given** a mode row is highlighted, **When** the developer selects it, **Then** the row's option applies to the whole window, not only to the palette.

---

### User Story 2 - Pick a Mode from the Theme Menu (Priority: P2)

A developer who prefers the mouse opens the Theme menu. The three mode choices appear there next to the mineral variants, and the active mode carries a selection mark. One click changes the mode.

**Why this priority**: The project requires every shell capability in the palette, but the menu is the discoverable counterpart. It makes the three options visible to a developer who does not know the palette exists. It is independently testable once the palette path works.

**Independent Test**: Open the Theme menu and confirm the three choices with exactly one marked. Select a different one and confirm the mark and the window appearance both move to that choice.

**Acceptance Scenarios**:

1. **Given** the Theme menu is open, **When** it renders, **Then** Light, Dark, and System are listed as three separate items.
2. **Given** the window is in Light mode, **When** the Theme menu renders, **Then** Light carries the selection mark and Dark and System do not.
3. **Given** the Theme menu is open, **When** the developer chooses System, **Then** the window follows the current OS appearance and the mark moves to System.
4. **Given** the Theme menu is open, **When** the developer looks for a cycle command, **Then** no cycle entry is present.

---

### User Story 3 - System Mode Tracks the Operating System (Priority: P3)

A developer leaves the mode on System. Later the operating system switches from light to dark at sunset. The window follows without any action from the developer. A second window pinned to Light stays light.

**Why this priority**: System is one of the three options and must mean "follow the OS", not "snapshot the current OS appearance". The behavior already exists, so this story protects it from regression while the selection model changes.

**Independent Test**: Set one window to System and another to Light. Change the OS appearance. Confirm only the System window follows.

**Acceptance Scenarios**:

1. **Given** a window is in System mode, **When** the OS appearance changes, **Then** the window updates to the new appearance without a restart.
2. **Given** a window is in Light mode, **When** the OS appearance changes to dark, **Then** the window stays light.
3. **Given** a window is in Dark mode, **When** the OS appearance changes to light, **Then** the window stays dark.
4. **Given** two windows use different modes, **When** one window changes its mode, **Then** the other window keeps its own mode.

---

### Edge Cases

- When the developer selects the mode that is already active, the window MUST NOT flicker or reload. The selection mark stays in place.
- When the persisted mode is missing or not one of the three known values, the window starts in System mode without an error.
- When the developer switches modes while docked DevTools are open, the DevTools panel updates with the shell in the same change.
- When no page is loaded, the blank window's watermark and palette still follow the selected mode.
- When the developer switches modes several times in quick succession, the last selection MUST win and no earlier appearance may remain painted.
- When the developer searches a mode name with different casing or spacing, the matching row still appears.
- When the OS appearance changes at the same moment the developer pins an explicit mode, the explicit choice MUST win.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST offer exactly three color-mode choices: Light, Dark, and System.
- **FR-002**: The command palette MUST list the three choices as separate rows in the Theme group.
- **FR-003**: The palette MUST mark exactly one mode row as the active mode for the current window.
- **FR-004**: Selecting a mode row MUST apply that mode to the window on the first selection, without further cycling.
- **FR-005**: The Theme menu MUST list Light, Dark, and System as three separate items.
- **FR-006**: The Theme menu MUST show a selection mark on exactly one of the three items.
- **FR-007**: The tool MUST NOT offer a cycle-mode command in the palette or the Theme menu.
- **FR-008**: Light mode MUST pin the window's tool surfaces to the light appearance regardless of the OS appearance.
- **FR-009**: Dark mode MUST pin the window's tool surfaces to the dark appearance regardless of the OS appearance.
- **FR-010**: System mode MUST follow the OS appearance, including changes that happen while the tool runs.
- **FR-011**: Each window MUST hold its own mode, and a change in one window MUST NOT change another window.
- **FR-012**: The tool MUST persist each window's mode and restore it on the next launch.
- **FR-013**: A mode change MUST apply to all of the window's own surfaces, including the command palette, the strip and title bar, transient overlays, and docked DevTools.
- **FR-014**: A mode change MUST NOT modify the guest page's content, styles, or scripts.
- **FR-015**: Selecting the active mode again MUST be a no-op that leaves the appearance and the selection mark unchanged.
- **FR-016**: An unknown persisted mode value MUST fall back to System without an error or a prompt.

### Key Entities *(include if feature involves data)*

- **Color Mode Preference**: One of Light, Dark, or System. It belongs to exactly one window, persists across launches, and never belongs to the guest page.
- **Window**: A shell viewport with one guest page and one color mode preference. Windows do not share modes.
- **OS Appearance**: The current light or dark setting of the operating system. System mode reads it live. Light and Dark mode ignore it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer reaches any of the three modes with one palette search and one selection, in under 5 seconds.
- **SC-002**: After every mode change, the palette and the Theme menu show exactly one active mode in 100% of observed cases.
- **SC-003**: A mode change repaints all tool surfaces within 1 second and needs no restart.
- **SC-004**: When the OS appearance changes, 0 windows pinned to Light or Dark change appearance, and 100% of windows in System change appearance.
- **SC-005**: After a restart, 100% of windows return to their saved mode.
- **SC-006**: The palette and Theme menu contain 0 cycle-mode entries.
- **SC-007**: Developers need at most one selection to reach a target mode, down from up to two selections with the old cycle.

## Assumptions

- The three choices use the names Light, Dark, and System. System means "follow the operating system appearance".
- Palette labels follow the existing theme pattern, for example "Color Mode: Dark". The Theme menu drops the prefix and shows "Light", "Dark", and "System".
- No new keyboard shortcut is added. The palette satisfies the keyboard-first rule, and the Theme menu satisfies discoverability.
- The mode remains per window. A global mode for all windows is out of scope.
- Existing persisted values for the mode remain valid, so no migration is needed.
- The existing live OS-follow behavior and persistence behavior are kept, not rebuilt.
- The guest page keeps its own preferred color scheme and is not restyled by the tool.

## Out of Scope

- Additional modes such as high contrast, sepia, or a scheduled night mode.
- Changes to the eight mineral theme variants.
- Synchronizing the mode across all open windows.
- Changing how the guest page reports or applies its preferred color scheme.
