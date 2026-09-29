# Contract: Window Lifecycle, Menu, and Accelerators

Governs how windows are created, made independent, placed, restored, and closed,
and how the New Window / Close Window commands surface in the menu, palette, and
keyboard. Requirements: FR-001–FR-017.

## Command catalog changes

Two catalog commands drive this feature; the catalog stays the single source of
labels and accelerators (constitution III).

| Command | Label | Accelerator | Group | Palette | Notes |
| --- | --- | --- | --- | --- | --- |
| `window.new` | New Window | `⌘N` | other | listed | Opens an additional independent window |
| `window.close` | Close Window | `⌘W` | other | listed | Closes the current window |

`window.close` gains its `⌘W` accelerator (001 deliberately left it off; FR-010
now requires it). `window.new` is new. Neither is in the no-OS-accelerator set, so
both are registered as application-menu accelerators and fire with DevTools
focused (FR-006).

## Menu

The application menu gains a **File** menu and the Window menu loses its Close
item, so there is one obvious home for window commands.

| Menu | Items |
| --- | --- |
| File | New Window `⌘N` · Close Window `⌘W` |
| Window | Minimize, Zoom, Front (standard roles) |

Every menu item remains a catalog command; clicks dispatch to the **focused**
window. The Developer menu (008) also targets the focused window.

## New Window

1. `⌘N`, **File → New Window**, or the palette row runs `window.new` on the
   focused window.
2. A new `WindowRecord` is appended: fresh `id`, `target: null`, cascaded `bounds`,
   `dockMode` inherited from the focused window, `devtoolsOpen: false`,
   `stripVisible: false`.
3. A new window opens with the themed backdrop and the **location** palette armed
   and focused (decision C). It does not load a target until one is submitted.
4. Dismissing the palette without a target leaves the window open and blank; `⌘L`
   / `⌘P` reopen the target entry (FR-012).
5. If a target is submitted, that window loads it and records it; sibling windows
   are untouched.

**Cascade rule**: the new window's position is the focused window's origin plus a
fixed offset (e.g. 32 px), clamped so the title area stays on a visible display.

## Independence

Each window owns its target, bounds, DevTools open/dock, strip, theme variant, and
color mode. Changing any of these updates only that window's record and that
window's views. The color mode governs the tool's own surfaces (window background,
palette, strip, shell); the guest page's `prefers-color-scheme` and the docked
DevTools' internal theme follow the OS. Changing a **shared** preference
(installed extensions) fans out to every window, and loading a target merges into
the shared recents so every window sees it (FR-005, FR-008, FR-009).

## Restore on launch

Boot reads `windows`:

| Condition | Result |
| --- | --- |
| No records (first launch, or all were closed) | One window at `DEFAULT_TARGET` (FR-013) |
| Records present | One window per record, in order |

For each restored record:

- `target` non-null → load it; `target` null → blank + location palette.
- `bounds` non-null and intersecting a connected display → use it; otherwise the
  window falls back to a visible default, clamped to the minimum size (FR-017).

## Close and quit

- Closing a window removes its `WindowRecord` and closes only that window's views;
  siblings are unaffected (FR-007).
- The app quits when the **last** window closes, preserving today's behaviour.
- Quitting with windows open (`⌘Q`) leaves their records in place so they restore
  next launch (FR-014).

## Exit criteria

- One new window per invocation, original window still present and interactive.
- Every new window's location entry is focused on open.
- A second window never changes a first window's target, DevTools, strip, or theme.
- Quit-and-relaunch restores each saved window at its saved position and target.
