# Research: Color Mode Options

**Feature**: `027-color-mode-options`
**Date**: 2026-10-25

## R1. Menu selection mark: how to keep the Theme menu current

**Decision**: Give every menu item a stable `id` equal to its command id. Render the three mode items with `type: "radio"` and an initial `checked` value from the focused window's mode. On a mode change and on every window-focus change, update `checked` in place through `Menu.getApplicationMenu()?.getMenuItemById()`.

**Rationale**:
- The update touches three objects. It does not rebuild the native menu, so accelerators, menu order, and the dev-only Developer menu stay stable.
- The existing menu is installed once at boot. A full rebuild on focus would recreate every item on a common event.
- The mode is per window. The application menu is process-wide, so it must follow the focused window. Focus and mode are the only two inputs to the mark.
- A radio group gives the native macOS behavior and the correct accessibility role for a mutually exclusive choice.

**Alternatives considered**:
- Rebuild the whole application menu on every mode or focus change. Rejected: more work per event and the menu structure is otherwise static.
- Render a check glyph in the label. Rejected: not native, and it would break the label-to-command lookup.
- Keep the menu static and show the current mode only in the palette. Rejected by spec FR-006.

## R2. One source of truth for the three modes

**Decision**: Add `COLOR_MODES` to `src/shared/commands.ts` as three entries with a slug and a display name. Derive the `ColorMode` union from it. Generate the three `theme.mode.<slug>` commands from the same array. `src/main/state/schema.ts` re-exports the type and validates against the shared list. The renderer imports the shared type instead of declaring its own copy.

**Rationale**:
- `THEME_VARIANTS` already uses this pattern for the eight mineral variants. The mode list should read the same way.
- The palette labels, menu items, command handlers, and persisted-value validation all derive from one list, so they cannot drift.
- The union type makes an unsupported mode a compile error.

**Alternatives considered**:
- Keep the literal list in `schema.ts` and repeat it in `commands.ts`. Rejected: two lists drift and the palette can offer a mode the store rejects.
- Hard-code the three commands without a list. Rejected: the palette, menu, and validation would each carry a copy of the same three values.

## R3. Palette contract for the active mode

**Decision**: Reuse the existing `detail: "current"` marker that the eight theme variant rows use. Mark exactly one mode row as current when theme state is available. Leave all three unmarked when the palette has no theme state.

**Rationale**:
- The palette already reads "current" for the active variant. A second convention for the same idea would be noise.
- `detail` is the row's description, so "current" fits its meaning. `badge` is reserved for a standing property such as MV3.
- Reusing the marker keeps the row shape and tests simple.

**Alternatives considered**:
- Add a check glyph to the label. Rejected: it changes the fuzzy-match indices and the label still has to stay stable for search.
- Use a badge. Rejected: a badge states a property of the thing, not a live selection state.

## R4. Command ids and labels

**Decision**: Use `theme.mode.light`, `theme.mode.dark`, and `theme.mode.system`. The palette labels read `Color Mode: Light`, `Color Mode: Dark`, and `Color Mode: System`. Inside the Theme menu the prefix is dropped, so the items read `Light`, `Dark`, and `System`.

**Rationale**:
- The id follows the existing `theme.variant.<slug>` namespace, so the Theme group stays easy to reason about.
- The palette label mirrors `Theme: Jade` and stays searchable by both "mode" and the mode name.
- Dropping the prefix in the Theme menu mirrors what the app already does for the variant items.

**Alternatives considered**:
- `theme.light`, `theme.dark`, `theme.system`. Rejected: it flattens a namespace that already exists for theme choices.
- One `theme.setMode` command with an argument. Rejected: the palette would need a special row kind or argument plumbing, and the current marker would be harder to derive.
- Labels such as `Light Mode`. Rejected: the palette group already says Theme, and `Color Mode:` matches the variant prefix pattern.

## R5. Remove the cycle path completely

**Decision**: Delete `theme.cycleMode` from the catalog, delete its handler registration, and delete `cycleColorMode()`. Delete the palette special case that shows `mode: <current>`. Do not keep a hidden alias.

**Rationale**:
- Spec FR-007 requires zero cycle entries in the palette and the menu.
- A hidden alias would keep dead code and a second way to change the mode, which contradicts the request.
- The three explicit commands cover every state the cycle reached.

**Alternatives considered**:
- Keep the cycle command but hide it from the palette. Rejected: the menu check state would have two sources of truth and users could still land on a mode indirectly.

## R6. Per-window mode and menu focus

**Decision**: Keep the mode per window. The Theme menu reflects the focused window. Changing focus updates the mark; changing the mode in one window updates the mark and does not touch the other windows.

**Rationale**:
- `specs/012-multi-window/` already stores `colorMode` per window and inherits it for new windows.
- An application-wide mode would be a behavior change outside this feature and would break independent side-by-side comparison.

**Alternatives considered**:
- Make the mode global so the menu mark is unambiguous. Rejected: out of scope and contrary to spec assumptions.

## R7. System mode and OS changes

**Decision**: Reuse the existing `nativeTheme` listener and `resolvedMode()` logic. System mode follows live OS changes; Light and Dark pin the surfaces. No new listener and no new state.

**Rationale**: The behavior already meets spec FR-008 through FR-010. The feature changes only how a mode is chosen.

**Alternatives considered**:
- Cache the resolved appearance when System is selected. Rejected: it would turn System into a snapshot and break spec FR-010.

## R8. Persistence and migration

**Decision**: Keep schema version 4 and the existing `colorMode` field. No migration. Unknown stored values keep falling back to System.

**Rationale**: The three stored values already exist, and the field is already per window. The only change is how the value is chosen.

**Alternatives considered**:
- Bump the schema version. Rejected: no document shape changes, so a bump would only add migration code.

## R9. Tests and validation

**Decision**: Update `tests/unit/commands.test.ts` to assert:
- The catalog contains exactly three `theme.mode.*` commands in the Theme group and in the palette.
- The catalog contains zero `theme.cycleMode` entries.
- The palette marks exactly the active mode as `current` and leaves the other two unmarked.
- The palette omits all mode annotations when no theme state is supplied.
- The Theme scope contains eight variant rows plus three mode rows.
- Searching `mode` returns all three mode rows.

Add to `tests/unit/store.test.ts`: `sanitizeColorMode` and `sanitizeWindows` fall back to `system` for an unknown value.

**Rationale**: These are the behaviors that live in pure code. The menu check state needs the Electron runtime, so the quickstart covers it by hand.

**Alternatives considered**:
- Add an Electron integration test for the menu. Rejected for this feature: no harness exists, and the sync helper is three lookups plus an assignment.
