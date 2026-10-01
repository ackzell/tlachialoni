# Feature Specification: Trackpad Swipe History Navigation

**Feature Branch**: `015-trackpad-swipe-navigation`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "we have pending work on the touchpad support. I want to be able to use two finger navigation for going back and forward on my history. I also want a subtle overlay that signals the navigation is armed and will fire if I continue swiping on the direction, and cancel it if I stop while the signal is on."

## Context

`specs/002-trackpad-navigation/` shipped the mouse thumb buttons but parked the
trackpad half of its scope: a two-finger swipe that moves through the site's
history the way Safari and Chrome do, without hijacking ordinary horizontal
scrolling. That parked work left two things unresolved — the gesture itself, and
the confidence problem that comes with a "sticky" threshold: the developer cannot
feel how far the swipe has travelled, so they cannot tell whether the tool is
about to navigate or whether lifting their fingers will simply do nothing.

This feature finishes the trackpad gesture and pairs it with a small piece of
feedback: while a horizontal gesture is in progress and has passed the point at
which navigation is *possible*, a subtle overlay appears on the edge of the window
toward which the history would move. Continuing the swipe past a commit distance
fires the navigation; lifting the fingers while the overlay is showing cancels it
and the overlay fades away. The overlay makes the sticky gesture legible instead
of a black box, and it disappears so completely that a window at rest is still
zero chrome (constitution I).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Two-finger swipe moves through history (Priority: P1)

The developer, working in the guest page, swipes two fingers horizontally across
the trackpad. A swipe to the right goes back; a swipe to the left goes forward —
the same mapping as Safari and as the mouse thumb buttons already shipped in
`specs/002-trackpad-navigation/`. The gesture commits once, at most one history
step per swipe, and never fires from ordinary vertical or horizontal scrolling.

**Why this priority**: This is the core request and the unfinished half of the
trackpad feature. Everything else is feedback on top of it; without a working
gesture there is nothing to signal.

**Independent Test**: Visit two distinct pages in the guest page. Swipe two
fingers right and confirm the previous page loads; swipe left and confirm the
next page loads. Then scroll vertically and horizontally (including inside a
horizontally scrollable element) and confirm no navigation occurs.

**Acceptance Scenarios**:

1. **Given** the window has a back history entry, **When** the developer swipes two
   fingers to the right, **Then** the previous page in history loads.
2. **Given** the window has a forward history entry, **When** the developer swipes
   two fingers to the left, **Then** the next page in history loads.
3. **Given** the guest page is taller than the window, **When** the developer
   scrolls vertically with two fingers, **Then** the page scrolls and history does
   not move.
4. **Given** the guest page (or an element on it) scrolls horizontally, **When** the
   developer scrolls it horizontally with two fingers, **Then** the content scrolls
   and history does not move.
5. **Given** a single horizontal swipe, **When** the gesture completes and its
   momentum dies out, **Then** history has moved exactly one entry, not several.
6. **Given** the window has no history in the swiped direction, **When** the
   developer swipes, **Then** nothing navigates and no armed signal appears.

---

### User Story 2 - The overlay shows the swipe is armed (Priority: P1)

While a horizontal swipe is in progress and has reached the point where a
continued swipe would navigate, a subtle overlay appears on the edge of the window
the history would move toward — the left edge for Back, the right edge for Forward.
It reads as "let go now and nothing happens; keep going and this will fire." If the
developer lifts their fingers before the commit distance, the overlay fades away
and history is untouched.

**Why this priority**: This is the explicit second half of the request. Without it
the sticky threshold is unpredictable; with it the gesture is legible. It is
independently testable against the armed state alone.

**Independent Test**: Begin a horizontal swipe on a page with back history and stop
part-way, holding the fingers still. Confirm the overlay appears on the correct
edge and stays for as long as the fingers hold. Lift the fingers without
continuing and confirm the overlay leaves and no navigation happened.

**Acceptance Scenarios**:

1. **Given** a page with back history, **When** the developer starts a rightward
   two-finger swipe and holds it mid-gesture past the arm distance, **Then** a
   subtle overlay appears on the left edge signalling that Back is armed.
2. **Given** a page with forward history, **When** the developer swipes left past
   the arm distance, **Then** the overlay appears on the right edge signalling that
   Forward is armed.
3. **Given** the overlay is showing, **When** the developer lifts their fingers
   before the swipe reaches the commit distance, **Then** the overlay fades away,
   history does not move, and no navigation is queued.
4. **Given** the overlay is showing and the swipe continues past the commit
   distance, **When** the commit distance is crossed, **Then** the navigation fires
   and the overlay clears.
5. **Given** the overlay has appeared and then the gesture reverses direction back
   below the arm distance, **When** the fingers return toward the start, **Then**
   the overlay clears without navigating.
6. **Given** no gesture is in progress, **Then** nothing is painted for this
   feature and the window shows zero chrome.

---

### User Story 3 - The gesture feels native and does not fight the page (Priority: P2)

The swipe respects what the page is doing: a mostly vertical scroll, a horizontal
scroll inside the page's own scrollable region, or a scroll that begins vertical
and drifts horizontal must not trip navigation. Once a gesture has fired, the
released momentum must not fire again, and a new navigation requires a new,
deliberate gesture.

**Why this priority**: It protects ordinary scrolling from being hijacked — the
risk `specs/002-trackpad-navigation/` called out when it parked the work — so the
feature is trustworthy in daily use.

**Independent Test**: On a page with both vertical and horizontal overflow, perform
vertical scrolls, diagonal scrolls, and scrolls inside the horizontal element,
confirming no navigation; then swipe to navigate and confirm the trailing momentum
does not navigate a second time.

**Acceptance Scenarios**:

1. **Given** a page with a horizontally scrollable element under the pointer,
   **When** the developer scrolls it fully to one side, **Then** the element
   scrolls and history is unchanged.
2. **Given** a vertical scroll that drifts horizontally part-way, **When** the
   gesture ends, **Then** no navigation occurred because the gesture's dominant
   direction was vertical.
3. **Given** a swipe that has already navigated, **When** the momentum continues in
   the same direction after the fingers lift, **Then** no further navigation
   occurs.
4. **Given** a swipe that fired Back, **When** the developer immediately swipes Back
   again as a new gesture, **Then** the second navigation is honored.

---

### Edge Cases

- **History boundary reached**: if the window cannot go back (or forward), the
  gesture neither navigates nor arms the overlay; the swipe is treated as an
  ordinary scroll, so the page can still scroll normally.
- **Overlay showing, then a page navigation from another source** (`⌘←`/`⌘→`, a
  link click, a palette navigation): the overlay clears and the in-flight gesture is
  abandoned; no second navigation fires from it.
- **Gesture started over DevTools**: when DevTools has focus and is docked, a
  two-finger horizontal swipe over the DevTools area scrolls DevTools rather than
  navigating history; the gesture is treated as a plain scroll there.
- **Guest page is blank / never loaded**: a swipe on a window with no target does
  nothing and shows no overlay.
- **Window loses focus mid-gesture** (Space switch, another app): the overlay clears
  and the gesture is abandoned without navigating.
- **Reduced motion**: the overlay appears and clears instantly, with no fade; the
  navigation behavior is otherwise identical.
- **Multiple windows**: each window detects and signals its own gesture
  independently; a swipe in one window never arms or navigates another
  (constitution V).
- **Rapid alternating swipes**: back and forward swipes in quick succession each
  follow the currently available history; the feature never gets stuck armed.
- **Mouse drivers that synthesize a discrete swipe event** (the Logitech-style
  thumb buttons from `specs/002-trackpad-navigation/`): these keep navigating
  exactly as they do today; having no in-progress gesture, they show no overlay.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A two-finger horizontal swipe in the guest page MUST navigate browser
  history: a swipe to the right MUST go Back, a swipe to the left MUST go Forward,
  matching Safari and the existing mouse thumb buttons.
- **FR-002**: The gesture MUST be "sticky": history MUST NOT move until the swipe
  passes a commit distance, so ordinary scrolling never triggers navigation.
- **FR-003**: A vertical two-finger scroll MUST NOT navigate history, and a
  horizontal scroll of the page or of a scrollable element inside it MUST NOT
  navigate history; only a deliberate horizontal swipe crosses the thresholds.
- **FR-004**: A gesture MUST fire at most one navigation, and the released momentum
  MUST NOT fire additional navigations; a further navigation MUST require a new
  gesture.
- **FR-005**: While a horizontal gesture passes an arm distance (below the commit
  distance) and history exists in that direction, the tool MUST show a subtle
  overlay on the edge of the window toward which history would move — the left edge
  for Back, the right edge for Forward — signalling that navigation is armed.
- **FR-006**: The overlay MUST clear, with no navigation, when the gesture ends
  before the commit distance, when the gesture reverses back below the arm
  distance, when the window loses focus, or when the in-flight gesture is otherwise
  abandoned.
- **FR-007**: When the gesture crosses the commit distance, the navigation MUST fire
  and the overlay MUST clear.
- **FR-008**: The overlay MUST NOT appear when history in the swiped direction is
  unavailable; the swipe then behaves as an ordinary scroll.
- **FR-009**: The overlay MUST be painted by the shell, never injected into or
  layered inside the guest page, and the feature MUST NOT modify the guest page's
  DOM, styles, or scripts (constitution II).
- **FR-010**: The overlay MUST be non-interactive: it MUST NOT capture pointer or
  keyboard input, and it MUST NOT block the page, the command palette, the drag
  band, or any other shell surface.
- **FR-011**: The overlay MUST be transient — it exists only while the gesture is
  armed, and once the gesture ends, the navigation fires, or the gesture is
  abandoned, visible chrome MUST return to zero pixels (constitution I).
- **FR-012**: The overlay MUST be subtle and consistent with the shell's motion and
  Tlapalli theme, and it MUST respect `prefers-reduced-motion` by appearing and
  clearing instantly rather than fading.
- **FR-013**: Gesture detection MUST be scoped to the window's own focused, visible
  guest view, MUST stop on blur or close, and MUST NOT perform per-frame work; idle
  and in-use resource use attributable to the feature MUST be negligible.
- **FR-014**: Keyboard history navigation (`⌘←` / `⌘→`) and the existing mouse
  thumb-button behavior MUST be unchanged; the gesture is an additional route, not
  a replacement (constitution III).
- **FR-015**: Each window MUST detect and signal its own gesture independently
  (constitution V).
- **FR-016**: While DevTools has focus, a horizontal swipe over the DevTools area
  MUST scroll DevTools and MUST NOT navigate the guest page's history; the gesture
  applies only when the guest view is the focused surface.

### Key Entities

- **Horizontal gesture**: a two-finger trackpad movement, with a begin/update/end
  lifecycle, that has a dominant horizontal direction and a signed travelled
  distance; the unit the arm and commit thresholds are measured against.
- **Arm state**: the transient, never-persisted condition in which a gesture has
  passed the arm distance with history available in that direction; the overlay's
  visibility is bound to it.
- **Arm distance / commit distance**: the two tuning thresholds that separate
  "ordinary scroll", "armed (overlay showing, still cancellable)", and "fire the
  navigation".
- **History direction**: Back (swipe right) or Forward (swipe left); determines
  which edge the overlay appears on and which history move is attempted.
- **Navigation overlay**: the transient shell surface — a subtle directional
  indicator on the left or right edge — that signals an armed navigation and clears
  on cancel, commit, or abandonment.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A deliberate two-finger horizontal swipe navigates exactly one history
  step in the correct direction in 100% of trials on a page with history in that
  direction.
- **SC-002**: Vertical scrolling, horizontal scrolling of page content, and diagonal
  scrolling produce zero history navigations across a test pass that includes a
  vertically and horizontally overflowing page.
- **SC-003**: The overlay becomes visible within a fraction of a second of the
  gesture passing the arm distance, and is fully gone within a fraction of a second
  of the gesture ending, reversing, or committing; at rest the feature paints zero
  pixels.
- **SC-004**: A swipe followed by its natural momentum results in exactly one
  navigation in 100% of trials (no momentum double-fire).
- **SC-005**: Lifting the fingers while the overlay is showing, before the commit
  distance, cancels the navigation in 100% of trials — the overlay leaves and the
  page does not move.
- **SC-006**: The overlay never intercepts an interaction: with it showing, the
  page, palette, drag band, and other controls behave exactly as they do without a
  gesture in progress.
- **SC-007**: The guest page is never modified by the feature: no DOM, style, or
  script changes are observable, and no residual elements or listeners remain after
  a gesture.
- **SC-008**: A developer judge finds the overlay subtle and informative — it
  communicates the armed direction at a glance and never draws attention when no
  gesture is in progress.

## Assumptions

- Direction convention follows Safari and `specs/002-trackpad-navigation/`: swipe
  right = Back, swipe left = Forward.
- The gesture is read from the guest view's high-precision horizontal scroll
  signals (`gestureScrollBegin` / `Update` / `End`, and/or `mouseWheel` with precise
  deltas, per the 002 findings); mouse-wheel vertical scrolling is excluded, and the
  discrete `swipe`/`app-command` events used for mouse thumb buttons are unaffected.
- Two thresholds are used: an **arm** distance at which the overlay appears while
  the gesture is still cancellable, and a larger **commit** distance at which the
  navigation fires immediately as the swipe continues. Exact distances are tuning
  values settled at planning, with the arm distance plainly below the commit
  distance so the overlay always has a visible sending-off window.
- A gesture is treated as horizontal only when its horizontal travel dominates its
  vertical travel; this is how ordinary vertical scrolling is protected.
- The overlay is a small directional indicator (an edge chevron/glow in the
  direction of travel), drawn from the shell's Tlapalli tokens and the shared motion
  values; exact visual treatment is tuning, and the constraint is only that it be
  subtle, directional, and transient.
- Navigation fires from the guest view only; DevTools keeps its own scroll behavior.
- macOS trackpad is the primary target, consistent with the project's macOS-only
  shipping assumption; the behavior degrades to no-op rather than mis-navigating on
  inputs without a gesture lifecycle.
- The mouse thumb-button behavior shipped in `specs/002-trackpad-navigation/`
  remains exactly as is, including its platform-specific event mapping.

## Dependencies

- The findings and gesture-event discovery in
  `specs/002-trackpad-navigation/` (`input-event` gesture events and their native
  delta fields), which this feature builds on rather than re-derives.
- The shell overlay, shell-mode state machine, and per-window lifecycle in
  `src/main/shell/window.ts`, and the shell surface model in `src/shared/shell.ts`.
- The shared motion values and reduced-motion handling from
  `specs/004-shell-motion/` for the overlay's appear/clear treatment.
- The Tlapalli token system (`--tb-*`) for the overlay's color, from
  `specs/001-minimal-browser/`.
- The existing history commands (`view.back` / `view.forward`) and keyboard routes
  from `specs/001-minimal-browser/`.
