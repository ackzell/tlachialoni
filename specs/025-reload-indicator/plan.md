# Implementation Plan: Load Rim

**Branch**: `025-reload-indicator` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-reload-indicator/spec.md`

## Summary

Add a transient **four-edge rim** around the guest page while a load is in
progress. It is the complement to the full-screen veil: the rim mirrors any
main-frame load that keeps the current page visible — reloads, link clicks,
history moves, and same-origin palette navigations — while the veil remains for
cold starts, site switches, and failure loads. A normal load breathes a soft rim;
a hard reload adds a heavier 2px inner rim that trails the base pulse by about
180 ms. The rim renders in the **shell overlay** (never in the guest page), wraps
the page area below any visible strip, is pointer-through, and keeps a
theme-tinted dark contrast ring so it reads on light and dark pages regardless of
the shell's color mode.

Technically, main already owns the load lifecycle through `WebContents` events.
The plan adds a one-way `viewport:reloading` channel to the existing shell bridge,
treats every main-frame, non-same-document navigation as a rim trigger when no
veil is up, detects a reload by comparing the navigation URL to the last committed
URL, and uses the command that started the reload to carry the normal/hard kind. A
new renderer component draws the rim and its hard echo from Tlapalli tokens. No
persistence, schema change, or guest-page modification is involved.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 24, Vue 3 `<script setup>`

**Primary Dependencies**: Electron 44.x (`WebContents` navigation/loading events,
`BaseWindow`, `WebContentsView`), Vue 3 + VueUse, electron-vite, electron-builder

**Storage**: none added. The load rim is transient per-window presentation state;
the JSON `StateStore` and `WindowRecord` schema are untouched (no migration, no
bump).

**Testing**: Vitest (`vp test`) for the pure `src/shared/reload.ts` (same-URL
detection + normal/hard rim selection); manual validation for the live motion;
the existing screenshot scene runner (`pnpm screenshots` / `pnpm gifs`) samples the
reload scene during normal and hard reloads.

**Target Platform**: macOS desktop (packageable; runs from source)

**Project Type**: desktop application (main / preload / renderer split)

**Performance Goals**: the rim is on screen within one frame of the load starting,
animates at 60 fps using compositor-friendly transforms/opacity only, adds no
polling, and adds zero work while idle.

**Constraints**: the guest page is never modified (constitution II); the rim never
intercepts pointer input; colors come from Tlapalli tokens (`--tb-accent`,
`--tb-signature`) plus a theme-tinted dark contrast ring and neutral shadow for
light-page legibility; reduced-motion degrades to a static treatment; the surface
is absent from packaged builds except as its normal transient UI; the dev preview
is dev-only.

**Scale/Scope**: one transient per-window status, one main-process predicate and
event channel, one renderer component, one dev preview, one unit test; no new
command, no persistence, no schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / rule | Assessment |
|------------------|------------|
| I. Chromeless by default | PASS — the rim exists only while a load is running and fades on completion; painted chrome is zero at rest (FR-001/005, SC-003). |
| II. The Guest Page is Sacred | PASS — the rim is a shell-overlay surface; the guest page's DOM, styles, and scripts are untouched (FR-012). |
| III. Keyboard-First Ergonomics | PASS — the existing keyboard-first Reload / Hard Reload commands are triggers, and link/history/palette navigation is keyboard-reachable; the rim itself is passive and adds no capability (FR-003). |
| IV. Real Chromium DevTools, Docked | PASS — no DevTools behavior changes; the rim wraps the page area and does not displace or duplicate the docked panel (FR-009). |
| V. One Target Per Window | PASS — the rim is per-window transient state; windows stay independent (FR-008/015). |
| VI. Identity Through Tlapalli | PASS — the accent and signature come from Tlapalli tokens; the dark contrast ring is a mix of the accent token with black, and the neutral shadow is a standard depth cue, not a new palette (FR-010/016). |
| Security & Isolation | PASS — one read-only main → shell presentation event on the existing bridge; no guest access, no preload API expansion, no privileged surface. |
| Dev Workflow: transient-surface preview | PASS — a Developer-menu preview is added for both kinds, so the motion can be iterated with live HMR (FR-014). |
| Checks | PASS — the feature is designed to pass `pnpm check`, `pnpm test`, and `pnpm typecheck`; a pure unit-tested helper carries the detection logic. |

No violations; Complexity Tracking is not required.

**Post-design re-check (after Phase 1)**: the design adds one shell-overlay
component, one main → shell presentation event, and one pure predicate. It does
not touch the guest page, the persisted state, the preload API, or the command
catalog. The component is pointer-through and token-colored, and the dev preview
is gated to dev builds. Every gate above still passes with no new complexity.

## Project Structure

### Documentation (this feature)

```text
specs/025-reload-indicator/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/
│   └── reload-indicator.md     # Phase 1 output
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── reload.ts                       # NEW: reload detection + rim kind selection (pure, tested)
├── main/
│   ├── index.ts                        # Developer menu: preview normal / hard indicator
│   └── shell/
│       ├── site-view.ts                # NEW event: main-frame did-start-navigation
│       └── window.ts                   # reload trigger, indicator state, viewport:reloading,
│                                       #   desiredShellMode full, dev preview
├── preload/
│   └── shell.ts                        # unchanged: the generic `on` bridge carries the event
├── renderer/src/
│   ├── App.vue                         # renders the indicator above the veil/failure surfaces
│   ├── composables/useShell.ts         # reloading ref + viewport:reloading subscription
│   └── components/
│       └── ReloadIndicator.vue         # NEW: the four-edge rim + hard echo, tokens + reduced motion
└── main/screenshots.ts                 # reload scene samples the live indicator

tests/unit/
└── reload.test.ts                      # NEW: same-URL detection + kind selection
```

**Structure Decision**: Single desktop application, following the existing
transient-surface pattern (zoom and viewport readouts, specs/023/024). Detection
lives in a pure `src/shared/reload.ts` so main and Vitest share one definition.
Main extends the shell-mode machine with one more `full`-mode condition and sends
one new presentation event; the renderer adds one small component and one ref.
The guest page and preloads are untouched.

## Complexity Tracking

> No constitution violations — no justification needed. The indicator is a
> transient shell surface, so it sits inside the already-sanctioned overlay model
> and the zero-chrome default.
