# Validation: Blank-Page Watermark

**Feature**: `specs/014-blank-watermark/`
**Date**: 2026-09-29

## Automated evidence

| Check | Command | Result |
| --- | --- | --- |
| Types (main) | `npm run typecheck:node` | PASS |
| Types (preload) | `npm run typecheck:preload` | PASS |
| Types (renderer) | `npm run typecheck:web` | PASS |
| Unit tests | `npm run test` | PASS — 144 tests / 10 files, including `tests/unit/shell.test.ts` (13: the existing strip cases plus the new `isBlankSurfaceVisible` cases) |
| Format + lint | `npm run check` | PASS (71 files formatted, 0 warnings/errors) |
| Build | `npm run build` | PASS — main, preload, and renderer bundles produced; the inlined mark is bundled into the renderer JS |

The only logic with real inputs is the shared `isBlankSurfaceVisible` predicate, and
it is fully covered by unit tests. The visual surface (`BlankView.vue`) lives in a
`WebContentsView` with no DOM harness, so its look and the light/dark treatment are
manual checks.

## Manual scenarios (require a running Electron UI)

These need a human at the machine (or a GUI harness); they could not be executed in
this environment. Scenarios are defined in `quickstart.md`.

| Scenario | Requirements | Status |
| --- | --- | --- |
| S1 — Watermark on a new blank window | FR-001, FR-002, FR-004, SC-001 | PENDING manual |
| S2 — The watermark is blank-only | FR-005, SC-002 | PENDING manual |
| S3 — Palette and failure stay authoritative | FR-003, FR-010, SC-004 | PENDING manual |
| S4 — Theme matching | FR-006, FR-007, SC-003 | PENDING manual |
| S5 — Restored blank window | FR-001, FR-004 | PENDING manual |
| S6 — Multi-window independence | FR-010 | PENDING manual |
| S7 — Reduced motion and small windows | FR-008 | PENDING manual |
| S8 — Automated checks | Development Workflow gate | PASS (see above) |

## Notes

- **Asset invariant**: `src/renderer/src/assets/logo.svg` differs from the committed
  source art `resources/logo.svg` only in the two `fill:currentColor` substitutions on
  `path334`/`path335`; verified with `diff`.
- **Constitution**: a PATCH-level clarification to Principle I was applied
  (`.specify/memory/constitution.md`, version 2.2.5) recording that the zero-pixel
  chrome rule constrains chrome over the guest page, so a decorative watermark on a
  never-loaded window is permitted. It is removed as soon as a target commits and
  never intercepts input.
- **Build**: the standalone `logo-*.svg` asset is no longer emitted because the mark
  is imported as a raw string and inlined; this is expected (the `currentColor`
  accents require the SVG to be part of the live document).
