# Feature Specification: Load Rim

**Feature Branch**: `025-reload-indicator`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "I want a loading indicator that shows while a page is reloading and let's add a different kind when it is 'hard reloading'. Chrome has a bar that grows atop full width, Arc has a little bar that has an animation. I would like to have something original but that still goes well with the rest of the rather minimal aesthetic of the ui"

## Clarifications

### Session 2026-10-22

- Q: Should the reload indicator convey measurable load progress, or simply signal that a reload is underway? → A: Indeterminate motion; no percentage or proportional fill.
- Q: Which visual concept should the two indicators follow? → A: An edge pulse, refined in the 2026-10-23 session into a four-edge rim: a soft, slow bloom for a normal load, with a sharper, faster second pulse added for a hard reload.

### Session 2026-10-23

- Q: Should the indicator be a top-edge bar or a rim around all four edges? → A: A four-edge rim around the guest page area, below any visible strip.
- Q: Should the rim also appear for a new link, history move, or same-origin palette navigation when the guest page is already visible? → A: Yes; any main-frame load that keeps the current page visible and raises no full-screen veil uses the rim.
- Q: How should the hard reload and light-page contrast read? → A: The normal rim is a 4px accent core with a theme-tinted dark contrast ring and a harsher inner shadow so it reads on light and dark pages; a hard reload adds a heavier 2px inner rim that trails the base pulse by about 180 ms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See That an In-Place Load Is In Progress (Priority: P1)

A developer presses the reload shortcut (or follows a link, moves through
history, or navigates to another same-origin path from the palette) while the
page is already visible. While that load is in progress, a narrow, understated
rim hugs all four edges of the guest page and stays visible until the load
completes. The page itself remains visible underneath for as long as the previous
page is still painted, so the developer is not plunged into a full-screen veil
just to refresh or follow a link; the rim is the only signal that the next page
is coming in. Once the new document commits and loading finishes, the rim fades
away on its own.

**Why this priority**: This is the core of the request. In-place loads currently
give no feedback beyond the page itself, so a developer cannot tell whether the
shortcut or link registered or the page is still working. A lightweight rim
delivers that feedback without breaking the chromeless, distraction-free default,
and it complements the full-screen veil rather than replacing it.

**Independent Test**: With a page loaded, trigger a normal reload and follow a
link; confirm the rim appears on all four edges during each load and disappears
once loading finishes, while the page stays visible underneath.

**Acceptance Scenarios**:

1. **Given** a loaded page, **When** the developer triggers a normal reload,
   **Then** a narrow rim appears around all four edges of the guest page while
   the page reloads.
2. **Given** a loaded page, **When** the developer follows a link to another
   page, **Then** the same rim appears and the current page stays visible until
   the new one commits.
3. **Given** a loaded page, **When** the developer moves through history or
   navigates to another same-origin path from the palette, **Then** the rim
   appears for that load.
4. **Given** the rim is visible during a load, **When** the load finishes and the
   new document is ready, **Then** the rim fades away on its own without the
   developer dismissing it.
5. **Given** an in-place load is in progress, **When** the developer looks at the
   guest page, **Then** the page remains visible underneath the rim (no
   full-screen veil is raised).
6. **Given** a reload triggered from the command palette or the drag strip's
   reload button, **When** it runs, **Then** the same rim appears as for the
   keyboard shortcut.
7. **Given** a window that has never loaded a target (blank/new window),
   **When** a reload is triggered, **Then** no rim is shown (there is nothing to
   reload).

---

### User Story 2 - Distinguish a Hard Reload (Priority: P2)

A developer presses the hard-reload shortcut (or runs "Hard Reload") to bypass
the cache and fetch everything fresh. The rim that appears is visibly different
from the normal-load rim — a heavier inner rim that trails the base pulse by
about 180 ms — so at a glance the developer can tell which kind of reload is
running, without reading a label. The two rims share the same placement and
lifetime (four edges, disappears when loading finishes); only the visual
character differs.

**Why this priority**: Hard reloads are the more disruptive, cache-busting
operation, and conflating them with a normal refresh hides that. A distinct
visual keeps the two operations unambiguous while reusing the same lightweight
surface, so it builds directly on P1.

**Independent Test**: Trigger a hard reload and confirm the rim that appears
differs visibly from the normal-load rim, while occupying the same four-edge
placement and disappearing on completion.

**Acceptance Scenarios**:

1. **Given** a loaded page, **When** the developer triggers a hard reload,
   **Then** a rim appears with a heavier inner rim whose visual treatment is
   distinct from the normal-load rim.
2. **Given** a hard reload in progress, **When** the developer compares it side
   by side with a normal load, **Then** the two are distinguishable by motion
   and/or weight alone, with no text label required.
3. **Given** a hard reload finishes, **When** loading completes, **Then** its
   rim fades away just like the normal one.

---

### User Story 3 - The Rim Does Not Fight Other Surfaces (Priority: P3)

The rim is one more transient surface in a window that already has a loading
veil, a failure view, a blank watermark, and several badges. It must compose with
them without duplicating or obscuring their meaning: it yields to the full-screen
veil and failure view when those are active, it does not appear for the loads
that the veil owns (cold starts, site switches, and failure loads), and repeated
or overlapping loads keep a single, coherent rim rather than stacking.

**Why this priority**: Correctness of composition matters for a tool whose value
is a clean viewport, but it is secondary to the rim existing at all.

**Independent Test**: Trigger loads in combination with site switches, failure,
and repeated reloads; confirm at most one rim is shown and it never overlaps or
contradicts the veil/failure view.

**Acceptance Scenarios**:

1. **Given** a site switch or a palette navigation to another origin is in
   progress (full-screen veil raised), **When** a reload is also triggered,
   **Then** no separate rim appears; the veil remains the sole loading surface.
2. **Given** the failure view is showing, **When** the developer retries (which
   reloads), **Then** the failure view is replaced by the normal veil flow rather
   than showing a rim.
3. **Given** a load is already in progress, **When** the developer triggers
   another reload, **Then** the rim stays single (it refreshes/continues rather
   than stacking a second one).
4. **Given** an in-place load is in progress, **When** the developer navigates to
   a different target that raises the veil, **Then** the rim disappears and the
   veil takes over.
5. **Given** a load fails, **When** loading ends in failure, **Then** the rim
   disappears and the failure view appears.
6. **Given** a loaded page, **When** the developer follows a link, moves through
   history, or navigates to another same-origin path from the palette, **Then**
   the rim appears and the veil does not.

---

### Edge Cases

- What happens when a reload is triggered while the page is still loading from a
  previous navigation? The rim reflects the new load; the prior load's veil
  behavior is unaffected.
- What happens when the page reloads itself (for example via `location.reload()`
  or a meta refresh)? A normal rim appears, since the page is loading; it is
  indistinguishable from a tool-triggered normal reload.
- What happens when a link click targets another origin? The current page stays
  visible until the new document commits, so the normal rim appears (the veil is
  reserved for a target load that deliberately replaces the page).
- What happens when DevTools is docked open? The rim wraps the guest page area,
  so it does not paint over the docked panel and is not duplicated.
- What happens when the window is in titlebar (docked strip) mode? The rim wraps
  the guest page area below the docked strip, so it never paints over the strip.
- What happens when the shell is in a dark theme but the guest page is light (or
  the reverse)? The rim keeps a theme-tinted dark contrast ring plus the accent
  core, so its edge remains visible on white and on dark pages.
- What happens when reduced motion is requested by the OS? The rim's animation is
  suppressed or replaced by a static treatment, while still clearly indicating
  that a load is in progress.
- What happens on a very fast load (completes within a single frame)? The rim may
  not become visible at all, or may flash briefly; this is acceptable as long as
  no stale rim remains.
- What happens when a hard reload redirects? The hard rim survives the redirect
  and the heavier inner rim stays for the whole load.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show a loading rim while a page is reloading or
  while a main-frame navigation is loading and the guest page is already visible.
  The rim MUST convey activity through indeterminate motion, with no percentage,
  numeric progress, or proportionally filling bar.
- **FR-002**: The rim MUST wrap all four edges of the guest page area in a narrow
  band (not a full-screen overlay), so the guest page remains visible underneath.
- **FR-003**: The rim MUST appear for keyboard-shortcut and command-palette
  invocations of "Reload" and "Hard Reload", the drag strip's reload affordance,
  link clicks, history moves, and same-origin palette navigations.
- **FR-004**: The system MUST provide a visually distinct rim for a hard reload,
  distinguishable from the normal-load rim by motion and/or weight without
  requiring a text label. A normal load breathes a soft rim; a hard reload adds a
  heavier 2px inner rim that trails the base pulse by about 180 ms.
- **FR-005**: The rim MUST disappear automatically when the load finishes
  loading (success or failure).
- **FR-006**: The rim MUST NOT appear when the full-screen veil is raised —
  cold starts, site switches, and loads from the failure view. The veil remains
  the sole loading surface for those.
- **FR-007**: The rim MUST yield to the full-screen veil and the failure view:
  when either is active, no separate rim is shown.
- **FR-008**: The system MUST show at most one rim at a time; a load triggered
  while one is already showing refreshes or continues it rather than stacking a
  second.
- **FR-009**: The rim MUST be positioned around the guest page area so it does
  not paint over the docked strip/titlebar or docked DevTools; in titlebar mode
  it wraps the page area below the strip.
- **FR-010**: The rim's colors and motion MUST derive from the Tlapalli theme
  tokens (mineral variants, dark/light modes), not ad-hoc values, and its
  typography MUST remain consistent with the shell (no new font families).
- **FR-011**: The rim MUST NOT intercept pointer input; it is a non-interactive,
  display-only surface.
- **FR-012**: The rim MUST NOT modify the guest page's content, styles, or
  scripts (constitution II); it renders in the shell overlay only.
- **FR-013**: The rim MUST respect the OS "reduced motion" preference,
  degrading its animation to a static treatment while still conveying progress.
- **FR-014**: The rim MUST be previewable in development builds (dev-only,
  absent from packaged builds) so its look and motion can be iterated, consistent
  with other transient surfaces.
- **FR-015**: The rim MUST clear when a load is superseded by a target load that
  raises the veil.
- **FR-016**: The rim MUST remain visible on both light and dark guest pages,
  regardless of the shell's color mode, by pairing the accent core with a
  theme-tinted dark contrast ring and a harsher inner shadow.
- **FR-017**: In-place navigations MUST use the normal rim; the hard rim is
  reserved for the Hard Reload command.

### Key Entities *(include if feature involves data)*

- **Load Rim State**: whether a load is in progress, and, if so, whether it is a
  normal or hard rim. Transient; not persisted.

### Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can tell within one second of triggering a reload or an
  in-place navigation that a load is in progress, by the presence of the rim.
- **SC-002**: In a side-by-side comparison, 100% of observers can distinguish a
  hard reload from a normal load from the rim alone, with no text label.
- **SC-003**: The rim is never visible once a load has finished, for both success
  and failure outcomes (no stale rim after 1 second).
- **SC-004**: During an in-place load, the guest page remains visible underneath
  the rim in 100% of cases (no full-screen veil is raised).
- **SC-005**: No more than one rim is ever on screen at once, including under
  rapid repeated loads.
- **SC-006**: The rim never blocks pointer input: during a load, every click and
  hover reaches the guest page exactly as it would without the rim.
- **SC-007**: The rim is clearly visible on a white page with both a light shell
  theme and a dark shell theme (no washed-out edge).
- **SC-008**: Following a link, moving through history, and navigating to another
  same-origin path from the palette each show the rim and never the full-screen
  veil.

## Assumptions

- The existing normal-reload and hard-reload actions, in the command palette and
  on their keyboard shortcuts, remain the triggers; this feature adds feedback
  only and does not change reload semantics or cache behavior.
- "Hard reload" keeps its existing meaning (bypass cache); only the rim's visual
  treatment differs.
- The rim is a shell-overlay surface, consistent with the zoom and viewport-size
  badges, and is exempt from the zero-pixel chrome rule only while a load is in
  progress (it is transient).
- A load that keeps the current page visible uses the rim; a load that replaces
  the page (cold start, site switch, failure view) uses the full-screen veil.
- Reloads and navigations initiated by the guest page itself are treated as
  normal loads for rim purposes; only the Hard Reload command uses the hard rim.
- Dev-preview affordances for this surface are dev-only and absent from packaged
  builds, per the constitution's development workflow.
- Reduced-motion handling follows the same convention as other animated shell
  surfaces.
