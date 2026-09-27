---
description: "Task list for standalone macOS packaging"
---

# Tasks: Standalone macOS Application Packaging

**Input**: Design documents from `/specs/003-standalone-packaging/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested by the specification. Validation is the scripted
build-and-launch path in `quickstart.md` (unit tests cannot install/launch a
bundle); pure helpers, if any, fall under `vp test`.

**Organization**: Tasks are grouped by user story so each is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

Single project (Electron) at repository root: `src/`, `scripts/`, `resources/`,
root config files.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the packager dependency and the metadata/type prerequisites.

- [x] T001 [P] Add `electron-builder` as a devDependency in `package.json` (pin a version compatible with Electron 44) and install it
- [x] T002 [P] Add an `author` field to `package.json` (bundle/About metadata; satisfies the identity contract)
- [x] T003 [P] Add `"electron-vite/node"` to `compilerOptions.types` in `tsconfig.node.json` so `?asset` imports type-check

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Icon bundle and packager config that every story relies on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Add `scripts/build-icons.sh` that builds an `.iconset` (16, 32, 128, 256, 512 and `@2x` = 1024) from `resources/icon.png` and calls `iconutil -c icns`, failing loudly if any size is missing; run it to produce `resources/icon.icns`, and commit both the script and the `.icns`
- [x] T005 Create `electron-builder.yml` with `appId: com.ackzell.tlachialoni`, `productName: Tlachialoni`, `directories.output: release`, `files: ["out/**", "package.json"]`, and `asar: true` (mac target details land in US1)

**Checkpoint**: Foundation ready — user stories can now proceed.

---

## Phase 3: User Story 1 - Run the tool without the repository (Priority: P1) 🎯 MVP

**Goal**: A launchable `Tlachialoni.app` that opens from `/Applications` with the
source checkout absent.

**Independent Test**: `npm run package`, copy the `.app` to `/Applications`, move
the repo away, double-click — it opens and renders the default target
(quickstart §2).

- [x] T006 [US1] Add the single `package` script (`electron-vite build && electron-builder --mac`) to `package.json`
- [x] T007 [US1] Configure the macOS target in `electron-builder.yml`: `mac.target: [dmg, zip]`, `mac.arch: [arm64]`, `mac.icon: resources/icon.icns`, and an app category (`public.app-category.developer-tools`)
- [x] T008 [US1] In `src/main/index.ts`, import the icon via `../../resources/icon.png?asset`, set the development Dock icon on macOS (`app.dock?.setIcon`), and confirm no privileged/network behavior changes
- [x] T009 [US1] Build and validate US1: `npm run package`, install to `/Applications`, move the repo away, launch from Spotlight, confirm it renders the default target (quickstart §2), then restore the repo

**Checkpoint**: The app runs standalone — MVP delivered.

---

## Phase 4: User Story 2 - Produce the artifact with one command (Priority: P2)

**Goal**: Reproducible, idempotent packaging that writes only ignored output and
never touches tracked files.

**Independent Test**: From a clean `release/`, run the command; confirm the
artifact appears and `git status` is clean (quickstart §1).

- [x] T010 [P] [US2] Verify `release/` is gitignored in `.gitignore` and that no packaging output escapes it; add a `package:mac` alias script to `package.json`
- [x] T011 [US2] Validate idempotency: `rm -rf release out && npm run package` twice; confirm success both times, output replaced (not corrupted), and `git status` shows no tracked changes (FR-006/FR-009)
- [x] T012 [US2] Document in `README.md`: prerequisites, the `npm run package` command, the `release/` output, and the unsigned first-launch caveat (right-click → Open / `xattr -dr com.apple.quarantine`)

**Checkpoint**: US1 and US2 both work; packaging is reproducible.

---

## Phase 5: User Story 3 - Correct identity in the OS (Priority: P3)

**Goal**: The installed app shows its own name and icon everywhere macOS surfaces
them.

**Independent Test**: Launch the installed app; inspect Dock, ⌘Tab, application
menu, About panel, Finder (quickstart §3–4).

- [x] T013 [US3] In `src/main/index.ts`, derive the app name from a single source (no duplicated `"tlachialoni"` literal) and set `app.setAboutPanelOptions` (name + icon) so the About panel matches the bundle
- [x] T014 [US3] Validate identity: installed app shows `Tlachialoni` in Finder/menu/About and its own icon in Dock/⌘Tab; verify `resources/icon.icns` contains all standard sizes with no upscaled retina slots (quickstart §3–4)

**Checkpoint**: Identity is consistent across the OS.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates and consistency across the whole feature.

- [x] T015 Run `npm run check` and `npm run test`; fix all failures (FR-008)
- [x] T016 Run `quickstart.md` §5–7: offline UI renders (SC-005), chromeless + docked DevTools behavior is preserved in the installed app, and `npm run dev` still works
- [x] T017 [P] Update docs impacted by the now-in-scope packaging: `README.md` (if not already), and any "packaging deferred" references in `specs/001-minimal-browser/`
- [x] T018 Remove the temporary `<!-- Sync Impact Report -->` comment from `.specify/memory/constitution.md` before committing the amendment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T001–T003 are parallel.
- **Foundational (Phase 2)**: Depends on Setup — T004 (icns) and T005 (builder config) can run in parallel; both block all stories.
- **User Stories (Phase 3+)**: Depend on Foundational.
  - US1 (P1) is the MVP and should go first.
  - US2 (P2) depends on US1's `package` script existing.
  - US3 (P3) depends on US1's bundle; independent of US2.
- **Polish (Phase 6)**: After the desired stories.

### User Story Dependencies

- **US1 (P1)**: after Foundational — no other story dependencies.
- **US2 (P2)**: after Foundational; exercises US1's command but adds reproducibility + docs.
- **US3 (P3)**: after Foundational; adds identity polish on top of US1's bundle.

### Parallel Opportunities

- T001, T002, T003 (Setup) run in parallel — different files.
- T004 and T005 (Foundational) run in parallel.
- T010 (gitignore/aliases) can proceed alongside T013 (identity) once US1 is done.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1.
4. **STOP and VALIDATE** with quickstart §2 (run from `/Applications`, repo absent).
5. That alone satisfies the headline requirement.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → standalone app (MVP).
3. US2 → reproducible command + docs.
4. US3 → identity polish.
5. Polish → checks/docs green.

---

## Notes

- [P] = different files, no dependencies.
- `resources/logo.svg` and `resources/icon.png` are already in place (moved from
  the repo root); T004 derives the `.icns` from the PNG.
- No test tasks: the specification did not request them; end-to-end validation is
  `quickstart.md`, and pure logic falls under `vp test`.
- Commit after each task or logical group.
