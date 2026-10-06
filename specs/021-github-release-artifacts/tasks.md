# Tasks: GitHub Release Artifacts

**Input**: Design documents from `specs/021-github-release-artifacts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the workflow directory structure

- [x] T001 Create `.github/workflows/` directory

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core workflow structure that MUST be complete before user stories can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create `.github/workflows/release.yml` with workflow header, trigger, permissions, and job configuration
- [x] T003 [P] Add checkout and setup steps to `.github/workflows/release.yml` (actions/checkout, pnpm/action-setup, actions/setup-node)
- [x] T004 [P] Add version extraction and verification steps to `.github/workflows/release.yml`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Push a tag, get a downloadable release (Priority: P1) 🎯 MVP

**Goal**: Push a `v*` tag and get a GitHub Release with `.dmg` and `.zip` artifacts attached

**Independent Test**: Push a `v*` tag to GitHub, wait for the workflow to finish, and confirm a GitHub Release exists with the correct artifacts attached.

### Implementation for User Story 1

- [x] T005 [US1] Add build steps to `.github/workflows/release.yml` (pnpm install, pnpm package)
- [x] T006 [P] [US1] Add changelog extraction step to `.github/workflows/release.yml`
- [x] T007 [US1] Add GitHub Release creation step to `.github/workflows/release.yml` with artifact attachment
- [x] T008 [US1] Add success notification step to `.github/workflows/release.yml`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Version mismatch fails the build (Priority: P2)

**Goal**: Push a tag with mismatched version and confirm the workflow fails with a clear error

**Independent Test**: Push a tag with a version that does not match `package.json` and confirm the workflow fails.

### Implementation for User Story 2

- [x] T009 [US2] Enhance version verification in `.github/workflows/release.yml` to provide clear error message on mismatch
- [x] T010 [US2] Add test for version mismatch scenario in `.github/workflows/release.yml` (manual validation step)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T011 [P] Update `README.md` with release workflow documentation
- [x] T012 [P] Update `specs/006-release-versioning-about/spec.md` to reflect new CI approach
- [x] T013 Run quickstart.md validation
- [x] T014 [P] Add `.github/workflows/release.yml` to `.vscodeignore` if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Enhances US1's version verification

### Within Each User Story

- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)

---

## Parallel Example: User Story 1

```bash
# Launch all independent tasks for User Story 1 together:
Task: "Add build steps to .github/workflows/release.yml"
Task: "Add changelog extraction step to .github/workflows/release.yml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
