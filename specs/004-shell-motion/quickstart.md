# Quickstart Validation: Shell Motion

Runnable validation for `specs/004-shell-motion/spec.md`. Motion is perceptual, so
most checks are observed live; use a slow-motion capture (QuickTime screen
recording, or `screencapture -v`) when a step needs frame-level proof.

## Prerequisites

- `npm install` on Node 24.21+.
- A local dev server for navigation checks: any server on `http://localhost:3000`
  (the default target), or a Vite server on `:5173`.
- A known-dead port for failure checks (for example `:5999`).
- macOS 13+ on Apple silicon; system **Reduce Motion** toggled in
  System Settings → Accessibility → Display when running S6.

## Run

```sh
npm run dev        # build and launch with renderer HMR
npm run check      # format, lint, typecheck (Vite+)
npm run test       # unit tests (Vitest) — includes splitTargetLabel cases
npm run typecheck  # explicit TS pass across node/preload/web
```

## Scenarios

### S1 — Palette grows and shrinks (FR-009, FR-003, FR-004, SC-001, SC-002, SC-003)

1. From an idle shell, press `⌘P`. The backdrop fades in and the panel grows
   from ~0.97 scale to full — no single-frame appearance.
2. Type immediately on invocation. The first keystroke lands; characters never
   wait for the entrance.
3. Press `Esc`. The panel shrinks and fades; afterwards the window shows only the
   page (zero chrome).
4. Press `⌘P`, then `Esc` during the entrance; press `⌘P` again during the exit.
   Each reversal is fluid, with no flicker, jump, or stuck backdrop.
5. Dismiss by clicking outside and by activating a row; both exits behave the
   same, and keyboard focus returns to the page.

### S2 — Drag strip choreography (FR-010, FR-011, FR-012, SC-002)

1. Press `⌘B`. Capture in slow motion: the strip surface eases in, the location
   segments fade in left to right (`:` and `/` boundaries), then reload,
   DevTools, and close drop in one after another.
2. While the strip is visible, navigate with the palette (`⌘L`, edit the target
   to a different path). The location reveal replays for the new target.
3. Navigate to a long target (for example `http://localhost:3000/a/b/c/d/e/f/g/h?x=1`).
   The reveal still finishes quickly — the stagger compresses instead of
   lengthening.
4. Press `⌘B` to hide. The contents leave smoothly; the chrome then reaches zero
   pixels. Nothing cuts.
5. Drag the window by the strip while it is still entering — dragging works.

### S3 — Palette matches animate while typing (FR-013, FR-014, FR-024, FR-025, SC-003, SC-008)

1. Open the palette and type a query that changes the fuzzy result set. Newly
   matching rows unfold in with a staggered height-and-fade; rows that stay put do
   not re-animate.
2. Delete characters so rows drop out. Departing rows fade where they sit; the
   list does not grow, and the row under the pointer does not jump. Exits are
   quick (90 ms) and never animate height, so fast typing stays smooth.
3. Type quickly (a burst of characters). No queued animation trail, no duplicates,
   and the settled row count always equals the number of matches.
4. Type a long target (for example `localhost:5173/api/users?tab=1&sort=desc`).
   The row truncates with an ellipsis and stays one row tall, so the list height
   depends only on the row count.
5. Clear to a query with no matches. The empty state appears with the same
   treatment, and matches entering afterwards are treated like any other entry.
6. Arrow through rows while typing; the selection moves without the list jumping.

### S4 — Loading veil fades out (FR-015, SC-001)

1. Stop the dev server; navigate to the dead target with the palette so the
   failure view appears (also covers S5).
2. Start the server; press Retry. The veil shows while loading, then fades out to
   reveal the page — no flash of empty frame and no cut.
3. During the fade-out, click the page. Clicks pass through; motion does not block
   interaction.
4. Retry again and watch for a double-flash: the veil returns promptly if the
   load restarts while it is leaving.

### S5 — Failure view transitions (FR-016, SC-001)

1. Navigate to the dead port. The failure view fades in (card lifts slightly)
   instead of replacing the screen in one step.
2. Press Retry: the view fades out as the veil arrives.
3. Re-trigger the failure, then press Edit URL: the palette arrives as the
   failure view leaves; under it, the palette is fully usable.
4. Re-trigger, then press Go Back (when offered): the view leaves smoothly into
   the loading state.

### S6 — Reduced motion (FR-005, SC-004)

1. Enable Reduce Motion in System Settings.
2. Repeat S1, S2, S4, and S5. Every surface changes instantly: no fades, no
   movement, no stagger — and every end state is identical to the animated runs.
3. Toggle Reduce Motion back off mid-session. The next transition is animated
   again; no restart needed.

### S7 — Interruption, interaction, and zero chrome (FR-004, FR-007, FR-008, SC-005, SC-006)

1. Toggle `⌘B` several times rapidly. The final state always matches the last
   command; no half-visible strip and no stuck overlay.
2. Re-enable the strip, then hide it and immediately open the palette. The
   palette is fully interactive; the strip does not fight it.
3. With everything dismissed, confirm the visible tool chrome is zero pixels —
   the page is edge to edge, unchanged by any transition (no layout shift, no
   viewport change).
4. Quit the app mid-transition (toggle the strip and quit while it moves).
   No error, no residue on next launch.

### S8 — Automated checks (Development Workflow)

1. `npm run test` — `splitTargetLabel` cases pass alongside the existing suite.
2. `npm run check` — format, lint, and type checks green.
3. `npm run typecheck` — node, preload, and web configuration clean.

## Results recording

Record outcomes per scenario (with slow-motion captures noted for S1–S5) in
`specs/004-shell-motion/validation.md`, mirroring the 001 validation table.
Findings that change behavior feed back into the spec or plan before commit.

## Spec coverage

| Scenario | Requirements / success criteria                        |
| -------- | ------------------------------------------------------ |
| S1       | FR-003, FR-004, FR-009, SC-001–003                     |
| S2       | FR-010, FR-011, FR-012, SC-002                         |
| S3       | FR-013, FR-014, FR-024, FR-025, SC-003, SC-008       |
| S4       | FR-015, SC-001                                         |
| S5       | FR-016, SC-001                                         |
| S6       | FR-005, SC-004                                         |
| S7       | FR-001, FR-004, FR-006–008, FR-018, SC-005–007         |
| S8       | Development Workflow gate (`vp check` / `vp test`)      |