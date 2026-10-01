---

description: "Task list for the Trackpad Swipe History Navigation feature"

---

# Tasks: Trackpad Swipe History Navigation

**Input**: Design documents from `/specs/015-trackpad-swipe-navigation/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The plan (`## Delivery Order`, M1) commits to Vitest coverage for the pure `HistoryGesture` state machine and the shared armed predicate, so those unit-test tasks are listed. All other verification is manual through `quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` and `tests/` at repository root; specs under `specs/015-trackpad-swipe-navigation/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Retire the one architectural risk before any UI work (constitution: spike-first; plan `## Delivery Order` M0).

- [ ] T001 Run the M0 spike gate on a real Mac trackpad and record the outcome in `specs/015-trackpad-swipe-navigation/research.md` §10: log the `input-event` stream during (a) a deliberate back/forward swipe, (b) vertical scroll on a tall page, (c) horizontal scroll on a wide element, and (d) a swipe with "Swipe between pages" set to include two fingers. Record which phase types arrive, the exact `deltaX` / `deltaY` values and sign for Back vs Forward, `hasPreciseScrollingDeltas`, whether `gestureScrollEnd` arrives, whether `canScroll` separates a consumed scroll from a boundary, and whether `win.on("swipe")` also fires for the same gesture. If `canScroll` is unreliable, adopt the documented fallback (dominant-axis + large commit distance + single-fire, research §2).

**Checkpoint**: The event fields, the direction sign constant, and the gating strategy are confirmed before build-out.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared armed type/predicate and the pure gesture state machine that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Create `src/shared/history.ts` per contracts/history-gesture-protocol.md `## Shared type and predicate`: `export type HistoryDirection = "back" | "forward"`, `export interface HistoryArmed { direction: HistoryDirection; progress: number }`, and `export function isHistoryArmedVisible(armed: HistoryArmed | null, paletteOpen: boolean): boolean` returning `armed !== null && !paletteOpen`.
- [ ] T003 [P] Create `tests/unit/history.test.ts` covering the predicate: `null` never visible; armed with the palette closed visible; armed with the palette open hidden; both directions visible.
- [ ] T004 [P] Create `src/main/shell/history-gesture.ts` with the pure `HistoryGesture` class from contracts/history-gesture-protocol.md `## Detector contract`: `begin()`, `update(sample)` returning `{ armed, commit }`, `end()`, `reset()`. Feed it `GestureSample` (`deltaX` normalized positive = Back, `deltaY`, `scrollable`, `canGoBack`, `canGoForward`, `now`); hold no timers (time is injected). Constants per data-model.md `## Constants`: `dominantRatio` ≈ 1.2, `releaseOffset < armDistance < commitDistance`, `idleMs` ≈ 150, `swipeGuardMs` ≈ 300 (export names so tests can import them).
- [ ] T005 [P] Create `tests/unit/history-gesture.test.ts` covering the state machine (data-model.md `## State machine: gesture`): vertical-dominant input never arms; `scrollable === true` never arms; horizontal-dominant past `armDistance` with history available arms the correct direction; history unavailable never arms; past `commitDistance` emits `commit` once; further travel does not re-commit until `begin()`; `end()` clears arm without commit; reversal below `releaseOffset` clears without commit; `reset()` requires a fresh `begin()`.

**Checkpoint**: The armed type/predicate and the gesture machine are tested; the adapter can be wired against a fixed contract.

---

## Phase 3: User Story 1 - Two-finger swipe moves through history (Priority: P1) 🎯 MVP

**Goal**: A two-finger horizontal swipe moves history (right = Back, left = Forward), commits once, and never fires from ordinary vertical or horizontal scrolling.

**Independent Test**: Visit two pages; swipe right → previous page, swipe left → next page, exactly one step each. Scroll vertically and horizontally and confirm no navigation. At a history boundary, swiping does nothing.

### Implementation for User Story 1

- [ ] T006 [US1] In `src/main/shell/window.ts`, add the input adapter: subscribe `this.siteView.webContents.on("input-event", this.handleGestureInput)` and map only trackpad input — precise `mouseWheel` (`hasPreciseScrollingDeltas === true`) plus `gestureScrollBegin` / `gestureScrollUpdate` / `gestureScrollEnd` — reading `deltaX` / `deltaY` / `canScroll` by direct property access (native getters; never serialize the event, per `specs/002-trackpad-navigation`). Normalize the sign so positive = Back (per T001), call `begin()` on a begin/idle-start, `update()` per event, and `end()` on an explicit end; ignore non-precise wheel and `gesturePinch*`/touch events. Pass `scrollable` from `canScroll` (or the T001 fallback) and `canGoBack`/`canGoForward` from `navigationHistory`.
- [ ] T007 [US1] In `src/main/shell/window.ts`, act on the machine outcome: when `commit` is `"back"` / `"forward"`, run the existing `view.back` / `view.forward` command (the same path as `⌘←` / `⌘→`), never calling `navigationHistory` directly. Ignore `armed` in this story (the overlay is US2), so navigation is fully testable on its own.
- [ ] T008 [US1] In `src/main/shell/window.ts`, reset the gesture (no navigation) on a guest `did-navigate` / `did-navigate-in-page` (another source moved history) and on `win` `close`; remove the `input-event` listener during teardown so no listener survives a closed window.
- [ ] T009 [US1] Validate User Story 1 against `specs/015-trackpad-swipe-navigation/quickstart.md` S1 (swipe back/forward, one step), S3.3–S3.5 (vertical and diagonal scroll never navigate, horizontal element scroll unchanged), S4 (one step, boundary no-op), and S10 (spike confirmation of sign/fields); record results for `validation.md`.

**Checkpoint**: The gesture navigates history with no overlay involved; User Story 1 is a viable MVP.

---

## Phase 4: User Story 2 - The overlay shows the swipe is armed (Priority: P1)

**Goal**: While a horizontal gesture is past the arm distance with history available, a subtle edge overlay signals the armed direction; continuing commits it, while lifting or reversing cancels and clears it.

**Independent Test**: Begin a horizontal swipe on a page with back history and hold it past the arm point — the overlay appears on the left edge. Lift without continuing — the overlay leaves and nothing navigates. Repeat leftward for the right edge and Forward.

### Implementation for User Story 2

- [ ] T010 [US2] In `src/main/shell/window.ts`, own and broadcast the arm state: store the machine's `armed` value, send `history:armed` with `HistoryArmed | null` whenever it changes and once from `markShellReady` (contracts/history-gesture-protocol.md `## IPC channel`), and make `desiredShellMode()` return `"full"` while `isHistoryArmedVisible(armed, paletteOpen)` is true so the edge overlay can paint; grow at once when armed and defer the shrink through the existing settle protocol when cleared.
- [ ] T011 [P] [US2] In `src/renderer/src/composables/useShell.ts`, add a `historyArmed` ref (`HistoryArmed | null`), subscribe with `api.on("history:armed", (payload) => { historyArmed.value = (payload as HistoryArmed | null) ?? null; })`, and expose it from `useShell()`.
- [ ] T012 [P] [US2] Create `src/renderer/src/components/HistoryOverlay.vue`: a full-height, absolutely positioned, non-interactive (`pointer-events: none`, `aria-hidden="true"`) edge indicator on the left for Back and the right for Forward — a soft edge gradient plus a chevron pointing in the direction of travel — its opacity scaled by `progress` (dimmer when just armed, clearer as it nears commit). Color MUST derive from Tlapalli tokens (`--tb-accent` / `--tb-fg*`); enter/leave MUST use the shared motion values and collapse to an instant change under `prefers-reduced-motion` (constitution VI, FR-012).
- [ ] T013 [US2] In `src/renderer/src/App.vue`, mount `HistoryOverlay` (with `Transition`) above the page but below the palette when `isHistoryArmedVisible(historyArmed, paletteOpen)` is true, so main's `full` shell mode and the renderer's mounted overlay read the same predicate (FR-010).
- [ ] T014 [US2] In `src/main/shell/window.ts`, clear the arm (send `null`, relayout) on `win` `blur` and `hide`, and while a surface that owns input is up (palette, loading veil, failure view, extension status, dev preview); reset the machine on each so a stale armed signal can never linger (FR-006).
- [ ] T015 [US2] Add the dev-only preview per the constitution / specs/008: a `previewHistoryArm()` method in `src/main/shell/window.ts` that arms the overlay in a representative state (alternating Back/Forward) and holds it, wired to a Developer-menu item in `src/main/index.ts`, absent from packaged builds.
- [ ] T016 [US2] Validate User Story 2 against quickstart.md S2 (arm, progress, commit), S3.1–S3.2 (lift and reverse cancel), S5 (subtle, directional, non-interactive, zero chrome at rest, theme-following), S8 (reduced motion), and S11 (dev preview); record results for `validation.md`.

**Checkpoint**: The armed overlay appears, commits, and cancels independently; User Stories 1 and 2 both function.

---

## Phase 5: User Story 3 - The gesture feels native and does not fight the page (Priority: P2)

**Goal**: Momentum, diagonal bias, horizontal-scroll boundaries, the OS swipe setting, and DevTools focus never produce an unexpected or double navigation.

**Independent Test**: Scroll a wide element to its end, scroll diagonally, and swipe with momentum — no navigation fires from momentum or diagonal input, a deliberate fresh swipe is honored, and a horizontal scroll over focused DevTools does not move the guest history.

### Implementation for User Story 3

- [ ] T017 [US3] In `src/main/shell/window.ts`, harden the gesture lifecycle: close the gesture on `gestureFlingStart` and on `idleMs` of silence when no explicit `gestureScrollEnd` arrives, so released momentum is inert and a fresh navigation requires a new `begin()`; add the coalescing guard — ignore a `win.on("swipe")` event arriving within `swipeGuardMs` of a trackpad gesture stream so one physical swipe cannot navigate twice, while a discrete mouse-driver `swipe` (no preceding gesture stream) still navigates as in 002 (FR-004, FR-014).
- [ ] T018 [US3] In `src/main/shell/history-gesture.ts`, refine the robustness rules per the T001 outcome: tune `dominantRatio` and the `releaseOffset` hysteresis so marginal jitter never strobes the arm, and implement the fallback gating (dominant-axis + larger `commitDistance` + single-fire) when `scrollable`/`canScroll` is unavailable; keep the invariant `releaseOffset < armDistance < commitDistance`.
- [ ] T019 [P] [US3] Extend `tests/unit/history-gesture.test.ts` with the hardening cases: momentum/further travel after commit produces no second `commit`; a diagonal gesture with vertical bias never arms; a boundary (`scrollable === false`) gesture arms while a consumed (`true`) one does not; reversal within the hysteresis band keeps the arm; the fallback path (gate unavailable) still fires once and only on a deliberate swipe.
- [ ] T020 [US3] Validate User Story 3 against quickstart.md S3 (wide-element boundary, diagonal), S4 (momentum inert, fresh gesture honored), S6.3 (one trackpad swipe navigates once with the OS setting on), S7.1 (focused DevTools scrolls itself), and S9 (focus loss clears the arm); record results for `validation.md`.

**Checkpoint**: The gesture no longer interferes with page scrolling or momentum; all three stories function independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution audit, documentation, full validation, and the checks gate.

- [ ] T021 [P] Audit `src/renderer/src/components/HistoryOverlay.vue` and `src/renderer/src/App.vue` against the constitution: confirm zero painted pixels at rest (I), no guest-page injection (II), Tlapalli-only colors (VI), `pointer-events: none` (FR-010), and an instant reduced-motion path (FR-012).
- [ ] T022 [P] Update `README.md`: document that a two-finger horizontal swipe navigates history (right = back, left = forward) with an armed overlay, alongside the existing `⌘←` / `⌘→` and mouse-button routes (constitution III).
- [ ] T023 Run the full `quickstart.md` matrix (S1–S12, including the S10 spike outcome, the S9 focus-loss/multi-window checks, and an idle-CPU baseline confirming no timer runs while no gesture is in progress) and write results to `specs/015-trackpad-swipe-navigation/validation.md`, mirroring the 001/013 validation tables.
- [ ] T024 Run `vp check`, `vp test`, and `npm run typecheck` (scripts in `package.json`); fix any failures so node, preload, and web configurations are clean (Development Workflow gate).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 gates the adapter constant and the gating strategy.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **User Stories (Phase 3+)**: depend on Foundational.
  - US1 (P1) is the MVP and can ship alone.
  - US2 (P1) builds on US1's detector and uses the machine's `armed` output.
  - US3 (P2) hardens US1's gesture and the OS-swipe coexistence.
- **Polish (Phase 6)**: depends on the stories being complete.

### User Story Dependencies

- **US1**: after Phase 2; no dependency on other stories. **MVP.**
- **US2**: after US1 (needs the detector feeding `armed` and a history move to commit).
- **US3**: after US1 (hardens the same gesture); independent of US2.

### Within Each User Story

- Pure logic and its tests before wiring; main before renderer; manual validation last.
- `src/main/shell/history-gesture.ts` is touched by T004, T018 — sequential.
- `src/main/shell/window.ts` is the serialization point (T006, T007, T008, T010, T014, T015, T017) — keep those sequential.
- `src/renderer/src/App.vue` is touched by T013 only after T011 and T012 land.
- `tests/unit/history-gesture.test.ts` is touched by T005 and T019 — sequential.

### Parallel Opportunities

- After T002 lands, T003, T004 (and its test T005) touch different files and can run together.
- T011 and T012 (renderer composable and component) touch different files and can run together.
- T021 and T022 touch different files and can run together at the end.

---

## Parallel Example: Foundational Logic

```bash
# After T001, build the shared type/predicate and the pure machine together:
Task: "Create src/shared/history.ts"                       # T002
Task: "Create tests/unit/history.test.ts"                  # T003
Task: "Create src/main/shell/history-gesture.ts"           # T004
Task: "Create tests/unit/history-gesture.test.ts"          # T005
```

## Parallel Example: Renderer for User Story 2

```bash
# After T010, the renderer composable and component are independent files:
Task: "Add the historyArmed ref in src/renderer/src/composables/useShell.ts"  # T011
Task: "Create src/renderer/src/components/HistoryOverlay.vue"                # T012
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 (M0 spike) and Phase 2 (foundational).
2. Complete Phase 3 (US1): the two-finger history gesture with scroll protection.
3. **STOP and VALIDATE**: quickstart S1, S3.3–S3.5, S4 — swipes move history and scrolling never does.
4. This alone delivers the requested navigation; ship/demo if ready.

### Incremental Delivery

1. Setup + Foundational → predicate and pure machine ready.
2. US1 → swipe navigation works (MVP).
3. US2 → armed overlay appears, commits, and cancels; dev preview for styling.
4. US3 → momentum/diagonal/boundary/OS-swipe hardening.
5. Polish → constitution audit, README, validation, checks.

### Notes

- [P] = different files, no dependency on an incomplete task.
- [Story] labels map tasks to spec user stories for traceability.
- `src/main/shell/window.ts` is the primary serialization point; everything else is largely parallelizable.
- Tests are limited to the two pure modules (`history-gesture.ts`, the shared predicate) because the live gesture and shell overlay have no DOM harness; the Electron adapter and the overlay are validated manually via `quickstart.md`.
- Commit after each task or logical group; stop at each checkpoint to validate the story independently.
