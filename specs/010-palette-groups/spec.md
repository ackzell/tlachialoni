# Feature Specification: Grouped Command Palette

**Feature Branch**: `010-palette-groups`

**Created**: 2026-09-28

**Status**: Active

**Input**: User description: "I want to group the actions in the command palette somehow. If I go command + l … that should also list the recent pages I've been to. Then there is the theme switching. I want a new binding command + t to take me to the theme selection. And perhaps 'other' actions. If I hit tab on the input for the command palette it will cycle through the groups. If there is another group that makes sense I want to hear of it."

## Context

The palette (FR-005, FR-007) listed commands and recents as one flat list: the
typed target and recents first, then fuzzy-scored commands. As the catalog grew
(DevTools dock sides, extensions, eight theme variants) an empty palette became a
long undifferentiated list, and `⌘L` — whose whole job is to point the window at a
target — hid recents entirely because it prefilled a non-empty query.

This feature gives the palette **groups**: Location, DevTools, View, Theme,
Extensions, and Other. `Tab` / `Shift+Tab` cycle a scope, `⌘T` opens straight to
Theme, and `⌘L` opens Location where recents stay visible. Recents are grouped by
origin so a single busy dev server cannot bury every other site.

The command catalog stays the single source of truth (constitution III, FR-020):
each command declares its group, and both the group order and the Tab order are
derived from that one declaration.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Switch between groups with Tab (Priority: P1)

The developer opens the palette and presses `Tab` to move from All to Location,
DevTools, View, Theme, Extensions, Other, and back to All. A chip row shows where
they are; the highlighted rows are only that group's.

**Why this priority**: This is the request — it makes the growing catalog
navigable by keyboard, not by typing.

**Independent Test**: Open the palette, press `Tab` repeatedly, and confirm the
active chip and the listed rows change together and wrap; `Shift+Tab` reverses.

**Acceptance Scenarios**:

1. **Given** the palette is open, **When** the developer presses `Tab`, **Then**
   the active scope advances to the next group and the list shows only its rows.
2. **Given** the palette is scoped to a group, **When** the developer presses
   `Shift+Tab`, **Then** the scope moves to the previous group.
3. **Given** the last scope is active, **When** the developer presses `Tab`,
   **Then** the scope wraps to All.
4. **Given** any scope, **When** the palette renders, **Then** every row belongs
   to the active group (or all groups when All is active).

---

### User Story 2 - `⌘L` lists the pages already visited (Priority: P1)

The developer presses `⌘L` to replace the current page. The palette opens in
Location with the current URL selected in the input, and the history below,
collapsed to one row per origin.

**Why this priority**: `⌘L` is the primary way to point the window, and its value
is choosing among places already visited.

**Independent Test**: Visit two pages on different ports, press `⌘L`, and confirm
both origins are listed; press `→` and confirm a host expands to its paths;
`Enter` navigates to a page.

**Acceptance Scenarios**:

1. **Given** the palette is opened with `⌘L`, **Then** it is scoped to Location
   and the recent origins are listed below the prefilled input.
2. **Given** a host row is highlighted, **When** the developer presses `→`,
   **Then** that origin expands to list its recent pages; `←` collapses it (and
   `←` on a page collapses its parent in one press).
3. **Given** a host row is highlighted, **When** the developer presses `Enter`,
   **Then** the newest page for that origin is opened.
4. **Given** an origin has more pages than the per-origin cap, **Then** only the
   newest are kept, so other origins remain listed.

---

### User Story 3 - `⌘T` opens the theme picker (Priority: P2)

The developer presses `⌘T` to switch themes without searching for the group. The
palette opens in Theme with the **active variant highlighted**, and moving the
highlight live-previews the theme.

**Why this priority**: Theme switching was buried among every other command; a
dedicated binding makes it a one-keystroke destination.

**Independent Test**: Press `⌘T`, confirm Theme is active and the current variant
is highlighted, arrow up/down to preview, and `Enter` (or `Space`) to commit.

**Acceptance Scenarios**:

1. **Given** the developer presses `⌘T`, **Then** the palette opens scoped to
   Theme.
2. **Given** the Theme group is entered (by `Tab` or `⌘T`), **Then** the active
   variant is the highlighted row, not the first variant.
3. **Given** the Theme group is scoped and the developer types then deletes the
   query, **Then** the highlight returns to the active variant.
4. **Given** a theme row is highlighted with an empty query, **When** the
   developer presses `Space`, **Then** the theme is committed and the palette
   stays open; **Enter** commits and dismisses.

---

### Edge Cases

- **Scoped query with no in-group match**: the palette widens to all groups and
  shows a hint, rather than an empty list.
- **Pasted Chrome Web Store URL**: offered as an install row in Extensions/All
  (and in a scoped group through fallback), not as an invalid "Open" target.
- **Typed target**: offered only in Location/All, so a plain word in Theme does
  not present a rejected "Open word" row.
- **Group switching**: replaces the whole list, so per-row enter/leave motion is
  suppressed; incremental typing keeps the staggered row motion.
- **Recents cap**: bounded overall and per origin; merging across instances keeps
  the newest timestamp per URL.
- **`Space` with a non-empty query** is a literal space, like any text field.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The command catalog MUST declare a group for every command, and the
  palette's group order and Tab order MUST derive from that single declaration
  (constitution III, FR-020).
- **FR-002**: The palette MUST support scopes All, Location, DevTools, View,
  Theme, Extensions, and Other, and `Tab` / `Shift+Tab` on the input MUST cycle
  them, wrapping.
- **FR-003**: The active scope MUST be visible in the palette and rows MUST belong
  to the active scope.
- **FR-004**: `⌘T` MUST open the palette scoped to Theme.
- **FR-005**: `⌘L` MUST open the palette scoped to Location, keep the current URL
  prefilled, and list recent origins below it.
- **FR-006**: Recents MUST be grouped by origin, expandable to their pages, with
  `Enter` opening the newest page and `←` collapsing.
- **FR-007**: The recents list MUST be bounded overall and per origin, so one
  origin cannot evict the others.
- **FR-008**: A scoped query with no in-group match MUST widen to all groups and
  indicate the fallback.
- **FR-009**: Entering the Theme group MUST highlight the active variant, and
  clearing a theme query MUST restore that highlight.
- **FR-010**: With an empty query, `Space` MUST activate the highlighted row
  without dismissing the palette; `Enter` MUST activate and dismiss.
- **FR-011**: The palette MUST NOT regress the keyboard-first contract: every
  capability remains reachable by keyboard and listed (constitution III).

### Key Entities

- **Command group**: a stable grouping of commands with a label and a position
  that defines both list order and Tab order (`COMMAND_GROUPS`).
- **Scope**: "all" or one command group; the palette's active filter.
- **Recent origin**: the `scheme://host:port` grouping key for recents, so
  `localhost:3000` and `localhost:5173` are distinct.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: `Tab` reaches any group in at most six presses from All and wraps
  without dead stops.
- **SC-002**: `⌘L` lists at least one row per visited origin up to the cap, with
  no origin able to occupy more than five rows.
- **SC-003**: `⌘T` lands on the active variant in a single keypress.
- **SC-004**: The full unit suite (catalog grouping, scopes, scoped rows,
  host-grouped recents, recents caps) passes with no typecheck or lint errors.

## Assumptions

- Chip affordance only for now; section headers may be added later without
  changing the catalog contract.
- `⌘T` is free because the app forbids tabs (constitution V).
- Recents remain local-target URLs only (FR-006 local policy) and are recorded on
  full loads.
