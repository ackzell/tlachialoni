# Implementation Plan: Color Mode Options

**Branch**: `027-color-mode-options` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-color-mode-options/spec.md`

## Summary

Replace the single `theme.cycleMode` command (system → dark → light) with three direct commands, one per color mode: Light, Dark, and System. The command palette lists the three rows and marks the active one, using the same `current` detail the theme variants already use. The Theme menu lists the same three items as radio choices and moves the selection mark to the focused window's mode. The stored per-window `colorMode` field, the live OS-follow behavior for System, and the immediate repaint of the shell and docked DevTools all stay as they are. The cycle command and its handler are removed.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Vue 3.5.43, Node 24, Electron 44.5.1

**Primary Dependencies**: Electron `Menu` and `BaseWindow` focus events, the existing `CommandRegistry`, and the Vue command palette. No new dependency.

**Storage**: The existing JSON state store under Electron's `userData`. The per-window `colorMode` field already persists `light | dark | system`. Schema version 4 already covers it, so no migration is needed.

**Testing**: Vitest through `vp test`; unit tests in `tests/unit/`. The Electron menu has no unit harness, so the menu check state is covered by a manual quickstart scenario.

**Target Platform**: macOS desktop app (Electron). The menu path uses a standard Electron template, so other desktop platforms keep working.

**Project Type**: Desktop application with a main process, a preload bridge, and a Vue renderer.

**Performance Goals**: A mode change repaints the shell and docked DevTools within 1 second. A menu check sync is a constant-time lookup of three items and adds no measurable delay.

**Constraints**: Zero new always-visible chrome. No guest page mutation. Palette reachability for every capability. Per-window mode independence. Unknown stored modes fall back to System.

**Scale/Scope**: Three commands, two selection surfaces (palette and Theme menu), one already-persisted field, and about six source files plus tests.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Chromeless by Default | Pass | The feature adds no painted shell surface. The only new marks sit in the macOS menu bar and the existing palette. |
| II. The Guest Page is Sacred | Pass | Mode changes touch the shell, the window background, and docked DevTools. No guest DOM, style, or script is modified. |
| III. Keyboard-First Ergonomics | Pass | All three modes are palette commands, searchable and selectable from the keyboard. No new capability depends on a mouse, and no new keybinding is claimed. |
| IV. Real Chromium DevTools, Docked | Pass | No change to docking. The existing repaint path is reused. |
| V. One Target Per Window | Pass | The mode stays per window; no target or tab behavior changes. |
| VI. Identity Through Tlapalli | Pass | No new colors. Light and Dark select the existing Tlapalli token sets through the current resolved-mode path. |
| Security & Isolation | Pass | No IPC surface is added. The existing `theme:setColorMode` handler keeps its input validation. |
| State | Pass | `colorMode` stays per window and persisted. The menu mark is derived state, never stored. |
| Packaging & Distribution | Pass | No runtime asset or build change. |
| Development Workflow | Pass | Spec precedes code. `pnpm check`, `pnpm typecheck`, and `pnpm test` remain the gates. |

**Constitution wording (reconciled)**: the State bullet previously said docked DevTools follow the OS. `specs/022-devtools-theme/` establishes and ships the opposite: DevTools follow the window's resolved mode. This change updates the constitution to v2.2.8 (PATCH) so the text matches the shipped behavior and names the three explicit mode choices.

**Prior-spec supersession**: `specs/011-grouped-os-menu/` FR-005 says the menu must not mirror live state. This feature deliberately marks the active mode in the Theme menu, as required by spec FR-006. The change is limited to the three mode items. It updates `checked` in place and does not rebuild the menu, so it is the smallest departure from the static-menu rule.

## Project Structure

### Documentation (this feature)

```text
specs/027-color-mode-options/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── color-mode-commands.md
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── commands.ts              # COLOR_MODES catalog, derived ColorMode, three commands
├── main/
│   ├── index.ts                 # Theme menu items, label prefix, checked sync
│   ├── ipc.ts                   # Unchanged theme:setColorMode handler
│   ├── state/
│   │   └── schema.ts            # Re-export shared ColorMode, validate from catalog
│   └── shell/
│       ├── window.ts            # Register three handlers, remove cycle handler
│       └── window-manager.ts    # Menu-state callback on focus and close
├── renderer/src/
│   ├── composables/
│   │   ├── useCommands.ts       # Mark the active mode row as current
│   │   └── useShell.ts          # Use the shared ColorMode type
│   └── theme/
│       └── apply.ts             # Unchanged resolved-mode applier
tests/
└── unit/
    ├── commands.test.ts         # Catalog, palette rows, no cycle entry
    └── store.test.ts            # Unknown color mode falls back to System
```

**Structure Decision**: Single Electron project. The change stays inside the existing main/preload/renderer split and the existing shared command catalog. No new module or directory is needed.

## Phase 0: Research

See [research.md](./research.md). All decisions are resolved; no `NEEDS CLARIFICATION` remains.

## Phase 1: Design

- [data-model.md](./data-model.md)
- [contracts/color-mode-commands.md](./contracts/color-mode-commands.md)
- [quickstart.md](./quickstart.md)

## Complexity Tracking

No constitution violations and no complexity exceptions. The feature removes a command rather than adding architecture.
