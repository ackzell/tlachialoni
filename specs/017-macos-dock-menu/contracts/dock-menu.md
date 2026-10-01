# Contract: macOS Dock Menu

Defines the native Dock menu the application installs on macOS, the actions its
items route to, and the lifecycle wiring around it. There is **no new IPC channel,
no preload change, no renderer change, and no persisted field**; every action calls
existing main-process window logic. Requirements: FR-001–FR-015.

## What macOS provides for free (important)

AppKit appends a **native window list** to every app's Dock menu — with the key
window checked — and activates the chosen window. Electron's Dock Menu guide
describes this as the system-provided window management utilities: "show all
windows, hide the app, and switch between different open windows."

That list satisfies FR-003 (list every open window), FR-004 (raise the chosen
window), and FR-005 (stay synchronized, since it reads live window titles). Our
menu therefore MUST NOT add a second window list (doing so showed a visible
duplicate; see research.md "Post-implementation correction").

## Menu composition (authoritative)

`buildDockMenuTemplate(recents, actions)` returns an
`Electron.MenuItemConstructorOptions[]`:

```text
┌ <macOS-provided window list>        (system; not ours)
├ New Window                          → actions.newWindow()
└ ───────────────  (separator, only when recents exist)
  Recent ▸
    ├ localhost:3000                  (single entry → leaf, no drill-down)
    ├ localhost:5173/dashboard        (single entry, path kept for detail)
    └ localhost:8080 ▸                (several entries → drilled down)
        /admin
        /
        /admin/users
```

Rules:

- **New Window** is always present, first, and labeled `New Window`.
- The **Recent** submenu is present only when there is at least one recent; it
  never shows an empty header or a disabled placeholder (FR-015).
- Recents are **grouped by origin**, newest first, exactly as the command palette
  groups them: the group key is the origin, its label is `host:port`, and each
  child is labeled with its path (plus query/hash). Grouping by origin — not
  hostname — is what keeps `localhost:3000` and `localhost:5173` apart. The
  origin key is `recentHost()` from `src/main/state/schema.ts`, the same function
  the palette's grouping and the recents cap use.
- An origin with **exactly one** entry is rendered as a **leaf**, not a
  drill-down: labeled by host alone for a root target (`localhost:3000`), or host
  plus path when the path adds information (`localhost:5173/dashboard`). Going one
  level deeper to show one item adds nothing.
- An unparseable url falls back to itself for both the group and the leaf label.
- The Dock shows the **same bounded list the palette shows** (30 entries overall,
  5 per origin — `MAX_RECENTS` / `MAX_RECENTS_PER_HOST`); no Dock-specific cap is
  applied.
- The open-window list is deliberately absent — macOS owns it.

## Action routing (main process only)

| Item | Handler | Behavior |
| --- | --- | --- |
| New Window | `WindowManager.createNew()` | Same code path as the `window.new` command: a blank window with the location entry armed, cascaded, inheriting the focused window's theme/dock side (FR-002, FR-011) |
| Recent item (leaf or child) | `WindowManager.openTarget(url)` | Creates a window at that validated target via the shared `spawnNew(target)` path (FR-006) |

No handler touches the guest page, the renderer, or another window's state beyond
raising it.

## Lifecycle wiring (`src/main/index.ts`)

| Event | Handler |
| --- | --- |
| `app.on("activate")` (Dock icon click; registered after `boot()`) | `manager.activate()` → `focusWindow` the most-recently-focused window, else `createNew()` (FR-007, FR-008) |
| `app.on("window-all-closed")` | `if (process.platform !== "darwin") app.quit()` — on macOS the app stays resident so the Dock stays available (FR-009); every other platform is unchanged (FR-014) |
| `app.on("before-quit")` | Unchanged: `manager.beginQuit()` preserves the saved window set on `⌘Q` |

## Rebuild contract

The Dock menu MUST be rebuilt and re-set (`Menu.buildFromTemplate` →
`app.dock.setMenu`) when its app-specific content could be stale — the recent list:

| Trigger | Call site |
| --- | --- |
| Window created | `WindowManager.spawn` |
| Window closed | `WindowManager.handleClosed` |

The window list itself needs no rebuild: macOS maintains it. `refreshDockMenu()`
re-reads recents (`store.refreshRecents()`), is a no-op off macOS, and is guarded by
`app.dock?.`, so `process.platform !== "darwin"` produces no Dock menu and no
behavior change.

## Deliberate change from `012-multi-window`

`012`'s window-lifecycle contract says "the app quits when the last window closes."
This feature narrows that to non-macOS only: **on macOS the app remains running with
no windows** so the Dock icon and its menu stay available, and a subsequent Dock
click opens a window. Quitting is unchanged everywhere else, and `⌘Q` still
preserves the saved window set.

## Exit criteria

- The Dock menu shows New Window and (when present) a Recent submenu grouped by
  origin; it does not duplicate the macOS-provided window list.
- An origin with one entry has no drill-down level.
- Choosing New Window opens exactly one window; choosing any recent — leaf or
  grouped child — opens exactly one window on that target.
- Clicking the Dock icon focuses an existing window, or opens one when none exists.
- No IPC channel, preload method, renderer change, or persisted field is added, and
  non-macOS behavior is unchanged.