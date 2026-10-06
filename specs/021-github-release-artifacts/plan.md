# Implementation Plan: GitHub Release Artifacts

**Branch**: `021-github-release-artifacts` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/021-github-release-artifacts/spec.md`

## Summary

Add a GitHub Actions workflow that triggers on `v*` tag pushes, builds the macOS
artifacts (`.dmg` and `.zip`), and creates a GitHub Release with those artifacts
attached. This updates spec 006's local-only release approach to use GitHub as
the distribution channel. The workflow runs on a macOS runner, verifies version
consistency, and attaches ad-hoc signed artifacts (no Developer ID signing).

## Technical Context

**Language/Version**: TypeScript (Node 22)

**Primary Dependencies**: electron-vite, electron-builder, commit-and-tag-version,
softprops/action-gh-release

**Storage**: N/A (artifacts stored as GitHub Release attachments)

**Testing**: vitest (existing), vp check (existing)

**Target Platform**: macOS 13+ (Apple silicon / arm64 only)

**Project Type**: Desktop app (Electron)

**Performance Goals**: Workflow completes in under 10 minutes

**Constraints**: Ad-hoc signing only (no Developer ID), macOS runner required,
artifacts must match local build output

**Scale/Scope**: Single maintainer, occasional releases, small user base

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Chromeless by Default | N/A | No UI changes |
| II. The Guest Page is Sacred | N/A | No guest page changes |
| III. Keyboard-First Ergonomics | N/A | No shell changes |
| IV. Real Chromium DevTools, Docked | N/A | No DevTools changes |
| V. One Target Per Window | N/A | No window changes |
| VI. Identity Through Tlapalli | N/A | No visual changes |
| Packaging & Distribution | Pass | Workflow produces standalone macOS artifact; ad-hoc signing is explicitly permitted; leaves room for future Developer ID signing |
| Development Workflow | Pass | Spec Kit drives development; all changes pass `vp check` before commit |
| Security & Isolation | N/A | No runtime changes |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/021-github-release-artifacts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── release.yml      # NEW: GitHub Actions release workflow

src/                     # (unchanged)
├── main/
├── preload/
├── renderer/
└── shared/

resources/               # (unchanged)
├── icon.icns
└── icon.png

electron-builder.yml     # (unchanged)
electron-builder.local.yml # (unchanged)
package.json             # (unchanged)
```

**Structure Decision**: Single new file `.github/workflows/release.yml`. No changes
to existing source code, build configuration, or packaging setup.

## Complexity Tracking

No constitution violations to justify.
