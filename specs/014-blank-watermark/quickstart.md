# Quickstart Validation: Blank-Page Watermark

Runnable validation for `specs/014-blank-watermark/spec.md`. The surface lives in a
`WebContentsView` with no DOM harness, so these are observed live; use a slow-motion
capture where a step needs frame-level proof of the loading/failure hand-off.

## Prerequisites

- `npm install` on Node 24+.
- macOS 13+ on Apple silicon.
- A local dev server on `http://localhost:3000` (or any reachable target) to observe
  the watermark disappearing on a committed load; an unreachable local port to
  exercise the failure view.

## Run

```sh
npm run dev        # build and launch with renderer HMR
npm run check      # format, lint, typecheck (Vite+)
npm run test       # unit tests (Vitest) — includes the blank predicate cases
npm run typecheck  # explicit TS pass across node/preload/web
npm run build      # confirms the mark is bundled into the renderer
```

## Scenarios

### S1 — Watermark on a new blank window (FR-001, FR-004, SC-001)

1. Cold-launch; with a window focused press `⌘N`. A new window opens with the
   location palette armed.
2. Press `Esc` to dismiss the palette without navigating. The window stays blank and
   the watermark is centered and visible.
3. Confirm the watermark is faint, centered, and does not move or react to the
   pointer.
4. Press inside the top ~10px and drag; the window moves (the drag band still works
   beneath the watermark).

### S2 — The watermark is blank-only (FR-005, SC-002)

1. From the blank window in S1, type `:3000` (or a reachable target) into the
   palette and press Enter.
2. While the page loads, confirm the watermark is not visible over the veil.
3. Once the page paints, confirm no watermark is visible anywhere.
4. Reload and navigate via `⌘L`; the watermark never reappears.

### S3 — Palette and failure surfaces stay authoritative (FR-003, FR-010, SC-004)

1. On a blank window, press `⌘P`. The palette and its text render fully legibly; the
   watermark does not reduce legibility and does not intercept any click or key.
2. Close the palette; the watermark is still there.
3. On a blank window, navigate to an unreachable local port (e.g. `:1`) and confirm
   the failure view owns the window with no watermark competing; dismiss the failure
   and confirm the window is usable as before.

### S4 — Theme matching (FR-006, FR-007, SC-003)

1. On a blank window, open the theme group (`⌘P`, then Tab to Theme) and move the
   selection through the variants. The watermark's accent details follow the
   highlighted/accent color.
2. Commit a colored variant (e.g. gold, turquoise, quartz) and confirm the accents
   match it without a reload.
3. Toggle the color mode to light (or set the OS to light while in "system" mode).
   The mark remains visible against the light backdrop and the accent keeps its hue.
4. Set the OS to dark while in "system" mode; the mark returns to the dark treatment
   with no restart.

### S5 — Restored blank window (FR-001, FR-004)

1. Open a window with `⌘N`, dismiss the location palette, and quit the app (`⌘Q`).
2. Relaunch. The window restores blank with the location palette armed; dismiss it
   and confirm the watermark is shown exactly as a fresh new window.
3. In a second restored window that had a target, confirm no watermark appears.

### S6 — Multi-window independence (FR-010)

1. Open two blank windows side by side (`⌘N` twice, dismiss each palette). Both show
   their own watermark.
2. Give one a target; only that window loses its watermark. The other keeps its own.
3. Set the two windows to different variants; each watermark matches its own window.

### S7 — Reduced motion and small windows (FR-008)

1. Enable Reduce Motion; the watermark is static and unchanged (no motion to reduce).
2. Resize a blank window very small and very large; the mark stays centered, scales
   with the window, does not overflow, and introduces no scrollbars.

### S8 — Automated checks (Development Workflow)

1. `npm run test` — the `isBlankSurfaceVisible` cases pass alongside the existing
   predicate cases.
2. `npm run check` — format, lint, and type checks green.
3. `npm run typecheck` — node, preload, and web configurations clean.
4. `npm run build` — the renderer build succeeds and bundles the mark.

## Results recording

Record outcomes per scenario in `specs/014-blank-watermark/validation.md`, mirroring
the 001/013 validation tables. Findings that change behavior feed back into the spec
or plan before commit.

## Spec coverage

| Scenario | Requirements / success criteria |
| --- | --- |
| S1 | FR-001, FR-002, FR-004, SC-001 |
| S2 | FR-005, SC-002 |
| S3 | FR-003, FR-010, SC-004 |
| S4 | FR-006, FR-007, SC-003 |
| S5 | FR-001, FR-004 |
| S6 | FR-010 |
| S7 | FR-008 |
| S8 | Development Workflow gate (`vp check` / `vp test`) |
