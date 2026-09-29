# Feature Specification: Blank-Page Watermark

**Feature Branch**: `014-blank-watermark`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "what is the 'new page' component or view that this app shows when we open up a new window that does not load a specific URL? I want to add the svg logo as the background to it" — refined during review to "we can actually use the svg, because path335 and path334 could have a fill that matched currentcolor (or --tb-fg) ... that will give a little bit of a theme matching look to it."

## Context

A window opened with no target (`⌘N`, or a restored window that never had one) has
nothing to paint: the guest view is empty, so the developer sees a flat themed
backdrop with the location palette over it. Once the palette is dismissed, the bare
color is all that remains and the window reads as an unfinished void rather than a
page.

This feature gives that blank state an identity: the tool's logo mark, centered and
faded, painted as the page background. It is a watermark, not chrome over content —
it exists only while the window has no target, so it never sits over, competes
with, or obscures the developer's work. Two small paths inside the mark take the
window's accent color, so the watermark belongs to the active Tlapalli variant
rather than being a fixed piece of brand art.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A blank window reads as a page, not an empty void (Priority: P1)

The developer presses `⌘N` (or restores a window that never had a target). The
location palette is armed over the window. They dismiss it without choosing a
target — and instead of a flat color they see the tool's mark as a faint,
centered watermark, with the top drag band still available.

**Why this priority**: This is the request. It is the entire visible change and the
only thing the feature must do to be useful.

**Independent Test**: Open a new window, dismiss the location palette without
navigating, and confirm the watermark is visible, centered, and non-interactive,
and that the window can still be dragged from the top band. Then navigate and
confirm the watermark is gone.

**Acceptance Scenarios**:

1. **Given** a newly opened window with no target, **When** the location palette is
   dismissed without navigating, **Then** the watermark is visible on the blank
   page.
2. **Given** a blank window showing the watermark, **When** a target commits,
   **Then** the watermark disappears and never appears over the loaded page.
3. **Given** a blank window showing the watermark, **When** the developer presses
   inside the top drag band and drags, **Then** the window moves as it did before
   this feature.
4. **Given** a blank window, **When** the developer opens the command palette,
   **Then** the palette and its text render fully legibly above the watermark.
5. **Given** a restored window whose saved target is `null`, **When** it launches,
   **Then** it shows the watermark exactly as a fresh new window does.

---

### User Story 2 - The watermark matches the window's theme (Priority: P2)

The developer switches the window's Tlapalli variant. The watermark's accent
details follow the new variant's color, and the mark stays legible in both dark and
light modes, so the blank page feels like part of the tool rather than pasted-on
art.

**Why this priority**: A valuable refinement of the watermark, but the feature is
useful with a theme-neutral mark alone.

**Independent Test**: Cycle the theme variants (and the color mode) on a blank
window and confirm the watermark's accent details change with the variant and that
the mark remains visible, without a reload.

**Acceptance Scenarios**:

1. **Given** a blank window showing the watermark, **When** the variant changes,
   **Then** the mark's accent details take the new variant's accent color.
2. **Given** a blank window in dark mode, **When** the mode switches to light (or
   the OS light/dark setting changes while in "system" mode), **Then** the mark
   remains visible against the light backdrop with its accent hue preserved.

---

### Edge Cases

- **Loading and failure**: while a target is loading (loading veil) or has failed
  (failure view), that surface owns the window; the watermark yields and never
  shows through or competes. Once the surface clears on a still-blank window, the
  watermark returns.
- **Palette open**: the command palette and its backdrop paint above the watermark;
  the watermark may be faintly visible behind the palette's translucent backdrop but
  never reduces the palette's legibility.
- **No target ever vs. target cleared**: the watermark keys off "this window has
  never committed a target," not merely "nothing is on screen right now," so it
  never flashes during a normal navigation between pages.
- **Multiple windows**: each window shows its own watermark independently, like its
  theme; hovering or interacting with one window never affects another's.
- **Reduced motion**: the watermark is static and introduces no motion, so
  `prefers-reduced-motion` has nothing to change.
- **Extremely small window**: the mark scales down and stays centered without
  overflowing or introducing scrollbars.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A window that has never committed a target MUST show a centered,
  faded watermark of the tool's logo mark on its blank page.
- **FR-002**: The watermark MUST be decorative and non-interactive: it MUST NOT
  capture pointer or keyboard input, and it MUST NOT block the always-available top
  drag band (013) or any shell surface above it.
- **FR-003**: The watermark MUST be subordinate to full-window surfaces: hidden
  while the loading veil or failure view owns the window, and painted beneath the
  command palette and its backdrop.
- **FR-004**: The watermark MUST persist after the location palette is dismissed on
  a still-blank window, and MUST disappear permanently once a target commits.
- **FR-005**: The watermark MUST NOT appear on any window that has loaded a target;
  it never overlays the guest page (constitution II).
- **FR-006**: Two accent details inside the mark MUST derive their color from the
  window's theme (its accent/foreground token), so the watermark matches the active
  Tlapalli variant; the rest of the mark's artwork is unchanged.
- **FR-007**: The watermark MUST remain visible in both dark and light modes; in
  light mode it MUST adapt so the mark does not vanish against the light backdrop,
  and the themed accent details MUST keep their hue.
- **FR-008**: The watermark's opacity and size MUST be tuned so it reads as a faint
  background and never competes with the palette text or other surfaces for
  attention; it MUST scale with the window and stay centered.
- **FR-009**: The feature MUST NOT modify the guest page, and MUST NOT change any
  persisted state or window record shape.
- **FR-010**: The feature MUST NOT change existing keyboard, pointer, dragging,
  navigation, or DevTools behavior on a blank window.

### Key Entities

- **Blank window**: a window whose record target is `null` and that has never
  committed a load — a fresh `⌘N` window, or a restored window that never had a
  target.
- **Blank surface**: the decorative watermark layer the shell renderer paints for a
  blank window; it paints no interactive area.
- **Watermark mark**: the tool's logo artwork, bundled with the renderer, whose two
  inner accent details are themable while the rest of the art is fixed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a new window with the location palette dismissed, the watermark is
  visible and the window is still fully draggable from the top band, with no
  keyboard step.
- **SC-002**: In a normal session, the watermark is never visible on a window that
  has loaded a target (zero occurrences across opening, reloading, and navigating).
- **SC-003**: Switching the window's variant visibly changes the watermark's accent
  details to match, with no reload and no restart.
- **SC-004**: With the palette, loading veil, or failure view on screen, that surface
  renders fully legibly and every keyboard/pointer interaction with it behaves
  exactly as before this feature.
- **SC-005**: The watermark is visible but unobtrusive: it is legible as brand art
  without competing with palette text, and a person unfamiliar with the app can
  still read the palette at a glance.

## Assumptions

- The watermark is purely decorative, so it carries no accessible text and is marked
  hidden from assistive technology; it conveys no information a screen reader needs.
- The mark is the same committed logo art used for the app icon; only the two inner
  accent details are re-coloured for theming. No new artwork is produced.
- "Light mode" is the window's own resolved color mode, which already tracks the OS
  in "system" mode; the watermark follows that same resolution.
- Exact opacity, size, and the light-mode treatment are tuning values expected to be
  adjusted during implementation; the requirement is only that the mark is faint,
  centered, and legible per FR-008.
- Only one watermark exists per window; there is no tiling or multi-instance case.

## Dependencies

- The blank-window model from `specs/012-multi-window/` (FR-011: a new window starts
  with no target and an armed location prompt).
- The shell-mode state machine from `specs/013-always-on-drag-region/` (`full` /
  `band`), whose `full` mode the blank page now depends on so the watermark is not
  clipped to the 36px band, and whose drag band must keep working beneath the
  watermark.
- The Tlapalli token system (`--tb-*`) and per-window variant/mode resolution from
  `specs/001-minimal-browser/` and `specs/012-multi-window/`, which supply the accent
  color and the light/dark decision.
- The committed logo source art (`resources/logo.svg`), from which the bundled,
  themable mark is derived.
