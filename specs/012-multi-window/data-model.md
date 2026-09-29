# Phase 1 Data Model: Multi-Window Instances

Persisted state stays in the one JSON document under Electron's `userData`
directory (atomic writes, 001). This feature bumps it to **schema version 3**:
the single per-app window fields become an ordered list of window records, so
several windows can be restored independently, and theme (variant + color mode)
moves into each record so it is per-window. Only the installed-extension list and
recents stay shared. The persisted shape is authoritative in
`contracts/state.schema.json`; the renderer-facing shape is in
`contracts/ipc-routing.md`.

## Entity: PersistedState (v3)

| Field | Type | Default | Shared? | Purpose / requirements |
| --- | --- | --- | --- | --- |
| `schemaVersion` | integer | `3` | — | Enables forward migration |
| `recents` | `RecentEntry[]` | `[]` | yes (merged) | Shared history; unchanged from 001/010 |
| `extensions` | `InstalledExtension[]` | `[]` | yes (LWW) | Installed extensions (007), FR-008 |
| `windows` | `WindowRecord[]` | `[]` | per record | Open windows, in creation order; restored on launch (FR-014, FR-015) |

**Removed vs v2**: top-level `target`, `bounds`, `dockMode`, `devtoolsOpen`,
`stripVisible`, `variant`, `colorMode` — these move into each `WindowRecord` so
theme is per-window too (FR-009).

### Validation rules (on load and on write)

- **Shared fields**: the extension record validation is unchanged.
- **Recents**: unchanged — dedupe by URL, newest first, capped (001, 010).
- **`windows`**: each entry must be an object with a non-empty string `id`; a
  missing/duplicate `id` entry is dropped. `target` must satisfy the local-target
  policy or be `null`. `bounds`, when present, must be four finite numbers, with
  width/height clamped to at least 480 × 360. `dockMode` must be one of
  `bottom|right|left`; `devtoolsOpen`/`stripVisible` must be booleans; `variant`
  must be a known slug and `colorMode` one of `system|dark|light`, else defaults.
  A malformed record never invalidates the rest of the state.
- **Cap**: a sane maximum (e.g. 16) window records; extras are dropped so a
  corrupt file cannot spawn an unbounded number of windows.
- **Unknown/missing fields**: ignored / defaulted, as in 001.

## Entity: WindowRecord

One open window, persisted so the workspace survives a launch.

| Attribute | Type | Default (new window) | Purpose / requirements |
| --- | --- | --- | --- |
| `id` | string (uuid) | generated | Stable identity; the merge key (research §4) |
| `target` | string \| null | `null` | This window's page; `null` = blank + location prompt (FR-011) |
| `bounds` | `{x,y,width,height}` \| null | cascaded from the focused window | This window's frame to restore (FR-014, FR-016) |
| `dockMode` | `bottom` \| `right` \| `left` | inherited from the focused window | This window's DevTools dock side (FR-009) |
| `devtoolsOpen` | boolean | `false` | This window's DevTools state (FR-009) |
| `stripVisible` | boolean | `false` | This window's strip visibility (FR-009) |
| `variant` | `VariantSlug` | inherited from the focused window, else `obsidian` | This window's Tlapalli variant (FR-009) |
| `colorMode` | `system` \| `dark` \| `light` | inherited from the focused window, else `system` | This window's color mode for the tool's surfaces (FR-009) |

**Invariants**

- `id` is unique across `windows` for the life of a launch.
- A record exists for every open window and for no closed window.
- `target`, when non-null, satisfies the local-target policy (never a
  `chrome://`, `file://`, etc.).

## Entity: WindowViewState (renderer-facing)

The shape `AppWindow.getState()` returns and `state:changed` pushes. It is the
v2 `ShellState` the Vue shell already consumes, composed from the shared state plus
one window's record. Keeping this shape stable is why the renderer needs no
change (research §10).

| Field | Source | Meaning |
| --- | --- | --- |
| `schemaVersion` | persisted | as stored |
| `target` | **this window's record** | current page, or `null` when blank |
| `recents` | shared | same list in every window |
| `dockMode` | **this window's record** | this window's dock side |
| `devtoolsOpen` | **this window's record** | this window's DevTools state |
| `stripVisible` | **this window's record** | this window's strip |
| `variant` | **this window's record** | this window's theme variant |
| `colorMode` | **this window's record** | this window's color mode |
| `extensions` | shared | installed extensions |

## Entity: Window (runtime)

The live object behind a record; not persisted as such.

| Attribute | Description |
| --- | --- |
| `windowId` | matches its `WindowRecord.id` |
| `store` | the one process-wide `StateStore` |
| `siteView` / `shellView` | this window's guest and shell views |
| `devtools` / `picker` | this window's controllers |
| surface state | palette/loading/failure — transient, never persisted |

## Window lifecycle

```text
                 createNew (⌘N / File / palette)
no records ─────────────────────────────────────► blank window (target null)
   │                                                 + location palette armed
   │ restoreAll                            ┌─────────────┬──────────────┐
   └───────────────► restored window(s) ───┤ target set? │ bounds valid?│
                     (one per record)      └─────────────┴──────────────┘
                                                │              │
                                     null → blank+location   off-screen → default

any open window ── close ──► record removed from `windows`; if it was the last
                             window, the app quits (FR-007)
```

### Transitions and persisted effects

| Event | Persisted effect |
| --- | --- |
| New Window | append a `WindowRecord{ target: null, bounds: cascade, … }` |
| Navigate / SPA route | update that record's `target` |
| Move / resize | update that record's `bounds` |
| DevTools open/dock, strip toggle | update that record's `dockMode`/`devtoolsOpen`/`stripVisible` |
| Theme variant / color mode (this window only) | update that record's `variant`/`colorMode`; no fan-out (FR-009) |
| Extension install/enable/remove | update shared `extensions`; fan out to all windows |
| Target loaded successfully | merge into shared `recents` (unchanged) |
| Window closed | remove that record; quit if none remain |
| Quit with windows open | leave `windows` as-is; restored next launch |

## Migration: v2 → v3

A v2 document

```json
{ "schemaVersion": 2, "target": "http://localhost:3000",
  "bounds": { "x": 100, "y": 100, "width": 1440, "height": 900 },
  "dockMode": "bottom", "devtoolsOpen": true, "stripVisible": false,
  "variant": "obsidian", "colorMode": "system", "recents": [], "extensions": [] }
```

becomes

```json
{ "schemaVersion": 3,
  "windows": [{ "id": "<generated>", "target": "http://localhost:3000",
    "bounds": { "x": 100, "y": 100, "width": 1440, "height": 900 },
    "dockMode": "bottom", "devtoolsOpen": true, "stripVisible": false,
    "variant": "obsidian", "colorMode": "system" }],
  "recents": [], "extensions": [] }
```

Rules:

- Exactly one record is produced, carrying the old target, bounds, surface
  scalars, and theme; the developer's current window is preserved verbatim.
- Recents and extensions carry over untouched.
- A v2 document whose old `target` is invalid still yields one record with the
  default target (or `null` if the policy rejects everything) — never a broken
  launch.
- No document / newer-than-known version → defaults (`windows: []`), and boot
  opens one default window (FR-013).

## Concurrency

- **In-process**: many windows share one `StateStore`; writes are synchronous and
  serialised, so there is no intra-process race.
- **Cross-process**: `windows` is merged by `id` on write (a window replaces only
  its record, remaining records union), `recents` is read-merge-written, and the
  shared extension list is last-writer-wins — extending 001's rule to the window
  list. Per-window theme rides along in the window record.
