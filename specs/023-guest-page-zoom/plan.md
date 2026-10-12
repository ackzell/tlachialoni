# Implementation Plan: Guest Page Zoom

**Branch**: `023-guest-page-zoom` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-guest-page-zoom/spec.md`

## Summary

Let the developer scale the guest page (the inspected target's content) up and down and reset it,
from the keyboard (`⌘+`, `⌘-`, `⌘0`), the command palette, and — per the clarifications session —
pointer gestures: Command + mouse wheel (up zooms in, down zooms out) and trackpad pinch (spread
zooms in, together zooms out). Every input moves along **one discrete ladder**, is persisted
**per window**, and shows the same brief, subtle bottom-right percentage indicator.

Technically, zoom is Chromium's per-webContents zoom applied to the guest `WebContentsView` only, in
`isolated` zoom mode so the application owns the level while Chromium still renders it. Pointer
gestures — Command + wheel and trackpad pinch — are captured in the existing native `NSEvent` monitor
in `native/swipe-navigation` (the same place navigation lives), which sees the events before any view
dispatches them and keeps the gestures out of the guest page entirely. Zoom step is a discrete index
into a fixed ladder persisted per window; the indicator reuses the established transient
shell-surface machine.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 24, Vue 3 `<script setup>`

**Primary Dependencies**: Electron 44.x (`WebContentsView`, `webContents.setZoomFactor`,
`setZoomMode("isolated")`), a native Node-API addon (`native/swipe-navigation`, AppKit `NSEvent`),
Vue 3 + VueUse, electron-vite, electron-builder

**Storage**: the existing JSON `StateStore` (`state.json` under Electron `userData`); a new
per-window `zoomIndex` field, schema 3 → 4

**Testing**: Vitest (`vp test`) for the zoom ladder, the command catalog, and the store sanitizer;
manual validation for the native gesture feel (tuning constants in `window.ts`)

**Target Platform**: macOS desktop (packageable; also runs from source)

**Project Type**: desktop application (main / preload / renderer split)

**Performance Goals**: zoom applies within one frame of the input; indicator visible < 100 ms after
a change and gone within 2 s of the last change (spec SC-004)

**Constraints**: guest page only (never shell surfaces or docked DevTools); zero painted chrome at
rest; the indicator must not intercept pointer input; keyboard shortcuts must work with the guest
page **and** docked DevTools focused; wheel/pinch must not disturb existing page scrolling or the
native trackpad swipe-navigation monitor (specs/015)

**Scale/Scope**: three commands, two native gesture inputs, one transient indicator, one persisted
per-window field, one new shared module, one native-addon extension

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / rule | Assessment |
|------------------|------------|
| I. Chromeless by default | PASS — the indicator is transient and auto-dismisses; painted chrome stays zero at rest (SC-007). |
| II. The Guest Page is Sacred | PASS — zoom uses the webContents' own zoom; the gestures are captured natively and **no guest-page code is involved**. |
| III. Keyboard-First Ergonomics | PASS — shortcuts and palette remain sufficient for every level (FR-004, FR-006, FR-021); gestures are accelerators only. |
| IV. Real Chromium DevTools, Docked | PASS — only the guest view's webContents is scaled; DevTools is untouched, and gestures over it are ignored (FR-019). |
| V. One Target Per Window | PASS — zoom is per-window state (FR-011, FR-012). |
| VI. Identity Through Tlapalli | PASS — indicator colors derive from Tlapalli tokens. |
| Security & Isolation | PASS — no privileged access added to the guest; one read-only status event on the existing bridge. |
| Dev Workflow: spike-first risk retirement | PASS — the pinch input path was the unproven assumption; it was retired by a probe, and the answer (the native `NSEvent` monitor) is what shipped (research §11). |

No violations; Complexity Tracking is not required.

## Project Structure

### Documentation (this feature)

```text
specs/023-guest-page-zoom/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── zoom-commands.md # Phase 1 output
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
native/
└── swipe-navigation/
    └── swipe-navigation.mm      # NSEvent monitor now also reports Command+scroll and magnify

src/
├── shared/
│   ├── commands.ts              # +3 view commands; Accelerator gains shiftInsensitive/menuAccelerator
│   └── zoom.ts                  # NEW: the zoom ladder + step/clamp/percent helpers
├── main/
│   ├── index.ts                 # +zoom items in the View menu; menuAccelerator mapping
│   ├── state/
│   │   └── schema.ts            # WindowRecord.zoomIndex; SCHEMA_VERSION 4; sanitize + migrate
│   └── shell/
│       ├── window.ts            # zoom commands, onZoomGesture, accumulators, zoomStatus, nav re-apply
│       ├── swipe/
│       │   ├── addon.ts         # +ZoomGestureEvent type + onZoom option
│       │   └── navigation.ts    # route onZoom → the window under the pointer
│       └── window-manager.ts    # default zoomIndex on new/restored windows
├── preload/
│   └── shell.ts                 # unchanged: reuses the generic `on` / `runCommand` bridge
└── renderer/src/
    ├── App.vue                  # render <ZoomIndicator>
    ├── composables/useShell.ts  # zoomLevel ref + `zoom:changed` subscription
    └── components/
        └── ZoomIndicator.vue    # NEW: bottom-right, pointer-events:none, transient

tests/unit/
├── commands.test.ts             # accelerator + palette assertions for the zoom commands
├── zoom.test.ts                 # NEW: ladder stepping, clamping, percent
└── store.test.ts                # zoomIndex defaulting/sanitizing
```

**Structure Decision**: Single desktop application. Zoom policy lives in `src/shared/zoom.ts` so the
main process and Vitest share one definition of the ladder, mirroring `src/shared/commands.ts`. Input
capture is native, in the existing `native/swipe-navigation` addon (no separate module was needed); the
JS side routes it through `SwipeNavigation` → `AppWindow.onZoomGesture`. Renderer changes are confined
to the existing shell overlay (`App.vue` + `useShell.ts` + one new component). No preload change was
needed — the wheel/pinch paths never touch the guest page.

## Complexity Tracking

> No constitution violations — no justification needed.
