# Phase 0 Research: Shell Motion

Decisions are recorded as Decision / Rationale / Alternatives considered.

## R1. Animation mechanism: Vue built-in transitions over CSS

**Decision**: Use Vue 3's `<Transition>` and `<TransitionGroup>` with scoped CSS
transitions and keyframes. Timings come from CSS custom properties defined once in
`styles/motion.css`.

**Rationale**: Vue is already a dependency and its transition lifecycle supplies
exactly what this feature needs: leave classes that keep an element mounted until
its exit finishes, enter/leave cancellation when a state flips mid-flight, and
`@after-leave` hooks for the settle ack. Interruption and reversal (spec FR-004)
come free. CSS keeps animation on the compositor (opacity/transform) with no
runtime work per frame.

**Alternatives considered**:

- *Web Animations API*: precise playback control, but every surface would need a
  hand-rolled lifecycle (mount/unmount timing, cancellation, cleanup), duplicating
  what Vue already exposes. Rejected as more code for no visible gain.
- *A motion library (Motion One, motion-v, anime.js)*: extra dependency, bundle
  weight, its own reduced-motion conventions, and imperative refs to manage —
  against the "small UI, no design system of its own" grain of the project.
  Rejected.
- *Pure CSS with manual mount management*: reimplements Vue's transition classes
  by hand. Rejected.

## R2. Exit coordination: renderer settle ack plus a main-side safety timeout

**Decision**: Add one renderer → main signal, `shell:settled`, sent after every
leave transition finishes (immediately under reduced motion). Main tracks the
shell view's current mode (`full`, `strip`, `hidden`) and defers a *smaller*
relayout for the two main-initiated collapses — `handleReady` (veil leaving) and
`toggleStrip` (strip hiding) — until the ack arrives or 400 ms elapse, whichever
comes first. Renderer-initiated closes keep applying immediately, because the
renderer already ordered them after its own leave: the palette only calls
`setPaletteVisible(false)` from `@after-leave`.

**Rationale**: `relayout()` currently decides everything from
`paletteOpen || showLoading || failed || stripVisible` and shrinks or hides the
shell `WebContentsView` synchronously. Main-initiated changes (`viewport:ready`,
the `⌘B` hotkey, which is handled by `before-input-event` in main) therefore cut
any exit before the renderer can animate it; renderer-initiated ones do not, as
long as the renderer delays its own IPC. Deferring *only the visual collapse* —
state broadcasts still go out immediately, so the renderer starts its leave right
away — keeps the timing source of truth in the renderer's CSS tokens while main
holds a dumb safety net (400 ms > the longest 200 ms surface leave plus the
capped strip sequence). Rapid toggles are handled by a supersede rule: a larger
desired mode applies immediately and clears the pending wait, and late acks with
nothing pending are no-ops.

**Alternatives considered**:

- *Main-side fixed grace delay before relayout*: duplicates durations in two
  processes, feels laggy when the renderer is slow, and races on rapid toggles.
  Rejected.
- *Renderer delays its own IPC only (no ack channel)*: covers palette close but
  cannot cover main-initiated `viewport:ready`, `⌘B`, or failure paths. Rejected
  as insufficient.
- *Never shrink the shell view; keep it full-window and make it click-through away
  from the strip*: would need `setIgnoreMouseEvents` routing and changes input
  behavior for the whole window. Rejected as a much larger change than the
  feature warrants.
- *No coordination; accept cut exits on main-initiated collapses*: violates
  FR-001 and the feature's whole premise. Rejected.

## R3. Motion tokens: project-local CSS custom properties, colors untouched

**Decision**: A new `src/renderer/src/styles/motion.css` defines a small named
set of timing tokens (three durations, two easings, one stagger step and cap, one
shift distance, one scale). `@media (prefers-reduced-motion: reduce)` clamps the
durations to `0.01ms` — not `0ms`, so transition events still fire — and zeroes
stagger, shift, and scale.

**Rationale**: Tlapalli is a color theme; it has no motion concept, and inventing
upstream tokens would misattribute and break the "colors derive from Tlapalli"
contract. Principle VI governs colors, and motion adds none: every painted value
stays a Tlapalli token, while timing lives beside `base.css` as renderer-local
styling. `0.01ms` keeps Vue's transition detection and `after-leave` hooks
working, so the settle ack still fires.

**Alternatives considered**:

- *Extend the Tlapalli generation pipeline with duration/easing tokens*:
  misattributes non-color values to an upstream theme that does not define them.
  Rejected.
- *TS constants injected as CSS variables at runtime (like `theme/apply.ts`)*:
  adds a runtime layer for values that never change; CSS media queries could no
  longer own the reduced-motion clamp. Rejected.
- *Inline literal values per component*: no shared vocabulary, drifts; violates
  the consistency requirement (FR-002). Rejected.

## R4. Strip choreography: keyed segment spans with capped CSS delays

**Decision**: `splitTargetLabel(label)` (pure, unit-tested) splits the display
label on `:` and `/`, dropping empty parts and keeping other characters
(including `?`) inside a segment. `DragStrip.vue` renders segments as spans keyed
by `target + index` with a `--i` custom property; enter delays are
`min(--i, cap) * stagger`. The key includes the target so a navigation re-mounts
the segments and replays the reveal (FR-011). The three action buttons reuse the
same mechanism with indices continuing after the segments, producing the
sequential drop-in (FR-010). The group animates the outgoing label with a fast
fade so a target change does not cut the old label.

**Rationale**: CSS-only stagger with a capped index satisfies both the replay and
the compression requirements without JavaScript scheduling, and the pure splitter
is the only piece that needs a unit test.

**Alternatives considered**:

- *JavaScript timers per segment*: more moving parts, needs cleanup on
  interruption, no benefit. Rejected.
- *`<TransitionGroup>` keyed only by index*: Vue reuses nodes on target change, so
  the reveal would not replay. Rejected.
- *Splitting on every URL boundary character (`/`, `:`, `.`, `?`, `&`, `=`)*:
  over-fragments query strings (e.g. a nested URL becomes many units with pauses).
  Rejected — spec fixes `:` and `/` only.

## R5. Palette: panel grow/shrink, rows enter-only and stagger-free

**Decision**: The palette root (`.palette-backdrop`) carries the transition:
backdrop opacity, panel opacity + scale from 0.97 (transform-origin top center).
Rows use `<TransitionGroup name="palette-rows" tag="ul">`: 100 ms enter fade +
2 px rise, 80 ms leave fade, **no** move class, no stagger, no appear animation
(the panel entrance covers first paint). Keys stay `row.id + row.label`, so
surviving rows never re-animate (FR-013).

**Rationale**: Typing is continuous; anything queued or staggered on the row list
would read as lag exactly where the shell must feel instant (FR-014). Enter-only
emphasis matches what the developer actually watches — the result set growing —
and leave drops out of the way.

**Alternatives considered**:

- *Animate row reordering with FLIP (`move` class)*: looks busy during fuzzy
  filtering and costs layout reads per keystroke. Rejected.
- *Stagger new rows*: delays information during typing. Rejected.
- *Leave animations per row*: rows would linger during filtering. Rejected.

## R6. Veil and failure: cross-fades with instant interactivity

**Decision**: Veil enters at the base duration and leaves at the slow duration
(200 ms); the failure view fades in with a small card lift and fades out at the
fast duration. Every leaving surface gets `pointer-events: none` while its leave
runs. The veil's output path keeps the loading flag in the renderer until the
leave finishes, so the page is interactive even as the veil dissolves.

**Rationale**: These two surfaces swap state rather than being invoked; fading
both directions is what makes the "nothing cuts" rule hold app-wide. The long
veil leave is the one place where a slightly longer time reads as relief rather
than delay, which is why it uses the slow token, still under the 400 ms safety
timeout.

**Alternatives considered**:

- *Veil cut on ready (status quo)*: the exact pop this feature removes. Rejected.
- *Cross-fade veil and failure through a shared opacity owner*: unnecessary
  coordination; independent leaves overlap naturally during the loading
  transition. Rejected.

## R7. Reduced motion and interaction safety

**Decision**: CSS clamps the tokens under `prefers-reduced-motion: reduce`;
JavaScript uses `matchMedia` only to advise the settle logic (skip the fallback
timer, expect the near-instant `after-leave`). End states are identical in both
modes.

**Rationale**: The reduced-motion requirement (FR-005) is about comfort, and the
cheapest correct implementation is to zero the visuals at the token layer rather
than branch every component. Keeping the JS flag advisory avoids a second source
of truth for durations.

**Alternatives considered**:

- *Branch each component on a JS flag*: duplicates every transition declaration
  and risks drift. Rejected.
- *Disable transitions entirely under reduced motion*: `display:none`-style cuts
  are exactly the abruptness being fixed; instant changes should still be
  well-formed state updates, not skipped lifecycle. Rejected.

## R8. Performance

**Decision**: Only `opacity` and `transform` animate; the palette backdrop's blur
is static; no `will-change` is set globally (only the palette panel while its
transition classes are active); row animations stay at 100/80 ms with no stagger.

**Rationale**: These are the compositor-friendly properties; the 36 px strip and
modal surfaces are tiny, so frame cost is negligible. Constraining rows protects
typing responsiveness (SC-003).

**Alternatives considered**: Animating layout properties (height, width, top) for
a "push" feel — explicitly not desired: the strip overlays and never reflows
(spec Assumptions, 001 Clarifications). Rejected.

## R10. Row animation: reverted, then solved via stable keys (see 005)

**Decision**: Ship the Vue-docs technique — `TransitionGroup` with `:css="false"`
and `onBeforeEnter` / `onEnter` / `onLeave` JS hooks driving the Web Animations
API — now that the two prerequisites the spike identified are met: stable row
keys and a fixed row height.

**Rationale**: The first attempt left duplicated rows and a growing list. The
spike (`specs/005-row-animation-spike/`, `spikes/row-animation/results.md`) found
the cause: the typed-target row's key (`id + label`) changed on every keystroke,
so `TransitionGroup` mounted a new element per character and held the previous one
through its leave lifecycle. With a stable `Row.key` every candidate technique
passes with zero duplicates — the engine was never the problem. Height animates
between two constants (`0` and `--palette-row-height`) so the list unfolds without
measuring the DOM while typing, and reduced motion collapses each animation to
1 ms.

**Alternatives considered**:

- *Keep `TransitionGroup`, drop only the leave rules*: still duplicated while the
  key was volatile.
- *Plain `v-for` + CSS `@keyframes` (candidate D, entry only)*: safe and passed the
  spike, but offered no exit animation and no height unfold. Superseded once the
  key fix made the lifecycle safe.
- *GSAP as in the docs example*: unnecessary; the element API does the same job
  and the docs' `:css="false"` pattern works with either. No new dependency.

**Status**: shipped. FR-013 / US3 reinstated; FR-024 and FR-025 record the two
prerequisites. Residual: enter/leave overlap during very fast typing reads as
slight choppiness, tunable via the motion tokens.

## R11. Testing strategy

**Decision**: Unit-test `splitTargetLabel` (Vitest) alongside the existing
`target.test.ts`; validate everything else manually with the quickstart, using
slow-motion capture for SC-001 and system reduced-motion toggling for SC-004.
Record results in `specs/004-shell-motion/validation.md`.

**Rationale**: The shell runs in a `WebContentsView` with no browser-test harness
in this repo (001 established scripted/manual validation for exactly this layer),
and the feature's risks — coordination and restraint — are perceptual, not
computational.

**Alternatives considered**: Component tests with a DOM simulator — would not
exercise the main/renderer coordination that carries the real risk. Rejected.