---
description: "Task list for the Blank-Page Watermark feature"
---

# Tasks: Blank-Page Watermark

**Input**: Design documents from `/specs/014-blank-watermark/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included for the one piece of logic with real inputs — the shared blank predicate (plan `## Delivery Order`, M1). The visual surface has no DOM harness, so its look is validated manually through `quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` and `tests/` at repository root; specs under `specs/014-blank-watermark/`.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The shared predicate both main and the renderer must agree on.

**⚠️ CRITICAL**: The renderer mount condition and the main shell-mode rule both read this predicate; it must exist first.

- [X] T001 [P] Add `export function isBlankSurfaceVisible(state: { target: string | null }): boolean` to `src/shared/shell.ts`, returning `state.target == null`, with a doc comment explaining that main keeps the shell full in this state (contracts/blank-surface-protocol.md `## Shared predicate`).
- [X] T002 [P] Add `isBlankSurfaceVisible` cases to `tests/unit/shell.test.ts`: `target: null` is blank; a set target is not; a missing `target` is treated as blank.

**Checkpoint**: The blank predicate is shared and tested.

---

## Phase 2: User Story 1 - A blank window reads as a page (Priority: P1) 🎯 MVP

**Goal**: A window that has never loaded a target shows the centered, faded watermark; it yields to loading/failure, sits beneath the palette, and disappears when a target commits.

**Independent Test**: Open `⌘N`, dismiss the location palette, confirm the watermark is visible and the top band still drags; navigate and confirm it is gone.

- [X] T003 [US1] In `src/main/shell/window.ts`, add `isBlankSurfaceVisible({ target: this.record()?.target ?? null })` to the `full` branch of `desiredShellMode()` so a blank window is not collapsed to the 36px band (contracts/blank-surface-protocol.md `## Shell mode rule`).
- [X] T004 [P] [US1] Create `src/renderer/src/assets/logo.svg` as a copy of `resources/logo.svg` with only `path334` and `path335` changed to `fill:currentColor` (contracts/blank-surface-protocol.md `## Mark contract`).
- [X] T005 [US1] Create `src/renderer/src/components/BlankView.vue`: full-window, `pointer-events: none`, `aria-hidden`; import the mark with `?raw` and render it inlined; center and size it responsively; fade it (FR-001, FR-002, FR-008).
- [X] T006 [US1] In `src/renderer/src/App.vue`, import `isBlankSurfaceVisible` and `BlankView`; compute `blankVisible = state ? isBlankSurfaceVisible(state) && !loading && !failed : false` and render `<BlankView v-if="blankVisible" />` as the bottom-most surface so veil/failure/palette paint above it (FR-003).
- [ ] T007 [US1] Validate User Story 1 against `specs/014-blank-watermark/quickstart.md` S1 (watermark + drag band), S2 (blank-only), S5 (restored blank window), and S3 (palette/failure stay authoritative); record results for `validation.md`.

**Checkpoint**: The blank page shows the watermark and it never overlays a page; User Story 1 is a viable MVP.

---

## Phase 3: User Story 2 - The watermark matches the theme (Priority: P2)

**Goal**: The mark's accent details follow the window's variant and stay legible in dark and light modes.

**Independent Test**: On a blank window, cycle variants and modes; the accents change with the variant and the mark remains visible in light mode.

- [X] T008 [US2] In `src/renderer/src/components/BlankView.vue`, set `color: var(--tb-accent)` on the surface so the mark's `currentColor` accents track the active variant (FR-006).
- [X] T009 [US2] Add the global light-mode rule in `src/renderer/src/components/BlankView.vue`: `:root[data-mode="light"] .blank { filter: invert(1) hue-rotate(180deg) }` so the mark is visible on light backdrops while preserving the accent hue (FR-007).
- [ ] T010 [US2] Validate User Story 2 against quickstart.md S4 (variant + mode changes) and S6 (per-window variants); record results for `validation.md`.

**Checkpoint**: The watermark belongs to the active variant in both modes.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Governance, docs, checks, and the full validation record.

- [X] T011 [P] Apply the PATCH-level constitution clarification in `.specify/memory/constitution.md`: state that the zero-pixel chrome rule constrains chrome over the guest page, and that a decorative identity watermark on a window that has never loaded a target is permitted (removed as soon as a target commits, non-interactive); bump the version and Last Amended date per the governance rules.
- [X] T012 [P] Audit the feature for the constitution: confirm the watermark never appears over a loaded page (II, FR-005), is non-interactive (I, FR-002), and uses only Tlapalli tokens (VI, FR-006/FR-007).
- [ ] T013 [P] Update `README.md` if it describes the blank/new-window behavior, so the watermark is mentioned alongside the blank-window location prompt.
- [X] T014 Run `vp check`, `vp test`, `npm run typecheck`, and `npm run build`; fix any failures so node, preload, and web configurations are clean and the mark is bundled (Development Workflow gate).
- [ ] T015 Run the full `quickstart.md` matrix (S1–S8) and write results to `specs/014-blank-watermark/validation.md`, mirroring the 001/013 validation tables.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: no dependencies; T001 gates both consumers.
- **US1 (Phase 2)**: depends on T001.
- **US2 (Phase 3)**: depends on T005 (the surface exists to theme).
- **Polish (Phase 4)**: depends on the stories being complete.

### User Story Dependencies

- **US1**: after T001. **MVP.**
- **US2**: after US1 (the surface must exist first); otherwise independent of US1's validation.

### Within Each User Story

- Pure predicate and its test before wiring.
- Main before renderer, then manual validation.
- Shared file `src/renderer/src/components/BlankView.vue` is touched by T005, T008, T009 — keep those sequential.
- Shared file `src/renderer/src/assets/logo.svg` is T004 only.

### Parallel Opportunities

- T001 and T002 touch different files and can run together.
- T004 is independent of T003/T005 (different files).
- T011, T012, T013 touch different files and can run together at the end.

---

## Parallel Example: Foundational + Asset

```bash
# After confirming the current blank-page behavior, start the independent pieces:
Task: "Add isBlankSurfaceVisible in src/shared/shell.ts"        # T001
Task: "Add predicate cases in tests/unit/shell.test.ts"         # T002
Task: "Derive the themable mark in src/renderer/src/assets/logo.svg"  # T004
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 (predicate) and T003 (blank → full).
2. Complete T004–T006 (mark asset, surface, gating).
3. **STOP and VALIDATE**: quickstart S1/S2 — watermark on a blank window, gone on a load, drag band intact.

### Incremental Delivery

1. Foundational → predicate.
2. US1 → the surface, the asset, the shell-mode rule (MVP).
3. US2 → accent theming and the light-mode treatment.
4. Polish → constitution PATCH, README, validation, checks.

### Notes

- [P] = different files, no dependency on an incomplete task.
- [Story] labels map tasks to spec user stories for traceability.
- `src/renderer/src/components/BlankView.vue` is the main serialization point; everything else is parallelizable.
- Commit after each task or logical group; stop at each checkpoint to validate the story independently.
