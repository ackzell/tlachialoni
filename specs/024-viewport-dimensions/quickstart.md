# Quickstart: Validating the Viewport Size Indicator

A run guide to prove the feature works end-to-end. It references
[contracts/viewport-indicator.md](./contracts/viewport-indicator.md) and
[data-model.md](./data-model.md) rather than repeating them. It contains no
implementation code.

## Prerequisites

- macOS; Node 24 and `pnpm` available.
- A local target to look at. The default is `http://localhost:3000`; start any dev
  server there (for example `npx serve` in the repo root, or an app you are working
  on). Any local `http://localhost:*` target works.

## Setup

```bash
pnpm install
```

## Resolve the two open questions first (resolved)

The suppression route and the viewport source were the feature's only unknowns;
both are now fixed by design (research §4, §5, §9) and carried by the code:

- **S0 — viewport source**: the guest's read-only `window.innerWidth`/`innerHeight`
  (the layout viewport), which matches DevTools by construction and tracks a docked
  DevTools panel and titlebar inset. `dock-test.ts` cross-checks it against the
  guest viewport.
- **S1 — suppression route**: `src/main/shell/devtools-overlay.ts` sends
  `Overlay.setShowViewportSizeOnResize({ show: false })` over DevTools' own
  connection (via the `InspectorFrontendHost.sendMessageToBackend` host binding)
  and is re-asserted on the poll tick so it survives a dock change. `dock-test.ts`
  reports `suppressed: true` against the live front-end.

The only thing left to a manual run is confirming these against a live GUI
(docking bottom/right/left) — the automated harness covers the rest.

## Automated checks (fast)

```bash
pnpm check     # lint + format (vp check)
pnpm test      # vitest (vp test) — includes tests/unit/viewport.test.ts
pnpm typecheck # tsc + vue-tsc across node/preload/web
```

Expected: all pass, including the new formatter/equality unit tests.

## Integration harness

Extends the existing in-process DevTools self-test rather than adding a parallel one:

```bash
TLACHIALONI_DOCK_TEST=1 pnpm dev
```

Expected extra `DOCK_TEST` evidence: `viewport.suppressed` (the DevTools-native
readout is off), `viewport.matches` (a reported page viewport flashes the shell
size readout with that value), `viewport.cleared` (it dismisses), `viewport.zoomShown`
(the shell zoom readout renders), and `viewport.zoomGate` (the exact DevTools pointer
band). `viewport.devtoolsResizeShown` is logged too — a real dock change is
environment-dependent (headless sessions may not reflow), so it is confirmed by hand.

## Run

```bash
pnpm dev
```

## Validation scenarios

| # | Scenario | Steps | Expected | Covers |
|---|----------|-------|----------|--------|
| S1 | Show on resize | Drag a window edge | A `width × height` badge appears in the guest page's top-right within ~100 ms and tracks the size live | US1.1/1.2, FR-001/002/006, SC-001 |
| S2 | Auto-dismiss | Stop dragging | The badge is gone within 2 s; the window returns to zero painted chrome | US1.3, FR-007/015, SC-004 |
| S3 | Maximize / restore / fullscreen | Use the green traffic light and enter/exit fullscreen | The badge appears with each new size | FR-013, edge cases |
| S4 | Move is not a resize | Drag the window by its strip/band without resizing | No badge appears | FR-013 |
| S5 | Matches DevTools | With DevTools open (temporarily un-suppressed for the check), resize and read both numbers | The badge's number equals the DevTools overlay's number | US2.1, FR-003, SC-002 |
| S6 | Native readout suppressed | With DevTools docked and open, resize the window | The DevTools-native size readout does not appear; only the tool's badge shows | US2.2, FR-004, SC-003 |
| S6b | DevTools panel resize | With DevTools docked and open, drag the panel's divider | The badge appears (in the page's corner) and updates with the new page viewport | US1.7, FR-013/018 |
| S7 | Dock sides | Dock DevTools bottom, then right, then left; resize each time | The badge sits in the page's corner (not over DevTools) and reflects the page viewport; suppression holds after each dock change | US2.3, FR-009/014, SC-002/003 |
| S8 | Titlebar mode | Toggle titlebar mode, resize | The value reflects the reduced page area (minus the strip) | FR-014, edge case |
| S9 | DevTools closed | Close DevTools, resize | The badge appears exactly as when DevTools is open | US1.6, FR-005 |
| S10 | Click-through | With the badge visible, click and scroll where it sits | The click/scroll reaches the page underneath | US3.1, FR-008, SC-005 |
| S11 | Coexists with zoom | Resize, then zoom (⌘+) so both are visible | The size badge is top-right and the zoom badge bottom-right; neither occludes the other | US3.2, FR-010, SC-006 |
| S12 | Rapid resizes | Resize back and forth quickly | A single badge shows only the latest size; no flicker, no stale hide | edge case, FR-006/007 |
| S13 | Per-window independence | Open a second window (⌘N); resize one, then the other | Each shows its own size; resizing one never affects the other | FR-011, SC-007 |
| S14 | All page states | Resize a blank window, during a load, and on the failure view | The badge appears in every state | US1.4, FR-017 |
| S15 | Reduced motion | Enable *Reduce motion* in System Settings, resize | The badge still appears and disappears, instantly | US3.4, FR-016 |
| S16 | Page untouched | Resize, zoom, let a badge dismiss, then inspect the guest page's DOM | No badge element, style, or script is added to the page — the readouts render in the shell | Principle II, FR-018 |

## What failure looks like

- **The value disagrees with DevTools** → the wrong source was chosen (outer window
  size, or bounds that ignore the DevTools dock); re-run spike S0 and switch to the
  guest layout viewport.
- **Both readouts appear while resizing** → the suppression is being sent on the
  page session instead of the DevTools front-end (research §4), or it is not
  re-asserted after a dock change.
- **The size readout appears at the wrong corner** → the insets are wrong for the
  dock side, or the strip offset is missing in overlay mode (research §12).
- **Zooming scales or jitters a readout** → it is being rendered inside the page
  instead of the shell, or the zoom-suppression window for the size readout is
  missing (research §12).
- **The readout blocks clicks** → it opted into `pointer-events: auto`, or the leave
  is holding the shell `full`.
- **It appears on window moves** → the trigger is not gated on an actual viewport
  change.
