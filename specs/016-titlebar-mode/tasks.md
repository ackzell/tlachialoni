---

description: "Task list for Titlebar Mode"

---

# Tasks: Titlebar Mode

**Input**: Design documents from `specs/016-titlebar-mode/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/titlebar-layout-protocol.md`, `quickstart.md`

**Tests**: Included because `plan.md` lists concrete test deliverables and the
constitution requires `vp test` to pass. Generate/keep them; do not extend beyond what
the plan names.

**Organization**: Tasks are grouped by user story so each can be implemented and
tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: `US1`–`US4`, mapping to the spec's user stories
- Every task names exact file path(s)

## Path Conventions

- Electron single project: `src/`, `tests/` at repository root (see `plan.md`).

---

## Phase 1: Setup (Spike Gate)

**Purpose**: Retire the three M0 unknowns before any UI work, per the constitution's spike-first rule.

- [x] T001 [P] M0 spike — inset `src/main/shell/site-view.ts`'s `WebContentsView` and verify docked DevTools relocate/resize below the strip on **bottom**, **right**, and **left** docks; record the outcome in `specs/016-titlebar-mode/research.md` §8
- [x] T002 [P] M0 spike — plant a sentinel on the guest `window` and a history entry, toggle the inset bounds, and verify no reload and preserved scroll/history (`did-start-loading`/`did-finish-load` never fire); record in `specs/016-titlebar-mode/research.md` §9
- [x] T003 [P] M0 spike — verify the native macOS traffic lights sit inside the 30px docked strip on a frameless `BaseWindow`, including enter/leave fullscreen; record in `specs/016-titlebar-mode/research.md` §10

**Checkpoint**: Spikes retired. If a fallback is needed (DevTools re-dock, or dropping fullscreen behavior), update `plan.md` before continuing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared flag, predicate, and command that every user story reads.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Add `titlebarMode: boolean` (default `false`) to `WindowRecord`, `defaultWindowRecord()`, `migrateLegacyWindow()`, and `sanitizeWindowRecord()` (coerce via `typeof record.titlebarMode === "boolean" ? record.titlebarMode : false`) in `src/main/state/schema.ts` — do NOT bump `SCHEMA_VERSION` (stays 3)
- [x] T005 [P] Extend `isStripSurfaceVisible()` with `titlebarMode` in its state (`if (state.titlebarMode === true) return true;` before the existing rule) and add `titlebarInset(titlebarMode)` returning `STRIP_HEIGHT` or `0` in `src/shared/shell.ts`
- [x] T006 [P] Add the `titlebar.toggle` command to `COMMANDS` in `src/shared/commands.ts`: label `Toggle Titlebar Mode`, `acceleratorLabel: "⇧⌘F"`, `accelerator: { meta: true, shift: true, code: "KeyF" }`, `palette: true`, `group: "other"`
- [x] T007 [P] Add `titlebarMode: boolean` to `ShellState` in `src/renderer/src/composables/useShell.ts` (arrives on the existing `state:changed` channel; no new subscription)
- [x] T008 Add `titlebarMode` to `WindowViewState` and `composeWindowView()` (`record?.titlebarMode ?? false`) in `src/main/state/store.ts` (depends on T004)
- [x] T009 [P] Add unit cases for the `titlebarMode` short-circuit (wins over `paletteOpen`, over pinned, over peek) and for `titlebarInset(true|false)` in `tests/unit/shell.test.ts`
- [x] T010 [P] Add unit cases that a record missing `titlebarMode` sanitizes to `false` and that a set value round-trips through `composeWindowView()` in `tests/unit/store.test.ts`

**Checkpoint**: Foundation ready — `titlebarMode` persists, composes to the renderer, and the shared predicate/inset/command exist.

---

## Phase 3: User Story 1 — Toggle and work with a permanent strip (Priority: P1) 🎯 MVP

**Goal**: `⇧⌘F` (or the palette) turns a window into a layout where the strip is docked and permanently visible and interactive, with no hover, dwell, or `⌘B` pin.

**Independent Test**: Cold-launch, press `⇧⌘F`, move the pointer away from the top; the strip stays and each control actuates. Press `⇧⌘F` again; the overlay behavior returns. (Layout push is US2.)

- [x] T011 [US1] Add a private `titlebarActive()` helper (reads `record()?.titlebarMode ?? false`) and register `titlebar.toggle` as `() => this.toggleTitlebar()`, where `toggleTitlebar()` flips the persisted flag, clears any peek when enabling, calls `broadcastState()`, and relayouts (enable immediate; disable deferred) in `src/main/shell/window.ts`
- [x] T012 [US1] Make `desiredShellMode()` return `"strip"` when `titlebarActive()` and no full-window surface is up (surfaces still return `"full"`) in `src/main/shell/window.ts`
- [x] T013 [US1] Pass `titlebarMode: this.titlebarActive()` into the shared predicate inside `syncWindowButtons()` so the macOS traffic lights stay shown while the docked strip is on screen in `src/main/shell/window.ts`
- [x] T014 [US1] Include `titlebarActive()` in `proximityPaused()` (and force `setPeek(false)` on enable) and make `toggleStrip()` (`⌘B`) return early while `titlebarActive()` in `src/main/shell/window.ts`
- [x] T015 [US1] Compute `stripVisible` from the extended `isStripSurfaceVisible({ stripVisible, peeking, titlebarMode }, paletteOpen)` and add an `is-titlebar` class to `.shell-root` (bound to `state.titlebarMode`) in `src/renderer/src/App.vue`

**Checkpoint**: User Story 1 is independently functional and testable (permanent docked strip + lights), even before the page is pushed.

---

## Phase 4: User Story 2 — The guest page is pushed below, never covered (Priority: P1)

**Goal**: The page and docked DevTools are laid out *below* the strip (a real viewport reflow), so no page pixel is ever covered, and toggling never reloads the page.

**Independent Test**: With an interactive first-row element at `y = 0`, enable the mode and confirm it is fully visible/clickable and `window.innerHeight` shrinks by the inset; toggle on/off and confirm no reload and preserved scroll/state.

- [x] T016 [US2] In `relayout()`, compute `inset = titlebarInset(this.titlebarActive())` and set `siteView.setBounds({ x: 0, y: inset, width, height: Math.max(0, height - inset) })` so a resize recomputes the inset; on disable, restore the site view to full immediately while the shell `strip → band` shrink defers through the settle protocol in `src/main/shell/window.ts` (depends on T011, T012)
- [x] T017 [P] [US2] Add a `--shell-inset` custom property (`STRIP_HEIGHT` under `.shell-root.is-titlebar`, `0` otherwise) in `src/renderer/src/styles/base.css`
- [x] T018 [US2] Offset each full-window surface's top by `var(--shell-inset)` so its content sits below the docked strip in `src/renderer/src/components/CommandPalette.vue`, `LoadingVeil.vue`, `FailureView.vue`, `InstallStatus.vue`, `BlankView.vue`, and `HistoryOverlay.vue`
- [x] T019 [US2] Extend the headless harness in `src/main/dock-test.ts` to assert, after toggling titlebar mode: `siteView` bounds inset by `STRIP_HEIGHT`, guest `window.innerHeight` reduced by the inset, docked DevTools still open below the strip, and a planted sentinel surviving the toggle with no load events

**Checkpoint**: User Stories 1 and 2 together deliver the real feature — a docked strip with the page below it.

---

## Phase 5: User Story 3 — Reach it from the keyboard and palette (Priority: P2)

**Goal**: `⇧⌘F` and a palette row are the complete, documented keyboard path.

**Independent Test**: Press `⇧⌘F` and confirm the mode toggles; open the palette and confirm **Toggle Titlebar Mode** is listed and toggles it; confirm it also works while DevTools has focus.

- [x] T020 [P] [US3] Add `"titlebar.toggle"` to the **View** menu section so it carries an OS accelerator and works while DevTools is focused in `src/main/index.ts`
- [x] T021 [P] [US3] Add command-catalog tests in `tests/unit/commands.test.ts`: `titlebar.toggle` exists, is `palette: true`, carries the `⇧⌘F` accelerator, and `commandForInput()` maps that key to it

**Checkpoint**: US3 is complete; the mode is fully keyboard-reachable and palette-listed.

---

## Phase 6: User Story 4 — Per window and remembered (Priority: P3)

**Goal**: Each window chooses its own layout, the choice survives relaunch, and is independent across windows.

**Independent Test**: Enable in window A only; window B is unchanged; relaunch restores A docked and B overlay; a newly opened window starts in overlay mode.

- [x] T022 [US4] Set `titlebarMode: false` in both `WindowManager.createDefault()` and `WindowManager.createNew()` so a first launch and every new window start in the default overlay layout in `src/main/shell/window-manager.ts`
- [x] T023 [US4] Add a multi-window independence test in `tests/unit/store.test.ts`: two records with different `titlebarMode` values compose independently, and a `patchWindow({ titlebarMode })` on one leaves the other unchanged (same file as T010)

**Checkpoint**: All four stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, governance, and end-to-end validation.

- [x] T024 [P] Document `⇧⌘F` titlebar mode (and its relationship to `⌘B`) in `README.md`'s shortcut list
- [x] T025 [P] Apply the Principle I PATCH clarification proposed in `plan.md` (name the opt-in docked layout as permitted; the default stays chromeless) and bump the version / Last Amended date in `.specify/memory/constitution.md`
- [x] T026 Run the `specs/016-titlebar-mode/quickstart.md` scenarios (S1–S11) and record outcomes, captures, and spike results in `specs/016-titlebar-mode/validation.md`
- [x] T027 Run `vp check`, `vp test`, and `npm run typecheck` and fix any findings; confirm all pass before commit

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run the spikes first; they gate the design.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational.
  - US1 (P1) and US2 (P1) are both P1; US2's layout depends on US1's shell-mode wiring (T011, T012).
  - US3 (P2) and US4 (P3) are largely independent of US1/US2 and may run in parallel once Foundational is done.
- **Polish (Phase 7)**: Depends on all desired stories.

### Story Dependencies

- **US1 (P1)**: After Foundational. No story dependencies.
- **US2 (P1)**: After Foundational; T016 builds on T011/T012 (same file, sequential).
- **US3 (P2)**: After Foundational. Independent (menu + catalog tests).
- **US4 (P3)**: After Foundational. Independent (constructors + tests).

### Within Each Story

- Foundational models/predicate before story behavior.
- `window.ts` tasks (T011–T016) are the same file and MUST be sequential.
- Renderer tasks (T015, T017, T018) touch different files from main and may proceed alongside `window.ts` work where files differ.
- Tests accompany the behavior they cover.

### Parallel Opportunities

- Setup: T001, T002, T003 fully parallel (three independent spikes).
- Foundational: T004, T005, T006, T007, T009, T010 parallel (T008 waits on T004).
- US2: T017 parallels T016 (different files).
- US3: T020 and T021 parallel.
- Polish: T024 and T025 parallel.

---

## Parallel Example: Foundational

```bash
Task: "Add titlebarMode to schema.ts (T004)"
Task: "Extend isStripSurfaceVisible + add titlebarInset in shared/shell.ts (T005)"
Task: "Add titlebar.toggle command in shared/commands.ts (T006)"
Task: "Add titlebarMode to ShellState in useShell.ts (T007)"
Task: "Predicate/inset unit tests in tests/unit/shell.test.ts (T009)"
Task: "Sanitize/round-trip unit tests in tests/unit/store.test.ts (T010)"
```

## Parallel Example: Setup Spikes

```bash
Task: "Spike docked DevTools under the inset (T001)"
Task: "Spike no-reload state preservation across a bounds change (T002)"
Task: "Spike traffic lights + fullscreen (T003)"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (spikes) and Phase 2 (foundation).
2. Complete Phase 3 (US1): the permanent docked strip.
3. Complete Phase 4 (US2): the page pushed below it — **US1 + US2 together are the feature's true MVP**, since US1 alone is a permanent overlay and US2 is what makes it a push.
4. **STOP and VALIDATE**: run quickstart S1–S3, S6–S7 and the headless harness.
5. Then US3 (keyboard/menu completeness) and US4 (persistence/independence).

### Incremental Delivery

1. Foundation → US1 (docked strip, keyboard toggle) → demo.
2. US2 (page below, surfaces below) → demo the full layout.
3. US3 (menu + catalog tests) → demo keyboard completeness.
4. US4 (per-window persistence) → demo multi-window.
5. Polish → docs, constitution PATCH, full validation.

### Parallel Team Strategy

After Foundational:
- Developer A: US1 then US2 (sequential, same `window.ts`).
- Developer B: US3 (menu + `commands.test.ts`).
- Developer C: US4 (`window-manager.ts` + `store.test.ts`).

---

## Notes

- `[P]` tasks = different files, no dependencies.
- `window.ts` tasks (T011–T016) share one file; do them sequentially.
- Every task follows `- [x] TNNN [P?] [USn?] description with file path`.
- Commit after each logical group; run `vp check`/`vp test` before commit.
- Do not modify the guest page; toggling must remain a bounds change only (constitution II, FR-006).
