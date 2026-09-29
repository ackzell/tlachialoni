# Tasks: Multi-Window Instances

**Input**: Design documents from `specs/012-multi-window/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests are included only for pure logic (schema/migration, store
merge, geometry, catalog), as specified in plan.md's testing strategy. There is no
TDD requirement in the spec, so OS/window behaviour is validated through the
`quickstart.md` scenarios (S1–S10) rather than automated UI tests.

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable. The multi-window *substrate* is foundational because
every story sits on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: The user story this task belongs to (US1–US4)
- Every task includes an exact file path

## Path Conventions

Single project at the repository root: `src/`, `tests/` (see the source tree in
plan.md). Main-process changes dominate; the Vue renderer and preloads are
unchanged.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Catalog entries every later task depends on.

- [x] T001 [P] Add the `window.new` command (label "New Window", `acceleratorLabel` "⌘N", `accelerator { meta: true, code: "KeyN" }`, `palette: true`, `group: "other"`) and add `acceleratorLabel` "⌘W" + `accelerator { meta: true, code: "KeyW" }` to the existing `window.close` entry in `src/shared/commands.ts`; do not add either to any no-accelerator set.
- [x] T002 Add catalog unit tests in `tests/unit/commands.test.ts`: `window.new` exists with the ⌘N accelerator and is palette-listed; `window.close` carries ⌘W; `commandForInput` matches both (depends on T001).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The multi-window substrate. The app must still open exactly one
window at boot when this phase is done, but the state, routing, and window
identity machinery is per-window ready.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Rework `src/main/state/schema.ts` to schema 3: add `WindowRecord { id: string; target: string | null; bounds: Bounds | null; dockMode: DockMode; devtoolsOpen: boolean; stripVisible: boolean }`; `PersistedState` gains `windows: WindowRecord[]` and drops top-level `target`/`bounds`/`dockMode`/`devtoolsOpen`/`stripVisible`; set `SCHEMA_VERSION = 3`; implement v2→v3 migration wrapping the old scalars into one record; sanitize `windows` (unique non-empty string `id`; `target` must pass `isAllowedTarget` or be `null`; `bounds` four finite numbers clamped to at least 480 × 360; `dockMode ∈ bottom|right|left`; booleans default; `MAX_WINDOWS = 16`).
- [x] T004 Rework `src/main/state/store.ts` (depends on T003): `upsertWindow(record)` merges by `id` (ours wins, sibling and other-process records union), `removeWindow(id)` drops only that record, `updateShared(patch)` writes `variant`/`colorMode`/`extensions`, and `composeWindowView(id)` returns the renderer shape (`target`, `dockMode`, `devtoolsOpen`, `stripVisible` from the record; `recents`, `variant`, `colorMode`, `extensions` shared); keep `recordRecent`/`refreshRecents` merging.
- [x] T005 [P] Unit tests in `tests/unit/store.test.ts` (depends on T003/T004): v2→v3 migration preserves target/bounds/surfaces into exactly one record; `upsertWindow` never drops a sibling; `removeWindow` keeps others; malformed records dropped; `MAX_WINDOWS = 16` cap.
- [x] T006 [P] Create pure geometry helpers in `src/main/shell/geometry.ts`: `cascadeBounds(from, offset = 32, workArea)` and `ensureVisibleBounds(bounds, displays)` (returns saved bounds when they intersect a display work area, else a visible default), clamping width/height to `MIN_WIDTH`/`MIN_HEIGHT`.
- [x] T007 [P] Unit tests in `tests/unit/geometry.test.ts` (depends on T006): cascade offsets and clamps; off-screen/malformed bounds fall back to a visible default; minimum-size clamp.
- [x] T008 Create `src/main/shell/window-manager.ts` (depends on T003–T006): owns the one `StateStore` + `ExtensionManager`, `windows: Map<windowId, AppWindow>`, focused-window tracking (window `focus` events), a `WebContents.id → AppWindow` routing map (`registerWindow`/`unregisterWindow`), `resolveSender(sender)`, `focused()`, `runOnFocused(id, arg)`, `broadcastShared()`, `createWindow(record)`, `restoreAll()`, and `remove(id)`.
- [x] T009 Rework `src/main/ipc.ts` (depends on T008): replace `registerIpc(appWindow)` with `registerIpc(manager)` registered **once**; every channel resolves the sender's window via `manager.resolveSender` and acts on it, per `contracts/ipc-routing.md`; shared `theme:setVariant`/`theme:setColorMode` go through the manager and fan out; unknown senders are ignored.
- [x] T010 Rework `src/main/shell/window.ts` (depends on T004/T008): `AppWindow` gains `windowId`; `AppWindowOptions` gains `{ windowId, initialTarget: string | null, bounds }`; `getState()` returns `store.composeWindowView(this.windowId)`; add a per-window surface accessor (get/set `dockMode`/`devtoolsOpen`/`stripVisible` → `store.upsertWindow` on this id); remove `registerIpc(this)` and the `extensions.onChange`/`onStatus` assignments from the constructor; `show()` and `desiredShellMode()` read this window's record.
- [x] T011 Rework `src/main/shell/devtools.ts` (depends on T010): take a per-window `SurfaceState` accessor instead of the global `StateStore`; `open`/`close`/`syncDockSide` write dock mode and open state through it; polling/notify logic unchanged.
- [x] T012 Rework `src/main/extensions/manager.ts`: replace the single `onChange`/`onStatus` callbacks with listener registration (e.g. `addChangeListener(fn)` / `addStatusListener(fn)` returning an unsubscribe) so several windows can observe; install/management logic unchanged.
- [x] T013 Rework `src/main/index.ts` (depends on T008–T012): build the store + extension manager once, construct the `WindowManager`, `installMenu(manager)` with menu clicks dispatching `manager.runOnFocused`, boot a single window via `manager.restoreAll()` (empty `windows` → one window at `DEFAULT_TARGET`), keep `window-all-closed` → quit, drop the single-window `activate` recreation path.
- [x] T014 Baseline verify (depends on T001–T013): `npm run check` and `npm run test` stay green and the app still opens one window at the default target.

**Checkpoint**: The app runs on the multi-window substrate with a single window; user stories can begin.

---

## Phase 3: User Story 1 - Open a new window from the current one (Priority: P1) 🎯 MVP

**Goal**: `⌘N` (and the palette row) opens an additional window that starts blank with the location entry focused; the original window is untouched.

**Independent Test**: With one window open, press `⌘N`; a second blank window appears with the Location palette focused, the first is unchanged, typing a target loads only the new window, and closing one leaves the other running.

- [x] T015 [US1] Implement `WindowManager.createNew()` in `src/main/shell/window-manager.ts`: build a `WindowRecord` (fresh uuid `id`, `target: null`, `bounds` cascaded from the focused window via `geometry.cascadeBounds`, `dockMode` inherited from the focused window else `bottom`, `devtoolsOpen: false`, `stripVisible: false`), `store.upsertWindow` it, construct the `AppWindow`, focus it.
- [x] T016 [US1] Implement the blank start in `src/main/shell/window.ts`: when `initialTarget` is `null`, skip `loadTarget` (leave the themed backdrop), and once `markShellReady` fires call `openPalette("", "location")`; ensure failure/back/forward and `reportLoading` degrade safely with no target.
- [x] T017 [US1] Register `window.new` for a window in `src/main/shell/window.ts` (`registerCommands`) to call the manager's `createNew()`, so both the palette (`command:run`) and the keyboard (`commandForInput` via `before-input-event`) open a window on the focused window.
- [x] T018 [US1] Make close independent in `src/main/shell/window.ts` + `src/main/shell/window-manager.ts`: closing a window removes only its record and routing entries; the app quits only when the last window closes (FR-007).
- [x] T019 [US1] Validate quickstart S1 (blank + focused location), S2 (⌘N and palette) and S6 (close one / quit on last) per `specs/012-multi-window/quickstart.md`.

**Checkpoint**: US1 is a usable MVP — two blank-then-targeted windows can run side by side.

---

## Phase 4: User Story 2 - Windows are fully independent (Priority: P1)

**Goal**: Target, DevTools open/dock, strip, and loading/failure surfaces are per window; acting in one never changes another.

**Independent Test**: Point two windows at different targets and, in one, navigate, reload, go back/forward, toggle/dock DevTools, and toggle the strip; the other window's page and surfaces never change.

- [x] T020 [US2] Complete the per-window surface wiring in `src/main/shell/window.ts` + `src/main/shell/devtools.ts`: `strip.toggle`, dock commands, and `syncWindowButtons`/`desiredShellMode` read and write **this** window's record only.
- [x] T021 [US2] Confirm every push is window-scoped in `src/main/shell/window.ts` (`state:changed`, `devtools:changed`, `viewport:*` go only to this window's shell view) and that per-window changes never call the manager's `broadcastShared`.
- [x] T022 [P] [US2] Unit test in `tests/unit/store.test.ts`: two window records with different `target`/`dockMode`/`devtoolsOpen`/`stripVisible`; `upsertWindow` on one leaves the other's fields intact.
- [x] T023 [US2] Validate quickstart S3 (per-window independence, including a failure in only one window) and the blank-window edge case (dismissing the location entry, then `⌘L` to retarget) per `specs/012-multi-window/quickstart.md`.

**Checkpoint**: Multiple windows are genuinely independent instances.

---

## Phase 5: User Story 3 - Windows are remembered across launches (Priority: P2)

**Goal**: Each window's position and target persist and are restored on the next launch; a first launch opens one default window; bad geometry falls back on-screen.

**Independent Test**: Open two windows at distinct positions with distinct targets (one blank), quit, relaunch; both return at their saved positions with their targets.

- [x] T024 [US3] Implement `WindowManager.restoreAll()` in `src/main/shell/window-manager.ts`: with `windows` non-empty, create one `AppWindow` per record in order (null `target` → blank + location), validating `bounds` with `geometry.ensureVisibleBounds` and falling back when needed; with `windows` empty, create one window at `DEFAULT_TARGET` (FR-013).
- [x] T025 [US3] Persist per-window changes through `store.upsertWindow` in `src/main/shell/window.ts`: bounds on move/resize (as today), `target` on successful load and SPA navigation, and DevTools/strip changes (via the T010 accessor).
- [x] T026 [US3] Remove a window's record on `closed` in `src/main/shell/window-manager.ts` so closed windows do not restore, while quitting with windows open leaves their records in place (FR-014, FR-015).
- [x] T027 [P] [US3] Unit tests in `tests/unit/store.test.ts` quoting the `data-model.md` constraints verbatim: v2→v3 migration; `windows` merge-by-`id`; `target` passes the local-target policy or is `null`; `bounds` four finite numbers clamped to at least 480 × 360; `dockMode ∈ bottom|right|left`; booleans default; `MAX_WINDOWS = 16`.
- [x] T028 [US3] Validate quickstart S7 (restore), S8 (off-screen/malformed bounds fallback) and S9 (v2 migration) per `specs/012-multi-window/quickstart.md`.

**Checkpoint**: A multi-window workspace survives a relaunch.

---

## Phase 6: User Story 4 - New Window is discoverable and consistent (Priority: P2)

**Goal**: A File menu holds New/Close Window (`⌘N`/`⌘W`); `⌘N` fires from DevTools focus; shared preferences stay consistent across windows.

**Independent Test**: File → New Window, `⌘N` (including with DevTools focused), and the palette row all open a window; theme, color mode, extensions, and recents stay consistent across windows.

- [x] T029 [US4] Add the File menu in `src/main/index.ts`: `{ label: "File", submenu: [menuItemFor("window.new"), menuItemFor("window.close")] }`; remove `window.close` from the Window menu (keep Minimize/Zoom/Front); ensure all menu clicks dispatch to the focused window.
- [x] T030 [US4] Implement shared-preference fan-out in `src/main/shell/window-manager.ts` + `src/main/shell/window.ts`: a committed variant/color-mode change and any extension-list change update the shared scalar and refresh **every** window's shell (`broadcastShared`), while native theme handling stays correct.
- [x] T031 [US4] Route extension status to the initiating window in `src/main/shell/window-manager.ts` (else the focused window) and fan change notifications to all windows, per `contracts/ipc-routing.md`.
- [x] T032 [US4] Validate quickstart S4 (shared prefs + recents), S5 (extension status lands only in the initiating window) and S10 (⌘N with DevTools focused) per `specs/012-multi-window/quickstart.md`.

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T033 [P] Docs: update `specs/001-minimal-browser/contracts/commands-and-keys.md` (add `window.new` / `⌘N` and `window.close` `⌘W`; note 001 FR-004 is superseded by 012 for DevTools/dock/strip) and `README.md` (⌘N / ⌘W, and list `specs/012-multi-window/spec.md` under design docs).
- [x] T034 [P] Remove the temporary Sync Impact Report HTML comment from `.specify/memory/constitution.md` before committing (it is scratch, not governance content).
- [x] T035 Run the full `specs/012-multi-window/quickstart.md` S1–S10 plus `npm run check` and `npm run test`; confirm no IPC "second handler" error and no stale routing entries after closing windows.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **User Stories (Phases 3–6)**: depend on Foundational. In priority order US1 → US2 → US3 → US4; US1 and US2 are both P1, US3 and US4 are P2.
- **Polish (Phase 7)**: depends on the desired user stories.

### User Story Dependencies

- **US1 (P1)**: needs only Foundational. Delivers the MVP.
- **US2 (P1)**: needs Foundational; builds directly on US1's window creation (complete the per-window split and prove non-interference).
- **US3 (P2)**: needs Foundational and US1 (there must be windows to persist/restore).
- **US4 (P2)**: needs Foundational; menu/palette listing is independent of US3.

### Within Each Story

- Pure logic + tests before wiring; wiring before manual validation.
- Story complete and validated before moving to the next priority.

### Parallel Opportunities

- Setup: T001 then T002 (T002 depends on T001).
- Foundational: T003, T006 are independent and can start together; T005 follows T003/T004; T007 follows T006; T008–T013 are largely sequential; T014 last.
- US2: T022 [P] can be written while T020/T021 are implemented.
- US3: T027 [P] can be written alongside T024–T026.
- Polish: T033 and T034 are independent.

---

## Parallel Example: Foundational

```bash
# Independent first moves:
Task: "Rework src/main/state/schema.ts to schema 3, add WindowRecord + v2→v3 migration"
Task: "Create pure geometry helpers in src/main/shell/geometry.ts"

# Their tests, once the modules exist:
Task: "Unit tests for migration + store merge in tests/unit/store.test.ts"
Task: "Unit tests for cascade/off-screen fallback in tests/unit/geometry.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (catalog entries).
2. Complete Phase 2: Foundational (the multi-window substrate) — CRITICAL.
3. Complete Phase 3: US1 (New Window, blank + location).
4. **STOP and VALIDATE**: quickstart S1, S2, S6.
5. Demo: two windows on two dev servers.

### Incremental Delivery

1. Setup + Foundational → app runs on the substrate (one window).
2. US1 → open a second window (MVP).
3. US2 → prove independence.
4. US3 → restore the workspace across launches.
5. US4 → File menu, DevTools-focus accelerators, shared-pref consistency.
6. Polish → docs, removal of the temporary constitution report, full validation.

### Parallel Team Strategy

1. One developer (or pair) lands Setup + Foundational together — it is one refactor.
2. Then US2/US3 detail work and US4 (menu/fan-out) can proceed in parallel once US1 exists.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- The one risky task is T010/T013: every `state.x` read for target/bounds/dock/strip must move to the window record; a missed spot silently re-shares state (plan Risk 1).
- Do not re-register IPC per window (T009) — that is what throws on window #2 today.
- Tests cover pure logic only; OS/window behaviour is validated by the quickstart scenarios.
- Validation performed: `npm run typecheck`/`check`/`test` (120) and `npm run build` green; runtime smokes proved a second window constructs without an IPC re-register throw, starts blank, closes without disturbing siblings, survives `⌘Q` restore with saved per-window bounds, and holds independent per-window theme. The remaining S1–S10 visual checks were confirmed while running `npm run dev`.
- Post-implementation fixes folded in: (a) guard window-touching handlers against a destroyed `BaseWindow` when a window closes mid-load; (b) keep window records on app quit (`before-quit`) so `⌘Q` restores the whole workspace.
- Per-window theme (variant + color mode for the tool's surfaces) was added after the first implementation pass; spec/data-model/research/contracts/constitution updated to match.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
