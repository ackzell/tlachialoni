# Phase 1 Data Model: macOS Dock Window Management

This feature introduces **no persisted state, no schema change, and no new IPC
payload**. The Dock menu is a projection of one thing the app already owns: the
shared recents (`StateStore.recents`). The open-window list shown in the Dock menu
is **provided by macOS**, not by us (see research.md "Post-implementation
correction"), so it is deliberately absent from this model.

## Persisted entities (unchanged)

### `WindowRecord` — `src/main/state/schema.ts`

Existing per-window record (schema 3). No field is added.

| Field | Type | Used by this feature |
| --- | --- | --- |
| `id` | `string` (uuid) | Identity when raising a window for a Dock-icon click (`activate`) |
| `target` | `string \| null` | Not used directly (the Dock menu's recent items carry their own urls) |
| `bounds` | `Bounds \| null` | Not used (New Window/Recent cascade reuses the existing `spawnNew`) |
| `dockMode` | `"bottom" \| "right" \| "left"` | Inherited by a Dock-created window (existing rule) |
| `devtoolsOpen` | `boolean` | Not used |
| `stripVisible` | `boolean` | Not used |
| `titlebarMode` | `boolean` | Inherited as `false` by a Dock-created window (existing 016 rule) |
| `variant` | `VariantSlug` | Inherited by a Dock-created window (existing rule) |
| `colorMode` | `ColorMode` | Inherited by a Dock-created window (existing rule) |

### `RecentEntry` — `src/main/state/schema.ts`

Existing shared recents entry. No change. Already sanitized to local http/https
targets, de-duplicated by URL, capped by `MAX_RECENTS` (30) and
`MAX_RECENTS_PER_HOST` (5).

| Field | Type | Used by this feature |
| --- | --- | --- |
| `url` | `string` (http/https, local) | Opens a window on this target when chosen |
| `lastOpenedAt` | `number` | Ordering only (list is already newest-first) |

## Transient entities (in memory only)

### `DockRecentEntry` — `src/main/shell/dock-menu.ts`

One recent project as the Dock menu sees it. Labels are **derived** from the url;
no label is carried.

| Field | Type | Rule |
| --- | --- | --- |
| `url` | `string` | A sanitized `RecentEntry.url`; also the click argument and the source of every label |

The Recent submenu is omitted entirely when the list is empty.

### `DockRecentGroup` — `src/main/shell/dock-menu.ts`

`groupRecentsByOrigin()` collapses recents into one group per origin, in first-
appearance order (recents are newest-first, so a group leads with its newest entry).

| Field | Type | Rule |
| --- | --- | --- |
| `origin` | `string` | `recentHost(url)` — the shared origin key, so dev-server ports stay apart |
| `label` | `string` | `host:port` of the group's newest entry (palette parity) |
| `items` | `DockRecentEntry[]` | That origin's recents, newest-first |

A group with **one** entry is rendered as a leaf instead of a submenu: labeled by
host for a root target (`localhost:3000`), or host plus path when the path adds
information (`localhost:5173/dashboard`). An unparseable url falls back to itself.

### `DockMenuTemplate`

`Electron.MenuItemConstructorOptions[]`, produced by
`buildDockMenuTemplate(recents, actions)` and rendered once per rebuild via
`Menu.buildFromTemplate` → `app.dock.setMenu`. Not persisted; discarded on each
rebuild.

## State transitions (rebuild triggers)

| Event | Where | Effect on the Dock menu |
| --- | --- | --- |
| Window created (`spawn`) | `WindowManager.spawn` | Rebuild: re-reads recents |
| Window closed (`handleClosed`) | `WindowManager.handleClosed` | Rebuild: re-reads recents |
| App launch / restore | first `spawn` during `restoreAll` | Rebuild: recents appear |
| Window created/closed/renamed in the OS list | macOS | The system window list updates itself; no rebuild needed |
| Recent target loaded | existing `recordRecent` | Picked up on the next rebuild (fresh read) |

`refreshDockMenu()` reads the current recents (`store.refreshRecents()`) so a target
opened in another instance is reflected the next time the menu is rebuilt.

## Validation rules

- A recent's `url` is already constrained by `sanitizeState`/`isAllowedTarget`, so
  `openTarget` only ever receives a valid local http/https target (001/012 policy).
- `activate()` raises the id returned by `focused()`; `focusWindow(id)` no-ops when
  the id is unknown or the `BaseWindow` is destroyed (FR-007/FR-008).
- No new persisted field means no new sanitizer and **no schema bump**; an older
  file remains fully valid.
