# Tasks: Load Rim

**Input**: Design documents from `specs/025-reload-indicator/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: A pure unit test is included because the plan and contract make the
load predicates a tested boundary. The visual surface is validated manually and
through the screenshot scene.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, `tests/` at repository root
- Main process: `src/main/`
- Renderer: `src/renderer/src/`
- Shared pure modules: `src/shared/`
- Unit tests: `tests/unit/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing project can carry the feature without new dependencies

- [x] T001 Confirm the feature branch `025-reload-indicator` and the existing scripts (`pnpm dev`, `pnpm check`, `pnpm test`, `pnpm typecheck`) in `/Users/ackzell/projects/oss/tlachialoni/package.json`; add no new dependencies

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure detection logic and the one-way shell bridge that every user story consumes

- [x] T002 [P] Create `src/shared/reload.ts` exporting `ReloadKind = "normal" | "hard"`, `isReloadNavigation(navigationUrl, shownUrl)` (false when nothing is committed; normalized `href` equality with string fallback), and `rimKindFor(isReload, pending, active)` (pending decides a reload; otherwise an active hard rim survives continuations and a fresh load is normal)
- [x] T003 Add `tests/unit/reload.test.ts` covering null committed URLs, same `href` including trailing-slash normalization, different path/query/origin, unparseable input, and `rimKindFor` for fresh navigation, page-initiated reload, pending normal/hard, hard continuation, normal downgrade, and stale pending on a non-reload
- [x] T004 [P] Extend `SiteViewEvents` in `src/main/shell/site-view.ts` with `onNavigateStart: (url: string) => void` and wire `wc.on("did-start-navigation")` to call it only for `details.isMainFrame && !details.isSameDocument`
- [x] T005 [P] Add the `reloading` ref plus a `viewport:reloading` subscription in `src/renderer/src/composables/useShell.ts`; accept `{ hard: boolean, url: string } | null`, store `{ hard } | null`, and clear it on `viewport:failed` and on `viewport:loading` with `loading: true`

**Checkpoint**: The predicates, navigation hook, and shell bridge are ready

---

## Phase 3: User Story 1 - See That an In-Place Load Is In Progress (Priority: P1) 🎯 MVP

**Goal**: A reload, link click, history move, or same-origin palette navigation shows a four-edge rim while the current page stays visible.

**Independent Test**: Load a target, press `⌘R`, then follow a link; confirm the rim wraps the page during each load and fades on completion.

### Implementation for User Story 1

- [x] T006 [US1] In `src/main/shell/window.ts`, add `private reloading: { hard: boolean } | null = null`, pass `onNavigateStart` into `createSiteView`, and implement `handleNavigateStart(url)` to show the rim for any main-frame document load when `shownUrl !== null`, no veil is raised, and the window has not failed
- [x] T007 [US1] In `src/main/shell/window.ts`, add `setReloading(next)` to send `viewport:reloading` (`{ hard, url }` or `null`), clear `reloading` when `setLoading(false)` runs, and include `this.reloading !== null` in `desiredShellMode()` so the shell expands to `full`
- [x] T008 [P] [US1] Create `src/renderer/src/components/ReloadIndicator.vue` with a four-edge rim: a constant 4px `--tb-accent` border, a theme-tinted dark contrast ring and harsher neutral shadow for light pages, a `--tb-signature` inner bloom, `pointer-events: none`, `aria-hidden="true"`, and the `reload-enter-active` / `reload-leave-active` fade classes; props `hard: boolean` and `top: number`
- [x] T009 [US1] Render `<ReloadIndicator>` in `src/renderer/src/App.vue` inside a `<Transition name="reload">` with `markSurfaceLeaving` / `markSurfaceLeft` / `markSurfaceLeaveCancelled`, placed before the `LoadingVeil` and `FailureView` transitions, and pass `:hard="reloading.hard"` and `:top="0"`

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Distinguish a Hard Reload (Priority: P2)

**Goal**: A hard reload adds a heavier inner rim that trails the normal pulse, so it is distinguishable without a label.

**Independent Test**: Press `⇧⌘R` and confirm the rim has a visibly heavier, delayed inner rim while keeping the same placement and lifetime.

### Implementation for User Story 2

- [x] T010 [US2] In `src/main/shell/window.ts`, add `private pendingReloadKind: ReloadKind | null`, set it to `"normal"` / `"hard"` immediately before `webContents.reload()` / `reloadIgnoringCache()` in `view.reload` / `view.hardReload`, consume it in `handleNavigateStart` via `rimKindFor`, and pass the resulting `hard` value into `reloading`
- [x] T011 [P] [US2] Extend `src/renderer/src/components/ReloadIndicator.vue` so the `hard` prop adds a heavier 2px inner rim with its own dark shadow, a `180ms` animation delay, and a double-beat base glow
- [x] T012 [US2] Add `previewLoadRim(hard: boolean)` to `src/main/shell/window.ts`, extend the `devPreview` union with `"reload"`, send the preview status, and clear it in `exitDevPreview`
- [x] T013 [P] [US2] Add **Preview Load Rim** and **Preview Hard Reload Rim** entries to the dev-only Developer menu in `src/main/index.ts`, calling `manager.focused()?.previewLoadRim(false | true)`

**Checkpoint**: Both rim kinds are distinguishable and previewable independently

---

## Phase 5: User Story 3 - The Rim Does Not Fight Other Surfaces (Priority: P3)

**Goal**: The rim yields to the veil and failure view, never appears for a veiled target load, stays single under repeated loads, and respects the strip, titlebar, reduced motion, and pointer-through rules.

**Independent Test**: Trigger loads alongside site switches, failure, repeated loads, titlebar mode, and reduced motion; confirm at most one rim is shown, it never competes with the veil, and it never blocks input.

### Implementation for User Story 3

- [x] T014 [US3] In `src/main/shell/window.ts`, clear `reloading` when a veiled `loadTarget` starts, in `handleFailed`, and whenever the full-screen veil is raised; a repeated in-place load refreshes the single status; a blank window (`shownUrl === null`) never starts it
- [x] T015 [P] [US3] In `src/renderer/src/App.vue`, replace the fixed `:top="0"` with `:top="stripVisible ? STRIP_HEIGHT : 0"` (import `STRIP_HEIGHT` from `@shared/shell`), so the rim wraps the page area below a pinned, peeking, or docked strip
- [x] T016 [P] [US3] In `src/renderer/src/components/ReloadIndicator.vue`, add `@media (prefers-reduced-motion: reduce)` overrides that remove all animations and render static rims, and add `data-tlachialoni-reload-indicator` plus `data-kind="normal" | "hard"` lookup hooks
- [x] T017 [US3] Update the `reload` scene in `src/main/screenshots.ts` to sample a normal reload and a hard reload, so the captured frames show both rims through `data-tlachialoni-reload-indicator` / `data-kind`

**Checkpoint**: All user stories are independently functional and compose with existing surfaces

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, documentation, and capture across all stories

- [x] T018 [P] Run the validation scenarios S1–S23 in `specs/025-reload-indicator/quickstart.md` against `pnpm dev`, including in-place navigation, light-page contrast with a dark shell theme, reduced motion, click-through, titlebar/strip placement, and the guest-page-untouched check
- [x] T019 Run the `check`, `test`, and `typecheck` scripts defined in `/Users/ackzell/projects/oss/tlachialoni/package.json` and fix any failures
- [x] T020 [P] Regenerate the reload GIF with `pnpm screenshots` (reload scene) and `node scripts/build-gifs.mjs --only reload`, and confirm the normal and hard frames are both distinct in `docs/gifs/reload.gif`
- [x] T021 [P] Update `README.md` (reload bullet and alt text) and the spec/plan/research/data-model/contract/quickstart artifacts to the final four-edge rim behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — blocks all user stories
- **User Stories (Phase 3+)**: Depend on Foundational; US1 → US2 → US3 is the simplest path
- **Polish (Phase 6)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational
- **US2 (P2)**: Starts after US1's state/component
- **US3 (P3)**: Starts after US1/US2's state and rendering

### Parallel Opportunities

- Phase 2: T002, T004, and T005 touch different files; T003 follows T002
- US1: T008 can be written in parallel with T006/T007, then T009 wires them
- US2: T011 can run in parallel with T010/T012; T013 follows T012
- US3: T015 and T016 touch different files and can run in parallel
- Polish: T018, T020, and T021 are independent; T019 is the final gate

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup + Foundational
2. Complete US1
3. Validate reload **and** link/history/palette navigation
4. Add US2 (hard rim) and US3 (composition/placement)
5. Finish with tests, docs, and the regenerated reload GIF

### Incremental Delivery

1. Foundation → predicates + bridge
2. US1 → in-place load feedback (MVP)
3. US2 → hard reload is visually distinct
4. US3 → composition, placement, reduced motion, screenshots
5. Polish → all checks, docs, and captures

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
