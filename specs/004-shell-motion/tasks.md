# Tasks: Shell Motion

**Input**: Design documents from `specs/004-shell-motion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: One unit test task is included for `splitTargetLabel`, per research R9
and plan.md's testing strategy (pure presentation logic). Everything else is
validated through `quickstart.md` scenarios, because the shell lives in a
`WebContentsView` with no DOM test harness in this repo.

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: The user story this task belongs to (US1–US5)
- Every task includes an exact file path

## Path Conventions

Single project at the repository root: `src/`, `tests/`, `specs/` (see the source
tree in plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The shared timing vocabulary every surface consumes

- [x] T001 Create the motion token stylesheet `src/renderer/src/styles/motion.css` exactly per contracts/motion-tokens.md — durations `--tb-motion-fast: 100ms`, `--tb-motion-base: 140ms`, `--tb-motion-slow: 200ms`; easings `--tb-motion-ease-out` / `--tb-motion-ease-in`; `--tb-motion-stagger: 24ms`, `--tb-motion-stagger-cap: 6`, `--tb-motion-shift: 4px`, `--tb-motion-scale: 0.97` — plus the `prefers-reduced-motion: reduce` clamp (`0.01ms` durations, `0ms` stagger, `0px` shift, scale `1`); import it in `src/renderer/src/main.ts` after base.css

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The settle protocol — main defers the shell-view collapse until the
renderer reports its leave finished (contracts/settle-protocol.md)

**⚠️ CRITICAL**: No user story exits can be validated until this phase is complete.

- [x] T002 [P] Add the `shell:settled` channel to the shell bridge: `settled(): void` in `src/preload/shell.ts` (`ipcRenderer.send("shell:settled")`) and its signature on `TlachialoniApi` in `src/renderer/src/env.d.ts`
- [x] T003 [P] Register `ipcMain.on("shell:settled", ...)` in `src/main/ipc.ts`, delegating to a new `appWindow.notifyShellSettled()` handler
- [x] T004 Implement the relayout gate in `src/main/shell/window.ts`: track the applied `shellMode` (`full` | `strip` | `hidden`) and a computed `desiredMode` (`paletteOpen || showLoading || failed` → `full`, `stripVisible` → `strip`, else `hidden`); add `relayout(defer?: boolean)` that, when the shell renderer is loaded and `desiredMode` ranks smaller than `shellMode`, holds the current bounds behind `pendingSettle` with `SHELL_SETTLE_TIMEOUT_MS = 500` (raised from 400 with the 2026-09-27 pacing change); apply immediately and clear pending on any larger-or-equal desired mode (supersede rule); `notifyShellSettled()` clears pending and applies the recomputed mode; call with `defer = true` only from `handleReady()` (send `viewport:ready`/`reportLoading(false)` first, then defer) and from `toggleStrip()` when hiding (broadcast state first, then defer); clear the timer on `closed`
- [x] T005 Renderer settle signaling in `src/renderer/src/composables/useShell.ts`: export `markSurfaceLeaving()` (increment a counter, arm a 300 ms fallback timer) and `markSurfaceLeft()` (decrement; when the counter reaches zero, cancel the fallback and call `api.settled()`); expose both for surface components

**Checkpoint**: Foundation ready — with no renderer changes yet, exits still complete via the 400 ms timeout.

---

## Phase 3: User Story 1 - The palette grows and shrinks (Priority: P1) 🎯 MVP

**Goal**: The palette grows in and shrinks out over a fading backdrop; typing is
available on invocation, and mid-flight toggles reverse cleanly.

**Independent Test**: quickstart S1 — invoke, type immediately, dismiss, and
re-toggle mid-entrance/exit.

- [x] T006 [US1] Wrap `<CommandPalette>` in `<Transition name="palette">` in `src/renderer/src/App.vue`
- [x] T007 [US1] Add the palette transition styles in `src/renderer/src/components/CommandPalette.vue`: backdrop opacity `--tb-motion-base` ease-out in / `--tb-motion-fast` ease-in out; panel opacity + scale from `--tb-motion-scale` (transform-origin top center); `pointer-events: none` while leaving; wire `@leave` → `markSurfaceLeaving()` and `@after-leave` → `markSurfaceLeft()` on the transition
- [x] T008 [US1] Convert palette dismissal to a shown-state machine in `src/renderer/src/composables/useShell.ts`: `closePalette()` flips a local shown ref (drives the leave) and `@after-leave` sends `setPaletteVisible(false)`; a `palette:open` arriving mid-leave cancels the leave and sends nothing; the exported `paletteOpen` contract for `App.vue` stays unchanged

**Checkpoint**: User Story 1 is independently functional (MVP).

---

## Phase 4: User Story 2 - The drag strip introduces itself (Priority: P1)

**Goal**: The strip eases in, the location reveals segment by segment (`:` and
`/` boundaries) with a capped stagger, controls drop in after, and the reveal
replays on every navigation.

**Independent Test**: quickstart S2 — toggle the strip, navigate to a long
target, and confirm replay and compression.

- [x] T009 [P] [US2] Add `splitTargetLabel(label: string): string[]` to `src/renderer/src/utils/target.ts`: split on `:` and `/`, drop empty parts, keep all other characters (including `?`) inside a segment, degenerate input yields one segment
- [x] T010 [P] [US2] Unit-test `splitTargetLabel` in `tests/unit/target.test.ts`: `localhost:5173/api/users?tab=1`, trailing slash, no port, malformed/empty, many-segment input
- [x] T011 [US2] Wrap `<DragStrip>` in `<Transition name="strip">` in `src/renderer/src/App.vue`
- [x] T012 [US2] Implement the strip choreography in `src/renderer/src/components/DragStrip.vue`: surface enter (opacity `--tb-motion-base` + translateY from `--tb-motion-shift`) and leave styles; render segments as a `<TransitionGroup name="strip-seg">` of spans keyed by `target + index` with an inline `--i` custom property and enter delay `calc(min(var(--i), var(--tb-motion-stagger-cap)) * var(--tb-motion-stagger))`; continue the index for the reload/DevTools/close controls so they drop in sequentially after the segments; leaving items get `pointer-events: none` and a fast no-delay fade; `@leave`/`@after-leave` call the settle signals

**Checkpoint**: Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 - Palette matches animate as the query changes (Priority: P2)

**Goal**: Rows entering the fuzzy result set animate subtly; surviving rows stay
still; fast typing never lags.

**Independent Test**: quickstart S3 — type progressively and in bursts, and
confirm only new rows animate with no queued trail.

- [x] T013 [US3] Animate palette result rows in `src/renderer/src/components/CommandPalette.vue` using the Vue-docs technique: `TransitionGroup` with `:css="false"` and `onBeforeEnter` / `onEnter` / `onLeave` hooks driving the Web Animations API; staggered enter by `data-index` (capped), height unfold `0 ↔ var(--palette-row-height)`, leave shrink-and-fade, reduced motion collapsed to 1 ms; requires stable `row.key` (T021) and fixed row height (T022); include the empty state

**Checkpoint**: Stories 1–3 work independently.

---

## Phase 6: User Story 4 - Loading and failure states transition (Priority: P2)

**Goal**: The veil fades out to reveal the page; the failure view fades in and
out with the rest of the state changes.

**Independent Test**: quickstart S4–S5 — retry a dead target and watch both
surfaces cross-fade.

- [x] T014 [US4] Add the veil transition: `<Transition name="veil">` wrapper in `src/renderer/src/App.vue`, and enter (`--tb-motion-base` ease-in) / leave (`--tb-motion-slow` ease-out) styles in `src/renderer/src/components/LoadingVeil.vue` with `pointer-events: none` while leaving; `@leave`/`@after-leave` call the settle signals
- [x] T015 [US4] Add the failure-view transition: `<Transition name="failure">` wrapper in `src/renderer/src/App.vue`, and enter (opacity `--tb-motion-base` + card translateY from `--tb-motion-shift`) / leave (opacity `--tb-motion-fast`) styles in `src/renderer/src/components/FailureView.vue` with `pointer-events: none` while leaving; `@leave`/`@after-leave` call the settle signals

**Checkpoint**: Stories 1–4 work independently.

---

## Phase 7: User Story 5 - Restrained micro-feedback (Priority: P3)

**Goal**: Hover and selection fills ease instead of blinking.

**Independent Test**: quickstart S7 sweep — move the pointer across rows and
controls; no queued trail, final state correct.

- [x] T016 [P] [US5] Ease hover/selection fills at `--tb-motion-fast` in `src/renderer/src/components/CommandPalette.vue`, `src/renderer/src/components/DragStrip.vue`, and `src/renderer/src/components/FailureView.vue` (background-color and border-color only; no layout properties)

**Checkpoint**: All user stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verification across stories and repo hygiene

- [x] T017 Execute all quickstart scenarios S1–S8 in order: capture slow-motion evidence for SC-001/SC-002, verify rapid toggles and zero-chrome (S7), toggle system Reduce Motion for S6, and record results in `specs/004-shell-motion/validation.md` — **machine-verifiable parts done and recorded; perceptual pass done by the developer in `npm run dev` (row behaviour confirmed correct)**

---

## Phase 9: Row Animation Follow-up (004 US3)

**Purpose**: Reinstate the palette row motion once its root cause was fixed

- [x] T021 [US3] Give every palette row a stable identity: add `key` to `Row` in `src/renderer/src/composables/useCommands.ts` (`target.typed`, `target.recent:<url>`, `command:<id>`) and bind `:key="row.key"` in `CommandPalette.vue` (FR-024)
- [x] T022 [US3] Fix the row height and truncation in `CommandPalette.vue`: `height: var(--palette-row-height, 34px)` with `box-sizing: border-box`, `min-width: 0` + `overflow: hidden` + ellipsis on the label, `white-space: nowrap` on the meta (FR-025)
- [x] T023 [US3] Re-run the spike probe (`node spikes/row-animation/probe.mjs`) with the updated key function to confirm the duplication is gone, and record the outcome in `spikes/row-animation/results.md`
- [x] T024 [US3] Unit-test row identity in `tests/unit/commands.test.ts`: stable typed-target key across queries, distinct keys per row, recents keyed by URL, command keys namespaced and stable
- [x] T018 [P] Add the 004 feature to the README design-docs list (`README.md`)
- [x] T019 Run `npm run check`, `npm run test`, and `npm run typecheck`; fix every finding
- [x] T020 Commit as `feat: animate shell surfaces with tokenized motion` (src/, tests/, specs/004-shell-motion/) — shipped in `6b019a6`; the row-animation follow-up landed afterwards (see T021–T023)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; **blocks every user story's exit animations**
- **User Stories (Phases 3–7)**: depend on Foundational; proceed in priority order or in parallel
- **Polish (Phase 8)**: after the desired user stories are complete

### Critical Gate

- **T004 + T005** must land together: the defer gate without renderer signaling
  would stall every main-initiated collapse for the full 400 ms timeout. Validate
  with one strip hide (S2 step 4) before moving past Phase 2.

### User Story Dependencies

All stories depend only on the Foundational phase:

- **US1 (P1)**: none — palette closes are renderer-initiated (delayed IPC); the ack is already wired by T005/T007
- **US2 (P1)**: none — uses `splitTargetLabel` (T009) and the defer gate (T004) for strip hide
- **US3 (P2)**: none behaviorally, but touches `CommandPalette.vue` like US1 — serialize after US1 when working in priority order
- **US4 (P2)**: none — veil and failure paths use the defer gate from `handleReady`
- **US5 (P3)**: none — pure CSS on existing surfaces

### Within Each User Story

- Tokens (T001) before any styles; settle signaling (T005) before any leave hooks;
  implementation before validation

---

## Parallel Opportunities

### Foundational

```bash
Task: "T002 shell bridge settled() and env.d.ts type"
Task: "T003 ipcMain shell:settled registration"
# T004 and T005 are sequential-ish: T005 can be written in parallel (different file),
# but T004 must exist before the T005 ack can be observed working.
```

### User Story 2

```bash
Task: "T009 splitTargetLabel in utils/target.ts"
Task: "T010 splitTargetLabel unit tests in tests/unit/target.test.ts"
```

### Polish

```bash
Task: "T018 README design-docs entry"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational, gated on the T004+T005 check
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE** against quickstart S1
5. Demo: the palette growing in, typing instantly, shrinking away

### Incremental Delivery

1. Setup + Foundational → protocol ready
2. US1 → validate → palette polish (MVP)
3. US2 → validate → strip choreography
4. US3 → validate → typing feedback
5. US4 → validate → veil/failure cross-fades
6. US5 → validate → micro-feedback
7. Polish → checks, quickstart pass, validation.md

### Parallel Team Strategy

One developer is the expected case; if parallelizing, finish T004+T005 together,
then split US1/US2 (different components; both touch `App.vue` at the wrapper
level only) and US4 (same `App.vue` caveat).

---

## Notes

- `[P]` tasks touch different files and have no dependencies on incomplete tasks
- `[US#]` labels map each task to a user story for traceability
- Motion is best-effort by design: the 400 ms timeout means an unresponsive
  renderer can never block a state change (settle-protocol.md)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid vague tasks or cross-story dependencies that break independence