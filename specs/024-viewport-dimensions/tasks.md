---

description: "Task list for the Viewport Size Indicator feature"
---

# Tasks: Viewport Size Indicator

**Input**: Design documents from `specs/024-viewport-dimensions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/viewport-indicator.md, quickstart.md

**Tests**: Included — this repo keeps unit coverage for shared logic and in-process
integration coverage via `src/main/dock-test.ts` (the persistent/geometry analogue of
the zoom feature's tests).

**Organization**: Tasks are grouped by user story (US1–US3 from spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Paths are repository-relative

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The pure value model everything else builds on.

- [X] T001 [P] Create `src/shared/viewport.ts` with the `ViewportSize` type, `formatViewportSize(size)` → `"{width} × {height}"` (U+00D7, whole pixels, clamping non-finite/negative to a non-negative integer), and `viewportSizeEquals(a, b)`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two spikes that fix the design decisions, the shell value bridge, and the shared-model tests. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Spike S0 — determine the authoritative viewport source: with DevTools docked bottom/right/left and in titlebar mode, compare `siteView.getBounds()` against the guest's read-only `window.innerWidth`/`innerHeight` and against the DevTools overlay value; probe in `src/main/dock-test.ts` and record the chosen source in `specs/024-viewport-dimensions/research.md` §5
- [X] T003 [P] Spike S1 — determine the working suppression route: call the DevTools front-end so its resize-size overlay turns off, via `devToolsWebContents.executeJavaScript(...)` in `src/main/shell/devtools.ts`; confirm it survives a dock change and that the tool's own indicator still shows; record the exact expression in `specs/024-viewport-dimensions/research.md` §4
- [X] T004 Add the `viewportSize` ref (`{ width: number; height: number } | null`) and the `viewport:changed` subscription, and expose it read-only from `useShell()` in `src/renderer/src/composables/useShell.ts`
- [X] T005 [P] Unit tests for `formatViewportSize` (the `×`, rounding, non-finite/negative clamping) and `viewportSizeEquals` in `tests/unit/viewport.test.ts`

**Checkpoint**: Spikes resolved, the bridge carries the value, the model is covered.

---

## Phase 3: User Story 1 - See the Viewport Size While Resizing (Priority: P1) 🎯 MVP

**Goal**: Resizing the window shows a live `width × height` readout in the bottom-right corner that dismisses itself after a short delay.

**Independent Test**: With any window, drag an edge and confirm the readout appears, tracks the size live, and disappears within ~2 s of the drag ending.

- [X] T006 [US1] In the existing `resize` handler, read the chosen viewport source, set `viewportStatus`, send `viewport:changed { width, height }`, and `relayout()`, gated on an actual size change via `viewportSizeEquals` (no-op on move/redundant resize); add the ~1.5 s dismissal timer and `hideViewportStatus()` (clear, send `viewport:changed null`, `relayout(true)`) in `src/main/shell/window.ts`
- [X] T007 [US1] Return `"full"` from `desiredShellMode()` while `viewportStatus !== null` in `src/main/shell/window.ts`
- [X] T008 [P] [US1] Create `src/renderer/src/components/ViewportSizeIndicator.vue` (bottom-right, `pointer-events: none`, `aria-hidden="true"`, tabular numerals, Tlapalli token colors, renders `formatViewportSize`, with enter/leave transitions)
- [X] T009 [US1] Render `<ViewportSizeIndicator>` with its transition in `src/renderer/src/App.vue`, driven by the `viewportSize` ref from `useShell()`
- [X] T010 [US1] Extend `src/main/dock-test.ts` to assert that a resize sets a size equal to the guest viewport and that the status clears after the dismissal timeout

**Checkpoint**: Resizing shows the readout and it auto-dismisses — the MVP is independently demoable.

---

## Phase 4: User Story 2 - One Consistent, Non-Duplicated Size Readout (Priority: P2)

**Goal**: The tool's readout equals what DevTools reports, and the DevTools-native resize readout is not shown while DevTools is open.

**Independent Test**: With DevTools docked and open, resize and confirm (a) the DevTools-native size readout does not appear and (b) the tool's value equals the guest viewport DevTools reports.

- [X] T011 [US2] Implement the DevTools resize-size-overlay suppression in `src/main/shell/devtools.ts`: call the DevTools front-end (per spike S1) to turn off `Overlay.setShowViewportSizeOnResize`, on `open`/devtools-opened and re-asserted on the existing poll `tick()`; no other DevTools behavior changes
- [X] T012 [US2] Finalize the viewport value to the source chosen in spike S0 so the reported number equals the DevTools readout under every dock side and titlebar mode in `src/main/shell/window.ts`
- [X] T013 [P] [US2] Extend `src/main/dock-test.ts` to assert value parity (tool value == guest viewport) and native-readout suppression with DevTools docked bottom/right/left, and again in titlebar mode

**Checkpoint**: One authoritative, matching readout; the native duplicate is gone.

---

## Phase 5: User Story 3 - A Transient, Non-Blocking Confirmation (Priority: P3)

**Goal**: The readout never intercepts input, coexists with the zoom indicator, and leaves zero painted chrome when idle.

**Independent Test**: Click/scroll over the visible readout (reaches the page); trigger a zoom and a resize together (both legible); confirm zero chrome after it dismisses.

- [X] T014 [US3] Introduce the bottom-right status stack so `<ViewportSizeIndicator>` and `<ZoomIndicator>` are laid out together without occluding each other in `src/renderer/src/App.vue`
- [X] T015 [P] [US3] Ensure `src/renderer/src/components/ViewportSizeIndicator.vue` stays pointer-through and `aria-hidden`, and add the `prefers-reduced-motion` instant show/hide path
- [X] T016 [US3] Extend `src/main/dock-test.ts` to assert the shell returns to the band (zero painted chrome) after the status clears and that the two indicators coexist without occlusion

**Checkpoint**: All three stories work together and the chromeless default holds.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, full checks, and manual validation.

- [X] T017 [P] Update `research.md`, `plan.md`, `data-model.md`, `contracts/viewport-indicator.md`, and `quickstart.md` to match the shipped design (record the S0/S1 outcomes and the final value/suppression choices)
- [X] T018 Run `pnpm check`, `pnpm typecheck`, and `pnpm test`
- [X] T019 Manual validation via `quickstart.md` (live drag, maximize/restore/fullscreen, dock sides, titlebar mode, coexistence with zoom, reduced motion)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T005 needs T001); **BLOCKS all user stories**.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
- **Polish (Phase 6)**: Depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependencies on other stories (MVP).
- **US2 (P2)**: After Foundational — the suppression (T011) is independent of US1's UI; the parity check (T013) reads the value US1 produces but is independently verifiable.
- **US3 (P3)**: After Foundational — refines the US1 surface; its checks (click-through, coexistence, zero chrome) are independently verifiable.

### Within Each User Story

- Spikes (T002, T003) retire the unknowns before the surface is built.
- Main-process drive before the renderer surface it feeds.
- Story complete and validated before moving to the next priority.

### Parallel Opportunities

- T001, T002, T003 — different files/concerns.
- T005 — independent of T002/T003/T004 once T001 exists.
- T008 (component) parallel with T006/T007 (main process).
- T013, T015, T017 — different files.

---

## Parallel Example: User Story 1

```bash
# Component and main-process drive touch different files:
Task: "T008 [P] [US1] Create src/renderer/src/components/ViewportSizeIndicator.vue"
Task: "T006 [US1] Add the resize hook + viewportStatus in src/main/shell/window.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T005) — retire both spikes first.
3. Complete Phase 3: US1 (T006–T010).
4. **STOP and VALIDATE**: resize → readout appears, tracks, dismisses.
5. Demo if ready.

### Incremental Delivery

1. Setup + Foundational → the value model, bridge, and dust-settled spikes.
2. US1 → the readout works and matches DevTools by construction (MVP).
3. US2 → the native duplicate is suppressed and parity is asserted across dock sides.
4. US3 → input-through, coexistence, and zero-chrome guarantees.
5. Polish → docs, checks, manual validation.

---

## Notes

- [P] tasks touch different files and can run in parallel.
- Tests live in `tests/unit/` (pure model) and `src/main/dock-test.ts` (integration).
- The feature adds no command, no persistence, and no schema change.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

---

## Revision 2026-10-16 — in-page badges (follow-up)

Triggered by validation feedback: a DevTools-panel resize did not update the badge,
and the badges should sit inside the guest page rather than on the window. See
`research.md` §11 and the amended constitution (v2.3.0, Principle II). Follow-up:
the size badge sits in the page's top-right; the zoom badge in its bottom-right.

- [X] T020 Amend Principle II in `.specify/memory/constitution.md` to sanction the transient status badges (pointer-through, no page-affecting behavior, removed when hidden, script-unreachable); bump 2.2.6 → 2.3.0
- [X] T021 Create `src/preload/badges.ts`: the in-page badges (size top-right, zoom bottom-right), the size badge driven by the page's own `resize` (so a DevTools-panel resize is reflected), elements removed when hidden
- [X] T022 Install the badges and wire `zoom:changed` + `badge:theme` in `src/preload/site.ts`
- [X] T023 In `src/main/shell/window.ts`: send the zoom readout to the site preload (drop the shell path), push `badge:theme` on load/theme change, and remove the shell viewport machinery and the `desiredShellMode()` badge conditions
- [X] T024 Replace the shell-based badges with an in-page badge module (`src/preload/badges.ts`), then (final revision, research §12) revert to shell-based readouts on a shared `Badge.vue`
- [X] T025 Update `src/main/dock-test.ts` to assert the shell readouts (`suppressed`, `matches`, `cleared`, `zoomShown`, `zoomGate`; `devtoolsResizeShown` logged) using `onPageViewport`
- [X] T026 Update `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/viewport-indicator.md`, `quickstart.md` to the final shell design
