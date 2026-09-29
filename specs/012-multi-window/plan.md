# Implementation Plan: Multi-Window Instances

**Feature Branch**: `012-multi-window`

**Created**: 2026-09-28

**Spec**: `specs/012-multi-window/spec.md`

## Summary

Turn the single-window app into a multi-window one. A process-level window
manager owns the set of windows and the one shared state store; a **New Window**
command (`⌘N`, File → New Window, palette row) opens an additional window that is
a fully independent instance — its own target, its own docked DevTools, its own
strip. New windows open blank with the location palette armed (spec decision C),
and each window's geometry, target, and surface state are persisted per window so
the workspace is restored on the next launch (decision B). The app quits when the
last window closes (decision A).

This is a structural change, not a leaf feature: the current code assumes exactly
one window (a `mainWindow` global, per-window IPC registration, a single
`state.target`/`state.bounds`). Those assumptions are the work.

## Technical Context

- **Runtime**: Electron 44 (`BaseWindow` + `WebContentsView`), macOS; Vue 3 shell
  renderer; TypeScript.
- **State**: existing atomic JSON `StateStore`, schema version 2 → 3. One store
  instance per process, shared by all windows.
- **Sessions**: guest views keep the default session (extensions live there);
  shell views keep `partition: "shell"`. Unchanged.
- **Extensions**: one process-wide `ExtensionManager`; its single `onChange` /
  `onStatus` callbacks must become multi-listener or be owned by the manager so
  several windows can observe them.
- **IPC**: process-global `ipcMain` handlers; must be registered once and routed
  to the owning window by `event.sender` (today they are registered per window and
  would throw on the second one).
- **Menus**: one application menu; items act on the focused window.
- **Testing**: Vitest unit tests for the pure modules (schema/migration, store
  merge, geometry/cascade, command catalog).

## Architecture

### Window manager (new)

`src/main/shell/window-manager.ts` — the process-level owner of:

- the one shared `StateStore` and `ExtensionManager`;
- `windows: Map<windowId, AppWindow>` and `focused: AppWindow | null`;
- creation (`createNew`), restoration (`restoreAll`), and teardown
  (`remove`), each maintaining the persisted window records;
- IPC routing: resolve the sender's `WebContents` id back to its `AppWindow`;
- menu dispatch: run a command on the focused window;
- shared-change broadcast: push state to every window when a shared preference
  (installed extensions) changes. Theme is per-window and is not broadcast.

`index.ts` shrinks to: build store + extension manager, hand them to the manager,
`installMenu(manager)`, then `restoreAll()` (or a single default window when
there are no records).

### Windows become independent

`AppWindow` gains an identity and per-window state:

| Concern | Today | After |
| --- | --- | --- |
| Identity | none | `windowId` (uuid), stable across a launch and persisted |
| Initial target | always `state.target` | `initialTarget: string \| null`; `null` = blank + location palette |
| Bounds | `state.bounds` | this window's record bounds |
| DevTools open / dock | shared `state.*` | per-window record fields |
| Strip visible | shared `state.stripVisible` | per-window record field |
| Theme variant / color mode | shared `state.*` | per-window record fields |
| IPC registration | via `registerIpc(this)` in the ctor | once in the manager; methods invoked by routing |

`DevToolsController` currently writes straight to the store; it will write through
a small per-window surface accessor supplied by `AppWindow` so dock side/open and
strip land on the window's own record. Its polling/notify logic is unchanged.

`AppWindow.getState()` composes the **shared** state with **this window's** record
into the existing `WindowViewState` shape the renderer already consumes, so the
Vue shell needs no shape change (`state.target`, `state.dockMode`,
`state.devtoolsOpen`, `state.stripVisible` simply now mean "this window's").

### Blank new windows (FR-011, decision C)

`createNew` builds a record with `target: null` and cascaded bounds, persists it,
and constructs an `AppWindow` with `initialTarget: null`. The constructor skips the
initial load (no `loadTarget`), leaving a themed backdrop (the window background
colour), and once the shell reports ready it runs `openPalette("", "location")`.
Dismissing the palette without a target leaves the window open and retargetable
(FR-012); `⌘L`/`⌘P` are the path back.

### Persistence (schema 3)

`PersistedState` keeps the shared extension list and recents, and replaces the
single `target`/`bounds`/`dockMode`/`devtoolsOpen`/`stripVisible`/`variant`/
`colorMode` with an ordered `windows: WindowRecord[]`. Each record carries `id`,
`target | null`, `bounds`, and this window's `dockMode`/`devtoolsOpen`/
`stripVisible`/`variant`/`colorMode`.

Details and the migration from v2 are in `data-model.md`; the shape is in
`contracts/state.schema.json`.

Store write discipline (all windows share one in-process instance):

- **windows**: merge by `id` on write — a window updates/replaces only its own
  record and never drops a sibling's (mirrors the existing recents merge);
- **recents**: unchanged read-merge-write;
- **shared list** (`extensions`): last-writer-wins.

Closing a window removes its record; quitting with windows open keeps them.

### Boot and restore (FR-013–FR-017)

`restoreAll()` reads `windows`:

- **no records** (first launch, or everything was closed): create one window at
  `DEFAULT_TARGET` (preserves today's cold start);
- **records present**: one `AppWindow` per record, in order, each at its saved
  bounds and target (a `null` target restores the blank + location state).

Saved bounds are validated against the connected displays; missing, malformed, or
off-screen geometry falls back to a visible default. Newly created windows (not
restored) cascade from the focused window's bounds with a fixed offset.

### Menu (FR-010)

A new **File** menu holds `window.new` (`⌘N`) and `window.close` (`⌘W`); the
**Window** menu keeps Minimize/Zoom/Front and drops the duplicate Close. Both are
catalog commands, so the palette and accelerators stay sourced from `COMMANDS`
(constitution III). Menu clicks dispatch to the focused window. `⌘N`/`⌘W` are
registered as OS accelerators so they fire with DevTools focused (FR-006).

### Extension status across windows

`ExtensionManager.onChange` / `onStatus` move under the manager's ownership so a
single manager can notify every window (change) and route a status to the window
that initiated it, falling back to the focused window. `AppWindow` no longer
assigns these in its constructor (today the last-constructed window wins).

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design.*

- **I. Chromeless by default** — PASS. No permanent chrome is added; the File
  menu is an OS menu bar entry (as already sanctioned by 011) and a blank window
  shows only the transient palette over the themed backdrop.
- **II. Guest page is sacred** — PASS. Each window gets its own sandboxed guest
  view; extensions still load only into the guest session, shell stays separate.
- **III. Keyboard-first** — PASS. New/Close Window are catalog commands with
  accelerators and palette rows; the menu and palette cannot drift.
- **IV. Real Chromium DevTools, docked** — PASS. Dock state becomes per-window;
  still the real DevTools, docked, persisted.
- **V. One Target Per Window** — PASS. The rule is preserved exactly; this
  feature is the "multiple independent instances" the principle already sanctions,
  now expressible inside one process. Per-window geometry supersedes 001 FR-004's
  last-writer-wins note (see Complexity Tracking) but does not weaken V.
- **VI. Identity through Tlapalli** — PASS. No new colours; each window derives
  from Tlapalli tokens, and the blank backdrop is the existing themed window
  background.

**Governance note**: moving DevTools open/dock, strip, theme variant, and color
mode from shared to per-window contradicts a sentence in the constitution's
**State** foundation and 001 FR-004/FR-016/FR-017. A PATCH-level amendment (no
meaning change to the principles, only to the state-sharing description) is
applied alongside this change.

## Project Structure

### Documentation (this feature)

```text
specs/012-multi-window/
├── plan.md                     # This file
├── spec.md                     # Feature specification
├── research.md                 # Phase 0: decisions
├── data-model.md               # Phase 1: entities, schema 3, migration
├── quickstart.md               # Phase 1: validation scenarios
├── contracts/
│   ├── state.schema.json       # Persisted state (v3), JSON Schema
│   ├── window-lifecycle.md     # New/close/restore/cascade + File menu
│   └── ipc-routing.md          # Sender-routed IPC contract
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/main/
├── index.ts                    # boot: store + extensions + WindowManager + menu
├── ipc.ts                      # register once; route by sender (rework)
├── shell/
│   ├── window-manager.ts       # NEW: window set, focus, routing, broadcast
│   ├── window.ts               # AppWindow: windowId, per-window surfaces/theme, blank start
│   ├── devtools.ts             # write through a per-window surface accessor
│   ├── commands.ts             # (unchanged)
│   ├── shell-view.ts           # (unchanged)
│   └── site-view.ts            # (unchanged)
├── state/
│   ├── schema.ts               # v3: windows[] records, migration, sanitize
│   └── store.ts                # windows merge-by-id, shared extension writes
└── extensions/
    └── manager.ts              # multi-listener change/status routing

src/shared/
└── commands.ts                 # + window.new (⌘N); + ⌘W on window.close

tests/unit/
├── store.test.ts               # window record merge, migration
├── commands.test.ts            # catalog gains window.new/accelerators
└── geometry.test.ts            # NEW: cascade + off-screen fallback (pure)
```

**Structure Decision**: single Electron project; the change is concentrated in the
main process (`shell/`, `state/`, `ipc.ts`), plus one command-catalog entry in
`src/shared`. The Vue renderer and both preloads are unchanged apart from the
renderer already rendering whatever state it is handed.

## Complexity Tracking

| Divergence | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| DevTools open/dock, strip, theme variant, and color mode move from shared to per-window (contra 001 FR-004/FR-016/FR-017 and the constitution's State line) | FR-005/FR-009 require windows to be independent; shared surfaces/theme would make one window change another, defeating the P1 story | Keeping them shared: toggling DevTools or the theme in one window would change every window — visibly wrong, and it contradicts the spec's core "opened independently" |
| One process, many windows (vs. requiring one OS process per window) | `⌘N`/File → New Window is an in-app action; macOS re-launch activates the existing process, so a per-process model cannot deliver it | Spawning a child process per window: heavy, shared-session behaviour changes, and macOS would not drive it from `⌘N` |

## Risks

- **Structural refactor**: every `state.x` read for target/bounds/dock/strip/theme
  must move to the window record; a missed spot silently re-shares state. Mitigation:
  the store facade exposes the per-window record explicitly and tests cover the
  shared-vs-per-window split.
- **IPC double-registration**: register handlers once; resolve the sender. A
  second window must not re-register (today it would throw).
- **Multi-process × multi-window**: two app processes each with several windows
  share one file. The merge-by-`id` rule (plus recents merge) keeps records from
  clobbering; document that cross-process window records are last-writer-wins per
  `id`.
- **Blank-window edge**: ensure a `null`-target window never falls into the failure
  view and that `currentUrl`-dependent paths (back/forward, focus) degrade safely.
- **Extension status routing**: with several windows, decide the target window for
  a status (initiator, else focused) so a toast does not appear everywhere.
- **Constitution amendment**: queue the State-foundation PATCH (above) so reviews
  do not flag the deliberate divergence.
