# Implementation Plan: Trackpad Swipe History Navigation

**Branch**: `015-trackpad-swipe-navigation` | **Date**: 2026-09-30 | **Spec**: `specs/015-trackpad-swipe-navigation/spec.md`

**Input**: Feature specification from `/specs/015-trackpad-swipe-navigation/spec.md`

## Summary

Finish the two-finger history gesture parked by `specs/002-trackpad-navigation/`, and
make the "sticky" threshold legible with a subtle armed overlay. The guest view's
`input-event` stream (trackpad-precise `mouseWheel` deltas plus the
`gestureScrollBegin/Update/End` boundary, per the 002 findings) feeds a new pure
main-process `HistoryGesture` state machine. It accumulates horizontal travel while
protecting ordinary scrolling (dominant-axis test, and an overscroll gate when the
platform reports the page could not consume the scroll). Crossing an **arm**
distance sends a transient `history:armed` signal — `{ direction: "back" | "forward",
progress }` — and crossing a larger **commit** distance runs the existing
`view.back` / `view.forward` command. Lifting, reversing below the arm distance, or
losing focus cancels and clears the signal.

The overlay is painted by the shell renderer, never injected into the guest page
(constitution II). Main temporarily grows the shell overlay to `full` while armed —
exactly the mechanism the palette and veil already use — so a directional edge
indicator can paint down the left or right edge; it collapses back through the
existing settle protocol when the gesture ends. The mouse thumb-button behavior from
002 (`app-command` and the driver-synthesized `swipe` event) is preserved, guarded
against double-firing when a real trackpad swipe produces both streams.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Electron `BaseWindow` + two `WebContentsView`s (site and
shell), Vue 3.5, VueUse, electron-vite 5, Vite+ 1.0.0-rc (`vp check` / `vp test`).
No new runtime dependency.

**Storage**: none new — no persisted shape changes; the store stays at schema
version 3. Arm state and the gesture accumulator are runtime-only and never written.

**Testing**: Vitest via `vp test` for the pure `HistoryGesture` state machine
(phases, thresholds, direction, dominant-axis and overscroll gating, cancel/commit,
cooldown) and the shared armed predicate; manual and slow-motion validation for the
live trackpad gesture and overlay, because the guest stream and shell live in
`WebContentsView`s with no DOM harness.

**Target Platform**: macOS 13+ (Apple silicon), matching 001; the feature degrades
to a no-op where no trackpad gesture stream exists.

**Project Type**: desktop app (Electron main + preload + renderer).

**Performance Goals**: the overlay appears with the next paint after the arm
distance is crossed (target under ~100ms) and clears within a fraction of a second
of cancel/commit (SC-003); detection is a handful of numeric ops per input event
with no polling, no per-frame work, and no timer while idle (FR-013).

**Constraints**: the guest page is never read, injected, or modified; the overlay
captures no input (`pointer-events: none`) and is suppressed while the palette is
open; the detector listens only on the focused guest view, so a docked, focused
DevTools panel keeps its own scroll; a gesture fires at most once and released
momentum never re-fires.

**Scale/Scope**: one new pure main module, one shared type/predicate module, one
new renderer component, plus wiring in `window.ts`, `useShell.ts`, `App.vue`, and a
dev-only preview entry; roughly eight files across main, shared, renderer, and
tests. Multi-window safe: every window owns its own gesture state.

**Resolved unknowns** (were the only Technical Context uncertainties; resolved in
`research.md`, confirmed by the M0 spike):

- Which Electron input events carry the two-finger gesture, their delta fields
  (`deltaX` / `deltaY`), and the sign convention for Back vs Forward.
- Whether the platform reports an overscroll/"the page could not consume this
  scroll" signal (`canScroll`) reliably enough to gate navigation, with a documented
  fallback if it does not.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.2.5) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | The overlay exists only while a gesture is armed and paints zero pixels at rest (FR-011, SC-003); it is a transient shell surface like the strip and veil, and the guest page still reaches every edge. |
| II. The Guest Page is Sacred | The overlay is shell-renderer only; nothing is injected into, read from, or layered inside the guest page (FR-009, SC-007). Detection *listens* to input events on the guest view without modifying it. |
| III. Keyboard-First Ergonomics | `⌘←`/`⌘→` (and the palette rows) remain the complete keyboard path; the gesture is an accelerator, never the only route (FR-014). No capability is removed. |
| IV. Real Chromium DevTools, Docked | Untouched; when DevTools is focused its own webContents receives the scroll, so the guest history is not moved (FR-016). |
| V. One Target Per Window | Untouched; each window owns an independent gesture state and overlay (FR-015). |
| VI. Identity Through Tlapalli | The overlay's color derives from Tlapalli tokens (`--tb-accent` / `--tb-fg*`) and its motion from the shared motion values; no ad-hoc color. |
| Technology Foundations | No dependency changes; electron-vite builds, Vite+ remains the checks layer; the JSON store is untouched. |
| Security & Isolation | The added `history:armed` main→renderer channel carries an inert `{ direction, progress }` object and grants no capability; guest isolation, navigation policy, and picker cleanup are unchanged. |
| Packaging & Distribution | No new runtime assets; the component ships in the existing renderer bundle. |
| Development Workflow | Spec precedes code (this document); the M0 spike retires the event-shape/overscroll risk before UI work; the overlay is a transient shell surface, so it gets a dev-only preview per the constitution and specs/008; `vp check` and `vp test` must pass before commit. |

**Gate result**: PASS — no blocking violations. Complexity Tracking is empty. No
constitution amendment is required: the overlay is a transient shell surface inside
the existing overlay-composition model, and it is previewable in development builds
as Principle I / the Development Workflow already require.

**Post-design re-check (after Phase 1)**: PASS.
`contracts/history-gesture-protocol.md` keeps the added IPC inert (a direction enum
plus a number), `data-model.md` adds no persisted state and no schema change, and
`quickstart.md` proves zero-chrome-at-rest, guest-untouched, keyboard-complete,
reduced-motion, single-fire, overscroll-protected, and multi-window-independent end
states. No new scope beyond the spec was introduced.

## Project Structure

### Documentation (this feature)

```text
specs/015-trackpad-swipe-navigation/
├── plan.md                            # This file
├── research.md                        # Phase 0 output
├── data-model.md                      # Phase 1 output
├── quickstart.md                      # Phase 1 output
├── contracts/
│   └── history-gesture-protocol.md    # Phase 1 output
├── checklists/
│   └── requirements.md                # /speckit.specify output
└── spec.md                            # Feature specification
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── history.ts                     # NEW: HistoryDirection, HistoryArmed, armed predicate
├── main/
│   ├── index.ts                       # Developer menu: preview the armed overlay (dev-only)
│   └── shell/
│       ├── window.ts                  # input-event wiring, armed state, armed→full shell mode,
│       │                              #   IPC broadcast, navigation/blur clear, dev preview
│       └── history-gesture.ts         # NEW: pure gesture state machine (arm/commit/cancel)
├── preload/
│   └── shell.ts                       # (unchanged: generic `on` already carries the new channel)
└── renderer/
    └── src/
        ├── App.vue                    # mount HistoryOverlay from the armed state
        ├── composables/
        │   └── useShell.ts            # + historyArmed ref + `history:armed` subscription
        └── components/
            └── HistoryOverlay.vue     # NEW: subtle directional edge indicator
tests/
└── unit/
    └── history-gesture.test.ts        # NEW: gesture state-machine cases
```

**Structure Decision**: Keep the established single-shell-renderer layout. The only
new main module is a pure state machine so the threshold/direction/gating logic is
unit-testable without a running Electron window; the Electron event plumbing stays
in `window.ts`, and the renderer only renders what main signals. The armed signal
travels on a dedicated transient channel rather than `state:changed`, so the
persisted renderer shape stays exactly as 012 defined it.

## Design Details

### Gesture detector and state machine (`src/main/shell/history-gesture.ts`)

A pure `HistoryGesture` class consumes normalized gesture phases and returns
`{ armed, commit }` each step. It owns the horizontal accumulator and all
thresholds; time is passed in, and it holds no timers.

- Phases: `begin()`, `update(sample)`, `end()`, `reset()`.
- `update` sample: `{ deltaX, deltaY, scrollable, canGoBack, canGoForward, now }`,
  where `deltaX` is already normalized so positive = toward Back, and `scrollable`
  is the overscroll gate (`true` = the page consumed the scroll; `false` = at the
  boundary). When the gate is unavailable the machine falls back to the
  dominant-axis + distance + cooldown rules.
- Rules: accumulate `sumX` / `sumY`; require `|sumX| > |sumY| * RATIO` and
  `scrollable === false` (or the fallback) before any arming; arm when
  `|sumX| >= ARM_DISTANCE` and history exists in that direction; commit when
  `|sumX| >= COMMIT_DISTANCE`; once committed, refuse further commits until the next
  `begin()`; `end()` / `reset()` clears arm; reversing below `ARM_DISTANCE` clears
  arm without committing.
- Availability: arming requires `canGoBack` for a Back gesture and `canGoForward`
  for a Forward gesture (FR-008), so the overlay never promises a move that cannot
  happen.

### Electron wiring (`src/main/shell/window.ts`)

- Subscribe `this.siteView.webContents.on("input-event", this.handleGestureInput)`.
  Filter to trackpad input: precise `mouseWheel` (`hasPreciseScrollingDeltas`) and
  the `gestureScrollBegin/Update/End` boundary. Read `deltaX` / `deltaY` /
  `canScroll` by direct property access (they are native getters, per the 002
  findings), never by serializing the event.
- Normalize the platform sign to "positive = Back" and feed the machine; when no
  explicit `gestureScrollEnd` is delivered, close the gesture on a short idle
  (≤ ~150ms) and on `gestureFlingStart` so momentum never re-arms.
- When the machine's armed direction changes, store it, send `history:armed` to the
  shell (queued path handles an early signal), and relayout: growing to `full` at
  once when armed, deferring the shrink through the settle protocol when cleared.
- When `commit` is non-null, run `view.back` / `view.forward` (the same commands the
  keyboard and mouse paths use) and clear the arm.
- Clear on: `did-navigate` / `did-navigate-in-page` (another source moved history),
  `win.on("blur")`, `win.on("hide")`, `win.on("close")`, `⌘W`, and while a surface
  that owns input (palette, veil, failure, extension status, dev preview) is up.
- Guard the existing `win.on("swipe")` handler: ignore a `swipe` event that follows a
  trackpad gesture stream within a short window, so the OS-level swipe and the
  custom detector cannot both navigate; a mouse driver's discrete `swipe` (no
  preceding gesture stream) still navigates as in 002.
- Dev-only `previewHistoryArm()` puts the overlay in a representative armed state
  (alternating direction) and holds it, wired to a Developer-menu item; it is absent
  from packaged builds (specs/008).

### Shared type and predicate (`src/shared/history.ts`)

`HistoryDirection = "back" | "forward"`; `HistoryArmed = { direction;
progress: number }`; and `isHistoryArmedVisible(armed, paletteOpen)` (armed and not
suppressed by the palette). Main uses the predicate to decide the `full` shell mode
and the renderer uses it to mount the overlay, so the two cannot disagree (mirrors
009 FR-004).

### Renderer (`src/renderer/src/...`)

- `HistoryOverlay.vue`: a full-height, non-interactive (`pointer-events: none`,
  `aria-hidden`) edge indicator on the left for Back and the right for Forward — a
  soft edge gradient plus a chevron pointing in the direction of travel, its opacity
  scaled by `progress` (dimmer when just armed, clear as it nears commit) so the
  "keep going" affordance is legible. Color from Tlapalli tokens; enter/leave use
  the shared motion values, collapsing to instant under `prefers-reduced-motion`.
- `useShell.ts`: a `historyArmed` ref fed by the `history:armed` channel (payload
  `HistoryArmed | null`); exposed to `App.vue`.
- `App.vue`: mount `HistoryOverlay` above the page but below the palette when the
  shared predicate is true.

## Delivery Order

1. **M0 — Spike gate**: on a real Mac trackpad, log the `input-event` stream
   (phase types, `deltaX` / `deltaY`, `hasPreciseScrollingDeltas`, `canScroll`) while
   swiping and while scrolling vertically, horizontally, and inside a wide element;
   confirm the sign for Back vs Forward, whether `gestureScrollEnd` arrives, and
   whether `canScroll` faithfully reports a consumed scroll; confirm whether the
   OS `swipe` event also fires for the same trackpad swipe. Record outcomes in
   `research.md`; pick the gating strategy (overscroll vs fallback) accordingly.
2. **M1 — Pure logic**: `HistoryGesture` and the shared predicate, unit-tested
   (`history-gesture.test.ts`).
3. **M2 — Main**: input-event wiring, arm state, `full` shell mode while armed,
   `history:armed` broadcast, lifecycle clears, `swipe` coalescing guard.
4. **M3 — Renderer**: `HistoryOverlay.vue`, `useShell` ref, `App.vue` gating.
5. **M4 — Dev preview**: Developer-menu item + `previewHistoryArm()` for HMR styling.
6. **M5 — Validation**: run `quickstart.md`, `vp check`, `vp test`, and the TS
   typecheck; record results in `validation.md`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| The event fields, delta sign, or `canScroll` semantics differ from the 002 findings | M0 spike logs the live stream and fixes the mapping; the machine takes normalized input, so only the adapter changes |
| Ordinary horizontal scrolling hijacks navigation | Overscroll gate (`canScroll === false`) where available; otherwise a dominant-axis ratio plus a deliberately large commit distance and a one-commit-per-gesture guard; validated in S3 |
| The custom detector and the OS `swipe` event both fire for one trackpad swipe | Coalescing guard ignores a `swipe` that follows a trackpad gesture stream; a discrete mouse-driver `swipe` still navigates (M0 confirms) |
| Momentum/fling fires a second navigation | Commit once per gesture, close on `gestureScrollEnd`/`gestureFlingStart`/idle, and require a fresh `begin()` (SC-004) |
| Growing the shell to `full` while armed fights the settle protocol | Reuse the exact palette/veil path (`desiredShellMode` → `full`, deferred shrink); arm is transient and the safety timeout still applies |
| Overlay flickers on a marginal gesture near the arm distance | Hysteresis: arm at `ARM_DISTANCE`, but clear only when the gesture ends, reverses below a smaller release offset, or is abandoned |
| Trackpad-triggered swipes navigate while a surface owns input | Detection is paused/cleared while the palette, veil, failure view, extension status, or a dev preview is up |
| A background window reacts to its own detector | Detection is per window and cleared on blur/hide; each window owns its state (FR-015) |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
