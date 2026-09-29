# Implementation Plan: Blank-Page Watermark

**Branch**: `014-blank-watermark` | **Date**: 2026-09-29 | **Spec**: `specs/014-blank-watermark/spec.md`

**Input**: Feature specification from `/specs/014-blank-watermark/spec.md`

## Summary

Give the blank page an identity: when a window has never committed a target, the
shell renderer paints a centered, faded watermark of the tool's logo mark. The mark
is inlined as raw SVG rather than a background image so two of its inner chevrons can
take the window's theme accent color; the rest of the art is untouched. The main
process keeps the shell in its `full` mode for a blank window (the 013 band would clip
the surface to a thin strip and hide it), so the watermark survives the location palette
being dismissed. The surface yields to the loading veil and failure view, paints
beneath the palette, and disappears the moment a target commits.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Electron `BaseWindow` + two `WebContentsView`s (site and
shell), Vue 3.5, Vite 7 / electron-vite 5, Vite+ 1.0.0-rc (`vp check` / `vp test`).
No new runtime dependency: the SVG is imported as a raw string via Vite
(`?raw`), which is stock functionality.

**Storage**: none. No persisted field is added, removed, or migrated; the store stays
at schema 3. "Blank" is derived from the existing per-window `target` (`null` until a
load commits).

**Testing**: Vitest via `vp test` for the new shared predicate
(`isBlankSurfaceVisible`) alongside the existing shell-surface predicate cases. The
visual surface lives in a `WebContentsView` with no DOM harness, so its look is
validated manually/slow-motion; the light/dark treatment is checked across variants.

**Target Platform**: macOS 13+ (Apple silicon), matching 001.

**Project Type**: desktop app (Electron main + preload + renderer).

**Performance Goals**: none beyond the existing surfaces — a single static SVG
element, no timers, no per-frame work. The only runtime cost is the (one-time) parse
of the inlined mark when a blank window mounts.

**Constraints**: the watermark MUST paint nothing interactive and MUST NOT overlay a
loaded page; the mark's fixed artwork stays as committed, with only two accent paths
re-colored; the shell stays warm on a blank window (it already does after 013).

**Scale/Scope**: one new renderer component, one derived asset, one shared predicate,
and one branch in `desiredShellMode()`; roughly six files touched across main,
shared, renderer, and tests. Multi-window safe: the surface is per-window and reads
per-window state.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.2.4) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | The watermark is painted pixels, but only on a window with **no guest page to obscure**. The principle's intent is that the developer's work is unobstructed and that chrome over content is zero; a blank window has no content, and the mark is removed the instant a target commits (FR-005). A PATCH-level amendment (below) records this reading. The top drag band keeps working beneath it (FR-002). |
| II. The Guest Page is Sacred | Nothing is injected into the guest page; the watermark is shell-renderer only and never appears once a target has loaded (FR-005, FR-009). |
| III. Keyboard-First Ergonomics | No capability is added, removed, or gated on the watermark; keyboard and palette paths are unchanged (FR-010). |
| IV. Real Chromium DevTools, Docked | Untouched; the watermark is beneath docked DevTools and never intercepts input. |
| V. One Target Per Window | Untouched; each window shows its own watermark from its own blank state (FR-010). |
| VI. Identity Through Tlapalli | The mark's accent details come from the window's Tlapalli token; nothing ad-hoc is introduced. Light/dark follows the window's existing resolution (FR-006, FR-007). |
| Technology Foundations | No dependency changes; the SVG is bundled with the renderer, so the packaged app reads it from the artifact, not the source tree. |
| Security & Isolation | Inlining a first-party, build-time asset adds no runtime input surface and no capability; the guest session, navigation policy, and picker cleanup are untouched. |
| Packaging & Distribution | The mark is bundled into the renderer build; no network or source-tree read at runtime. |
| Development Workflow | Spec precedes code (this document); `vp check` and `vp test` must pass before commit. |

**Gate result**: PASS — no blocking violations. Complexity Tracking is empty. A
PATCH-level clarification to Principle I is proposed (below); it clarifies wording
and does not change intent, so it does not gate this plan.

**Post-design re-check (after Phase 1)**: PASS. `data-model.md` adds no persisted
state and derives "blank" from the existing `target`; `contracts/blank-surface-protocol.md`
keeps the new predicate inert and the IPC surface unchanged; the quickstart proves
the watermark is blank-only, palette-subordinate, theme-matching, and drag-safe, with
no change to guest-page or existing behavior.

### Proposed constitution amendment (PATCH)

Principle I says "when all shell surfaces are dismissed, the visible tool chrome is
zero pixels." Clarify that this constrains chrome **over the guest page**: a window
that has never loaded a target has no guest content to obstruct, and a decorative
identity watermark on that empty page is permitted, provided it is removed as soon as
a target commits and never intercepts input. This mirrors the PATCH queued by 013 for
the invisible drag region.

## Project Structure

### Documentation (this feature)

```text
specs/014-blank-watermark/
├── plan.md                       # This file
├── research.md                   # Phase 0 output
├── data-model.md                 # Phase 1 output
├── quickstart.md                 # Phase 1 output
├── contracts/
│   └── blank-surface-protocol.md # Phase 1 output
├── checklists/
│   └── requirements.md           # /speckit.specify output
└── spec.md                       # Feature specification
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── shell.ts                  # + isBlankSurfaceVisible predicate
├── main/
│   └── shell/
│       └── window.ts             # desiredShellMode(): blank → full
└── renderer/
    └── src/
        ├── App.vue               # + BlankView gating (blank && !loading && !failed)
        ├── assets/
        │   └── logo.svg          # NEW: derived mark; two accent paths use currentColor
        └── components/
            └── BlankView.vue     # NEW: centered, faded, non-interactive watermark
tests/
└── unit/
    └── shell.test.ts             # + isBlankSurfaceVisible cases
```

**Structure Decision**: Keep the established single-shell-renderer layout. The
watermark is a leaf component with no state of its own; the one piece of logic both
sides must agree on — "is this window blank?" — lives in the shared shell module so
main's shell-mode rule and the renderer's mount condition cannot drift, exactly as
`isStripSurfaceVisible` is shared today.

## Design Details

### Shared predicate (`src/shared/shell.ts`)

```ts
export function isBlankSurfaceVisible(state: { target: string | null }): boolean {
  return state.target == null;
}
```

- Renderer: `App.vue` mounts `BlankView` when the predicate holds **and** no loading
  veil or failure view is up.
- Main: `desiredShellMode()` returns `full` when the predicate holds on the window's
  record, so the shell is not collapsed to the thin `strip`/`band` (which would clip
  and hide the surface).

### Main integration (`src/main/shell/window.ts`)

- Add `isBlankSurfaceVisible({ target: this.record()?.target ?? null })` to the
  `full` branch of `desiredShellMode()`. The record's `target` is `null` until a load
  commits (`handleReady`/`handleNavigated` patch it), which is exactly the blank →
  loaded boundary, so no new state is needed.
- Nothing else changes: the settle protocol, band, peek, and traffic lights are
  unaffected. A blank window's desired mode simply stops collapsing to `band`.

### Renderer

- `BlankView.vue`: a full-window, `pointer-events: none` layer. It inlines the raw
  mark (`import logoSvg from "../assets/logo.svg?raw"`, rendered with `v-html`),
  centers it via flex, sizes it responsively, and fades it. `color: var(--tb-accent)`
  drives the mark's `currentColor` accents. A global rule (not scoped, because
  `:root[data-mode]` is outside the component) adapts the mark for light mode.
- `App.vue`: render `BlankView` as the bottom-most surface, gated on
  `isBlankSurfaceVisible(state) && !loading && !failed`, so the veil and failure view
  always win.

### Derived mark (`src/renderer/src/assets/logo.svg`)

- A copy of the committed source art with exactly two changes: `path334` and
  `path335` (the inner chevrons) use `fill:currentColor` instead of a fixed gray.
  Everything else is byte-identical to `resources/logo.svg`.
- The source art stays the icon-build input; the derived copy is the watermark mark.
  It is inlined (not used as an `<img>`/CSS background) precisely because
  `currentColor` only resolves inside the document.

## Delivery Order

1. **M1 — Predicate**: add `isBlankSurfaceVisible` and its unit cases.
2. **M2 — Main**: blank → `full` in `desiredShellMode()`.
3. **M3 — Renderer**: `BlankView.vue` + the derived mark asset + `App.vue` gating.
4. **M4 — Validation**: run `quickstart.md`, `vp check`, `vp test`,
   `npm run typecheck`, `npm run build`; record results in `validation.md`.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| The watermark shows through over a loading page or a failure | `App.vue` gates on `!loading && !failed`, and the veil/failure view paint above it; the predicate only holds while the record target is `null` |
| The shell stays full-window on a blank window and swallows clicks | The surface is `pointer-events: none`; the drag band still owns the top 10px; a blank window has no page to click anyway |
| Light mode makes the white mark invisible or hue-shifts the accent | A dedicated light-mode rule inverts the mark while preserving the accent hue (`invert(1) hue-rotate(180deg)`) |
| The derived asset drifts from the source art | The copy differs from `resources/logo.svg` only in the two `currentColor` fills; keep that invariant when re-deriving |
| Inlining the SVG weakens CSP or adds risk | The string is a first-party build-time asset, not runtime input; it carries no script |
| The watermark competes with palette text | Opacity is deliberately faint and required to be unobtrusive (FR-008, SC-005) |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
