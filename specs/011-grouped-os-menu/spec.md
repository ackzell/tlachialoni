# Feature Specification: Grouped OS Menu

**Feature Branch**: `011-grouped-os-menu`

**Created**: 2026-09-28

**Status**: Active

**Input**: User description: "now I think we could add OS menu entries grouped in the same fashion as we did for the palette."

## Context

The application menu was a single flat **View** menu holding only the commands
whose accelerators needed to be registered with the OS (so they still fire while
DevTools has focus). After the palette gained groups (010), the menu was the only
surface still presenting the catalog as one undifferentiated list.

Research (Apple HIG *The menu bar*, Chrome/Safari, VS Code, Electron's menu API)
pointed at **domain top-level menus** rather than a literal copy of the palette
group names: the HIG explicitly endorses app-specific menus placed between View
and Window, and browsers/editors already group this way. "Location" and "Other"
also read poorly as menu titles. So the palette groups map to readable domains,
with a standard Window menu added for native window commands.

The menu is **static**: it lists commands but does not mirror state (active theme,
recents, per-extension rows), because checked/radio state would require rebuilding
the application menu on every change. The palette remains the primary,
always-current surface (constitution III).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find a command in the menu bar by domain (Priority: P1)

A developer opens the menu bar and finds commands grouped by what they do: View,
History, DevTools, Theme, Extensions, Window. They no longer scan one flat list.

**Why this priority**: This is the request — make the catalog scannable from the
menu bar the way it now is in the palette.

**Independent Test**: Open each menu and confirm the commands appear under the
expected domain heading, with the same labels and accelerators as the palette.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the menu bar is inspected, **Then** the
   top-level menus are App, Edit, View, History, DevTools, Theme, Extensions, and
   Window, in that order (plus a dev-only Developer menu).
2. **Given** the DevTools menu, **When** it is opened, **Then** it holds the
   toggle, the three dock sides, focus toggle, and inspect element.
3. **Given** the Theme menu, **When** it is opened, **Then** it lists the eight
   variants (without the `Theme:` prefix) and Cycle Color Mode.
4. **Given** any menu item, **When** it is clicked, **Then** it runs through the
   same command registry as the palette (nothing exists only in the menu).

---

### User Story 2 - Accelerators still work from DevTools (Priority: P1)

With focus inside the DevTools panel, the registered menu accelerators
(`⌘P`, `⌘R`, `⌘⌥J`, `⌘1/2/3`, `⌘J`, `⌘⇧C`, …) keep firing app-wide.

**Why this priority**: This is the reason the menu exists at all in a chromeless
app; the regroup must not drop any accelerator.

**Independent Test**: Focus DevTools and press each accelerator; confirm the
command fires.

**Acceptance Scenarios**:

1. **Given** focus is in DevTools, **When** an accelerator-bearing command is
   invoked, **Then** it runs even though the page's `before-input-event` never
   fires.
2. **Given** the History menu, **When** Back/Forward are shown, **Then** they
   carry no key equivalent, so `⌘←` / `⌘→` still perform native text navigation
   in editable fields.

---

### Edge Cases

- **Dev builds**: a separate **Developer** menu of surface previews is appended
  after Window; it is absent from packaged builds.
- **Static state**: the menu does not change when the theme, dock side, strip, or
  extensions change; the palette owns live state.
- **Platform**: the Window menu's Front item is macOS-only; Electron no-ops it
  elsewhere. Minimize/Zoom use standard roles.
- **Duplicated affordances**: `⌘P`/`⌘T` appear in View while the Theme menu lists
  variants directly — opening a palette scope and picking a variant are different
  actions.

## Requirements _(mandatory)_

- **FR-001**: The application menu MUST group commands into domain top-level
  menus (View, History, DevTools, Theme, Extensions, Window) in that order,
  following the HIG's app-specific-menu guidance.
- **FR-002**: Every menu item MUST be a catalog command, so labels and
  accelerators stay sourced from `COMMANDS` and both surfaces cannot drift
  (constitution III).
- **FR-003**: The menu MUST preserve every existing OS accelerator; no command
  that previously fired from DevTools focus may lose its accelerator.
- **FR-004**: `view.back` / `view.forward` MUST NOT carry OS accelerators, so
  native text navigation in editable fields is preserved (FR-011).
- **FR-005**: The menu MUST NOT mirror live state; it does not need to rebuild on
  theme, dock, strip, or extension changes.
- **FR-006**: Theme variant items MUST be labeled with the variant name alone
  inside the Theme menu.
- **FR-007**: A standard Window menu MUST provide Close Window plus native
  Minimize/Zoom/Front.

### Key Entities

- **Menu section**: a domain menu (`label` + ordered command ids, `null` for a
  separator) declared next to the catalog and expanded into native items.
- **Menu item**: a catalog command rendered as a native menu item, with an
  accelerator unless in the no-accelerator set (`view.back`, `view.forward`).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Navigation to any accelerators works with DevTools focused.
- **SC-002**: Menu labels and accelerators match the palette's catalog exactly.
- **SC-003**: `⌘←` / `⌘→` still edit text inside focused inputs.
- **SC-004**: Typecheck, lint, build, and the full unit suite stay green.

## Assumptions

- macOS is the only shipping target; the menus are standard Electron templates.
- Recents and per-extension rows stay palette-only this iteration; a dynamic
  rebuild (History menu, radio/checkbox state) is a possible follow-up.
- A Help menu is out of scope; the app has no help content yet.
