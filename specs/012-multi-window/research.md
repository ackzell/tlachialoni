# Phase 0 Research: Multi-Window Instances

The Technical Context had no `NEEDS CLARIFICATION` markers: the constitution
fixes the runtime (Electron 44), the state store is established (001), and the
feature's three open product decisions were resolved in the spec
(new windows blank + location-focused; per-window geometry persisted and restored;
quit on last window close). The decisions below are the implementation choices
that follow from those.

## 1. Multi-window model: one process, many windows

- **Decision**: `⌘N` opens an additional window **in the same process**. Separate
  OS processes remain possible (nothing adds a single-instance lock), but the
  in-app New Window command is the supported path.
- **Rationale**: File → New Window and `⌘N` are single-process, in-app actions.
  macOS re-launching the app only activates the existing process, so a
  one-process-per-window model cannot deliver them. A shared process also shares
  the one `StateStore`, the extension load, and the app menu, which is what makes
  "shared preferences" simple.
- **Alternatives considered**: spawn a child process per window (rejected: heavy,
  harder to coordinate, and no OS affordance triggers it); keep one window per
  process and rely on launching the app twice (rejected: the user explicitly asked
  to open a new window *from a current one*).

## 2. Which state is shared and which is per-window

- **Decision**:
  - **Per window**: target, window bounds, DevTools open state, DevTools dock side,
    strip visibility, theme variant, and color mode.
  - **Shared (app-wide)**: installed extensions and recents.
- **Rationale**: The P1 requirement is that windows are independent; DevTools, the
  strip, and the theme are window-local concerns, and sharing them would let one
  window change another. Extensions attach to the process's guest session, and
  recents exist to be shared (001 FR-004).
- **Theme scope**: `nativeTheme.themeSource` is process-wide, so a per-window color
  mode can only govern the tool's own surfaces (window background, palette, strip,
  shell). The guest page's `prefers-color-scheme` and the docked DevTools' internal
  theme follow the OS; emulating them per window would need per-webContents CDP
  media overrides and still could not cover DevTools.
- **Alternatives considered**: keep DevTools/strip shared as 001 stated (rejected:
  breaks independence); keep theme shared (rejected: the developer asked for
  per-window theme); set `nativeTheme.themeSource` on focus (rejected: it would
  flip the guest page and DevTools for every window).
- **Note**: This supersedes 001's concurrency note for dock/strip and its
  app-wide theme; a PATCH-level constitution amendment is queued in the plan.

## 3. Persistence shape and migration

- **Decision**: schema version **2 → 3**. Replace the single
  `target`/`bounds`/`dockMode`/`devtoolsOpen`/`stripVisible` with an ordered
  `windows: WindowRecord[]` (`id`, `target | null`, `bounds`, `dockMode`,
  `devtoolsOpen`, `stripVisible`). Keep `schemaVersion`, `recents`, `variant`,
  `colorMode`, `extensions`.
- **Rationale**: Records are the only way to restore "each window at its saved
  position and target" (FR-014). An explicit `id` is what lets a window update
  only its own record without disturbing siblings.
- **Migration**: a v2 document becomes a v3 document with exactly one record
  built from its old `target`/`bounds`/surface scalars, preserving the developer's
  current target, window frame, and DevTools/strip state; the shared scalars carry
  over unchanged. A missing/corrupt document still falls back to defaults
  (`windows: []`), which the boot path turns into one default window (FR-013).
- **Alternatives considered**: key positions by target/host instead of a record id
  (rejected: two windows may legitimately show the same target, and a target may be
  `null`); store a separate parallel bounds array (rejected: more places to keep
  in sync).

## 4. Write discipline across windows

- **Decision**:
  - **`windows`**: merge by `id` on every write — a window replaces only its own
    record and unions in any records it does not own.
  - **recents**: keep the existing read-merge-write.
  - **shared scalars**: last-writer-wins.
  - Closing a window removes its record; quitting with windows open leaves them.
- **Rationale**: All windows in a process share one `StateStore` instance, so
  in-process writes are serialized; the merge-by-`id` rule additionally protects
  against a second app process writing the same file, exactly as the recents merge
  already does (001 research §9).
- **Alternatives considered**: rewrite the whole `windows` array on each write
  (rejected: a stale in-memory copy could drop a sibling's or another process's
  record); an OS file lock (deferred, as in 001).

## 5. IPC routing

- **Decision**: register all `ipcMain` handlers **once**, in the window manager,
  and route each message to the owning `AppWindow` by looking up `event.sender.id`
  in a map maintained when a window is created/destroyed (both its shell and site
  views register their ids). `registerIpc(appWindow)` per constructor is removed.
- **Rationale**: `ipcMain.handle` is process-global; registering per window throws
  "Attempted to register a second handler" on the second window. Sender routing is
  the standard multi-window pattern and keeps each handler acting on the right
  window.
- **Alternatives considered**: `WebContentsView`-scoped IPC (not available in
  Electron); encode the window id in every payload from the renderer (rejected:
  redundant and spoofable, the sender already identifies the window).

## 6. Menu structure and accelerators

- **Decision**: add a **File** menu with `window.new` (`⌘N`) and `window.close`
  (`⌘W`). Remove `window.close` from the **Window** menu, which keeps
  Minimize/Zoom/Front. Menu item clicks run on the focused window.
- **Rationale**: The developer asked for File → New Window; `⌘N`/`⌘W` as OS
  accelerators keep working with DevTools focused (FR-006), matching the existing
  menu rationale from 011. Every item stays a catalog command so labels and
  accelerators cannot drift from the palette (FR-003, constitution III).
- **Alternatives considered**: put New Window in the Window menu (rejected: user
  asked for File); use Electron's `fileMenu` role (rejected: it only offers
  Close, not New Window).

## 7. New-window initial state (blank + location)

- **Decision**: a New Window is created with `target: null`; the window shows the
  themed backdrop and opens the command palette in the `location` scope with an
  empty input; dismissing it leaves the window blank and retargetable.
- **Rationale**: spec decision C — the fastest path to a *different* dev server.
  The palette already supports `openPalette(initial, scope)` and the settle
  protocol keeps the shell full while it is open, so this reuses existing
  machinery.
- **Alternatives considered**: load `DEFAULT_TARGET` (rejected by decision C);
  prefill the current window's target (rejected: invites accidental duplicates);
  a bespoke empty-state surface (rejected: new chrome for a transient need).

## 8. Placement, cascade, and restore validation

- **Decision**: a newly created window cascades from the focused window's bounds by
  a fixed offset; restored windows use their saved bounds. Saved bounds are
  accepted only if they intersect a currently connected display's work area;
  otherwise the window is placed at a visible default. Geometry is clamped to the
  existing minimum size.
- **Rationale**: FR-012/FR-016/FR-017 — a new window must not perfectly occlude
  its parent, and a monitor change must not restore a window off-screen.
- **Alternatives considered**: let Electron's `center` decide (rejected: every new
  window would open dead-centre on top of the parent); store a display id with the
  bounds (rejected: more state than the need requires).

## 9. Extension change/status fan-out

- **Decision**: the window manager owns the process-wide `ExtensionManager`.
  List changes fan out to **all** windows (theme/state refresh); an install/update
  status is shown in the window that initiated the command, falling back to the
  focused window. `AppWindow` no longer assigns `extensions.onChange` /
  `extensions.onStatus` in its constructor.
- **Rationale**: today the last-constructed window overwrites these single
  callbacks, so a second window would steal all extension traffic. Fan-out for
  changes is correct (extensions are shared); status is a transient action result
  and belongs to the window that caused it.
- **Alternatives considered**: broadcast status to every window (rejected: N
  copies of one toast); a dedicated status window (rejected: new surface for a
  transient message).

## 10. Renderer impact

- **Decision**: none required. `AppWindow.getState()` composes shared state with
  the window's own record into the existing `WindowViewState` shape
  (`target`, `dockMode`, `devtoolsOpen`, `stripVisible`, `variant`, `colorMode`,
  `recents`, `extensions`), which the Vue shell already consumes through
  `state:changed` / `state:get`. `variant` and `colorMode` now come from the
  window's record rather than a shared field.
- **Rationale**: Keeping the renderer contract stable confines the refactor to the
  main process and keeps the change reviewable.
- **Alternatives considered**: push a richer shape including the whole window list
  (rejected: the shell does not need sibling windows, and it would grow the IPC
  surface for no behaviour).
