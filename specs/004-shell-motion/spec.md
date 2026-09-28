# Feature Specification: Shell Motion

**Feature Branch**: `004-shell-motion`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "I want subtle but visible animation in the minimal chrome so it looks more polished: the command palette could grow and shrink as it comes and goes; once the drag strip is visible the location reveals itself with a per-word fade-in and the page-control buttons drop in sequentially; when I type and the fuzzy search has matches, they should animate subtly too. No part of the UI should spontaneously appear into existence or go away instantly, but it must stay subtle and never be distracting or cause discomfort."

## Clarifications

### Session 2026-09-27

- Q: Does the drag strip's per-segment location reveal replay whenever the target changes while the strip is already visible, or only when the strip itself is revealed? → A: Every navigation — a target change while the strip is visible replays the reveal.
- Q: How are the location's segments (the "words") defined for the staggered reveal? → A: `:` and `/` separate the segments; other characters (including `?`) stay within a segment. Example: `localhost:5173/api/users?tab=1` → `localhost`, `5173`, `api`, `users?tab=1`.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The palette grows and shrinks (Priority: P1)

The developer presses `⌘P` and the palette panel grows into place with a quick, subtle scale-and-fade while the backdrop dims in; dismissing it — by `Esc`, by activating a row, or by clicking outside — shrinks it away. Typing works the moment it is invoked; the entrance is never something to wait for.

**Why this priority**: The palette is the most frequently invoked surface and the most jarring pop today, and it is self-contained, so it delivers visible polish on its own.

**Independent Test**: Press `⌘P` and watch the panel enter; type immediately to confirm no delay; dismiss and watch it leave; toggle it again mid-entrance and confirm the motion reverses cleanly without residue.

**Acceptance Scenarios**:

1. **Given** the shell is idle with no surface invoked, **When** the developer invokes the palette, **Then** the backdrop and panel transition in — the panel growing and fading — rather than appearing in a single step.
2. **Given** the palette is still opening, **When** the developer types immediately, **Then** the first keystroke is accepted without waiting for the entrance to finish.
3. **Given** the palette is open, **When** it is dismissed by `Esc`, a row activation, or an outside click, **Then** it shrinks and fades away, and afterwards zero chrome remains.
4. **Given** the palette is mid-entrance or mid-exit, **When** the developer toggles it again, **Then** the transition reverses without a flicker, jump, or queued pause.

---

### User Story 2 - The drag strip introduces itself (Priority: P1)

Pressing `⌘B` eases the strip surface in; the target location then reveals itself segment by segment with a staggered fade — segments separated by `:` and `/` — and the action buttons (reload, DevTools, close) drop in one after another after the location. Every navigation while the strip is visible replays the location reveal, so a new target reads clearly instead of swapping in place.

**Why this priority**: This is the explicitly requested centerpiece — per-segment location reveal plus sequential controls — and the strip exists purely to be seen.

**Independent Test**: Toggle the strip and watch the surface → segments → buttons sequence; navigate to a new target and confirm the segment reveal replays; toggle the strip off and confirm nothing cuts abruptly.

**Acceptance Scenarios**:

1. **Given** the strip is hidden, **When** the developer presses `⌘B`, **Then** the strip surface eases in, the location segments fade in in order, and the action buttons appear sequentially — no element cuts in.
2. **Given** the strip is visible, **When** the target changes (palette navigation, in-page link, history move), **Then** the location segments replay the staggered reveal for the new target.
3. **Given** the strip is visible, **When** the developer hides it, **Then** its contents leave smoothly before the chrome reaches zero pixels.
4. **Given** a target with many segments (a long path or query string), **Then** the reveal compresses its stagger and still completes within the same short budget.
5. **Given** the strip is entering, **Then** dragging the window by the strip and using its buttons are available throughout and after the entrance — motion never blocks interaction.

---

### User Story 3 - Palette matches animate as the query changes (Priority: P2)

When typing changes the fuzzy result set, newly matching rows unfold into place with a subtle staggered height-and-fade instead of snapping into the list; rows that leave shrink and fade out. Rows that remain in the result set stay still — they must not re-animate on every keystroke.

**Why this priority**: Typing is continuous and this is the highest-risk animation for distraction, so it lands after the two discrete surfaces.

**Independent Test**: Type a query character by character and watch the rows; confirm only newly entering rows animate, the list keeps pace with fast typing, and the selection stays predictable.

**Acceptance Scenarios**:

1. **Given** the palette is open, **When** the query changes so new rows match, **Then** the entering rows unfold in with a staggered animation while surviving rows remain still.
2. **Given** a row stops matching, **When** it leaves, **Then** it shrinks and fades out without the list growing, jumping, or pushing the row under the pointer.
3. **Given** the developer types rapidly, **Then** animations never queue, leave duplicates, or retain departed rows, and each keystroke's results are visible immediately.
4. **Given** the result set becomes empty, **Then** the empty state appears with the same treatment, and matches entering afterwards are treated the same way.
5. **Given** the selection highlight moves between rows (keyboard or pointer), **Then** it moves without the list jumping or re-animating.
6. **Given** a very long target label, **Then** the row truncates with an ellipsis and its height is unchanged, so the list height stays a function of the row count alone.

---

### User Story 4 - Loading and failure states transition (Priority: P2)

The loading veil fades away to reveal the loaded page; the failure view fades in instead of replacing the screen in a single step, and fades out when Retry, Edit URL, or Go Back moves to another state. The "nothing pops" rule applies to state changes, not only to invoked surfaces.

**Why this priority**: Needed for the shell not to feel half-animated; it follows the same global rule as Stories 1–3.

**Independent Test**: Point the tool at a slow target and watch the veil leave; point it at a dead port and watch the failure view arrive; press Retry and watch it leave.

**Acceptance Scenarios**:

1. **Given** the loading veil is showing, **When** the target is ready, **Then** the veil fades out to reveal the page without a flash of empty frame.
2. **Given** a target fails to load, **When** the failure is reported, **Then** the failure view fades in over the themed background rather than cutting in.
3. **Given** the failure view is showing, **When** the developer chooses Retry, Edit URL, or Go Back, **Then** the view fades out as the next state (veil or page) arrives.
4. **Given** a new load starts while the veil is leaving, **Then** the veil returns promptly with no double-flash and no dropped frame.

---

### User Story 5 - Restrained micro-feedback (Priority: P3)

Pointer feedback eases rather than snaps: palette row fills and selection, strip button hover/active states, and failure-view button states transition briefly instead of blinking on and off at the edge of the pointer.

**Why this priority**: It completes the "nothing appears or disappears instantly" rule, but it is the most optional and the easiest to cut if it ever reads as noise.

**Independent Test**: Move the pointer across palette rows and strip buttons and observe easing; sweep quickly and confirm no queued trail of transitions.

**Acceptance Scenarios**:

1. **Given** the pointer moves onto an interactive row or button, **Then** its fill or outline eases in briefly rather than cutting.
2. **Given** the pointer sweeps across several targets quickly, **Then** no trail of queued transitions occurs and the final state is correct.

---

### Edge Cases

- **Rapid `⌘B` toggling**: the entrance reverses mid-flight; the final state matches the last command; no stuck half-visible strip.
- **Palette invoked over another state**: invoked while the veil is leaving or the failure view is showing, and dismissing it returns to the state underneath without re-animating that state.
- **Target changes during the strip reveal**: a link click or history move during a segment reveal supersedes it; two reveals never interleave.
- **Short targets**: a bare host or `localhost:3000` (which splits into `localhost` and `3000`) reveals without an awkward pause; a single-segment target fades as one unit.
- **Very long targets**: a query string containing many `:` and `/` compresses the stagger and still respects the shared budget.
- **Reduced motion enabled**: every transition is instant; all end states are identical to the animated versions; toggling the preference applies from the next transition.
- **Typing during the palette entrance**: results are already updating; no keystroke is dropped.
- **Quit mid-transition**: quitting while any transition runs leaves no error or partial state.
- **Window resize during the strip reveal**: the reveal continues without layout artifacts.
- **Theme re-skin**: variant and mode changes remain instant (existing behavior, out of scope for motion).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every transient shell surface — command palette, drag strip, loading veil, and failure view — MUST animate both when it appears and when it disappears; none may cut abruptly.
- **FR-002**: All transitions MUST be brief and consistent across surfaces, settling fast enough to read as immediate (target: under ~300 ms per surface; a staggered sequence under ~500 ms in total).
- **FR-003**: Entrance motion MUST NOT delay interactivity: palette focus and typing are available at invocation, strip controls are usable as soon as the strip is visibly present, and no keystroke may be dropped while a transition runs.
- **FR-004**: Every transition MUST be interruptible and reversible mid-flight; reversing MUST NOT flicker, jump, queue behind the previous transition, or leave residual chrome.
- **FR-005**: When the operating system's reduced-motion preference is enabled, all transitions MUST collapse to instant state changes — no fades, movement, or scaling — while end states remain identical.
- **FR-006**: Motion MUST remain subtle: opacity, small positional offsets, and small scale changes only; no bounce, overshoot, spin, pulse, or looping decoration. The loading spinner is the only continuous animation.
- **FR-007**: Once every surface is dismissed, visible chrome MUST return to zero pixels, regardless of where a transition was interrupted.
- **FR-008**: Shell motion MUST NOT alter the guest page's layout, viewport, or content; the strip continues to overlay without reflowing the page.
- **FR-009**: The palette MUST grow on entrance and shrink on exit (scale plus fade), with the backdrop fading in and out around it.
- **FR-010**: The drag strip MUST ease its surface in, then reveal the location as segments split on `:` and `/` with staggered fades, then bring in its action controls sequentially, all within the shared budget.
- **FR-011**: The location reveal MUST replay on every target change while the strip is visible, and whenever the strip is revealed.
- **FR-012**: For targets with many segments, the stagger MUST compress so total reveal time stays within the shared budget regardless of target length.
- **FR-013**: Palette result rows MUST animate subtly when they enter the result set due to a query change, while rows that remain MUST NOT re-animate. Rows MUST also animate on exit, and neither motion may accumulate, duplicate, or resize the list. Implemented with Vue's `TransitionGroup` + `:css="false"` JS hooks over the Web Animations API (`CommandPalette.vue`); requires stable row keys (FR-024) and a fixed row height (FR-025).
- **FR-014**: Palette result animations MUST NOT interfere with typing responsiveness, keyboard navigation, or selection behavior; the list MUST keep pace with the fastest realistic typing.
- **FR-015**: The loading veil MUST fade away when the target is ready and MUST be able to return promptly if a new load starts while it is leaving.
- **FR-016**: The failure view MUST fade in when a target fails and fade out when Retry, Edit URL, or Go Back transitions to another state.
- **FR-017**: Interactive micro-states (hover and selection fills on rows and buttons) MUST ease rather than cut, and MUST NOT queue when the pointer moves quickly.
- **FR-018**: Motion MUST NOT gate or delay any keyboard affordance; everything reachable from the keyboard remains reachable at full speed.
- **FR-024**: Every palette row MUST carry a stable DOM identity that does not change while the row persists, so a changing label (the `Open <query>` row) never registers as a new element.
- **FR-025**: Palette rows MUST have a fixed height with label ellipsis rather than wrapping, so a long target can never reflow the list and the row animation animates between two known heights.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In normal (non-reduced-motion) use, none of the four transient surfaces appears or disappears in a single step — verified by slow-motion capture of each show/hide.
- **SC-002**: Every single-surface transition settles within 300 ms, and the full strip sequence (surface → segments → buttons) within 500 ms, from trigger to settled state.
- **SC-003**: The palette accepts typing immediately: the first keystroke after invocation is reflected without perceptible delay, and zero keystrokes are dropped while any transition runs.
- **SC-004**: With reduced motion enabled, 100% of surfaces change instantly, and every end state matches the animated version.
- **SC-005**: Interrupting any transition (rapid toggle) ends in the state matching the last command 100% of the time, with zero residual chrome.
- **SC-006**: The guest page's layout and viewport are unchanged by shell motion in all cases (strip overlays only; no reflow).
- **SC-007**: During a normal work session the developer judges the motion subtle and non-distracting: no transition repeats on its own and none draws attention when unused.
- **SC-008**: While typing a query of any length, the palette list never accumulates or duplicates rows: the settled row count always equals the number of matching rows, and the list height stays a function of that count.

## Assumptions

- "Subtle" means short durations, small offsets and scales, and no overshoot; the existing loading spinner keeps its continuous spin because it is a progress indicator, not an entrance.
- Theme variant and mode changes remain instant (recorded behavior in `001-minimal-browser/validation.md` S7); crossfading re-skins is out of scope.
- The strip continues to overlay the page and never reflows it (`001-minimal-browser/` Clarifications); shell motion preserves that.
- The reduced-motion fallback is a full instant change, not a shortened animation.
- Motion applies to shell surfaces only; the guest page is never touched (constitution II).
- Timings come from one small shared set of motion values so all surfaces feel like one system; concrete values are settled at planning.
- macOS remains the only target platform (`001-minimal-browser/` Assumptions).
- No new user-facing controls are introduced; motion follows the system reduced-motion preference and is otherwise not configurable.