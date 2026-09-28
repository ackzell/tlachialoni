---
description: "Task list for release versioning and the About panel"
---

# Tasks: Release Versioning & About Panel

**Input**: Design documents from `/specs/006-release-versioning-about/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit tests are requested for the pure release-date formatter (Vitest,
`vp test`); the release command and the About panel are validated by
`quickstart.md` (a release and an install cannot be unit-tested).

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (release command), US2 (About identity), US3 (versioned artifacts)
- Exact file paths are included in every task

## Path Conventions

Single Electron project at the repository root: `src/`, `tests/`, `scripts/`, and
root config files.

---

## Phase 1: Setup

- [x] T001 Add `commit-and-tag-version` as a devDependency in `package.json` and install it (build-time only)

## Phase 2: Foundational

**Purpose**: The pure formatter and the build-time date that both US2 and US3 rely on.

- [x] T002 [P] Add `src/shared/release.ts` with a pure `formatReleaseDate(iso: string): string` that renders `YYYY-MM-DD` long-form and returns the input unchanged when unparseable
- [x] T003 [P] Add `tests/unit/release.test.ts` covering a normal date, an unparseable string, and a leap day
- [x] T004 Add `src/main/env.d.ts` declaring `__APP_RELEASE_DATE__: string`
- [x] T005 In `electron.vite.config.ts`, compute the release date (tag `v<version>` creatordate, else build day) and inject `__APP_RELEASE_DATE__` into the `main` build via `define`

**Checkpoint**: The date is available to the main process and formatted by a tested helper.

---

## Phase 3: User Story 1 - Cut a release with one command (Priority: P1) 🎯 MVP

**Goal**: `npm run tag` bumps, changelogs, commits, and tags locally.

**Independent Test**: `npm run tag` after a `feat:` commit → version bumped,
changelog entry added, `vX.Y.Z` tag created, only version/changelog files changed
(quickstart §2).

- [x] T006 [US1] Add `tag`, `tag:minor`, `tag:major`, and `tag:first` scripts to `package.json`
- [ ] T007 [US1] Validate the release flow per `contracts/versioning-command.md`: run `tag:first` to establish the baseline, then `tag` after a `feat:` commit; confirm the bump level, the release commit contents, and the tag name (quickstart §1–2) — **left for the maintainer: commit your work first so the baseline tag captures it**

**Checkpoint**: Releases are one command and local-only.

---

## Phase 4: User Story 2 - The About panel names what is running (Priority: P1)

**Goal**: The native About panel shows the logo, version, and release date.

**Independent Test**: Open the About panel in a packaged build; version and release
date match `package.json` and the tag (quickstart §4).

- [x] T008 [US2] In `src/main/index.ts`, import `formatReleaseDate` and add a `credits` line with the formatted release date to `app.setAboutPanelOptions`, keeping the existing name, version, and icon
- [ ] T009 [US2] Validate in the installed app: the panel shows logo + version + release date, and resolves offline with no source checkout (quickstart §4–5) — **requires a packaged install to eyeball**

**Checkpoint**: The running build is self-describing.

---

## Phase 5: User Story 3 - Local artifacts carry the version (Priority: P2)

**Goal**: Packaging stamps the version into the bundle and artifact filenames.

**Independent Test**: `npm run package` on a bumped version → `.dmg`/`.zip` names
contain the version (quickstart §3).

- [ ] T010 [US3] Validate `npm run package` produces version-stamped artifact filenames and that the installed bundle reports the same version (quickstart §3) — **requires a packaging run to eyeball**

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T011 Document the release ritual and the artifact/tag relationship in `README.md` (tag commands, first-release step, tag-then-package order)
- [x] T012 Run `npm run check` and `npm run test`; fix all failures (FR-009/SC-005)
- [x] T013 [P] Update `README.md` design-docs list with `specs/006-release-versioning-about/spec.md`

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: T002/T003 parallel; T004 and T005 depend on the plan,
  T005 logically follows T004 for type-checking.
- **US1 (Phase 3)**: depends on Setup only.
- **US2 (Phase 4)**: depends on Foundational (formatter + injected constant).
- **US3 (Phase 5)**: depends on US1 (a bumped version to stamp).
- **Polish (Phase 6)**: after the desired stories.

## Parallel Opportunities

- T002 and T003 (formatter + tests) run together.
- T011 and T013 (README edits) can be done together with the final validation.

## Implementation Strategy

Ship US1 first (the release ritual is the MVP), then US2 (About identity), then
US3 (verify artifact stamping), then docs and checks.
