# Implementation Plan: Viewport Size Indicator

**Branch**: `024-viewport-dimensions` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-viewport-dimensions/spec.md`

## Summary

Show a transient, top-right indicator reading the guest page viewport size
(`width × height`) whenever the window is resized, mirroring the existing zoom
indicator (specs/023). The number is the same quantity the built-in DevTools
resize readout shows, and that DevTools readout is suppressed while DevTools is
open so the tool's indicator is the only one on screen. The indicator appears
whether DevTools is open or closed, is pointer-through, and dismisses itself
after a short delay.

Technically both readouts render **in the shell overlay** — so page zoom cannot
scale them — and are **placed at the guest page's corner** using insets derived
from the page's own reported viewport (its `innerWidth`/`innerHeight`) times the
window zoom, plus the dock side and titlebar inset. The value and the trigger both
come from that report: the page's own `resize` event fires for a window resize, a
resize of the docked DevTools panel, and a dock change, so no polling is needed and
it works with DevTools closed. The zoom readout stays main-driven. The built-in
DevTools resize readout is turned off from the DevTools front-end. No persistence
and no schema change are involved.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 24, Vue 3 `<script setup>`

**Primary Dependencies**: Electron 44.x (`BaseWindow`, `WebContentsView` bounds
and the `bounds-changed` event, `webContents.openDevTools` /
`devToolsWebContents`), the Chromium DevTools Protocol `Overlay` domain
(`setShowViewportSizeOnResize`), Vue 3 + VueUse, electron-vite, electron-builder

**Storage**: none added. The viewport size is transient window geometry; the
existing JSON `StateStore` and its schema are untouched (no migration, no bump).

**Testing**: Vitest (`vp test`) for a new pure `src/shared/viewport.ts`
(formatting + equality); the existing in-process integration harness
`src/main/dock-test.ts` (`TLACHIALONI_DOCK_TEST=1`) extended to assert native-
readout suppression and value parity across dock sides and titlebar mode; manual
validation for the live-drag feel.

**Target Platform**: macOS desktop (packageable; runs from source)

**Project Type**: desktop application (main / preload / renderer split)

**Performance Goals**: the indicator is visible within 100 ms of a resize
beginning, tracks the size live during a drag, and is gone within 2 s of the last
change (spec SC-001, SC-004); suppression leaves no duplicate readout (SC-003).

**Constraints**: the reported value must equal the DevTools readout (SC-002 →
the guest page's layout viewport, counting for docked DevTools and titlebar
inset); the DevTools-native readout must be off while DevTools is open (FR-004);
zero painted chrome at rest (SC-004); the indicator never intercepts input
(SC-005); per-window, never persisted (FR-011); must not disturb zoom, the
strip/titlebar, or DevTools docking (FR-012).

**Scale/Scope**: one transient per-window status, one shared formatter module,
one renderer component, one resize hook, one DevTools suppression hook; no new
command, no persistence, no schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / rule | Assessment |
|------------------|------------|
| I. Chromeless by default | PASS — the indicator is transient and auto-dismisses; painted chrome stays zero at rest (SC-004). |
| II. The Guest Page is Sacred | PASS — the shell only *reads* the page's reported viewport; nothing is injected into the page (the readouts render in the shell). |
| III. Keyboard-First Ergonomics | PASS (N/A) — this is a passive confirmation of a window action, not an invokable capability, so it needs no palette entry; it adds or removes no command (parity with the zoom indicator, which likewise has none). |
| IV. Real Chromium DevTools, Docked | PASS — genuine docked DevTools are used; the only DevTools change is turning off its own resize-size overlay via its own front-end API. Docking, theming, and panels are untouched (FR-004). |
| V. One Target Per Window | PASS — the size is per-window state; windows are independent (FR-011). |
| VI. Identity Through Tlapalli | PASS — the indicator derives its colors from Tlapalli tokens, matching the zoom indicator. |
| Security & Isolation | PASS — no privileged access is added to the guest; one read-only presentation event on the existing bridge; `src/preload/shell.ts` is unchanged. |
| Dev Workflow: spike-first risk retirement | PASS — the plan's two unknowns (authoritative viewport source; a working suppression route) are retired by short spikes before the UI is built on them (research §4, §9). |

No violations; Complexity Tracking is not required.

## Project Structure

### Documentation (this feature)

```text
specs/024-viewport-dimensions/
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/
│   └── viewport-indicator.md # Phase 1 output
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── viewport.ts                  # format/clamp the viewport size (pure, tested)
├── main/
│   ├── state/schema.ts              # unchanged (no persisted field)
│   └── shell/
│       ├── site-view.ts             # unchanged
│       ├── devtools-overlay.ts      # turns off the DevTools resize-size overlay
│       ├── devtools.ts              # re-asserts the suppression on its poll tick
│       └── window.ts                # page:viewport → shell readout; insets;
│                                     #   zoom readout → shell; desiredShellMode full
├── preload/
│   └── site.ts                      # reports page:viewport on page resize
└── renderer/src/
    ├── App.vue                      # renders both readouts; strip offset for size
    ├── composables/useShell.ts      # viewportSize / zoomLevel (+ insets) refs
    └── components/
        ├── Badge.vue                # NEW: the shared readout look + fade
        ├── ViewportSizeIndicator.vue
        └── ZoomIndicator.vue

tests/unit/
└── viewport.test.ts                 # size formatting + equality
```

**Structure Decision**: Single desktop application, following the zoom readout
(specs/023) as the template. The value formatting lives in a pure
`src/shared/viewport.ts` so the shell and Vitest share one definition, mirroring
`src/shared/zoom.ts`. Both readouts render in the shell — a shared `Badge.vue`
owns their look and fade — and are placed at the guest page's corners via insets
main derives from the page's reported viewport × zoom, the dock side, and the
titlebar inset; the renderer adds the strip offset in overlay mode. The DevTools
suppression lives with the other DevTools concerns in
`src/main/shell/devtools-overlay.ts` / `devtools.ts`, re-asserted by the existing
1 s poll tick alongside theming and dock sync.

## Complexity Tracking

> No constitution violations — no justification needed. The readouts render in the
> shell and the guest page is only read, so Principle II's two exceptions stand
> unchanged.
