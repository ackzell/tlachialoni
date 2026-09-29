---

description: "Task list for the Always-On Drag Region feature"

---

# Tasks: Always-On Drag Region

**Input**: Design documents from `/specs/013-always-on-drag-region/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The plan (`## Delivery Order`, M1) commits to Vitest coverage for the pure proximity tracker and the extended predicate, so those unit-test tasks are listed. All other verification is manual through `quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` and `tests/` at repository root; specs under `specs/013-always-on-drag-region/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Retire the one architectural risk before any UI work (constitution: spike-first; plan `## Delivery Order` M0).

- [ ] T001 Run the M0 spike gate and record the outcome in `specs/013-always-on-drag-region/research.md`: (a) verify main-process `screen.getCursorScreenPoint()` vs `win.getContentBounds()` reliably detects the top band at the screen edge, on a secondary display, and under Retina scaling; (b) verify whether macOS applies its title-bar double-click-to-zoom to a custom `app-region: drag` region. If (a) fails, adopt the documented `no-drag` sensor fallback (research §6). If (b) fails, mark FR-013 dropped (research §7).

**Checkpoint**: The sensing mechanism and the double-click decision are confirmed before build-out.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared predicate, pure tracker, and the band shell mode that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Extend `src/shared/shell.ts`: add `export const DRAG_BAND_HEIGHT = 36;` and change `isStripSurfaceVisible(state: { stripVisible: boolean; peeking?: boolean }, paletteOpen: boolean)` to return `(state.stripVisible || state.peeking === true) && !paletteOpen` (contracts/strip-peek-protocol.md `## Shared predicate`).
- [X] T003 [P] Update the predicate cases in `tests/unit/shell.test.ts`: pinned and visible; pinned off and hidden; pinned on with the palette open (hidden); hidden but `peeking: true` (visible); `peeking: false` never forces visibility; other state fields ignored.
- [X] T004 [P] Create `src/main/shell/proximity.ts` with the pure `ProximityTracker` from contracts/strip-peek-protocol.md `## Proximity tracker contract`: `update({ cursor, bounds, now, paused })` returns the new `peeking` boolean and `reset()` clears timers. Constants verbatim from data-model.md: `bandHeight` 36, `proximity` 4, `dwellMs` 400, `graceMs` 600. No timers inside the class (time is injected).
- [X] T005 [P] Create `tests/unit/proximity.test.ts` covering the tracker's full state machine (data-model.md `## State machine: peek`): `atEdge` reveals immediately; `inBand` below the edge reveals only after `dwellMs`; staying in band keeps `peeking`; leaving starts the grace timer; re-entering during grace cancels dismissal; grace elapsed hides; `paused` clears and resets; cursor outside the window's x-range or below the band counts as outside.
- [X] T006 Refactor the shell-mode machine in `src/main/shell/window.ts`: replace `type ShellMode = "full" | "strip" | "hidden"` with `"full" | "band"`; make `desiredShellMode()` return `"full"` for palette/loading/failure/extension-status/dev-preview and `"band"` otherwise (no `stripVisible` branch); make `applyShellMode` set the shell view to `{ x: 0, y: 0, width, height: DRAG_BAND_HEIGHT }` and `setVisible(true)` in band mode; update `SHELL_MODE_RANK` to `{ band: 0, full: 1 }` so the settle protocol still defers `full → band` collapses only. Do not hide the shell view in normal use.

**Checkpoint**: Predicate + tracker tested; the overlay stays visible as a 36px band whenever no full surface is up.

---

## Phase 3: User Story 1 - Move the window at any time, pointer only (Priority: P1) 🎯 MVP

**Goal**: The window can be dragged from the top of the window with the pointer alone, whether the strip is hidden, peeking, or pinned.

**Independent Test**: Cold-launch, leave the strip hidden, press inside the top band and drag — the window moves with no keyboard step. Repeat with the strip pinned (`⌘B`).

- [X] T007 [US1] Create `src/renderer/src/components/DragBand.vue`: a transparent, absolutely positioned, full-width, `DRAG_BAND_HEIGHT`-tall (`36px`) element with `user-select: none`, `-webkit-app-region: drag` and `app-region: drag`, and no background or color (zero painted pixels).
- [X] T008 [US1] Mount the band in `src/renderer/src/App.vue` unconditionally so it is always available, layering it below the strip: the band is `z-index: 1` (above full-window surfaces, all `z-index: auto`) and the strip is `z-index: 2`, so the window stays draggable even while the palette, veil, failure view, or status is up (FR-011).
- [X] T009 [US1] Adjust `src/renderer/src/components/DragStrip.vue` so the strip covers the band's top edge and its whole surface stays draggable (fill the 36px band height; keep the left traffic-light inset and every control `app-region: no-drag`).
- [ ] T010 [US1] Validate User Story 1 against `specs/013-always-on-drag-region/quickstart.md` S1 (and S5 zero-chrome, S8 full surfaces), recording results for `validation.md`.

**Checkpoint**: Dragging works at all times with the pointer alone; User Story 1 is a viable MVP.

---

## Phase 4: User Story 2 - The strip introduces itself on hover (Priority: P1)

**Goal**: The strip reveals on pointer proximity to the top edge or after dwelling in the band, stays while the pointer is in the band/strip, dismisses after a short grace, and its controls remain usable during the reveal.

**Independent Test**: With the strip hidden, move the pointer to the top edge (strip appears) or hold still in the band (strip appears after ~400ms); move into the strip and click Reload (strip stays); move away and the strip leaves within ~1s.

- [X] T011 [US2] In `src/main/shell/window.ts`, add the proximity sensor lifecycle: a `peek` field and a `ProximityTracker` instance; start a `pollMs = 150` interval on `show`/`focus` and stop it on `blur`/`hide`/`closed`; each tick builds `{ cursor: screen.getCursorScreenPoint(), bounds: win.getContentBounds(), now: Date.now(), paused }` and, on change, updates `peek`. `paused` is true when the window is not focused or when palette/loading/failure/extension-status/dev-preview is active. Separately, a `move` event sets a `dragging` flag passed to `tracker.update` and debounced with `dragSettleMs = 200`; while dragging the tracker holds the current strip state (no new reveal, no dismissal) per FR-016, and the normal pointer rule resumes when the drag settles. Clear the interval and tracker on close alongside the existing teardown.
- [X] T012 [US2] In `src/main/shell/window.ts`, make `syncWindowButtons` call `isStripSurfaceVisible({ stripVisible: this.record()?.stripVisible ?? false, peeking: this.peek }, this.paletteOpen)` so the traffic lights appear with a peek and hide when it ends (FR-008).
- [X] T013 [US2] In `src/main/shell/window.ts`, push peek to the renderer: send `strip:peek` with the boolean whenever `peek` changes and once from `markShellReady` so the renderer starts in sync (contracts/strip-peek-protocol.md `## IPC channel`).
- [X] T014 [US2] In `src/renderer/src/composables/useShell.ts`, add a `peeking` ref, subscribe with `api.on("strip:peek", (payload) => { peeking.value = payload === true; })`, and expose it from `useShell()`.
- [X] T015 [US2] In `src/renderer/src/App.vue`, derive the strip surface from the shared predicate: `isStripSurfaceVisible({ stripVisible: state.stripVisible, peeking }, paletteOpen)` in place of the current `stripVisible && !paletteOpen` computation, so a peek mounts `DragStrip` and gating stays identical in main and renderer.
- [ ] T016 [US2] Validate User Story 2 against quickstart.md S2 (proximity + dwell + dismissal), S3 (controls usable while peeking), S9 (a drag holds the current strip state), and S5 (lights track the peek); record results for `validation.md`.

**Checkpoint**: Hover reveal and dismissal work independently of the pin and of dragging; User Stories 1 and 2 both function.

---

## Phase 5: User Story 3 - `⌘B` pins the strip (Priority: P2)

**Goal**: `⌘B` remains the sticky pin; a pinned strip ignores hover reveal/dismiss, and a peek never persists.

**Independent Test**: Press `⌘B`; move the pointer away — the strip stays. Press `⌘B` again; the strip leaves and hover only peeks it. Relaunch and confirm only the pinned state persisted.

- [X] T017 [US3] In `src/main/shell/window.ts`, simplify `toggleStrip`: patch `stripVisible`, `broadcastState()`, and call `syncWindowButtons()` directly; remove the `relayout(!visible)` deferral because hiding the strip no longer changes the shell bounds (the band never moves). Confirm a pinned strip composes with peek through the predicate (pinned wins, lights stay on).
- [X] T018 [US3] Add precedence cases to `tests/unit/shell.test.ts`: `stripVisible: true` with `peeking: true` and no palette is visible; `stripVisible: true` with `peeking: false` is visible; `stripVisible: false` with `peeking: true` is visible; palette open hides all combinations.
- [ ] T019 [US3] Validate User Story 3 against quickstart.md S4 (pin, unpin, relaunch persistence, peek never persisted); record results for `validation.md`.

**Checkpoint**: Pin semantics are unchanged and independent of the transient peek.

---

## Phase 6: User Story 4 - Double-click the band to zoom (Priority: P3)

**Goal**: Double-clicking the top band zooms/maximizes the window per the macOS title-bar preference, or the requirement is explicitly dropped.

**Independent Test**: Double-click the band with the strip hidden; the window zooms, and a second double-click restores. If the platform does not support it, FR-013 is marked dropped with the spike evidence.

- [ ] T020 [US4] Apply the T001 double-click finding: if macOS handles double-click on the custom drag region natively, confirm behavior and make no code change; otherwise update `specs/013-always-on-drag-region/spec.md` FR-013 and `research.md` §7 to record FR-013 as dropped (a JS `dblclick` cannot fire in a drag region). Do not add a `no-drag` hit area, which would reintroduce the drag dead zone.

**Checkpoint**: The double-click behavior is either working per platform convention or explicitly out of scope with evidence.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Zero-chrome guarantee, documentation, governance, and full validation.

- [X] T021 [P] Audit `src/renderer/src/components/DragBand.vue` and `src/renderer/src/App.vue` for the constitution: confirm the band paints no pixels and uses no ad-hoc colors (constitution VI), and that reduced motion still collapses the strip transition to instant (FR-014) with no band-specific motion added.
- [X] T022 [P] Update `README.md`: state that the window is always draggable from the top band and that `⌘B` now pins the strip on screen (hovering the top edge reveals it transiently).
- [X] T023 [P] Apply the PATCH-level constitution clarification in `.specify/memory/constitution.md`: amend Principle I so "visible tool chrome is zero pixels" counts painted surfaces and an invisible, pointer-only drag region is explicitly permitted; bump the version and Last Amended date per the governance rules.
- [ ] T024 Run the full `quickstart.md` matrix (S1–S12) and write results (with the T001 spike outcome) to `specs/013-always-on-drag-region/validation.md`, mirroring the 001 validation table.
- [X] T025 Run `vp check`, `vp test`, and `npm run typecheck`; fix any failures so node, preload, and web configurations are clean (Development Workflow gate).
- [ ] T026 Confirm the resource baseline per quickstart.md S10/FR-010/SC-007: focused idle CPU is indistinguishable from the pre-feature baseline and the sensor interval stops on blur; note the measurement in `validation.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 gates the approach choice.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **User Stories (Phase 3+)**: depend on Foundational.
  - US1 (P1) and US2 (P1) are both MVP-critical; US1 can ship alone, US2 builds on the band.
  - US3 (P2) depends on US2 (peek exists to be pinned against/ignored).
  - US4 (P3) depends on T001 only.
- **Polish (Phase 7)**: depends on the stories being complete.

### User Story Dependencies

- **US1**: after Phase 2; no dependency on other stories. **MVP.**
- **US2**: after US1 (needs the band as the strip's home and the peek surface's placement).
- **US3**: after US2 (validates pin vs. peek precedence).
- **US4**: after T001; otherwise independent.

### Within Each User Story

- Pure logic and its tests before wiring; main before renderer, then manual validation.
- Shared file `src/main/shell/window.ts` is touched by T006, T011, T012, T013, T017 — keep those sequential.
- Shared file `src/renderer/src/App.vue` is touched by T008 and T015 — sequential.
- `tests/unit/shell.test.ts` is touched by T003 and T018 — sequential.

### Parallel Opportunities

- T002, T004 (and their tests T003, T005) touch different files and can run together once T001 lands.
- T021, T022, T023 touch different files and can run together at the end.

---

## Parallel Example: Foundational Logic

```bash
# After T001, build the two independent pure modules and their tests together:
Task: "Extend the shared predicate in src/shared/shell.ts"          # T002
Task: "Create the ProximityTracker in src/main/shell/proximity.ts"  # T004
Task: "Update predicate cases in tests/unit/shell.test.ts"          # T003
Task: "Create tests/unit/proximity.test.ts"                         # T005
```

## Parallel Example: Polish

```bash
Task: "Audit the band for zero paint / reduced motion"             # T021
Task: "Update README.md drag/pin wording"                          # T022
Task: "PATCH-amend Principle I in .specify/memory/constitution.md" # T023
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 (spike) and Phase 2 (foundational).
2. Complete Phase 3 (US1): the always-on drag band.
3. **STOP and VALIDATE**: quickstart S1 — drag with no keyboard step, zero painted chrome.
4. This alone removes the original friction; ship/demo if ready.

### Incremental Delivery

1. Setup + Foundational → predicate, tracker, band mode ready.
2. US1 → drag works always (MVP).
3. US2 → hover reveal, controls usable, lights track the peek.
4. US3 → pin semantics verified against peek.
5. US4 → double-click resolved per spike.
6. Polish → zero-chrome/README/constitution/validation/checks.

### Notes

- [P] = different files, no dependency on an incomplete task.
- [Story] labels map tasks to spec user stories for traceability.
- `src/main/shell/window.ts`, `src/renderer/src/App.vue`, and `tests/unit/shell.test.ts` are the serialization points; everything else is parallelizable.
- Commit after each task or logical group; stop at each checkpoint to validate the story independently.
