# Validation: Always-On Drag Region

**Feature**: `specs/013-always-on-drag-region/`
**Date**: 2026-09-29

## Automated evidence

| Check | Command | Result |
| --- | --- | --- |
| Types (main) | `npm run typecheck:node` | PASS |
| Types (preload) | `npm run typecheck:preload` | PASS |
| Types (renderer) | `npm run typecheck:web` | PASS |
| Unit tests | `npm run test` | PASS — 141 tests / 10 files, including `tests/unit/proximity.test.ts` (15) and `tests/unit/shell.test.ts` (10) |
| Format + lint | `npm run check` | PASS (70 files formatted, 0 warnings/errors) |
| Build | `npm run build` | PASS — main, preload, and renderer bundles produced |

The pure logic is fully covered by unit tests: the proximity state machine
(`src/main/shell/proximity.ts`) and the shared strip-surface predicate
(`src/shared/shell.ts`).

## Manual scenarios (require a running Electron UI)

These need a human at the machine (or a GUI harness); they could not be executed in
this environment. Scenarios are defined in `quickstart.md`.

| Scenario | Requirements | Status |
| --- | --- | --- |
| S1 — Drag with no keyboard step | FR-001, FR-002, FR-003, SC-001, SC-004 | PENDING manual |
| S2 — Peek by proximity and dwell | FR-004, FR-005, SC-002, SC-003 | PENDING manual |
| S3 — Use the strip while peeking | FR-006, SC-005 | PENDING manual |
| S4 — Pin semantics unchanged | FR-007, SC-006 | PENDING manual |
| S5 — Traffic lights track the strip | FR-008 | PENDING manual |
| S6 — Reduced motion | FR-014 | PENDING manual |
| S7 — Multi-window independence | FR-012, FR-009 | PENDING manual |
| S8 — The band stays available over full surfaces | FR-011 | PENDING manual |
| S9 — Drag holds the current titlebar state | FR-016 | PENDING manual |
| S10 — Resource baseline | FR-010, SC-007 | PENDING manual |
| S11 — Spike outcomes | FR-013, SC-002 | PENDING manual (T001) |
| S13 — Space change keeps the reveal | FR-009 Spaces edge | PENDING manual |

## Fix log

- **Space change stopped the reveal (found in use, fixed).** Moving the window to
  another macOS Space fired `blur` (and sometimes `hide`) on the window, which
  stopped the proximity sampler; it only recovered when the window was refocused.
  The sampler is now kept alive for the window's lifetime and pauses itself per
  tick, so a Space change can no longer leave the strip unrevealed (`window.ts`).

## Known platform behavior

- macOS does not restore a window to the Space it was on before quitting; restored
  windows open on the currently active Space. There is no public API to assign a
  window to a specific existing Space (`setVisibleOnAllWorkspaces` only makes it
  appear everywhere), so this is a platform limitation unrelated to this feature.

## Spike notes (T001)

Not executed here (needs a live window):

- Cursor proximity at the screen edge, on a secondary display, and under Retina
  scaling — expected to hold because `screen.getCursorScreenPoint()` and
  `win.getContentBounds()` share the same DIP screen space.
- Native double-click-to-zoom inside a custom drag region — unresolved; FR-013
  stays as a SHOULD pending the spike. No JS `dblclick` is wired, because drag
  regions ignore pointer events.
