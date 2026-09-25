# Implementation Plan: Chromeless Localhost Browser

**Branch**: `001-chromeless-localhost-browser` | **Date**: 2026-09-25 | **Spec**: `specs/001-chromeless-localhost-browser/spec.md`

**Input**: Feature specification from `/specs/001-chromeless-localhost-browser/spec.md`

## Summary

Build a single-window, frameless Electron app that renders one local dev-server
target edge-to-edge with real Chromium DevTools docked in the same window, and no
other browser chrome. A Vue shell renderer supplies three transient surfaces — a
top drag strip, a `⌘P` command palette, and a themed failure view — while the
target renders in a separate, sandboxed `WebContentsView`, so the shell's code
never lives in the app under development. Multiple independent instances are
allowed for parallel projects. The minimal UI is themed entirely from Tlapalli
tokens (8 mineral variants × dark/light) with Source Code Pro typography.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24.21 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: electron-vite 5.0.0 (app build/dev), Vite+ 1.0.0-rc
(`vp check` / `vp test` only), Vue 3, VueUse, `@fontsource-variable/source-code-pro` 5.3.0

**Storage**: one versioned JSON file in `app.getPath('userData')`, written
atomically (temp file + `fsync` + `rename`); no database

**Testing**: Vitest through `vp test` for pure logic (URL normalization, local-target
policy, recents merge, theme token mapping); scripted/manual validation for
window, DevTools, and picker behavior

**Target Platform**: macOS 13+ (Apple silicon); frameless window

**Project Type**: desktop app (Electron main + preload + renderer)

**Performance Goals**: launch → painted target with docked DevTools ≤ 3 s
(SC-001); theme variant/mode change applied without restart ≤ 1 s (SC-006)

**Constraints**: DevTools docked natively only; zero permanent chrome; guest
sandboxed with no Node access; no injection into the guest except the transient
picker overlay; local targets only (loopback + private ranges + dev hostnames)

**Scale/Scope**: one target per window, multiple instances supported; recents
bounded; a handful of shell components

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle / requirement (constitution v2.0.0) | Plan compliance                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| I. Chromeless by Default                      | Strip, palette, and failure view are transient; no URL bar, tabs, or menu; SC-002 verified in quickstart                     |
| II. The Guest Page is Sacred                  | Guest view sandboxed with no Node; only the armed picker injects a transient overlay, removed on selection/cancel/navigation |
| III. Keyboard-First Ergonomics                | One command dispatcher; every command has both a keybinding and a palette entry (see `contracts/commands-and-keys.md`)       |
| IV. Real Chromium DevTools, Docked            | `openDevTools({ mode })` on the site view; genuine DevTools docked bottom/right/left, side and open state persisted          |
| V. One Target Per Window                      | One site view per window; multiple independent instances supported (FR-023)                                                  |
| VI. Identity Through Tlapalli                 | All shell colors are CSS variables generated from Tlapalli sources; Source Code Pro bundled locally                          |
| Technology Foundations                        | Electron + electron-vite + Vite+ (checks only) + Vue/VueUse/TS + JSON store, exactly as specified                            |
| Security & Isolation                          | Local-only navigation policy, popups → system browser, picker cleanup, `contextIsolation` + `sandbox`                        |
| Development Workflow                          | Spike-first gate (M0) below; MIT + README + NOTICE; `vp check` / `vp test` before commit                                     |

**Gate result**: PASS — no violations. Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: PASS. The generated artifacts stay within
the gates: `data-model.md` persists nothing that violates isolation; the IPC
contract keeps the site bridge inert until armed and injects only the transient
picker overlay; `commands-and-keys.md` guarantees every capability is both keyed
and palettized; `theme-tokens.md` sources all colors from Tlapalli with attribution;
no new scope was introduced, so there is still nothing to track in Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-chromeless-localhost-browser/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (state schema, IPC, commands/keys, theme tokens)
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
localbrowser/
├── electron.vite.config.ts          # main / preload / renderer build config
├── package.json                     # scripts: dev, build, preview, check, test
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── NOTICE                           # Tlapalli (MIT) attribution
├── README.md
├── scripts/
│   └── build-theme-tokens.ts        # Tlapalli sources → generated token module (run manually)
├── src/
│   ├── main/
│   │   ├── index.ts                 # app bootstrap, lifecycle, single-window creation
│   │   ├── ipc.ts                   # typed IPC surface used by the shell and site preloads
│   │   ├── shell/
│   │   │   ├── window.ts            # BaseWindow + view composition, resize layout
│   │   │   ├── site-view.ts         # guest WebContentsView: load, loading/failure signals
│   │   │   ├── shell-view.ts        # shell WebContentsView hosting Vue surfaces
│   │   │   ├── devtools.ts          # toggle, dock side, persistence
│   │   │   ├── commands.ts          # command registry + dispatcher (single source of truth)
│   │   │   └── picker.ts            # picker session, overlay protocol, inspectElement
│   │   ├── nav/
│   │   │   └── policy.ts            # local-target validation + URL shorthand normalization
│   │   └── state/
│   │       ├── schema.ts            # persisted shape + schemaVersion + defaults
│   │       └── store.ts             # atomic read/merge/write JSON store
│   ├── preload/
│   │   ├── shell.ts                 # contextBridge API for the Vue shell
│   │   └── site.ts                  # guest bridge: picker overlay + editable-focus signal
│   └── renderer/                    # Vue shell (single renderer entry)
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── components/          # DragStrip, CommandPalette, FailureView, LoadingVeil
│           ├── composables/         # useCommands, useTheme, useRecents, usePicker
│           └── theme/
│               ├── tokens.ts        # CSS variable contract + variant list
│               └── apply.ts         # applies variant + mode to the document
└── tests/
    ├── unit/                        # Vitest: policy, normalization, store merge, token mapping
    └── fixtures/
```

**Structure Decision**: electron-vite v5's `vue-ts` layout (main / preload /
renderer) extended with focused `main/shell`, `main/nav`, and `main/state` modules,
plus a second preload (`site.ts`) for the guest bridge. The shell stays a single
renderer entry that hosts all three surfaces; the target is a separate
`WebContentsView` rather than a second renderer entry.

## Phased Delivery & Spike Gate

- **M0 — Spike (architectural gate)**: a frameless `BaseWindow` with one
  `WebContentsView` loading `http://localhost:3000` and `openDevTools({ mode: 'bottom' })`,
  proving in-window docking, switching to `right`/`left` (via close + reopen),
  resize reflow, and a working drag region. If docking inside a `WebContentsView`
  fails on macOS, switch to the documented fallback (load the target in the
  window's own `webContents`; render shell surfaces in an overlay view) before
  building any shell UI.
- **M1 — Shell skeleton**: window and view composition, resize layout, site
  loading/ready/failure signals, drag-strip overlay, command dispatcher, state
  store, IPC contracts.
- **M2 — Palette**: target normalization and local-only policy, recents,
  command catalog, dismissal and focus behavior.
- **M3 — DevTools control and picker**: toggle/dock commands with persistence,
  `⌘⇧C` picker (guest bridge, transient overlay, `inspectElement`).
- **M4 — Theming**: token generation pipeline, variant and mode switching,
  `nativeTheme` sync, Source Code Pro bundling.
- **M5 — Hardening**: multi-instance state safety, loading/failure edge cases,
  README/NOTICE, `vp check` / `vp test` green.

## Risks & Mitigations

| Risk                                                                                    | Mitigation                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docked DevTools inside a `WebContentsView` may behave differently than assumed on macOS | M0 spike first; fallback documented in `research.md`                                                                                                               |
| No supported API to change dock side while open                                         | Close and reopen DevTools with the new mode; persist the choice; accept a brief flash                                                                              |
| `view.getBounds()` ignores the docked-DevTools inset                                    | Palette/failure overlays are transient and modal, so overlap is acceptable; if it becomes a problem, inset the overlay using the page's `innerWidth`/`innerHeight` |
| `did-fail-load` does not fire for HTTP 4xx/5xx                                          | Treat network-level failures (connection refused, DNS, timeout) as the failure view; HTTP error pages render as served                                             |
| Multiple instances overwriting shared state                                             | Atomic writes, merge-on-write recents, last-writer-wins scalars (FR-004)                                                                                           |
| Picker residue in the guest page                                                        | Overlay is owned by the guest preload and removed on disarm; disarm automatically on navigation via a generation counter                                           |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
