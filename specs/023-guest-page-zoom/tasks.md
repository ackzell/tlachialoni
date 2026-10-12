# Tasks: Guest Page Zoom

**Input**: Design documents from `specs/023-guest-page-zoom/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — this repo keeps unit coverage for shared logic and the command catalog.

**Note**: This list is **retrospective**. The feature was implemented and validated interactively
before `/speckit.tasks` was run, so every task below is already complete and marked `[X]`. It records
what shipped, in reviewable units, and mirrors the plan's structure; it was not used to drive the work.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Paths are repository-relative

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The shared zoom model and the persisted field everything else builds on.

- [X] T001 Add `zoomIndex: number` to `WindowRecord` and bump `SCHEMA_VERSION` 3 → 4 in `src/main/state/schema.ts`
- [X] T002 [P] Create the shared ladder module `src/shared/zoom.ts` (`ZOOM_STEPS`, `DEFAULT_ZOOM_INDEX`, `clampZoomIndex`, `zoomFactor`, `zoomPercent`, `stepZoom`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The catalog, zoom application, and menu wiring every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Extend `Accelerator` with `shiftInsensitive`/`menuAccelerator` and add `view.zoomIn`/`view.zoomOut`/`view.zoomReset` (view group, palette) in `src/shared/commands.ts`
- [X] T004 Apply `setZoomMode("isolated")` to the guest view, add `applyZoomFactor`, and re-apply after navigation/load in `src/main/shell/window.ts`
- [X] T005 Seed `zoomIndex` on new and restored windows in `src/main/shell/window-manager.ts`
- [X] T006 Map `menuAccelerator` in `toElectronAccelerator` and add the zoom items to the View menu in `src/main/index.ts`

**Checkpoint**: Foundation ready — the ladder, catalog, and application path exist.

---

## Phase 3: User Story 1 - Keyboard Zoom (Priority: P1) 🎯 MVP

**Goal**: `⌘+` / `⌘−` / `⌘0` scale the guest page.

**Independent Test**: Press the three chords and confirm the page steps up/down/reset.

- [X] T007 [US1] Register the three command handlers with a 20 ms dedupe (menu + `before-input-event`) in `src/main/shell/window.ts`
- [X] T008 [P] [US1] Unit tests for the zoom accelerators and shift-insensitive matching in `tests/unit/commands.test.ts`
- [X] T009 [P] [US1] Unit tests for the ladder in `tests/unit/zoom.test.ts`

**Checkpoint**: Keyboard zoom works and is covered.

---

## Phase 4: User Story 2 - Zoom from the Command Palette (Priority: P2)

**Goal**: The same three capabilities are listed in the palette.

**Independent Test**: Open the palette, search "zoom", run each row.

- [X] T010 [US2] Confirm the commands are palette-listed in the `view` group (asserted in `tests/unit/commands.test.ts`); selecting a row runs the same handler as the shortcut

**Checkpoint**: Keyboard and palette both work independently.

---

## Phase 5: User Story 3 - Wheel and Pinch Zoom (Priority: P3)

**Goal**: Command + wheel and trackpad pinch zoom the guest page, natively.

**Independent Test**: `⌘`+wheel and pinch change the level; plain scroll and swipe are unaffected.

- [X] T011 [US3] Extend the native `NSEvent` monitor to report Command + scroll and magnify via a new `onZoom` callback in `native/swipe-navigation/swipe-navigation.mm`
- [X] T012 [P] [US3] Add the `ZoomGestureEvent` type and the `onZoom` option in `src/main/shell/swipe/addon.ts`
- [X] T013 [US3] Route `onZoom` to the window under the pointer in `src/main/shell/swipe/navigation.ts`
- [X] T014 [US3] Implement `onZoomGesture`, the mouse/trackpad/pinch accumulators, and the `discrete` classification in `src/main/shell/window.ts`
- [X] T015 [US3] Debounce zoom persistence (~300 ms, plus window close) in `src/main/shell/window.ts`

**Checkpoint**: Gestures work alongside the keyboard and palette without disturbing scroll or swipe.

---

## Phase 6: User Story 4 - Transient Zoom Indicator (Priority: P3)

**Goal**: A brief bottom-right percentage confirms each change.

**Independent Test**: Trigger any zoom and watch the indicator appear then dismiss without blocking input.

- [X] T016 [P] [US4] Add the `zoomLevel` ref and the `zoom:changed` subscription in `src/renderer/src/composables/useShell.ts`
- [X] T017 [P] [US4] Create `src/renderer/src/components/ZoomIndicator.vue` (bottom-right, `pointer-events: none`, token colors, reduced-motion path)
- [X] T018 [US4] Render `<ZoomIndicator>` with its transition in `src/renderer/src/App.vue`
- [X] T019 [US4] Return `"full"` from `desiredShellMode()` while `zoomStatus` is set in `src/main/shell/window.ts`

**Checkpoint**: All four stories work together.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, remaining tests, and validation.

- [X] T020 [P] Update `research.md`, `plan.md`, `data-model.md`, `contracts/zoom-commands.md`, and `quickstart.md` to match the shipped design
- [X] T021 [P] Extend `tests/unit/store.test.ts` for `zoomIndex` defaulting/clamping and the schema bump
- [X] T022 Run `pnpm typecheck`, `pnpm build`, and `pnpm test` (243 tests passing)
- [X] T023 Manual validation via `quickstart.md` (keyboard, mouse wheel, trackpad scroll, pinch, DevTools yield)

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** blocks all stories.
- **US1 (P1)** after Foundational; **US2 (P2)** builds on US1's catalog entries; **US3 (P3)** adds the
  native path and reuses the same ladder/indicator; **US4 (P3)** is shared by all inputs.
- **Polish (Phase 7)** after the stories.

## Notes

- [P] tasks touch different files and can run in parallel.
- Tests live in `tests/unit/`; the native gesture feel is validated manually (`TLACHIALONI_ZOOM_DEBUG=1`).
- `pnpm check` currently fails only on a pre-existing, unrelated `.github/workflows/release.yml`
  formatting issue.
