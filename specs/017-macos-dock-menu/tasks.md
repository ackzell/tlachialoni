---

description: "Task list for macOS Dock window management"
---

# Tasks: macOS Dock Window Management

**Input**: Design documents from `/specs/017-macos-dock-menu/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dock-menu.md, quickstart.md

**Tests**: Included. The plan (`M1`) and the project's Development Workflow
(`vp test`) call for a unit test of the pure Dock menu builder; no TDD-first
ordering is required.

**Organization**: Tasks are grouped by user story (US1–US4) so each can be
implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are included in every task

## Path Conventions

Single desktop-app project: `src/main/` (Electron main), `src/preload/`,
`src/renderer/`, `src/shared/`, and `tests/unit/` at the repository root. This
feature touches **main only** plus one unit test.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the baseline and the "no new surface" constraints before code.

- [X] T001 Run `npm run typecheck`, `npm run check`, and `npm run test` from the repo root and confirm they are green; confirm this feature adds no dependency, IPC channel, preload/renderer change, or persisted field (plan.md Technical Context)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure, shared Dock menu core that every menu story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Create `src/main/shell/dock-menu.ts` with `DockWindowEntry { id: string; label: string }`, `DockRecentEntry { url: string; label: string }`, `DockMenuActions { newWindow: () => void; focusWindow: (id: string) => void; openRecent: (url: string) => void }`, and a pure `buildDockMenuTemplate(windows, recents, actions): Electron.MenuItemConstructorOptions[]` emitting: New Window first; separator; one item per window (label with `Untitled` fallback, `click → actions.focusWindow(id)`); separator + a `Recent Projects` submenu **only when `recents.length > 0`** (`click → actions.openRecent(url)`). Import only the `Electron.MenuItemConstructorOptions` **type** (no runtime Electron), per `contracts/dock-menu.md`
- [X] T003 ~~In `src/main/shell/window.ts`: capture the raw page title…~~ — **superseded and reverted; see Correction log**
- [X] T004 [P] Create `tests/unit/dock-menu.test.ts` covering `buildDockMenuTemplate`: item order, per-window labels, `Untitled` fallback, separator/section omission, and click routing to the correct action + argument (depends on T002)

**Checkpoint**: The pure builder and the window label are ready; no story behavior yet.

---

## Phase 3: User Story 1 - See and activate any open window from the Dock (Priority: P1) 🎯 MVP

**Goal**: The Dock menu lists every live window and raises the chosen one, staying
in sync as windows are created, closed, or renamed.

**Independent Test**: `quickstart.md` §1–§3 — with three windows open, the menu
lists all three; choosing one focuses it (restores if minimized); closing one and
retitling another updates the menu.

### Implementation for User Story 1

- [X] T005 [US1] Add `WindowManager.focusWindow(id)` in `src/main/shell/window-manager.ts`: no-op when the id is unknown or the window `isDestroyed()`; `restore()` if `isMinimized()`; `show()`; `focus()`; `app.focus({ steal: true })`; `touch(id)` (FR-004)
- [X] T006 [US1] Add `WindowManager.dockWindowEntries()` and `WindowManager.refreshDockMenu()` in `src/main/shell/window-manager.ts`: return early unless `process.platform === "darwin"` and use `app.dock?.`; map `this.windows` (creation order) to `{ id: w.windowId, label: w.titleLabel() }`; install with `app.dock?.setMenu(Menu.buildFromTemplate(buildDockMenuTemplate(entries, [], { newWindow: () => this.createNew(), focusWindow: (id) => this.focusWindow(id), openRecent: () => {} })))` (FR-001, FR-003, FR-015) (depends on T002, T003, T005)
- [X] T007 [US1] In `src/main/shell/window-manager.ts`, call `refreshDockMenu()` at the end of `spawn()` and in `handleClosed()`, and pass `onTitleChange: () => this.refreshDockMenu()` when constructing the `AppWindow` in `spawn()` (FR-005, FR-010) (depends on T006)
- [X] T008 [P] [US1] Extend `tests/unit/dock-menu.test.ts`: zero windows yields only New Window (no separators); N windows yields N items in creation order; each click calls `focusWindow` with its own id; an empty label renders as `Untitled`

**Checkpoint**: US1 is fully functional and independently testable (the menu also
ships the New Window row, whose behavior is owned by US2).

---

## Phase 4: User Story 2 - New Window from the Dock (Priority: P1)

**Goal**: Choosing New Window from the Dock opens a window with the location entry
armed, identically to the in-app `window.new` command.

**Independent Test**: `quickstart.md` §4 — with one window open, Dock New Window
opens exactly one additional window with the location entry focused and leaves the
original untouched.

### Implementation for User Story 2

- [X] T009 [US2] In `src/main/shell/window-manager.ts`, extract a private `spawnNew(target: string | null)` (record build, cascade, theme/dock inheritance) and route `createNew()` (target `null`) and a new `openTarget(target)` through it, so the Dock New Window and the `window.new` command share one path (FR-011); `createNew()` behavior is unchanged
- [X] T010 [P] [US2] Extend `tests/unit/dock-menu.test.ts` to assert the New Window item is present and first, and that its click invokes the injected `newWindow` action (the manager wires this to `createNew()`)

**Checkpoint**: US1 and US2 both work; New Window from the Dock is equivalent to the command.

---

## Phase 5: User Story 3 - Reopen a recent project from the Dock (Priority: P2)

**Goal**: The Dock menu offers the same recent projects the command palette shows,
and choosing one opens a window on that target.

**Independent Test**: `quickstart.md` §5 — after loading two targets, Recent
Projects lists them and choosing one opens a window on it; with no recents the
section is absent.

### Implementation for User Story 3

- [X] T011 [US3] Add `WindowManager.openTarget(target: string)` in `src/main/shell/window-manager.ts`, creating a window at that target via `spawnNew(target)` (FR-006) (depends on T009)
- [X] T012 [US3] In `WindowManager.refreshDockMenu()` (`src/main/shell/window-manager.ts`), call `this.store.refreshRecents()` and pass `recents.map((r) => ({ url: r.url, label: r.url }))` plus `openRecent: (url) => this.openTarget(url)`; leave the empty case to the builder (FR-006, FR-012) (depends on T006, T009, T011)
- [X] T013 [P] [US3] Extend `tests/unit/dock-menu.test.ts`: recents present yields a `Recent Projects` submenu with each url and `click → openRecent(url)`; recents empty yields no submenu

**Checkpoint**: All menu stories (US1–US3) are independently functional.

---

## Phase 6: User Story 4 - Native Dock-icon behavior (Priority: P2)

**Goal**: Clicking the Dock icon focuses an existing window, or opens one when the
app is running with none; the app stays resident on macOS.

**Independent Test**: `quickstart.md` §6 — click the Dock icon with windows open
(focuses one); close all windows without quitting (app stays running); click again
(opens a window); `⌘Q` + relaunch restores the saved set.

### Implementation for User Story 4

- [X] T014 [US4] Add `WindowManager.activate()` in `src/main/shell/window-manager.ts`: focus the most-recently-focused window via `focusWindow(focused().windowId)`, else `createNew()` (FR-007, FR-008) (depends on T005, T009)
- [X] T015 [US4] In `src/main/index.ts`, register `app.on("activate", () => manager.activate())` after `boot()`, and change the `window-all-closed` handler to `if (process.platform !== "darwin") app.quit()` so macOS stays resident while every other platform is unchanged (FR-009, FR-014)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification, parity, and documentation across all stories.

- [X] T016 [P] Run `npm run typecheck`, `npm run check`, and `npm run test` and fix every failure (SC-007)
- [ ] T017 Validate `quickstart.md` §1–§7 on macOS with `npm run dev`; record the outcomes — **REQUIRES A HUMAN**: this agent environment has no GUI session (`npx electron .` aborts with SIGABRT headlessly), so the interactive Dock scenarios could not be exercised here. Automated coverage passed: typecheck, `vp check`, 172 unit tests, and `npm run build`
- [X] T018 [P] Verify isolation and parity: no new IPC channel, preload method, renderer change, or persisted field; `refreshDockMenu` is a no-op off macOS; closing the last window still quits off macOS (FR-013, FR-014, SC-006)
- [X] T019 [P] Update `README.md`: add `specs/017-macos-dock-menu/spec.md` to the design-docs list and note the macOS last-window lifecycle change from `012-multi-window`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational; proceed in priority order (US1 → US2 → US3 → US4) or in parallel where staffing allows
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories (MVP)
- **US2 (P1)**: After Foundational — its create path (`spawnNew`) also serves US3
- **US3 (P2)**: After US2 (T011 needs the `spawnNew` from T009)
- **US4 (P2)**: After US1 (T014 reuses `focusWindow`) and US2 (reuses `createNew`/`spawnNew`)

### Within Each User Story

- Pure/shared code before manager wiring
- Manager wiring before its tests
- No story is complete until its independent test passes

### Parallel Opportunities

- Phase 2: T002, T003, T004 can run in parallel (T004 depends only on T002's signature)
- US1: T008 is parallel with T005–T007 once the builder exists
- US2/US3 tests (T010, T013) are parallel with each other
- Polish: T016, T018, T019 are parallel

---

## Parallel Example: User Story 1

```bash
# Once T002–T004 land, the US1 window-list wiring and its test can split:
Task: "T005 focusWindow(id) in src/main/shell/window-manager.ts"
Task: "T008 [P] window-list cases in tests/unit/dock-menu.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T011 openTarget(target) in src/main/shell/window-manager.ts"
Task: "T013 [P] recents-submenu cases in tests/unit/dock-menu.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1
4. **STOP and VALIDATE**: run `quickstart.md` §1–§3
5. Demo: the Dock lists and activates every window, live-synced

### Incremental Delivery

1. Setup + Foundational → shared menu core ready
2. US1 → window list + activation (MVP)
3. US2 → New Window parity
4. US3 → recent projects
5. US4 → native Dock-icon behavior + macOS residency
6. Polish → checks, quickstart, isolation/parity, docs

---

## Notes

- [P] tasks touch different files (or different test sections) with no incomplete dependencies
- The Dock menu is main-process only: no IPC, preload, renderer, or schema change
  (FR-013); `refreshDockMenu` is a no-op off macOS (FR-014)
- The only behavior change to an existing contract is macOS `window-all-closed`
  (T015), deliberate and documented in `contracts/dock-menu.md`
- Commit after each task or logical group; keep `vp check` and `vp test` green

---

## Correction log (post-implementation)

The first implementation shipped **our own open-window list** in the Dock menu, on
top of the one macOS already provides. The result was two window lists in the Dock
menu. The window list was removed; the following tasks are affected:

| Task | What changed |
| --- | --- |
| T003 | **Reverted.** `AppWindow.titleLabel()`, `onTitleChange`, and the `pageTitle` field were all removed — they existed only to label our own window list. `window.ts` is no longer touched by this feature. |
| T005 | `focusWindow` kept, but now used only by `activate()` (the Dock-icon click). The macOS window list handles menu activation. |
| T006 | `refreshDockMenu` kept, but no longer maps windows to entries; `dockWindowEntries()` is gone and the recents section is grouped by origin. |
| T007 | Menu rebuilds happen on window create/close only; the title-change hook is gone. |
| T008 | Rewritten: the window-list assertions were replaced by grouping and leaf-collapse cases. |
| T004, T010, T013 | Rewritten for the `Recent` label and origin grouping. |

Two user-driven refinements were also folded in after review:

- The recents section is labeled **`Recent`**, not "Recent Projects".
- Recents are **grouped by origin** (palette parity, via `recentHost`), and an
  origin with a **single** entry renders as a leaf with no drill-down level.

Docs updated to match: `spec.md` (FR-003–FR-006, FR-012, US1, US3), `plan.md`,
`research.md` (adds a "Post-implementation correction" section), `data-model.md`,
`contracts/dock-menu.md`, `quickstart.md`.
