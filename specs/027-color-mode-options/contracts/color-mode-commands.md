# Contract: Color Mode Commands

**Feature**: `027-color-mode-options`
**Date**: 2026-10-25

This contract covers the three color-mode commands, their palette rows, their Theme menu items, and the stored per-window value. It does not add a new IPC channel.

## 1. Command Catalog

Each mode is one catalog command in the `theme` group.

| Command id | Palette label | Menu label | Palette listed | Accelerator |
|------------|---------------|------------|----------------|-------------|
| `theme.mode.light` | `Color Mode: Light` | `Light` | Yes | None |
| `theme.mode.dark` | `Color Mode: Dark` | `Dark` | Yes | None |
| `theme.mode.system` | `Color Mode: System` | `System` | Yes | None |

Rules:

1. The catalog MUST contain exactly these three mode commands.
2. The catalog MUST NOT contain `theme.cycleMode`.
3. Every mode command MUST carry `group: "theme"`.
4. No mode command carries a keyboard accelerator. The palette is the keyboard path.

## 2. Palette Row Contract

Given a query and optional theme state `{ variant, colorMode }`:

1. A blank or matching query MUST offer all three mode rows in the Theme group.
2. When theme state is supplied, exactly the row whose slug equals `colorMode` MUST carry `detail: "current"`.
3. The other two rows MUST carry no `detail`.
4. When theme state is absent, all three rows MUST carry no `detail`.
5. Selecting a row MUST dispatch that row's command id through the same registry the keybindings use.
6. The row label MUST be the catalog label, so fuzzy matching and match indices stay stable.

Example, with `colorMode: "dark"`:

```text
Color Mode: Light
Color Mode: Dark    current
Color Mode: System
```

## 3. Theme Menu Contract

The Theme menu contains, in order: the eight variant items, a separator, then the three mode items.

| Menu item id | Type | Label | Checked source |
|--------------|------|-------|----------------|
| `theme.mode.light` | `radio` | `Light` | Focused window's `colorMode === "light"` |
| `theme.mode.dark` | `radio` | `Dark` | Focused window's `colorMode === "dark"` |
| `theme.mode.system` | `radio` | `System` | Focused window's `colorMode === "system"` |

Rules:

1. Exactly one mode item MUST be checked.
2. The checked value MUST come from the focused window. When no window is focused, the mark MUST show `System`.
3. A mode change MUST update the mark before the menu is next opened.
4. A window-focus change MUST update the mark for the newly focused window.
5. The update MUST mutate `checked` on the existing items. It MUST NOT rebuild the application menu.
6. The mode items MUST keep their catalog command ids, so a click dispatches through `WindowManager.runOnFocused`.
7. Clicking the already-checked item MUST dispatch its command and leave the mark unchanged.

## 4. Effect of a Mode Command

On dispatch for the focused window:

1. Store the mode in that window's record.
2. Resolve the appearance:
   - `light` → light tokens.
   - `dark` → dark tokens.
   - `system` → the OS appearance at that moment.
3. Repaint the window background and shell.
4. Repaint the docked DevTools palette when DevTools are open.
5. Broadcast the updated shell state.
6. Update the Theme menu mark.
7. Leave every other window unchanged.

The command MUST be idempotent. Selecting the active mode writes the same value and produces no visible change.

## 5. Persistence Contract

Stored shape, per window (unchanged from schema version 4):

```json
{
  "windows": [
    {
      "id": "…",
      "colorMode": "light"
    }
  ]
}
```

Rules:

1. `colorMode` MUST be one of `light`, `dark`, or `system`.
2. Any other value MUST sanitize to `system` on read.
3. The value MUST persist across launches.
4. A new window MUST inherit the focused window's mode, or `system` when no window is focused.
5. No schema version bump and no migration.

## 6. IPC Contract (unchanged)

The existing preload API and IPC handler stay as they are:

| Channel | Payload | Result |
|---------|---------|--------|
| `theme:setColorMode` | `{ mode: "light" \| "dark" \| "system" }` | `{ ok: true }` |

The mode commands call the same window method as this channel. No new channel and no new preload method.

## 7. Non-Goals

- No new color mode beyond the three.
- No global mode shared by all windows.
- No change to the guest page's preferred color scheme.
- No change to the DevTools docking behavior or the eight mineral variants.
- No keyboard accelerator for any mode command.

## 8. Verification Hooks

| Behavior | Verification |
|----------|--------------|
| Catalog has three modes and no cycle | Unit test on `COMMANDS` |
| Palette marks exactly one active mode | Unit test on `buildRows` |
| Palette leaves all three unmarked without theme state | Unit test on `buildRows` |
| Unknown stored mode sanitizes to System | Unit test on `sanitizeColorMode` |
| Menu marks and repaint | Manual quickstart |
| Persistence and multi-window | Manual quickstart |
