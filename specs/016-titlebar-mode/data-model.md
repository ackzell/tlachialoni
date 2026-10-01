# Phase 1 Data Model: Titlebar Mode

One additive persisted field. The store stays at **schema version 3** as 012 defined
it: `titlebarMode` is defaulted, so older documents and older app versions are
compatible without a migration. The authoritative persisted shape remains
`specs/012-multi-window/contracts/state.schema.json`.

## Persisted

### WindowRecord (one new field)

| Attribute | Type | Default | Purpose / requirements |
| --- | --- | --- | --- |
| `titlebarMode` | boolean | `false` | Whether this window docks the strip and pushes the guest content below it (FR-001, FR-008). Toggled by `⇧⌘F` / the palette; persisted per window. |

Validation and migration:

- `sanitizeWindowRecord` coerces the field with
  `typeof record.titlebarMode === "boolean" ? record.titlebarMode : false`, so a
  missing or malformed value becomes `false` (overlay mode) and never invalidates the
  record.
- `defaultWindowRecord`, `migrateLegacyWindow`, `WindowManager.createDefault`, and
  `WindowManager.createNew` all set `titlebarMode: false`, so a first launch and every
  new window start in the default overlay layout (FR-008, SC-005).
- No `SCHEMA_VERSION` bump: the field is additive and the `windows` array is read
  before the version gate, so a v3 document without the field loads as overlay mode.

### WindowViewState (renderer-facing view)

`composeWindowView` adds `titlebarMode: record?.titlebarMode ?? false` to the view
object alongside `stripVisible`; it travels on the existing `state:changed` channel.
No new channel and no new capability.

## Runtime entities

### Titlebar-active (per window)

The derived boolean the layout reads, `titlebarActive() = record.titlebarMode ?? false`.
It is never cached across a store read so a persisted update and a relayout cannot
disagree.

### Content inset

| Attribute | Value | Notes |
| --- | --- | --- |
| `titlebarInset(titlebarMode)` | `STRIP_HEIGHT` (30) when true, else `0` | Shared helper; the guest view's `y` and the full-window surfaces' CSS `top` both use it |
| Site view bounds | `{ x: 0, y: inset, width, height - inset }` | The page and docked DevTools live here (FR-004, FR-011) |
| Shell view bounds (mode on, no surface) | `{ x: 0, y: 0, width, STRIP_HEIGHT }` | The docked strip only |
| Shell view bounds (mode on, surface up) | `{ x: 0, y: 0, width, height }` | Surfaces paint from `inset` down; strip on top |

### Strip surface visibility

```text
stripSurfaceVisible = titlebarMode
                   || ((stripVisible || peeking) && !paletteOpen)
```

Same consumers as 009/013: the shell renderer (whether `DragStrip` mounts) and main
(`syncWindowButtons`, whether the macOS traffic lights show). In titlebar mode the
strip is visible even while the palette is open.

### Proximity / peek (titlebar mode)

| Attribute | Value in titlebar mode | Notes |
| --- | --- | --- |
| `proximityPaused()` | `true` | The hover/peek sensor neither reveals nor dismisses |
| `peeking` | forced `false` on toggle-on | No transient reveal competes with the docked strip |
| `⌘B` (`strip.toggle`) | no-op | Leaves the persisted pin untouched (FR-015) |

## State machine: titlebar mode

```text
                    ⇧⌘F / palette                      ⇧⌘F / palette
        overlay ───────────────────────► titlebar ───────────────────────► overlay
       (default)  ◄─────────────────────  (docked)  ◄───────────────────── (default)
                    ⇧⌘F / palette                      ⇧⌘F / palette
```

Transitions and effects (no navigation in any transition):

| Event | Persisted effect | Layout effect | Other effects |
| --- | --- | --- | --- |
| Enable (overlay → titlebar) | `titlebarMode = true` | site inset `STRIP_HEIGHT`; shell = `strip` (or `full` if a surface is up) | peek cleared; sensor paused; lights shown; strip mounted |
| Disable (titlebar → overlay) | `titlebarMode = false` | site restored to full; shell `strip → band` deferred through the settle protocol | sensor resumes; lights follow the overlay predicate; strip leaves |
| Resize while on | none | inset recomputed; page fills the remainder | — |
| Surface opens while on | none | shell = `full`; surfaces offset by the inset | strip stays visible above |
| DevTools opens/docks while on | `devtoolsOpen` / `dockMode` as today | docked panel moves below the strip with the page | — |
| `⌘B` while on | none | none | no-op |
| Relaunch | `titlebarMode` restored | that window reopens docked | new windows still start in overlay mode |

## Invariants

- `titlebarMode` is the only persisted field this feature adds or writes.
- The guest page is never read, injected into, or modified; its DOM, styles, and
  scripts are untouched (constitution II).
- Toggling is a bounds change only: no `loadURL`, no reload event, and guest scroll,
  history, and form state survive (FR-006, SC-003).
- In titlebar mode the page's top is never covered: the union of the docked strip and
  the content area equals the window content bounds with no overlap.
- The renderer's `DragStrip` presence and the native traffic lights derive from the same
  shared predicate, so they cannot disagree (009 FR-004).
- `titlebarMode` is per `WindowRecord`; every read is per `AppWindow`, so one window's
  toggle never changes another's layout (FR-008).
