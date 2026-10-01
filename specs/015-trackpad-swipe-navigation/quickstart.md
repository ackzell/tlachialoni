# Quickstart Validation: Trackpad Swipe History Navigation

Runnable validation for `specs/015-trackpad-swipe-navigation/spec.md`. The gesture
and overlay are observed live on a real trackpad; use a slow-motion capture
(QuickTime, or `screencapture -v`) where a step needs frame-level proof. Automated
checks cover the pure state machine and the shared predicate.

## Prerequisites

- `npm install` on Node 24+.
- A local dev server on `http://localhost:3000` for a normally-scrolling page, and a
  second page reachable via an in-page link so history has at least two entries
  (Back and Forward both available).
- A page with both vertical overflow and a horizontally scrollable element (for S3).
- macOS 13+ on Apple silicon with a trackpad. System **Reduce Motion** toggled in
  System Settings → Accessibility → Display for S8.
- For S10, note the current System Settings → Trackpad → More Gestures → "Swipe
  between pages" value.

## Run

```sh
npm run dev        # build and launch with renderer HMR
npm run check      # format, lint, typecheck (Vite+)
npm run test       # unit tests (Vitest) — HistoryGesture + predicate cases
npm run typecheck  # explicit TS pass across node/preload/web
```

## Scenarios

### S1 — Two-finger swipe moves history (FR-001, SC-001)

1. On page B (reached from page A), swipe two fingers to the right. Page A loads
   (Back), exactly one step.
2. Swipe two fingers to the left. Page B loads (Forward), exactly one step.
3. Repeat several times; each deliberate swipe moves exactly one entry in the
   expected direction.

### S2 — The overlay arms and commits (FR-005, FR-007, SC-003)

1. On page B, begin a rightward swipe and hold the fingers still past the arm
   point. A subtle overlay appears on the **left** edge, dim at first.
2. Continue the swipe; the overlay brightens as it approaches commit, then the
   navigation fires (page A loads) and the overlay clears.
3. Repeat leftward on page A: overlay on the **right** edge, then Forward fires.
4. Slow-motion capture: the overlay is fully gone shortly after commit.

### S3 — Cancelling on lift, and scrolling never navigates (FR-002, FR-003, FR-006, SC-002, SC-005)

1. On page B, swipe right past the arm point, then lift without continuing. The
   overlay fades, page B stays.
2. Swipe right past the arm point, then reverse back toward the start and lift. The
   overlay clears; no navigation.
3. Scroll vertically on a tall page: the page scrolls, no overlay, no navigation.
4. Scroll the wide element fully to one side, then keep swiping at the boundary; the
   overlay only appears if the implementation's overscroll gate allows it, and a
   normal-length horizontal scroll does not navigate.
5. Scroll diagonally with a vertical bias: no navigation (dominant-axis guard).

### S4 — One navigation per gesture; momentum is inert (FR-004, SC-004)

1. Swipe right decisively and let the momentum carry. Exactly one Back, no second
   step from the fling.
2. Immediately swipe right again as a fresh gesture; the second Back is honored.
3. At the back boundary (no more history), swipe right; nothing navigates and no
   overlay appears.

### S5 — The overlay is subtle, directional, and non-interactive (FR-010, FR-012, SC-006)

1. While the overlay is showing, click and type in the page; every interaction
   behaves as if the overlay were absent.
2. Confirm the overlay never appears at rest (zero chrome) and never lingers after a
   gesture ends.
3. Cycle theme variants; the overlay's color follows the Tlapalli tokens (VI).

### S6 — Keyboard and mouse paths are unchanged (FR-014)

1. `⌘←` / `⌘→` move history exactly as before, including the focused-input
   exemption.
2. Use the mouse back/forward thumb buttons: they still navigate as shipped in 002.
3. With the macOS "Swipe between pages" setting on, perform one trackpad swipe and
   confirm history moved exactly once (the OS `swipe` and the detector did not both
   fire).

### S7 — DevTools and surfaces (FR-016, FR-011)

1. Open DevTools docked, focus it, and two-finger scroll horizontally over the
   DevTools panel: it scrolls; the guest history does not move.
2. Open the command palette (`⌘P`) and swipe; no overlay, no navigation.
3. Trigger the loading veil and the failure view and swipe; no overlay over those
   surfaces, and the guest history does not move behind them.

### S8 — Reduced motion (FR-012)

1. Enable Reduce Motion and repeat S2. The overlay appears and clears instantly; the
   navigation behavior is identical.
2. Disable it mid-session; the next arm is animated again with no restart.

### S9 — Focus loss and multi-window independence (FR-015)

1. Begin an armed swipe, then switch Spaces or click another app mid-gesture: the
   overlay clears and nothing navigates.
2. Open a second window (`⌘N`). Swipe in window A: only A arms and navigates; B is
   untouched. Blur A; its overlay clears.

### S10 — Spike outcomes (M0)

1. Confirm the live stream: which phase types arrive, the `deltaX` / `deltaY` values
   and their sign for Back vs Forward, `hasPreciseScrollingDeltas`, whether
   `gestureScrollEnd` arrives, and whether `canScroll` separates a consumed scroll
   from a boundary.
2. With "Swipe between pages" set to include two fingers, confirm whether the OS
   `swipe` event also fires for a trackpad swipe, and that S6.3 still holds.
3. Record whether the overscroll gate or the fallback rule ships, and the tuned
   `armDistance` / `commitDistance`.

### S11 — Development preview (constitution / specs/008)

1. In a dev build, choose the Developer-menu item that previews the armed overlay.
   The overlay holds on screen in a representative state (both edge directions).
2. Edit `HistoryOverlay.vue` styles and confirm HMR updates the held preview.
3. Confirm the Developer menu and the preview are absent from a packaged build.

### S12 — Automated checks (Development Workflow)

1. `npm run test` — `HistoryGesture` cases (arm/commit/cancel, dominance, overscroll,
   single-fire, cooldown, direction, history-availability) and predicate cases pass.
2. `npm run check` — format, lint, and type checks green.
3. `npm run typecheck` — node, preload, and web configurations clean.

## Results recording

Record outcomes per scenario (with captures for S2/S3/S4 and the S10 spike result) in
`specs/015-trackpad-swipe-navigation/validation.md`, mirroring the 001/013 validation
tables. Findings that change behavior (especially the sign constant or the gating
strategy) feed back into `research.md` and the spec or plan before commit.

## Spec coverage

| Scenario | Requirements / success criteria |
| --- | --- |
| S1 | FR-001, SC-001 |
| S2 | FR-005, FR-007, SC-003 |
| S3 | FR-002, FR-003, FR-006, SC-002, SC-005 |
| S4 | FR-004, FR-008, SC-004 |
| S5 | FR-010, FR-012, SC-006, SC-008 |
| S6 | FR-014, FR-016 (setting interaction) |
| S7 | FR-016, FR-011 |
| S8 | FR-012, SC-003 |
| S9 | FR-013, FR-015, FR-006 |
| S10 | FR-003, FR-016 (spike), SC-002 |
| S11 | Development Workflow / specs-008 preview requirement |
| S12 | Development Workflow gate (`vp check` / `vp test`) |
