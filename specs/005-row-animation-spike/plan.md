# Implementation Plan: Palette Row Animation Technique (Spike)

**Branch**: `005-row-animation-spike` | **Date**: 2026-09-27 | **Spec**: `specs/005-row-animation-spike/spec.md`

**Input**: Feature specification from `/specs/005-row-animation-spike/spec.md`

## Summary

Build a headless harness that renders the real palette row model under five
candidate animation techniques and asserts, after every keystroke of a fixed
query sequence, that rows never accumulate, duplicate, ghost, jump, or lag. The
harness needs a real DOM and a real Vue transition lifecycle, so it runs in
Chromium (headless shell via Playwright, already cached on this machine) rather
than jsdom — jsdom does not run transitions, which is the exact behavior under
test.

## Technical Context

**Language/Version**: TypeScript 5.9; Vue 3.5; Vitest 5 for the build step

**Primary Dependencies**: the app's own `buildRows` / `fuzzyScore`
(`src/renderer/src/composables/useCommands.ts`) and `PALETTE_COMMANDS`
(`src/shared/commands.ts`), so the harness cannot drift from real row data;
Playwright's cached Chromium headless shell as the runner

**Storage**: N/A

**Testing**: one probe script that emits JSON verdicts per technique

**Target Platform**: macOS 13+ (spike); technique findings are platform-neutral

**Project Type**: spike (throwaway harness under `spikes/`)

**Performance Goals**: full five-technique run completes in seconds

**Constraints**: must reproduce (or fail to reproduce) the 004 duplication against
the exact original technique; must not ship any harness code in the app bundle

**Scale/Scope**: five candidates, one query sequence, five assertions each

## Constitution Check

| Principle | Plan compliance |
| --------- | --------------- |
| I. Chromeless by Default | No shell surface changes; the spike ships no UI |
| II. The Guest Page is Sacred | No guest involvement; harness renders a standalone page |
| III. Keyboard-First Ergonomics | The spike measures typing responsiveness, supporting this principle |
| IV. Real Chromium DevTools, Docked | Untouched |
| V. One Target Per Window | Untouched |
| VI. Identity Through Tlapalli | Harness uses throwaway colors; any adopted motion stays tokenized |
| Development Workflow | Spike-first is the constitution's own risk-retirement rule; `vp check` stays green because the harness is excluded from the app build |

**Gate result**: PASS.

## Structure

```text
spikes/
└── row-animation/
    ├── README.md            # how to run, what it measures
    ├── candidates/          # one HTML+JS page per technique, sharing the row model
    ├── probe.mjs            # drives each candidate, emits JSON verdicts
    └── results.md           # the verdict table + recommendation (/speckit.plan Phase 1 output)
specs/005-row-animation-spike/
├── spec.md
├── plan.md
├── research.md            # candidate set + considered alternatives
├── tasks.md
└── quickstart.md
```

**Structure Decision**: A self-contained `spikes/row-animation/` directory keeps
the harness out of `src/` so it cannot reach the app bundle, while reusing the
app's row model by importing it from the source tree at runtime (served as a
module, not bundled).

## Deliverables

- `spikes/row-animation/` — harness (five candidates + probe)
- `spikes/row-animation/results.md` — verdict table and the recommendation
- A follow-up note in `specs/004-shell-motion/research.md` pointing at the verdict

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Harness "passes" because it does not exercise the real transition lifecycle | Candidates are real Vue apps; the probe waits for transitions to settle and counts nodes at multiple points |
| jsdom-style false confidence | Run in Chromium, where transitions actually fire |
| The 004 duplication does not reproduce at all | Record that explicitly (SC-004) and treat it as evidence the trigger is environmental/interaction-specific |
| A candidate passes but only because rows are never removed | Assertion 1 compares node count to model count, so "never removes" cannot pass |