# Quickstart Validation: Always-On Drag Region

Runnable validation for `specs/013-always-on-drag-region/spec.md`. Most checks are
observed live; use a slow-motion capture (QuickTime, or `screencapture -v`) where a
step needs frame-level proof, and `top`/Activity Monitor for the resource check.

## Prerequisites

- `npm install` on Node 24+.
- A local dev server on `http://localhost:3000` (or any reachable target) for a
  painted page; a second window via `⌘N` for the multi-window checks.
- macOS 13+ on Apple silicon. System **Reduce Motion** toggled in
  System Settings → Accessibility → Display for S6.

## Run

```sh
npm run dev        # build and launch with renderer HMR
npm run check      # format, lint, typecheck (Vite+)
npm run test       # unit tests (Vitest) — proximity + predicate cases
npm run typecheck  # explicit TS pass across node/preload/web
```

## Scenarios

### S1 — Drag with no keyboard step (FR-001, FR-002, SC-001)

1. Cold-launch and do not press `⌘B`. The chrome is invisible; the page reaches the
   top edge.
2. Press inside the top 36px anywhere across the width (including above the docked
   DevTools area) and drag. The window moves with the pointer.
3. Press `⌘B` to pin the strip; drag from the strip's background between the controls.
   The window moves.
4. Press `⌘B` to unpin; drag again from the transparent band. The window moves with
   no keyboard step at any point.

### S2 — Peek by proximity and by dwell (FR-004, SC-002)

1. With the strip hidden, slide the pointer to within a few pixels of the top edge.
   The strip reveals promptly (under 0.5s).
2. Move the pointer well away (over the page) and wait; the strip disappears within
   1s (FR-005, SC-003).
3. With the strip hidden again, move the pointer into the band but a little below the
   top edge and hold still. After ~400ms the strip reveals.
4. Move the pointer off the window onto the desktop; the strip dismisses after the
   grace period.

### S3 — Use the strip while it is peeking (FR-006, SC-005)

1. Reveal the strip by hover. Without pressing `⌘B`, move down onto Reload and click;
   the page reloads and the strip is still present.
2. Move to the DevTools control and click; DevTools toggles and the strip remains.
3. Move the pointer away from the top area; only then does the strip dismiss.
4. Confirm the pointer never had to leave and re-enter to keep the strip open.

### S4 — Pin semantics unchanged (FR-007, SC-006)

1. Press `⌘B`. Move the pointer far from the top; the strip stays.
2. Press `⌘B` again; the strip leaves and hover once more only peeks it.
3. Pin the strip, quit, and relaunch. The strip is pinned. Unpin, quit, relaunch; it
   is hidden (a peek is never remembered).
4. Open the command palette with the strip pinned; the strip and its controls hide
   with the palette and return when it closes.

### S5 — Traffic lights track the strip (FR-008)

1. Cold-launch hidden: no traffic lights; zero visible chrome (SC-004).
2. Hover to peek: the three native controls appear inside the strip, clear of the
   lock and target text, and close/minimize/zoom work.
3. Let the strip dismiss: the controls leave with it.
4. Pin with `⌘B`: the controls stay with the pinned strip.

### S6 — Reduced motion (FR-014)

1. Enable Reduce Motion.
2. Repeat S2/S3. The strip appears and disappears instantly; dragging and clicking
   still work and no end state differs from the animated run.
3. Disable Reduce Motion mid-session; the next reveal is animated again with no
   restart.

### S7 — Multi-window independence (FR-012)

1. Open a second window with `⌘N`; put the two windows side by side.
2. Hover the top of window A: only A's strip peeks and only A's controls appear.
3. Pin A's strip; window B stays hidden until its own pointer enters.
4. Blur window A (click B): A's peek clears and A's sensor stops.

### S8 — The band stays available over full surfaces (FR-011)

1. Open the palette (`⌘P`); press in the top band and drag. The window moves, and
   the palette keeps its input below the top band.
2. Repeat with the loading veil and the failure view on screen: dragging from the
   top band still moves the window.
3. Close each surface; dragging from the band continues to work.

### S9 — A drag holds the current titlebar state (FR-016)

1. With the strip hidden, drag the window from the band; no strip appears for the
   whole drag.
2. Reveal the strip by hover, then drag the window; the strip stays visible for the
   whole drag and does not dismiss mid-drag.
3. Release with the pointer still on the titlebar: it stays; move the pointer away:
   it dismisses after the grace period.
4. After a hidden-strip drag, a fresh dwell reveal still works.

### S10 — Resource baseline (FR-010, SC-007)

1. With the window focused and the strip hidden, leave it idle and sample CPU for a
   minute; the app's idle CPU must be indistinguishable from the pre-feature
   baseline (no per-frame work).
2. Blur the window and confirm the feature stops sensing (peek clears and no reveal
   happens) without needing the timer torn down.

### S11 — Spike outcomes (M0)

1. Confirm cursor proximity reliably reveals/dismisses at the top screen edge, on a
   secondary display, and under Retina scaling.
2. Double-click the band; record whether macOS zooms. If it does, verify S1 still
   works; if it does not, record that FR-013 is dropped.

### S12 — Automated checks (Development Workflow)

1. `npm run test` — `ProximityTracker` cases and the updated predicate cases pass.
2. `npm run check` — format, lint, and type checks green.
3. `npm run typecheck` — node, preload, and web configurations clean.

### S13 — Space change keeps the reveal (FR-009 edge)

1. With the strip hidden, move the window to another macOS Space (drag it to the
   screen edge, or use Mission Control).
2. On the new Space, hover the top band; the strip peeks. It no longer requires
   leaving and returning to the old Space first.
3. Move the window back and re-check both Spaces.

## Results recording

Record outcomes per scenario (with captures noted for S2/S3/S9 and the S11 spike
result) in `specs/013-always-on-drag-region/validation.md`, mirroring the 001
validation table. Findings that change behavior feed back into the spec or plan
before commit.

## Spec coverage

| Scenario | Requirements / success criteria |
| --- | --- |
| S1 | FR-001, FR-002, FR-003, SC-001, SC-004 |
| S2 | FR-004, FR-005, SC-002, SC-003 |
| S3 | FR-006, SC-005 |
| S4 | FR-007, SC-006 |
| S5 | FR-008 |
| S6 | FR-014 |
| S7 | FR-012, FR-009 |
| S8 | FR-011 |
| S9 | FR-016, FR-009 |
| S10 | FR-010, SC-007 |
| S11 | FR-013 (spike), SC-002 |
| S12 | Development Workflow gate (`vp check` / `vp test`) |
| S13 | FR-009 (Spaces edge case) |
