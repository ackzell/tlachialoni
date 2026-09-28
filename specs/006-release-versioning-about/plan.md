# Implementation Plan: Release Versioning & About Panel

**Branch**: `006-release-versioning-about` | **Date**: 2026-09-28 | **Spec**: `specs/006-release-versioning-about/spec.md`

**Input**: Feature specification from `/specs/006-release-versioning-about/spec.md`

## Summary

Give the project a one-command release ritual and make the running build
self-describing. `commit-and-tag-version` (the same tool as the maintainer's
`tlapalli-vscode-theme`) reads Conventional Commits, bumps `package.json`, writes
`CHANGELOG.md`, commits, and creates an annotated `vX.Y.Z` tag — locally, with no
CI and no publishing. `package.json` stays the single source of truth: electron-
builder already stamps the bundle and artifact filenames from it. The native macOS
About panel gains a release date, computed at build time from the tag matching the
current version (falling back to the build day) and injected through
electron-vite's `define`, so the packaged app reads nothing at runtime.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24.21; Electron 44.4.5

**Primary Dependencies**: `commit-and-tag-version` (new, build-time only);
existing electron-vite 5 / vite 7 / electron-builder 26 / Vue 3 unchanged

**Storage**: N/A — this feature is build/release-time; the app's `userData` state
is untouched

**Testing**: Vitest (`vp test`) for the pure release-date formatter; the release
and About behaviors are validated by the scripted scenarios in `quickstart.md`

**Target Platform**: macOS 13+ (Apple silicon) — packaging and the native About
panel are macOS-only, matching 003

**Project Type**: desktop app (Electron) — release tooling + identity polish

**Performance Goals**: N/A — the tag command is interactive; packaging budget is
unchanged (003 SC-006)

**Constraints**: MUST be local-only (no push, no CI) (FR-004); MUST NOT read git /
source tree / network at runtime (FR-007); MUST NOT hand-edit versions (FR-003);
MUST not alter the dev/build/check/test workflow (FR-009)

**Scale/Scope**: one app; one release line; one new dev dependency; one small
pure helper plus the main-process About wiring

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle / requirement (constitution v2.1.0) | Plan compliance                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| I. Chromeless by Default                      | No shell surface is added; the native About panel is an OS window, not app chrome                                             |
| II. The Guest Page is Sacred                  | No guest-page change; release metadata never touches the site view                                                            |
| III. Keyboard-First Ergonomics                | The About panel is reached from the standard macOS app menu (⌘-accessible); no new hidden capability                          |
| IV. Real Chromium DevTools, Docked            | Unaffected                                                                                                                    |
| V. One Target Per Window                      | Unaffected                                                                                                                    |
| VI. Identity Through Tlapalli                 | The panel keeps the existing icon; the release date is plain text, no ad-hoc colors or new UI                                  |
| Technology Foundations                        | `commit-and-tag-version` is a build-time only addition; electron-vite/electron-builder stay the build/packaging tools          |
| Security & Isolation                          | No runtime network/source-tree read; the date is baked into the bundle (003 FR-005)                                            |
| Packaging & Distribution                      | Directly serves it: version and identifier from one source; artifact carries version; signing still deferred                   |
| Development Workflow                          | Spec precedes code (this feature); `vp check` / `vp test` stay green; spec-first flow maintained                              |

**Gate result**: PASS — no violations. Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: PASS. `contracts/versioning-command.md`
fixes the one-command release surface and its no-push scope;
`contracts/release-identity.md` keeps version and release date single-sourced and
baked in; `quickstart.md` re-verifies offline identity in the *installed* app. No
new scope, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-release-versioning-about/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── versioning-command.md   # CLI/release contract
│   └── release-identity.md     # single-source version + release date
├── checklists/
│   └── requirements.md  # Spec quality checklist
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
tlachialoni/
├── package.json                     # + commit-and-tag-version; tag/tag:* scripts
├── electron.vite.config.ts          # bake __APP_RELEASE_DATE__ into main
├── src/
│   ├── main/
│   │   ├── env.d.ts                 # NEW: declare the build-injected constant
│   │   └── index.ts                 # About panel: add release date credits
│   └── shared/
│       └── release.ts               # NEW: formatReleaseDate (pure, tested)
├── tests/unit/
│   └── release.test.ts              # NEW: formatter unit tests
├── CHANGELOG.md                     # generated/updated by tag commands
└── README.md                        # document the release ritual
```

**Structure Decision**: single-project Electron layout. Release tooling lives in
`package.json` scripts (no new source module for the command); the only runtime
code change is the About panel's credits line plus a tiny pure formatter in
`src/shared/` so it is unit-testable under `vp test`. The build injects the date
rather than reading it at runtime, preserving the offline/asar guarantees from 003.

## Phased Delivery

- **M1 — Release tooling**: add `commit-and-tag-version`; add `tag`, `tag:minor`,
  `tag:major`, and `tag:first` scripts; document the ritual and the first-release
  step.
- **M2 — Release identity**: add `formatReleaseDate` in `src/shared/release.ts`
  with unit tests; compute the release date in `electron.vite.config.ts` (tag date
  for `v<version>`, else build day) and inject it into the main bundle via
  `define`; declare the constant in `src/main/env.d.ts`.
- **M3 — About panel**: include the release date in `app.setAboutPanelOptions`
  credits, keeping the existing name/version/icon.
- **M4 — Docs & verification**: README release section; run `vp check` / `vp test`;
  walk `quickstart.md` (release → package → About).

## Risks & Mitigations

| Risk                                                                 | Mitigation                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| First `tag` with no tags counts all history as one release           | Provide `tag:first` and document it as the one-time baseline; `tag` then bumps from the last tag                               |
| Release date drifts from the actual tag date                         | Prefer `git for-each-ref` on `v<version>`; fall back to build day only when untagged; verify in `quickstart.md`                |
| `define` constant breaks `tsc` (`__APP_RELEASE_DATE__` unknown)      | Declare it in `src/main/env.d.ts`, included by `tsconfig.node.json`                                                            |
| Building before tagging bakes the build day                          | Document the order (tag, then package); fallback is explicit and harmless for dev builds                                       |
| Changelog churn from a full first release                            | `tag:first` is explicit and optional; the changelog is generated once and committed with the release                           |
| `commit-and-tag-version` requires a git repo                         | It is a release-time tool used in the checkout; the packaged app never invokes it (build-time only)                            |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
