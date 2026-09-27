# Tasks: Palette Row Animation Technique (Spike)

**Input**: Design documents from `specs/005-row-animation-spike/`

**Prerequisites**: spec.md, plan.md, research.md

**Tests**: The probe script *is* the test; there is no separate test suite.

## Phase 1: Harness

- [x] T001 Create `spikes/row-animation/` with a static server that serves the harness and lets candidate pages import the app's real modules (`src/renderer/src/composables/useCommands.ts`, `src/shared/commands.ts`) and `vue` from `node_modules`; document the run command in `spikes/row-animation/README.md`
- [x] T002 [P] Build the shared harness page: query input, the real `buildRows` model, and a tech switch that mounts one candidate's list — structure per `specs/005-row-animation-spike/research.md` R2
- [x] T003 [P] Implement candidate A (plain `v-for`, no animation) in `spikes/row-animation/candidates/a-plain.js`
- [x] T004 [P] Implement candidate B (`TransitionGroup` enter only) in `spikes/row-animation/candidates/b-enter-only.js`
- [x] T005 [P] Implement candidate C (enter + leave + `position: absolute`, the 004 technique) in `spikes/row-animation/candidates/c-transition-group-absolute.js`
- [x] T006 [P] Implement candidate D (plain `v-for` + CSS `@keyframes` entry) in `spikes/row-animation/candidates/d-keyframe-enter.js`
- [x] T007 [P] Implement candidate E (`TransitionGroup` with `move`/FLIP, enter only) in `spikes/row-animation/candidates/e-flip-move.js`
- [x] T008 Implement `spikes/row-animation/probe.mjs`: drive a fixed query sequence keystroke by keystroke against every candidate in headless Chromium, assert the five checks in research R3, capture console warnings, and print per-technique JSON verdicts
- [x] T009 Run the probe over all five candidates and record raw verdicts

## Phase 2: Verdict

- [x] T010 Write `spikes/row-animation/results.md`: per-candidate verdict table, whether the 004 duplication reproduced, console-warning notes, and the single recommendation with its adoption cost (SC-001–SC-004)
- [x] T011 Run `npm run check` to confirm the harness is excluded from app lint/format scope, and confirm the app build is unchanged (`npm run build`)

## Dependencies

- T002–T007 depend on T001 (serving + module resolution)
- T008 depends on all candidates
- T009 → T010 → T011

## Success gate

The spike is complete when at least one technique passes all five assertions
(SC-002) and `results.md` names it with the conditions it holds under.