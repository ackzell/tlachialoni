# Quickstart Validation: Titlebar Mode

Runnable validation for `specs/016-titlebar-mode/spec.md`. Most checks are observed
live; use a slow-motion capture (QuickTime, or `screencapture -v`) where a step needs
frame-level proof, and Activity Monitor for the resource check. The headless
self-test harness (`src/main/dock-test.ts`) covers the layout assertions that a person
would otherwise eyeball.

## Prerequisites

- `npm install` on Node 24+.
- A local dev server on `http://localhost:3000` (or any reachable target) for a painted
  page; a second window via `⌘N` for the multi-window checks.
- macOS 13+ on Apple silicon. System **Reduce Motion** toggled in
  System Settings → Accessibility → Display for S7.
- For the headless assertions: the same dev server, run with
  `TLACHIALONI_DOCK_TEST=1` (and the extended titlebar assertions, M5).

## Run

```sh
npm run dev        # build and launch with renderer HMR
npm run check      # format, lint, typecheck (Vite+)
npm run test       # unit tests (Vitest) — predicate/inset + schema cases
npm run typecheck  # explicit TS pass across node/preload/web
```

## Scenarios

### S1 — Toggle the mode and keep the strip permanent (FR-001, FR-002, FR-007, SC-001, SC-004)

1. Cold-launch; the default layout is zero-chrome with the page at the top edge.
2. Press `⇧⌘F`. The strip docks at the top as a title bar and stays there; the page
   begins below it. The layout settles within a second.
3. Move the pointer over the page and away from the top; the strip does not dismiss.
4. Click Back, Forward, Reload, and Toggle DevTools on the strip; each actuates and the
   strip remains.
5. Press `⇧⌘F` again; the strip returns to the overlay behavior and the page fills the
   window again.
6. Open the palette and confirm **Toggle Titlebar Mode** is listed and toggles the mode.

### S2 — The page is pushed below, never covered (FR-004, FR-005, SC-002)

1. Enable titlebar mode on a page with an interactive element on its first row (a nav
   bar or button at `y = 0`).
2. Confirm that element is fully visible and clickable — the strip does not cover any
   pixel of it.
3. In DevTools, read `window.innerHeight`; it is the window height minus the strip
   height (30 CSS px at 1x), i.e. the viewport reflowed rather than the page being
   translated or clipped.
4. Resize the window and confirm the strip keeps its height and the page fills the
   remainder with no gap or 1px seam (check at 1x and 2x scaling).

### S3 — Toggling never reloads the page (FR-006, SC-003)

1. With the page loaded, scroll to a non-top position and type into a form field (or
   plant a sentinel via DevTools: `window.__tb = 42`).
2. Toggle titlebar mode on, then off.
3. Confirm the scroll position, the form value (or `window.__tb`), and the history
   stack are unchanged, and no reload occurred.
4. Repeat in the headless harness: `TLACHIALONI_DOCK_TEST=1` asserts the sentinel and
   `window.innerHeight` delta.

### S4 — Docked DevTools live below the strip (FR-011)

1. Enable titlebar mode, open DevTools (`⌘⌥J`), and dock it bottom (`⌘1`).
2. The strip spans the full window width above both the page and the DevTools panel;
   the panel is below the strip and fully interactive.
3. Re-dock right (`⌘2`) and left (`⌘3`); in each case the panel stays below the strip
   and the strip is never covered.
4. Close DevTools; the page reflows to fill the content area below the strip.

### S5 — Full-window surfaces occupy the content area (FR-012)

1. Enable titlebar mode and open the palette (`⌘P`). The strip stays visible and
   clickable; the palette and its backdrop occupy the area below it.
2. Repeat with the loading veil (navigate to a target with a slow load) and the failure
   view (point at a dead port): each paints below the strip, and the strip stays usable.
3. Trigger the extension install status; it appears below the strip.

### S6 — `⌘B` is superseded while the mode is on (FR-015)

1. With titlebar mode on, press `⌘B`. Nothing visibly changes and the strip stays.
2. Turn titlebar mode off; the strip leaves unless it was pinned before.
3. Turn it on again, pin state unchanged; turn it off and confirm `⌘B` regains its
   normal overlay-pin behavior.

### S7 — Reduced motion (FR-014)

1. Enable Reduce Motion in System Settings.
2. Toggle titlebar mode on and off; the strip appears/disappears instantly and the page
   layout changes with no animation — no end state differs from the animated run.
3. Disable Reduce Motion mid-session; the next toggle animates again with no restart.

### S8 — Per-window independence and persistence (FR-008, SC-005)

1. Open a second window with `⌘N`; confirm it starts in the default overlay layout.
2. Enable titlebar mode in window A only; window B's layout is unchanged.
3. Quit and relaunch; A reopens in titlebar mode and B in overlay mode.
4. Resize and move A; the docked layout survives and the inset is preserved.

### S9 — Fullscreen and Spaces (FR-016, edge cases)

1. Enter macOS fullscreen with titlebar mode on. The strip stays docked and its controls
   work; the layout does not break.
2. Leave fullscreen; the docked layout re-applies with the traffic lights back in the
   strip.
3. Move the window to another Space/display; the docked layout is unchanged.

### S10 — Resource baseline (SC-008, FR-010 analog)

1. With the window focused and titlebar mode on, leave it idle and sample CPU for a
   minute; idle CPU must be indistinguishable from the overlay-mode baseline (the
   proximity sensor is dormant, so there is no new per-frame or per-tick work).
2. Confirm no `strip:peek` traffic or reveal/dismiss occurs while the mode is on.

### S11 — Automated checks

1. `npm run test` — new `isStripSurfaceVisible` / `titlebarInset` cases and the
   `titlebarMode` sanitize/round-trip case pass.
2. The extended `TLACHIALONI_DOCK_TEST=1` run asserts: `siteView` bounds inset by
   `STRIP_HEIGHT`, `window.innerHeight` reduced by the inset, DevTools still open below
   the strip, and the sentinel surviving the toggle.
3. `npm run check` and `npm run typecheck` are green.

## Results recording

Record outcomes per scenario (with captures noted for S2/S5 and the M0 spike results)
in `specs/016-titlebar-mode/validation.md`, mirroring the 001/013 validation tables.
Findings that change behavior feed back into the spec or plan before commit.

## Spec coverage

| Scenario | Requirements / success criteria |
| --- | --- |
| S1 | FR-001, FR-002, FR-003, FR-007, FR-010, SC-001, SC-004, SC-007 |
| S2 | FR-004, FR-005, FR-013, SC-002, SC-006 |
| S3 | FR-006, SC-003 |
| S4 | FR-011 |
| S5 | FR-012 |
| S6 | FR-015 |
| S7 | FR-014 |
| S8 | FR-008, SC-005 |
| S9 | FR-016 |
| S10 | SC-008 (FR-002, FR-010 analog) |
| S11 | Development Workflow gate (`vp check` / `vp test`) + M0 spike assertions |
