# Quickstart: Color Mode Options

**Feature**: `027-color-mode-options`
**Date**: 2026-10-25

Run these scenarios against a development build. They prove the spec end to end. Command labels and invariants are defined in [contracts/color-mode-commands.md](./contracts/color-mode-commands.md).

## Prerequisites

- macOS with a light and a dark appearance available.
- Node 24 and pnpm installed.
- Repository dependencies installed.

## Setup

```bash
pnpm install
pnpm dev
```

The dev build uses its own `Tlachialoni Dev` profile. A restart of `pnpm dev` therefore exercises the real persisted state without touching the installed app.

## Automated Checks

Run all three before the manual scenarios:

```bash
pnpm typecheck
pnpm test
pnpm check
```

Expected: no errors. The unit suite covers the catalog, the palette current marker, the absence of the cycle command, and the unknown-mode fallback.

## Scenario 1: Choose a Mode From the Palette

1. Press `⌘P` to open the palette.
2. Type `mode`.
3. Confirm three rows appear in the Theme group: `Color Mode: Light`, `Color Mode: Dark`, `Color Mode: System`.
4. Select `Color Mode: Dark`.

Expected: the window surfaces render dark on that first selection. The palette row for Dark now reads `current`, and the other two rows carry no marker.

## Scenario 2: Re-select the Active Mode

1. With the mode set to Dark, open the palette and select `Color Mode: Dark` again.

Expected: the appearance does not change, does not flicker, and `current` stays on Dark. The stored value is still `dark`.

## Scenario 3: Theme Menu Mark

1. Open the **Theme** menu in the menu bar.
2. Inspect the items after the separator.
3. Select **Light**.

Expected: `Light`, `Dark`, and `System` appear as three separate items. Exactly one carries the selection mark. After selecting Light, the mark moves to Light and the window renders light.

## Scenario 4: System Follows the OS

1. Select `Color Mode: System` from the palette.
2. Open **System Settings → Appearance**.
3. Switch from Light to Dark, then back to Light.

Expected: the window follows each change without a restart. The palette marker stays on System and the Theme menu mark stays on System.

## Scenario 5: Pinned Modes Ignore the OS

1. Select `Color Mode: Dark`.
2. Change the OS appearance to Light in System Settings.

Expected: the window stays dark. The marker stays on Dark.
3. Select `Color Mode: Light` and change the OS appearance to Dark.

Expected: the window stays light.

## Scenario 6: Window Independence

1. Open a second window with `⌘N`.
2. Set the first window to Dark.
3. Focus the second window and set it to Light.
4. Focus each window in turn and open the Theme menu.

Expected: each window keeps its own appearance. The Theme menu mark follows the focused window. Changing one window never changes the other.

## Scenario 7: Persistence

1. Set window A to Dark and window B to Light.
2. Quit the dev build.
3. Start `pnpm dev` again.

Expected: window A restores dark and window B restores light. Both Theme menu marks and palette `current` rows agree with the restored values.

## Scenario 8: DevTools Parity

1. Open docked DevTools with `⌘⌥J`.
2. Switch the mode from Dark to Light.

Expected: the shell and the DevTools panel both repaint to light in the same change. DevTools do not need to be closed or reopened.

## Scenario 9: Guest Page Untouched

1. Load a local page that reports its own color scheme, for example with a `prefers-color-scheme` media query.
2. Switch the tool between Light and Dark.

Expected: the guest page's own reported scheme does not follow the tool's pinned mode. The tool changes only its own surfaces.

## Scenario 10: No Cycle Entry

1. Open the palette and search `cycle`.
2. Open the Theme menu and look for a cycle entry.

Expected: no cycle command exists on either surface. The only mode entries are Light, Dark, and System.

## Pass Criteria

All ten scenarios pass, and the three automated checks are green. If a scenario fails, record the window count, the focused window's mode, the OS appearance, and the surface that showed the wrong state.
