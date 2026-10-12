# Quickstart: Validating Guest Page Zoom

A run guide to prove the feature works end-to-end. It references
[contracts/zoom-commands.md](./contracts/zoom-commands.md) and
[data-model.md](./data-model.md) rather than repeating them. It contains no implementation code.

## Prerequisites

- macOS; Node 24 and `pnpm` available.
- A local target to look at. The default is `http://localhost:3000`; start any dev server there (for
  example `npx serve` in the repo root, or an app you are working on). Any local `http://localhost:*`
  target works, including a page with a focused text input if you want to check US1 acceptance 4.

## Setup

```bash
pnpm install
```

## Gesture capture (resolved)

The one open question — how Command + wheel and trackpad pinch reach main — was settled during
implementation (research §10–§13): they are captured by the native `NSEvent` monitor in
`native/swipe-navigation`, which swallows them and reports deltas to JS. No guest-page code is
involved. Nothing to spike before validating; the scenarios below cover it.

## Automated checks (fast)

```bash
pnpm check     # lint + format (vp check)
pnpm test      # vitest (vp test)
pnpm typecheck # tsc + vue-tsc across node/preload/web
```

Expected: all pass, including the new unit tests for the zoom ladder, the command catalog's zoom
entries, and the store's `zoomIndex` defaulting.

## Run

```bash
pnpm dev
```

## Validation scenarios

| # | Scenario | Steps | Expected | Covers |
|---|----------|-------|----------|--------|
| S1 | Zoom in | Press `⌘+` (and separately `⌘⇧=`) once | The page content grows exactly one ladder step; a `110%` indicator appears bottom-right | US1.1, FR-001, FR-004 |
| S2 | Zoom out | Press `⌘-` from 100% | The page shrinks to `90%` | US1.2, FR-002 |
| S3 | Reset | From any level, press `⌘0` | The page returns to `100%` in one action and the indicator reads `100%` | US1.3, FR-003, SC-002 |
| S4 | One step per press | Watch the indicator value while pressing `⌘+` five times | Values advance exactly one step per press in both focus contexts: `110, 125, 150, 175, 200` — never skipping | FR-001, research §6 |
| S5 | Focused input does not defeat zoom | Focus a text field on the page, then press `⌘+` | The page still zooms (the shortcut is not yielded to the field) | US1.4, FR-005 |
| S6 | Upper boundary | Press `⌘+` until `500%`, then once more | Stays at `500%`; the indicator still appears reading `500%`; no error | US1.5, FR-014 |
| S7 | Lower boundary | Press `⌘-` until `25%`, then once more | Stays at `25%`; indicator still appears | FR-014 |
| S8 | Reset when already default | At `100%`, press `⌘0` | Nothing scales; the indicator still shows `100%` | edge case, FR-014 |
| S9 | Palette parity | Press `⌘P`, type `zoom` | *Zoom In*, *Zoom Out*, *Reset Zoom* are listed in the View group with their shortcuts; selecting one behaves like the shortcut | US2, FR-006, SC-003 |
| S10 | Indicator lifetime | Trigger one zoom, then stop | The indicator appears within ~100 ms and is gone within 2 s | FR-007, FR-008, SC-004 |
| S11 | Rapid changes | Press `⌘+` several times quickly | The indicator updates to the latest value and the dismissal timer restarts; no flicker, no stale hide | edge case, FR-008 |
| S12 | Indicator is click-through | With the indicator on screen, click and scroll where it sits | The click/scroll reaches the page underneath; the indicator takes no input | US4.4, FR-009, SC-005 |
| S13 | Only the page zooms | At `200%`, open the palette and the DevTools panel | The shell surfaces and docked DevTools render at normal size; only the guest page is scaled | FR-010 |
| S14 | DevTools focused | Focus the DevTools panel, then press `⌘0` / `⌘+` | The guest page zooms (the shortcut still works with DevTools focused) | FR-015 |
| S15 | Per-window independence | Open a second window (`⌘N`), zoom each differently | Each window keeps its own level; zooming one never changes the other | FR-011, SC-006 |
| S16 | Persistence across navigation | At `150%`, use `⌘L` to navigate to another localhost target | The new page renders at `150%` | FR-011, research §2 |
| S17 | Persistence across relaunch | Set a non-default zoom, quit, relaunch | The window restores at the same level | FR-012, SC-006 |
| S18 | Reduced motion | Enable *Reduce motion* in System Settings, trigger a zoom | The indicator still appears and disappears, instantly (no transition) | edge case, contract §5 |
| S19 | Guest page not modified | With the DevTools Elements panel open, trigger zoom | No new nodes, styles, or scripts appear in the guest page | Principle II, FR-010 |
| S20 | Zero chrome at rest | After the indicator has dismissed | No visible tool chrome; the window is fully chromeless as before | SC-007, Principle I |
| S21 | Command + wheel up | Hold `⌘` and roll the wheel up over the page | The page grows one step; the indicator shows the new level | US3.1, FR-016 |
| S22 | Command + wheel down | Hold `⌘` and roll the wheel down | The page shrinks one step | US3.2, FR-016 |
| S23 | Pinch out / in | Spread two fingers, then bring them together, over the page | The page grows, then shrinks; the indicator follows | US3.3/3.4, FR-017 |
| S24 | Gesture parity with the ladder | Zoom by gesture to a few levels, then press `⌘0` and `⌘+` | Gesture levels are exactly ladder members (e.g. `110%`, `125%`), persisted and reset like the keyboard's | FR-018, SC-008 |
| S25 | Gesture over DevTools | Perform `⌘`+wheel and pinch with the pointer over the docked DevTools panel, and again with DevTools focused | The guest page's zoom never changes; DevTools keeps the gesture | US3.6, FR-019, SC-009 |
| S26 | Plain scroll is untouched | Two-finger vertical scroll without `⌘`; two-finger horizontal swipe | The page scrolls, then history navigates as before; zoom never changes | US3.7, FR-020, SC-010 |
| S27 | Gesture boundary | Keep gesturing up past `500%`, then down past `25%` | The level clamps at each end; the indicator stays at the clamped value | US3.5, FR-014 |

## Gesture tuning (manual)

The model — discrete ladder, per-window persistence, indicator, guest-page-only precedence — is fixed
by the spec. The *feel* is tuned by hand via constants at the top of `src/main/shell/window.ts`:

- `ZOOM_WHEEL_MOUSE_STEP` (`12`) — mouse-wheel travel per step; ~one notch.
- `ZOOM_WHEEL_TRACKPAD_STEP` (`120`) — trackpad Command + scroll travel per step.
- `ZOOM_PINCH_STEP` (`0.3`) — pinch magnification per step.
- `ZOOM_GESTURE_IDLE_MS` (`160`) — idle gap that ends a gesture.

Run with `TLACHIALONI_ZOOM_DEBUG=1 pnpm dev` to log each gesture's `delta`/`magnification` and the
classification (`discrete`/`precise`), then adjust the constants to taste. Validate S21–S27 by hand.

## Focus-context coverage

Run S1/S3/S4 once with the guest page focused and once with the docked DevTools focused. Both must
behave identically (the OS menu accelerator covers DevTools focus; `before-input-event` covers the
page).

## What failure looks like

- Zoom resets on navigation → the re-apply-on-navigate step is missing or racing.
- A single key press jumps two steps → the 20 ms keyboard dedupe is missing or too short.
- A mouse notch moves many steps → it is going through the trackpad accumulator (wrong `discrete`
  classification) or `ZOOM_WHEEL_MOUSE_STEP` is too low.
- The indicator never appears at the bottom-right → `desiredShellMode()` is not returning `full`
  while `zoomStatus` is set, or the shell is being clipped to the band.
- The indicator blocks clicks → it opted into `pointer-events: auto` or the leave is holding the
  shell `full`.
