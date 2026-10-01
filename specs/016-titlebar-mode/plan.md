# Implementation Plan: Titlebar Mode

**Branch**: `016-titlebar-mode` | **Date**: 2026-10-01 | **Spec**: `specs/016-titlebar-mode/spec.md`

**Input**: Feature specification from `/specs/016-titlebar-mode/spec.md`

## Summary

Add an opt-in, per-window layout — **titlebar mode**, toggled with `⇧⌘F` or the
command palette — in which the strip is rendered permanently as a docked title bar
and the guest content is pushed below it. The implementation reuses the existing
shell-overlay composition instead of introducing a second rendering path:

- The guest `WebContentsView` (`siteView`) is inset by `STRIP_HEIGHT` (30px) so the
  page and any docked DevTools start below the strip; the page's viewport reflects
  the reduced height (a reflow, never a translation or clip of the guest page).
- The shell `WebContentsView` (`shellView`) stays at `STRIP_HEIGHT` while the mode
  is on, and grows to the full window only while a full-window shell surface
  (palette, veil, failure, extension status, dev preview) is up — the same `full |
  strip | band` machinery 013 established.
- The shared strip-visibility predicate gains a `titlebarMode` term, so the renderer
  mounts `DragStrip` and main shows the macOS traffic lights unconditionally while
  the mode is on, and both stay in lockstep (009 FR-004) exactly as they do today.
- Full-window surfaces offset their top by the content inset so their content lives
  below the docked strip; the strip (opaque, `z-index` above them) stays visible and
  clickable.

Toggling the mode is a bounds change only: the guest page is never reloaded and its
scroll, history, and form state survive (FR-006, SC-003). State persists per window
in `WindowRecord.titlebarMode`; the default remains the zero-chrome focus/overlay
layout, so the constitution's chromeless-by-default posture is preserved.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Electron `BaseWindow` + two `WebContentsView`s (site and
shell), Vue 3.5, VueUse, electron-vite 5, Vite+ 1.0.0-rc (`vp check` / `vp test`).
No new runtime dependency.

**Storage**: one new persisted per-window boolean, `WindowRecord.titlebarMode`
(default `false`). Additive and defaulted, so the store stays at **schema version
3**: an older file without the field reads as `false`, and an older app ignores the
unknown field. No migration.

**Testing**: Vitest via `vp test` for the pure shared predicate/inset helper and the
sanitizer round-trip; the existing headless Electron self-test harness
(`TLACHIALONI_DOCK_TEST` / `TLACHIALONI_UI_SNAPSHOT` in `src/main/dock-test.ts`) is
extended to assert the inset view bounds, DevTools-under-inset, and the strip/traffic
light state; manual and slow-motion validation covers the live layout, surfaces, and
reduced motion, because the shell lives in a `WebContentsView` with no DOM harness.

**Target Platform**: macOS 13+ (Apple silicon), matching 001.

**Project Type**: desktop app (Electron main + preload + renderer).

**Performance Goals**: toggling settles the layout within 1s with no reload
(SC-001, SC-003); idle resource use with the mode on is not observably higher than
the overlay mode — proximity sensing is dormant, so no new per-frame or per-tick work
(SC-008).

**Constraints**: the default remains the zero-chrome overlay; the guest page is never
read, injected, or modified (constitution II); the existing `MIN_HEIGHT` of 360 keeps
a usable content area (330px) below the 30px strip; no color is invented — the docked
strip reuses `DragStrip`'s Tlapalli tokens; no new IPC channel is added.

**Scale/Scope**: one shared predicate change, one command, one persisted field, the
`relayout`/`desiredShellMode` inset, renderer gating/inset, and tests — roughly nine
files across shared, main, renderer, and tests. Multi-window safe: every value is per
`WindowRecord` and per `AppWindow`.

**Resolved unknowns** (the only Technical Context uncertainties; resolved in
`research.md`, confirmed by the M0 spike):

- Whether insetting the guest `WebContentsView` bounds correctly relocates and
  resizes docked Chromium DevTools on every dock side.
- Whether a `WebContentsView` bounds change preserves the guest page's scroll and
  history without a reload.
- Whether the macOS traffic lights and the 30px docked strip compose correctly on a
  frameless `BaseWindow`, including in fullscreen.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.2.6) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | Titlebar mode is **opt-in and off by default**; the default layout stays zero-chrome, and chrome appears only while the developer has explicitly toggled it (`⇧⌘F`), exactly as a pinned strip (`⌘B`) already does. No surface is always-visible. A PATCH-level clarification names the opt-in docked layout explicitly (below). |
| II. The Guest Page is Sacred | The mode only changes the *bounds* of the guest's host view and the shell's overlay; nothing is injected into, read from, or layered inside the guest page (FR-004, FR-006, SC-008). Toggling does not reload or reset it. |
| III. Keyboard-First Ergonomics | `⇧⌘F` plus a command-palette row are the complete keyboard path (FR-007); the mode is never reachable only by a hidden mouse target. `⌘B` and every other capability are unchanged. |
| IV. Real Chromium DevTools, Docked | Untouched and, in fact, carried along: docked DevTools live inside `siteView`, so they move below the strip with the page and keep their dock side and open state (FR-011). |
| V. One Target Per Window | Untouched; each window owns its own `titlebarMode` and layout, and toggling one window never affects another (FR-008, SC-005). |
| VI. Identity Through Tlapalli | No new color or font; the docked strip is the existing `DragStrip` with its Tlapalli tokens, and full-window surfaces keep theirs. |
| Technology Foundations | No dependency changes; electron-vite builds, Vite+ remains the checks layer; the JSON store gains one additive field. |
| Security & Isolation | No new IPC channel and no new capability: `titlebarMode` rides the existing `state:changed` view and the existing `titlebar.toggle` command. Guest isolation, navigation policy, and picker cleanup are unchanged. |
| Packaging & Distribution | No new runtime assets; the change ships in the existing main/renderer builds. |
| Development Workflow | Spec precedes code (this document); the M0 spike retires the inset/DevTools/rounding risk before UI work; `vp check` and `vp test` must pass before commit. |

**Gate result**: PASS — no blocking violations. Complexity Tracking is empty. A
PATCH-level clarification to Principle I was applied in v2.2.6 (below); it names the
opt-in docked layout and does not change intent, so it did not gate this plan.

**Post-design re-check (after Phase 1)**: PASS. `contracts/titlebar-layout-protocol.md`
adds no IPC and no capability, `data-model.md` adds one defaulted boolean and no
schema bump, and `quickstart.md` proves page-not-covered, no-reload, keyboard entry,
persistence/independence, surfaces-below-strip, reduced motion, and DevTools behavior.
No new scope beyond the spec was introduced.

### Proposed constitution amendment (PATCH)

Principle I reads that "the drag strip is hidden until explicitly toggled" and that
"the tool MUST NOT ship ... any always-visible browser chrome." Clarify that a
**per-window, explicitly toggled docked layout** (titlebar mode) that keeps the strip
visible until toggled off, and pushes the guest page below it rather than overlaying
it, is permitted: it is opt-in, never the default, and is the layout analogue of the
permitted pinned strip. This is a clarification (PATCH), mirroring the note queued by
013. **Applied** in constitution v2.2.6 (2026-10-01).

## Project Structure

### Documentation (this feature)

```text
specs/016-titlebar-mode/
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/
│   └── titlebar-layout-protocol.md  # Phase 1 output
├── checklists/
│   └── requirements.md              # /speckit.specify output
└── spec.md                          # Feature specification
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── shell.ts                     # + titlebarMode in isStripSurfaceVisible; inset helper
│   └── commands.ts                  # + titlebar.toggle (⇧⌘F), palette + OS accelerator
├── main/
│   ├── index.ts                     # View menu: add titlebar.toggle
│   ├── state/
│   │   ├── schema.ts                # + WindowRecord.titlebarMode (default false) + sanitizer
│   │   └── store.ts                 # + titlebarMode in WindowViewState / composeWindowView
│   └── shell/
│       └── window.ts                # inset siteView, titlebar shell mode, lights predicate,
│                                    #   peek dormancy, ⌘B no-op, toggleTitlebar command
├── previews unchanged (preload/shell.ts uses the generic `on` bridge)
└── renderer/
    └── src/
        ├── App.vue                  # is-titlebar root class; strip gating off the predicate
        ├── styles/base.css          # --shell-inset token for full-window surfaces
        ├── composables/useShell.ts  # + titlebarMode in ShellState
        └── components/              # palette/veil/failure/status/blank/history offset by the inset
tests/
└── unit/
    ├── shell.test.ts                # + predicate/inset cases
    └── store.test.ts                # + titlebarMode sanitize/round-trip
```

**Structure Decision**: Keep the established single-shell-renderer layout and the
`full | strip | band` shell-mode machine; titlebar mode is expressed as a per-window
flag that feeds the existing predicate and the existing `relayout`, not as a parallel
layout path. The only new pure logic is the shared predicate term and a small inset
helper so main and renderer cannot disagree on where the content begins. No new
module, IPC channel, or dependency is introduced.

## Design Details

### Persisted flag and derived state

`WindowRecord.titlebarMode: boolean` (default `false`) is the single source of truth.
`composeWindowView` exposes it to the renderer on the existing `state:changed` view.
`AppWindow` reads it through a private `titlebarActive()` helper used by `relayout`,
`desiredShellMode`, `syncWindowButtons`, and `proximityPaused`.

### Layout (`src/main/shell/window.ts`)

- `relayout()` computes the content top from `titlebarInset(titlebarActive())` and sets
  `siteView.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) })`. The
  page (and docked DevTools) therefore reflow into the remaining area; a resize
  recomputes the same inset.
- `desiredShellMode()` returns `full` when any full-window surface is up (unchanged);
  otherwise `strip` when `titlebarActive()` is true, else the existing
  pinned/peek/band logic. `strip` sizes `shellView` to `STRIP_HEIGHT`;
  `full` sizes it to the whole window so a surface can paint below the strip.
- `toggleTitlebar()` flips `titlebarMode`, clears any peek when turning on, broadcasts
  state, and relayouts: turning **on** grows the shell to the strip and insets the page
  at once; turning **off** restores the page to full immediately and defers the
  shell's `strip → band` shrink through the settle protocol so the strip's leave
  animation is not cut (the same path unpinning uses).
- `syncWindowButtons()` passes `titlebarMode` into the shared predicate, so the macOS
  traffic lights show whenever the docked strip is on screen (including over full
  surfaces).
- `proximityPaused()` returns true while `titlebarActive()`, so the hover/peek sensor
  is dormant and no reveal/dismiss logic competes with the permanent strip.
- `toggleStrip()` (`⌘B`) returns early while `titlebarActive()`, so it neither shows a
  second strip nor perturbs the persisted pin; the pin's behavior returns unchanged
  when the mode is off (FR-015).

### Renderer (`src/renderer/src/...`)

- `App.vue` computes `stripVisible` from the extended predicate (titlebar mode ⇒
  always true) and adds an `is-titlebar` class to `.shell-root`; `DragStrip` therefore
  mounts permanently and the always-on `DragBand` remains harmlessly beneath it.
- Full-window surfaces offset their top by a `--shell-inset` custom property (set to
  `STRIP_HEIGHT` under `.is-titlebar`, `0` otherwise) so their content occupies the
  area below the docked strip; the opaque strip keeps painting above them at `z-index`
  2, so it is never hidden.
- `useShell.ts` adds `titlebarMode` to `ShellState`; no new subscription is needed
  because it arrives on `state:changed`.

### Command and menu (`src/shared/commands.ts`, `src/main/index.ts`)

- Add `titlebar.toggle` — label `Toggle Titlebar Mode`, accelerator `{ meta, shift,
  code: "KeyF" }`, `acceleratorLabel: "⇧⌘F"`, `palette: true`, `group: "other"`
  (beside `strip.toggle`) — and register it in `AppWindow.registerCommands`.
- Add `titlebar.toggle` to the **View** menu section so it carries an OS accelerator
  and keeps working while DevTools has focus (the existing `menuItemFor` path).

### Tests

- `shell.test.ts`: predicate cases for `titlebarMode` (wins over palette suppression
  and over pinned/peek), plus `titlebarInset` values.
- `store.test.ts`: a record without `titlebarMode` sanitizes to `false`, and a set
  value round-trips through `composeWindowView`.
- `dock-test.ts`: extend the headless harness to assert, after toggling titlebar mode,
  that `siteView` bounds are inset by `STRIP_HEIGHT`, that the guest `window.innerHeight`
  shrinks accordingly, that docked DevTools remain open/below the strip, and that no
  reload occurred (a sentinel on `window` survives the toggle).

## Delivery Order

1. **M0 — Spike gate**: confirm (a) insetting `siteView` relocates/resizes docked
   DevTools on every dock side, (b) a bounds change preserves guest scroll/history with
   no reload, (c) the traffic lights and the 30px docked strip compose on a frameless
   window including fullscreen. Record outcomes in `research.md`; adjust the plan if a
   fallback is needed.
2. **M1 — Pure logic**: extend `isStripSurfaceVisible` and add the inset helper;
   add `titlebarMode` to the schema/sanitizer/view; unit-test both
   (`shell.test.ts`, `store.test.ts`).
3. **M2 — Main**: `relayout` inset, `desiredShellMode`, `syncWindowButtons`,
   proximity dormancy, `⌘B` no-op, `titlebar.toggle` command registration.
4. **M3 — Renderer**: `App.vue` gating and `is-titlebar` class, `--shell-inset`, surface
   offsets, `useShell` field.
5. **M4 — Menu**: add `titlebar.toggle` to the View menu.
6. **M5 — Validation**: run `quickstart.md`, extend `dock-test.ts`, and run
   `vp check`, `vp test`, and `npm run typecheck`; record results in `validation.md`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Docked DevTools do not follow the inset `WebContentsView` | M0 spike measures all three dock sides; if a side misbehaves, re-dock or resize on toggle and document the fallback |
| A bounds change reloads or resets the guest page | M0 spike plants a sentinel and checks `window` state and history survive; the layout is a pure bounds change with no navigation |
| A visible seam or 1px gap between the docked strip and the page (Retina rounding) | The inset is exactly `STRIP_HEIGHT` and the strip is opaque and full-width; validate at 1x and 2x in the quickstart |
| The strip is hidden or covered while a surface is up | The strip keeps `z-index: 2` over the surfaces, and surfaces are offset below it; the predicate forces stripe visibility in titlebar mode |
| `⌘B` and `⇧⌘F` fight over strip state | `⌘B` is a no-op while the mode is on (FR-015), leaving the persisted pin untouched |
| The proximity sensor keeps revealing/dismissing, fighting the docked strip | `proximityPaused()` is true in titlebar mode and peek is cleared on toggle-on |
| Fullscreen hides the traffic lights and breaks the layout | M0 spike covers fullscreen; the strip keeps `STRIP_HEIGHT` and re-applies on leaving fullscreen (FR-016) |
| A tiny window leaves no usable page | The existing `MIN_HEIGHT` (360) guarantees a 330px content area; no new minimum is required |
| Toggling one window changes another | `titlebarMode` is per `WindowRecord` and all layout reads are per `AppWindow` (FR-008) |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
