# Implementation Plan: Always-On Drag Region

**Branch**: `013-always-on-drag-region` | **Date**: 2026-09-29 | **Spec**: `specs/013-always-on-drag-region/spec.md`

**Input**: Feature specification from `/specs/013-always-on-drag-region/spec.md`

## Summary

Make the window draggable at all times without touching the keyboard. The shell
overlay stops collapsing to nothing: whenever no full-window surface is up, it
stays visible as a 36px, fully transparent **drag band** with `app-region: drag`.
The visible strip (target + controls) becomes a renderer surface that is either
**pinned** (`⌘B`, persisted `stripVisible`) or **peeking** (transient, driven by
pointer proximity to the top edge or a short dwell in the band). Peek never
persists.

Because a draggable region ignores all pointer events (Electron's documented
behavior), the band cannot sense the pointer itself. A small main-process
**proximity sensor** polls `screen.getCursorScreenPoint()` at a low rate while the
window is focused and visible, compares it to the window's content top band, and
emits reveal/dismiss signals with proximity (≤4px), dwell (≥400ms), and dismissal
grace (600ms). The same signals drive the macOS traffic lights, extending the 009
strip-surface predicate to cover a peek. Double-click-to-zoom inside a custom drag
region is a spike item; if macOS does not handle it natively, the P3 requirement is
dropped rather than reimplemented.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Electron `BaseWindow` + two `WebContentsView`s (site and
shell), Vue 3.5, VueUse, electron-vite 5, Vite+ 1.0.0-rc (`vp check` / `vp test`).
No new runtime dependency.

**Storage**: none new — `stripVisible` remains the pinned flag in the per-window
`WindowRecord` (schema 3). Peek is runtime-only and never written.

**Testing**: Vitest via `vp test` for the pure proximity tracker (injected cursor,
bounds, and clock) and the updated `isStripSurfaceVisible` predicate; manual and
slow-motion validation for the live band, peek, controls, and lights, because the
shell lives in a `WebContentsView` with no DOM harness.

**Target Platform**: macOS 13+ (Apple silicon), matching 001.

**Project Type**: desktop app (Electron main + preload + renderer).

**Performance Goals**: reveal within 500ms of entering the hot zone (SC-002),
dismissal within 1s of leaving (SC-003); proximity work is a ~150ms interval of one
cheap native coordinate read and four integer comparisons while focused — no
per-frame work, no busy loop (FR-010, SC-007).

**Constraints**: the band paints zero pixels and the guest page is never touched;
the band swallows clicks in the top 36px of the page (accepted, title-bar-like); the
shell view can no longer be hidden in normal use, so its renderer stays warm.

**Scale/Scope**: one new renderer surface and one new main module; roughly eight
files touched across main, shared, renderer, and tests. Multi-window safe: each
window owns its own sensor and peek flag.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.2.3) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | The band paints zero pixels; the strip remains transient (pinned or peek) and the guest page still reaches the top edge (FR-003, SC-004). The always-present *interaction* surface is new, so the plan carries a PATCH-level amendment (below) to clarify that "chrome" means painted surfaces and that an invisible pointer-only drag region is permitted. |
| II. The Guest Page is Sacred | Nothing is injected into or read from the guest page; the band is shell-renderer only and the site view is untouched (FR-015). |
| III. Keyboard-First Ergonomics | `⌘B` and the palette remain the complete keyboard paths; the band and peek are accelerators, never the only route (FR-007). No capability is removed. |
| IV. Real Chromium DevTools, Docked | Untouched; the band spans the window above docked DevTools and does not alter docking or persistence. |
| V. One Target Per Window | Untouched, and per-window sensors keep reveal/pin independent (FR-012). |
| VI. Identity Through Tlapalli | The band adds no color or painted surface; the strip keeps its existing tokens. |
| Technology Foundations | No dependency changes; electron-vite builds, Vite+ remains the checks layer; the JSON store is untouched. |
| Security & Isolation | The added main→renderer signal (`strip:peek`) carries a boolean and grants no capability; guest isolation, navigation policy, and picker cleanup are unchanged. |
| Packaging & Distribution | No new runtime assets; nothing to bundle beyond the existing renderer and main builds. |
| Development Workflow | Spec precedes code (this document); the M0 spike retires the cursor-sensing/zoom risk before UI; `vp check` and `vp test` must pass before commit. |

**Gate result**: PASS — no blocking violations. Complexity Tracking is empty. A
PATCH-level amendment to Principle I is proposed (see below); it clarifies wording
and does not change intent, so it does not gate this plan.

**Post-design re-check (after Phase 1)**: PASS. `contracts/strip-peek-protocol.md`
keeps the added IPC inert (one boolean), `data-model.md` adds no persisted state and
keeps `stripVisible` as the only pin flag, and the quickstart proves zero-chrome,
guest-untouched, keyboard-complete, reduced-motion, and multi-window-independent end
states. No new scope beyond the spec was introduced.

### Proposed constitution amendment (PATCH)

Principle I currently reads that "the drag strip is hidden until explicitly
toggled" and that "visible tool chrome is zero pixels." Clarify that (a) the
always-available drag region is not the strip and paints nothing, and (b) "chrome"
counts painted surfaces, so an invisible, pointer-only drag region does not violate
the principle. This is a clarification (PATCH), mirroring the per-window-theme
PATCH queued by 012.

## Project Structure

### Documentation (this feature)

```text
specs/013-always-on-drag-region/
├── plan.md                       # This file
├── research.md                   # Phase 0 output
├── data-model.md                 # Phase 1 output
├── quickstart.md                 # Phase 1 output
├── contracts/
│   └── strip-peek-protocol.md    # Phase 1 output
├── checklists/
│   └── requirements.md           # /speckit.specify output
└── spec.md                       # Feature specification
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── shell.ts                  # + peek in isStripSurfaceVisible; band height
├── main/
│   └── shell/
│       ├── window.ts             # band shell mode, peek state, sensor lifecycle,
│       │                         #   lights predicate, strip:peek broadcast
│       └── proximity.ts          # NEW: pure proximity/dwell/grace tracker
├── preload/
│   └── shell.ts                  # (unchanged: generic `on` already carries peek)
└── renderer/
    └── src/
        ├── App.vue               # always-on drag band + strip gating
        ├── env.d.ts              # (unchanged)
        ├── composables/
        │   └── useShell.ts       # + peeking ref + strip:peek subscription
        └── components/
            ├── DragBand.vue      # NEW: transparent app-region: drag band
            └── DragStrip.vue     # fills the band's top edge; still draggable
tests/
└── unit/
    ├── shell.test.ts             # updated predicate cases (peek)
    └── proximity.test.ts         # NEW: proximity/dwell/grace state machine
```

**Structure Decision**: Keep the established single-shell-renderer layout. The only
new module is a pure main-process tracker so the timing logic is unit-testable
without a running Electron window; the renderer only renders what main signals. The
peek flag travels on a dedicated transient channel rather than `state:changed`, so
the persisted renderer shape stays exactly as 012 defined it.

## Design Details

### Shell modes

`ShellMode` becomes `full | band`. `desiredShellMode()` returns `full` when the
palette, loading veil, failure view, extension status, or a dev preview is up, else
`band`. `band` sets the shell view to `{0, 0, width, DRAG_BAND_HEIGHT}` and keeps it
visible — the view is never hidden in normal use. `stripVisible` no longer selects a
mode; it selects what the renderer paints inside the band. The settle protocol is
retained for `full → band` collapses (palette/veil/failure leaves) and no longer
applies to hiding the strip (no bounds change).

### Proximity sensor (`src/main/shell/proximity.ts`)

A `ProximityTracker` with `update({ cursor, bounds, now, paused })` returning the new
peek boolean. Constants: `bandHeight = 36`, `proximity = 4`, `dwellMs = 400`,
`graceMs = 600`. Rules: `atEdge` reveals immediately; `inBand` reveals after dwell;
leaving the band keeps the strip for `graceMs`; `paused` (unfocused, full surface,
active drag) clears peek and resets timers. The tracker holds no timers of its own —
main calls it on an interval, so time is injected and the logic is pure.

### Main integration (`src/main/shell/window.ts`)

- Start a ~150ms interval on `show`/`focus`; stop on `blur`/`hide`/`closed`.
- Each tick: `screen.getCursorScreenPoint()` + `win.getContentBounds()` →
  `tracker.update`; on a change, set `peek`, send `strip:peek`, and refresh the
  traffic lights.
- Pause when palette/loading/failure/extension-status/dev-preview is active, or for
  ~200ms after a `move` event (an in-progress drag).
- `syncWindowButtons` reads the extended predicate so the lights appear with a peek
  and hide when it ends (FR-008).
- `toggleStrip` patches state, broadcasts, and refreshes the lights; it no longer
  defers a bounds collapse (the band never moves).

### Renderer

- `DragBand.vue`: a transparent, full-width, 36px element with `app-region: drag`,
  mounted whenever no full-window surface is up.
- `App.vue`: render the band, then the strip (`pinned || peeking`, and not while the
  palette is open) above it. The band is not rendered while a full-window surface
  owns the window (FR-011).
- `useShell.ts`: a `peeking` ref fed by `strip:peek`, exposed to `App.vue`; the
  shared predicate keeps main and renderer in lockstep (009 FR-004).

## Delivery Order

1. **M0 — Spike gate**: confirm main-process cursor proximity behaves at the window
   edge, across displays, and at Retina scaling; confirm whether a custom drag region
   receives macOS double-click-to-zoom. Record the outcome in `research.md`; drop
   FR-013 if the OS does not provide it.
2. **M1 — Pure logic**: `ProximityTracker` and the extended
   `isStripSurfaceVisible`, both unit-tested (`proximity.test.ts`, `shell.test.ts`).
3. **M2 — Main**: band shell mode, sensor lifecycle, peek state, lights predicate,
   `strip:peek` broadcast, `toggleStrip` simplification.
4. **M3 — Renderer**: `DragBand.vue`, `App.vue` gating, `useShell` peek ref.
5. **M4 — Double-click**: wire the spike's outcome (native pass-through or dropped).
6. **M5 — Validation**: run `quickstart.md`, `vp check`, `vp test`, `npm run
   typecheck`; record results in `validation.md`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Cursor polling is unreliable at the screen's top edge or with multiple displays | M0 spike measures it; fall back to a `no-drag` sensor strip if needed |
| The always-visible shell view costs more than expected | The band is 36px and static; the sensor is a 150ms interval scoped to focus. Measure idle CPU against baseline in validation (SC-007) |
| Peek/dismiss flaps when the pointer hovers the boundary | Dwell before reveal and a 600ms grace before dismiss give hysteresis; a drag suppresses reveal for 200ms after the last `move` |
| Strip hides while a control is used | The whole band is tracked (not a 4px sensor), so the strip stays until the pointer truly leaves |
| Lights flash on every accidental peek | Expected per the Q2 decision; the grace period keeps it from strobing during normal movement |
| Double-click-to-zoom is impossible inside a drag region | M0 spike decides; FR-013 is a SHOULD and is dropped rather than shipped as a fake |
| A second window's sensor lights up a background window | Sensors stop on blur and are per-window; validated in the quickstart |
| The band blocks clicks in a page's top strip | Accepted trade-off (spec Assumptions); the band is the same 36px the pinned strip already covered |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
