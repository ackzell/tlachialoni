# Tasks: Chromeless Localhost Browser

**Input**: Design documents from `specs/001-chromeless-localhost-browser/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests are included only for pure logic (URL policy, store merge,
token mapping), as specified in plan.md's testing strategy. There is no TDD
requirement in the spec, so UI/OS behavior is validated through `quickstart.md`
scenarios rather than automated tests.

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: The user story this task belongs to (US1–US8)
- Every task includes an exact file path

## Path Conventions

Single project at the repository root: `src/`, `scripts/`, `tests/` (see the
source tree in plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create the electron-vite `vue-ts` project scaffold in the repo root (package.json, electron.vite.config.ts, src/main/index.ts, src/preload/index.ts, src/renderer/index.html) and confirm `npm run dev` opens a window
- [x] T002 [P] Pin Electron 44 and add runtime dependencies `vue`, `@vueuse/core`, and `@fontsource-variable/source-code-pro` in package.json
- [x] T003 [P] Add Vite+ and Vitest dev dependencies, add `check` and `test` scripts to package.json, and create vitest.config.ts
- [x] T004 [P] Add LICENSE (MIT), README.md, and NOTICE (Tlapalli MIT attribution per contracts/theme-tokens.md); keep the existing .gitignore

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 **M0 spike gate (constitution: spike-first)**: build a throwaway frameless `BaseWindow` with one `WebContentsView` loading `http://localhost:3000`; open DevTools with `mode: 'bottom'`, then `'right'`, then `'left'`; verify in-window docking, resize reflow, and window drag; record the outcome in the open items of research.md. If docking fails, stop and apply the documented fallback before T006. File: src/main/index.ts
- [x] T006 Compose the real window: `new BaseWindow({ frame: false })` with a site `WebContentsView` created with `webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }` (constitution §II, FR-014) and a transparent shell `WebContentsView` (`setBackgroundColor('#00000000')`); re-layout both on the window `resize` event using `getContentBounds()`; close each view's `webContents` on the window `closed` event. Do not call `app.requestSingleInstanceLock()`; every launch creates an independent window with its own target (FR-023). Files: src/main/shell/window.ts, src/main/shell/site-view.ts, src/main/shell/shell-view.ts
- [x] T007 [P] Implement the persisted state store: atomic write (temp file + `fsync` + `rename`), `schemaVersion` handling, defaults, recents merge ("deduplicated by normalized URL, newest first, bounded (maximum 10)"), and bounds clamp ("minimum 480 × 360"). Files: src/main/state/schema.ts, src/main/state/store.ts
- [x] T008 [P] Unit-test state defaults, missing-field handling, and recents merge/dedupe/bound. File: tests/unit/store.test.ts
- [x] T009 [P] Implement the local-target policy: allow only http/https on loopback (`localhost`, `127.0.0.0/8`, `::1`), private ranges (`10/8`, `172.16/12`, `192.168/16`), and dev hostnames (`*.localhost`, `*.local`, `*.test`); normalize `:5173`, `5173`, and `localhost:5173` to `http://localhost:5173`; reject other schemes/hosts with a reason. File: src/main/nav/policy.ts
- [x] T010 [P] Unit-test policy normalization and rejection cases. File: tests/unit/policy.test.ts
- [x] T011 Implement the command registry and dispatcher with accelerator interception via `before-input-event` on each view, maintain the editable-focus flag fed by `site:focus-editable`, and seed the registry by implementing `view.reload` (`⌘R`) on the site view as its first command. Files: src/main/shell/commands.ts, src/preload/site.ts
- [x] T012 [P] Implement the typed IPC surface exactly as specified in contracts/ipc.md (shell bridge invoke/on channels; site bridge send/on channels). Files: src/main/ipc.ts, src/preload/shell.ts, src/preload/site.ts
- [x] T013 Implement navigation enforcement: `setWindowOpenHandler` denies guest popups and opens them in the system browser; `will-navigate`/`will-frame-navigate` to a non-local address opens externally and leaves the view unchanged. Files: src/main/shell/site-view.ts, src/main/nav/policy.ts
- [x] T014 [P] Build the Tlapalli token pipeline: scripts/build-theme-tokens.ts generates src/renderer/src/theme/tlapalli.tokens.ts for all 8 variants × dark/light using the CSS variables in contracts/theme-tokens.md; add tokens.ts and apply.ts. Files: scripts/build-theme-tokens.ts, src/renderer/src/theme/tokens.ts, src/renderer/src/theme/tlapalli.tokens.ts, src/renderer/src/theme/apply.ts
- [x] T015 [P] Unit-test that every variant × mode defines every CSS variable in the contract. File: tests/unit/theme-tokens.test.ts
- [x] T016 [P] Import `@fontsource-variable/source-code-pro` in the renderer entry and add base styles that consume the theme variables. Files: src/renderer/src/main.ts, src/renderer/src/styles/base.css
- [x] T017 Create the shell renderer skeleton: App.vue mounts the surfaces and subscribes to state/IPC events through a useState composable. Files: src/renderer/src/App.vue, src/renderer/src/composables/useState.ts

**Checkpoint**: Foundation ready — user story work can begin.

---

## Phase 3: User Story 1 - Render a local dev site with docked DevTools (Priority: P1) 🎯 MVP

**Goal**: The window renders one local target edge-to-edge with genuine DevTools
docked at the bottom, and no other chrome.

**Independent Test**: quickstart S1 — with a server on port 3000, launch and
confirm the page and docked DevTools share the window; resize and confirm reflow.

- [x] T018 [US1] Implement site view lifecycle signals: show loading on `did-start-loading`, hide on `did-finish-load`, and classify `did-fail-load` (`isMainFrame` and `errorCode` not `-3`) into a failure state. File: src/main/shell/site-view.ts
- [x] T019 [US1] Open DevTools docked bottom by default on first launch via `openDevTools({ mode: 'bottom' })` after the view is attached. File: src/main/shell/devtools.ts
- [x] T020 [US1] Persist and restore the target and window bounds across launches, defaulting to `http://localhost:3000`. Files: src/main/index.ts, src/main/state/store.ts
- [x] T021 [P] [US1] Implement the LoadingVeil component wired to `viewport:loading`, themed from CSS variables. File: src/renderer/src/components/LoadingVeil.vue

**Checkpoint**: User Story 1 is independently functional (MVP).

---

## Phase 4: User Story 2 - Navigate with the command palette (Priority: P2)

**Goal**: `⌘P` opens a palette that navigates to targets and runs commands, with
recents, shorthand normalization, and clear dismissal.

**Independent Test**: quickstart S2.

- [x] T022 [US2] Build the CommandPalette component: top-center overlay with input and sectioned list (commands + recents). File: src/renderer/src/components/CommandPalette.vue
- [x] T023 [P] [US2] Implement useCommands: fuzzy filter plus command metadata (labels and accelerator labels per contracts/commands-and-keys.md); verify the registry enumerates every command in contracts/commands-and-keys.md (FR-020 completeness). File: src/renderer/src/composables/useCommands.ts
- [x] T024 [US2] Wire `palette.open` (`⌘P`) and `palette.editUrl` (`⌘L`, prefilled with the current target). Files: src/main/shell/commands.ts, src/renderer/src/components/CommandPalette.vue
- [x] T025 [US2] Implement target entry: call `target:validate`, show inline feedback when rejected, and navigate on success (`target.navigate`). Files: src/renderer/src/components/CommandPalette.vue, src/main/shell/commands.ts
- [x] T026 [US2] Implement dismissal and focus: `Esc` and click-outside close the palette and return focus to the page; invalid submissions keep it open with feedback (FR-022). Files: src/renderer/src/components/CommandPalette.vue, src/main/shell/window.ts
- [x] T027 [P] [US2] Implement useRecents and recents listing, recording a target only after it loads successfully. Files: src/renderer/src/composables/useRecents.ts, src/main/state/store.ts

**Checkpoint**: User Stories 1 and 2 work independently.

---

## Phase 5: User Story 3 - Control DevTools placement (Priority: P3)

**Goal**: Toggle DevTools and dock them bottom/right/left, persisting both.

**Independent Test**: quickstart S3.

- [x] T028 [US3] Implement `devtools.toggle` (`⌘⇧J`) on the site view. File: src/main/shell/devtools.ts
- [x] T029 [US3] Implement `devtools.dock.bottom` / `.right` / `.left` (`⌘⇧1/2/3`) using `closeDevTools()` then `openDevTools({ mode })`. Files: src/main/shell/devtools.ts, src/main/shell/commands.ts
- [x] T030 [US3] Persist and restore `dockMode` and `devtoolsOpen`. Files: src/main/state/store.ts, src/main/index.ts
- [x] T031 [P] [US3] Push `devtools:changed` to the shell and consume it in a useDevtools composable. Files: src/main/ipc.ts, src/renderer/src/composables/useDevtools.ts

**Checkpoint**: Stories 1–3 work independently.

---

## Phase 6: User Story 4 - Pick an element with hover highlighting (Priority: P4)

**Goal**: `⌘⇧C` arms a picker that highlights elements on hover and selects the
clicked element in DevTools, leaving no residue.

**Independent Test**: quickstart S4.

- [x] T032 [US4] Implement the picker overlay in the site preload: on `picker:armed` attach capture-phase `mousemove`/`click` listeners and draw one fixed, `pointer-events: none` highlight box; on disarm remove the node and all listeners. File: src/preload/site.ts
- [x] T033 [US4] Implement the picker session in main: arm/disarm, handle `picker:hover`/`picker:picked`, and hard-disarm on navigation via a generation counter updated on `did-navigate`/`dom-ready`. Files: src/main/shell/picker.ts, src/main/ipc.ts
- [x] T034 [US4] Implement `picker.toggle` (`⌘⇧C`) and `Esc` disarm. Files: src/main/shell/commands.ts
- [x] T035 [US4] On pick, call `inspectElement(x, y)` with view-relative DIPs, opening DevTools if closed (uses the DevTools module built in US3). Files: src/main/shell/picker.ts, src/main/shell/devtools.ts

**Checkpoint**: Stories 1–4 work independently.

---

## Phase 7: User Story 5 - Reveal the hidden drag strip (Priority: P5)

**Goal**: `⌘B` overlays a draggable strip with minimal controls, without changing
the page's layout.

**Independent Test**: quickstart S5.

- [x] T036 [US5] Build the DragStrip component: 36px top strip with `app-region: drag` and `no-drag` controls, themed ghost buttons (reload, toggle DevTools, close). File: src/renderer/src/components/DragStrip.vue
- [x] T037 [US5] Implement `strip.toggle` (`⌘B`) and persist `stripVisible`. Files: src/main/shell/commands.ts, src/main/state/store.ts
- [x] T038 [US5] Wire strip controls to `view.reload`, `devtools.toggle`, and `window:close`. Files: src/renderer/src/components/DragStrip.vue, src/main/ipc.ts

**Checkpoint**: Stories 1–5 work independently.

---

## Phase 8: User Story 6 - Reload and move through history (Priority: P6)

**Goal**: Standard reload/hard-reload and back/forward, with native text behavior
inside editable fields.

**Independent Test**: quickstart S6.

- [x] T039 [US6] Implement `view.hardReload` (`⇧⌘R`, bypassing cache). Files: src/main/shell/site-view.ts, src/main/shell/commands.ts
- [x] T040 [US6] Implement `view.back` / `view.forward` (`⌘←`/`⌘→`) using navigation history, palette-disabled with no history, and yielding when the editable-focus flag is set. File: src/main/shell/commands.ts

**Checkpoint**: Stories 1–6 work independently.

---

## Phase 9: User Story 7 - Theme the shell with Tlapalli (Priority: P7)

**Goal**: Eight mineral variants and system-following dark/light (with a persisted
override) applied to every shell surface and to DevTools.

**Independent Test**: quickstart S7.

- [x] T041 [US7] Implement the eight `theme.variant.<slug>` commands and persist `variant`. Files: src/main/shell/commands.ts, src/main/state/store.ts
- [x] T042 [US7] Implement `theme.cycleMode` (`system → dark → light`), persist `colorMode`, and set `nativeTheme.themeSource` so DevTools follow. Files: src/main/shell/commands.ts, src/main/index.ts
- [x] T043 [P] [US7] Apply variant/mode in the shell through useTheme and apply.ts, setting `data-variant` / `data-mode`. Files: src/renderer/src/composables/useTheme.ts, src/renderer/src/theme/apply.ts
- [x] T044 [US7] Audit every shell surface (strip, palette, failure, loading) so all colors come from CSS variables and typography is Source Code Pro. Files: src/renderer/src/styles/base.css, src/renderer/src/components/

**Checkpoint**: Stories 1–7 work independently.

---

## Phase 10: User Story 8 - Survive an unreachable target (Priority: P8)

**Goal**: A themed failure view with Retry and Edit URL replaces raw network errors.

**Independent Test**: quickstart S8.

- [x] T045 [US8] Build the FailureView component showing the target plus Retry and Edit URL, themed from CSS variables. File: src/renderer/src/components/FailureView.vue
- [x] T046 [US8] Implement `failure.retry` and wire `viewport:failed`; Edit URL opens the palette prefilled with the current target. Files: src/main/shell/commands.ts, src/renderer/src/components/FailureView.vue

**Checkpoint**: All user stories work independently.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Hardening and verification across stories

- [x] T047 [P] Add a state-concurrency unit test: two writers merge recents without loss and scalars are last-writer-wins. File: tests/unit/store-concurrency.test.ts
- [x] T048 [P] Finalize README (run instructions, Tlapalli thanks) and NOTICE (MIT attribution). Files: README.md, NOTICE
- [x] T049 Run `npm run check` and `npm run test` (scripts in package.json) and fix all failures
- [x] T050 Execute quickstart.md scenarios S0–S11 in order, timing launch-to-first-paint against SC-001's 3-second budget, and record the results in specs/001-chromeless-localhost-browser/validation.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; **blocks every user story**
- **User Stories (Phases 3–10)**: depend on Foundational; proceed in priority order
  or in parallel
- **Polish (Phase 11)**: after the desired user stories are complete

### Critical Gate

- **T005 (M0 spike)** must PASS before T006 and before any shell UI work. If it
  fails, apply the fallback in research.md and re-plan before continuing.

### User Story Dependencies

All stories depend only on the Foundational phase, so each is independently
testable. Practical ordering:

- **US1 (P1)**: none — pure render path
- **US2 (P2)**: none (uses policy from T009)
- **US3 (P3)**: none (DevTools module from T019)
- **US4 (P4)**: none (independent picker path)
- **US5 (P5)**: none (strip is its own overlay surface)
- **US6 (P6)**: none (uses the editable flag from T011)
- **US7 (P7)**: none, but verifies surfaces created by US1/US2/US5/US8 (T044)
- **US8 (P8)**: none (failure state produced by T018)

### Within Each User Story

- Implementation before integration; complete a story before moving to the next
  priority unless parallelizing deliberately

---

## Parallel Opportunities

### Setup

```bash
Task: "T002 Pin Electron 44 and add runtime dependencies"
Task: "T003 Add Vite+ and Vitest, wire scripts"
Task: "T004 Add LICENSE, README, NOTICE"
```

### Foundational

```bash
Task: "T007 state store"
Task: "T008 store unit tests"
Task: "T009 local-target policy"
Task: "T010 policy unit tests"
Task: "T012 typed IPC surface"
Task: "T014 Tlapalli token pipeline"
Task: "T015 token mapping unit tests"
Task: "T016 fonts and base styles"
```

### User Stories

Once Foundational is complete, US1–US8 can be staffed in parallel by different
people; within a story, `[P]` tasks (e.g. T021, T023, T027, T031, T043) can run
concurrently with their story's other tasks.

---

## Parallel Example: User Story 2

```bash
# Palette UI and its data layer in parallel:
Task: "T023 [P] [US2] useCommands fuzzy filter and metadata"
Task: "T027 [P] [US2] useRecents listing and recording"

# Then wire commands and validation sequentially:
Task: "T024 [US2] palette.open / palette.editUrl"
Task: "T025 [US2] target entry validation and navigation"
Task: "T026 [US2] dismissal and focus"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **including the T005 spike gate**
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE** against quickstart S0–S1
5. Demo: a chromeless window with docked DevTools rendering your dev server

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → usable core
3. US2 → validate → any target reachable
4. US3 → validate → DevTools placement
5. US4 → validate → picker
6. US5 → validate → movable window with controls
7. US6 → validate → reload/history
8. US7 → validate → Tlapalli theming
9. US8 → validate → failure recovery
10. Polish → checks and full quickstart pass

### Parallel Team Strategy

One developer is the expected case; if parallelizing, complete Setup +
Foundational together, pass the T005 gate, then split US1–US8 by priority.

---

## Notes

- `[P]` tasks touch different files and have no dependencies on incomplete tasks
- `[US#]` labels map each task to a user story for traceability
- The T005 spike gate is non-negotiable (constitution: spike-first)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid vague tasks or cross-story dependencies that break independence
