# Tasks: MV3 Extension Detection & Warning

**Input**: Design documents from `/specs/018-mv3-extension-warning/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — detection and the badge predicate are pure functions, and the persisted flag's defaulting is worth pinning down.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project structure needed — this feature extends existing modules.

- [x] T001 Verify existing extension modules are in place: `src/main/extensions/crx.ts`, `src/main/extensions/manager.ts`, `src/shared/extensions.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core detection logic and type changes that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add `detectMv3ServiceWorker(manifest)` to `src/main/extensions/crx.ts` — a pure check of `manifest_version === 3` and `background.service_worker` presence, returning a boolean
- [x] T003 [P] Add `"warning"` to the `ExtensionPhase` union in `src/shared/extensions.ts` and exclude it from `isActivePhase`, so it is terminal (dismissible) rather than in-flight
- [x] T004 [P] Add `mv3ServiceWorker: boolean` to `InstalledExtension` in `src/shared/extensions.ts`, and default it to `false` in `sanitizeExtensions` in `src/main/state/schema.ts` so records written before the field survive

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Install an MV3 extension and see a warning (Priority: P1) 🎯 MVP

**Goal**: When installing an MV3 extension with a service worker background, show a warning in the status surface.

**Independent Test**: Install an MV3 extension with `background.service_worker`. Confirm the status surface shows the warning after loading. Confirm the extension still loads and its content scripts work.

### Implementation for User Story 1

- [x] T005 [US1] Update `commit()` in `src/main/extensions/manager.ts` — detect via `detectMv3ServiceWorker(manifest)`, persist the flag on the record, and emit `warning` (interpolating `app.getName()`) instead of `done`
- [x] T006 [US1] Add a `warnAboutMv3(name)` helper in `src/main/extensions/manager.ts` holding the message template, and route `commit()` and `setEnabled()` through it
- [x] T007 [US1] Update `setEnabled()` in `src/main/extensions/manager.ts` — re-enabling is the other moment the warning is worth repeating, so it warns instead of confirming
- [x] T008 [US1] Update `InstallStatus.vue` in `src/renderer/src/components/InstallStatus.vue` — render `warning` with an amber glyph, the message as the title, and a dismiss hint; exclude it from `busy` and from the `done` auto-dismiss
- [x] T009 [US1] Make the auto-dismiss a predicate over the status value (`shouldAutoDismiss` in `src/shared/extensions.ts`) with an `immediate` watcher on `phase:message`, so a status that is already `done` on mount arms its timer. `Removed <name>` is a removal's first and only status, and `App.vue` mounts the surface only while a status exists, so a change-driven watcher never fired for it

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - See the standing limitation in the extension list (Priority: P1)

**Goal**: The warning fires once, on install. The persisted fact then lives on as an `MV3` badge in the palette, and boot stays silent.

**Independent Test**: Install an MV3 extension, dismiss the warning, open the palette's Extensions group and confirm the badge. Relaunch and confirm no card but the badge remains.

### Implementation for User Story 2

- [x] T010 [US2] Persist `mv3ServiceWorker` in `load()` in `src/main/extensions/manager.ts` and include it in `patch()`'s change check, so it is re-derived every load and back-fills older records
- [x] T011 [US2] Make boot and reload silent in `loadAll()` and `reloadAll()` in `src/main/extensions/manager.ts` — no `warning` on either path (FR-005)
- [x] T012 [US2] Revert the boot-time status routing in `src/main/index.ts` and the `pendingStatus` buffer in `src/main/shell/window-manager.ts` — the only pre-window status would now be a load error, which was already reported to stderr, so the buffering has no remaining caller and is deleted
- [x] T013 [US2] Add an optional `badge` to `Row` in `src/renderer/src/composables/useCommands.ts` and set it to `MV3` on the extension toggle row when the persisted flag is true
- [x] T014 [US2] Render the badge in `CommandPalette.vue` in `src/renderer/src/components/CommandPalette.vue` with amber styling matching the install warning

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - MV3 extensions still load despite the warning (Priority: P1)

**Goal**: The warning is informational only — the extension still loads and its content scripts and DevTools pages work.

**Independent Test**: Install an MV3 extension with content scripts. Confirm the content scripts inject into the guest page despite the warning.

### Implementation for User Story 3

- [x] T015 [US3] Verify in `src/main/extensions/manager.ts` that the `warning` status is emitted after `loadExtension` resolves — the extension is already loaded, so content scripts work
- [x] T016 [US3] Verify in `src/main/extensions/manager.ts` that no path unloads or rejects on an MV3 extension — `warnAboutMv3` only emits a status

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Tests

- [x] T017 Cover `detectMv3ServiceWorker` in `tests/unit/extensions.test.ts` — MV3+service worker is flagged; MV2, MV3 without a background, and a non-object background are not
- [x] T018 Cover `isActivePhase("warning") === false` and the other phases in `tests/unit/extensions.test.ts`
- [x] T018b Cover `shouldAutoDismiss` in `tests/unit/extensions.test.ts` — only `done` leaves on its own, and no in-flight phase is dismissable
- [x] T019 Cover `sanitizeExtensions` defaulting `mv3ServiceWorker` to `false` for legacy and non-boolean records in `tests/unit/extensions.test.ts`
- [x] T020 Cover the `MV3` badge on the extension toggle row, and its absence otherwise, in `tests/unit/commands.test.ts`
- [x] T021 Update the existing `InstalledExtension` fixtures in `tests/unit/commands.test.ts` and `tests/unit/store.test.ts` for the new field

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T022 [P] Update `spec.md`, `data-model.md`, `tasks.md`, and `quickstart.md` to the badge-based design, marking the superseded boot/session-dismissal clarifications
- [x] T023 Run `npm run test` — all tests pass (184)
- [x] T024 Run `npm run typecheck` — clean across node, preload, and web

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Tests (Phase 6)**: Depend on the user stories they cover
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1's warning phase and on the persisted flag from T004
- **User Story 3 (P1)**: Depends on Foundational - verifies existing behavior, no new code

### Within Each User Story

- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T003 and T004 can run in parallel (different files)
- T013 and T014 touch different files but the badge is only visible once both land

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently (MVP!)
3. Add User Story 2 → Test independently
4. Add User Story 3 → Test independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
