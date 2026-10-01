# Phase 0 Research: Trackpad Swipe History Navigation

Technical Context had two uncertainties — the shape/sign of the trackpad input
stream and the availability of an overscroll signal. Both are resolved below into a
mechanism that is robust to either spike outcome; the M0 spike confirms the concrete
fields and tuning constants before UI work. The runtime, storage, shell model, and
motion system are fixed by 001/004/009/012/013.

## 1. Event source: the guest view's `input-event` stream

- **Decision**: listen on `siteView.webContents.on("input-event")` and build the
  gesture from trackpad input only — precise `mouseWheel` events
  (`hasPreciseScrollingDeltas === true`) carrying `deltaX` / `deltaY`, delimited by
  `gestureScrollBegin` / `gestureScrollUpdate` / `gestureScrollEnd` where Electron
  provides them. Read the delta fields by direct property access, never by
  serializing the event object.
- **Rationale**: this is the mechanism the 002 findings already proved reaches the
  guest `WebContents` for a two-finger trackpad scroll, and it is the only source
  that exposes *in-progress* travel, which the armed/cancel requirement needs. The
  fields are native getters and are invisible to `JSON.stringify`
  (`specs/002-trackpad-navigation`), so the adapter reads `(input as any).deltaX`
  directly. Electron's `MouseWheelInputEvent` typing documents `deltaX`, `deltaY`,
  `hasPreciseScrollingDeltas`, and `canScroll`; the `InputEvent` typing documents the
  `gestureScroll*` phase names.
- **Alternatives considered**:
  - *The `BaseWindow` `swipe` event* (already used for mouse thumb buttons): it fires
    only when the macOS "Swipe between pages" setting includes two fingers, and only
    on gesture *completion*, so it can neither follow progress nor support an armed
    overlay (FR-005/FR-006). Kept only for mouse drivers, guarded (section 7).
  - *A renderer/preload wheel listener*: the guest page is sandboxed and must not be
    modified (constitution II); a preload wheel listener would also be reading
    untrusted page input and could not control history from the renderer.
  - *A native input hook / global monitor*: a new native dependency for no benefit
    over the documented event stream.

## 2. Detector mechanism: overscroll-gated sticky thresholds

- **Decision**: accumulate horizontal travel across the gesture and require
  `|sumX| > |sumY| * RATIO` (dominant-axis) before arming. When the platform reports
  the scroll was *not* consumed by page content (`canScroll === false` — i.e. the
  gesture is at a scroll boundary / overscrolling), treat it as a navigation
  candidate; if `canScroll` is unreliable, fall back to dominant-axis + a
  deliberately large commit distance + a one-commit-per-gesture guard. Arm at
  `ARM_DISTANCE`, commit at `COMMIT_DISTANCE > ARM_DISTANCE`.
- **Rationale**: the spec's hard constraint is that ordinary vertical and horizontal
  scrolling never navigates (FR-003, SC-002), while a deliberate swipe does. A pure
  distance threshold alone cannot separate "scrolled a wide element to its end" from
  "swiped to go back"; the overscroll signal is exactly that separation, and Chromium
  already computes it. The dominant-axis test is the second guard and preserves
  vertical scrolling unconditionally.
- **Alternatives considered**:
  - *Edge/velocity heuristics alone* (rejected as the primary gate: fragile across
    devices and momentum).
  - *Content-following (Safari's page slides with the finger)*: rejected for v1 by
    002 as view-compositing scope; the armed overlay is the chosen alternative to
    that feedback.
  - *Navigate on `gestureScrollEnd` when past a threshold* (rejected: the spec
    requires firing as the swipe continues and cancelling on lift — "will fire if I
    continue … cancel it if I stop").

## 3. Direction sign and mapping

- **Decision**: normalize the platform sign in the adapter so the state machine works
  in "positive = toward Back". Default assumption from 002: swipe right
  (`deltaX > 0`) = Back, swipe left = Forward, matching Safari. The M0 spike confirms
  the raw sign and the adapter constant is fixed accordingly.
- **Rationale**: the gesture and the mouse-driver `swipe` event have *opposite* raw
  direction conventions (002 records that the synthesized driver swipe is inverted),
  so keeping a single normalized convention inside the machine and doing the flip in
  one adapter line prevents a confusing, device-dependent result.
- **Alternatives considered**: hard-coding the raw sign in the state machine
  (rejected: it would couple testable logic to a platform quirk the spike may
  overturn).

## 4. Arm/commit state machine and hysteresis

- **Decision**: a pure `HistoryGesture` with `begin()` / `update()` / `end()` /
  `reset()`, returning `{ armed, commit }`. Arm requires dominant-axis travel past
  `ARM_DISTANCE` **and** history available in that direction. Commit fires once when
  `COMMIT_DISTANCE` is crossed; after commit the machine refuses further commits until
  a fresh `begin()`. Arm clears on `end()`, on `reset()`, and on reversing below a
  smaller release offset (hysteresis), never on a marginal jitter around
  `ARM_DISTANCE`.
- **Rationale**: this is the spec's two-threshold model — a stable armed window
  before an irreversible commit, with cancellation on lift (FR-005/FR-006/FR-007) and
  a single fire per gesture (FR-004). Hysteresis prevents an overlay that strobes at
  the threshold. History availability gating (FR-008) stops the overlay from
  signalling a move that cannot happen.
- **Alternatives considered**: a single threshold that both shows the overlay and
  fires (rejected: no cancellable state, so it fails the spec); firing on release
  (rejected by the spec wording).

## 5. Overlay rendering: shell-painted, shell grown to `full` while armed

- **Decision**: the overlay is a shell-renderer component. While armed, main makes
  `desiredShellMode()` return `full` (reusing the palette/veil path) so the overlay
  can paint down the left/right edge; when the arm clears, main defers the shrink
  through the existing settle protocol so the overlay's leave is not cut. The element
  is `position: fixed/absolute`, full-height on one edge, `pointer-events: none`,
  `aria-hidden`, colored from Tlapalli tokens, and animated with the shared motion
  values (instant under `prefers-reduced-motion`).
- **Rationale**: constitution II forbids injecting the overlay into the guest page,
  and the sanctioned picker overlay is a *specific* exception, not a general licence.
  The shell overlay already composes transparently over the page (001 research) and
  already resizes between `band`/`strip`/`full`, so `full` is a proven no-new-
  mechanism path. `pointer-events: none` keeps the page interactive immediately
  around a gesture (FR-010).
- **Alternatives considered**:
  - *A new dedicated `WebContentsView` for the overlay* (rejected: a second view and
    its own lifecycle for a transient 200ms surface).
  - *Confining the overlay to the 10px band* (rejected: the spec asks for an edge
    signal; 10px cannot carry it legibly).
  - *Injecting into the guest page like the picker* (rejected: would require a
    constitution amendment and pollutes the page being debugged).

## 6. Shared type, predicate, and IPC channel

- **Decision**: add `src/shared/history.ts` with `HistoryDirection`,
  `HistoryArmed = { direction; progress }`, and
  `isHistoryArmedVisible(armed, paletteOpen)`. Main pushes `history:armed`
  (`HistoryArmed | null`) to the shell renderer; the renderer stores it in a
  `historyArmed` ref in `useShell` and gates the component with the shared predicate.
- **Rationale**: a dedicated transient channel keeps the persisted `state:changed`
  shape frozen as 012 defined it, and the shared predicate keeps main's shell-mode
  decision and the renderer's mount decision in lockstep (the same pattern 013 used
  for the strip, 009 FR-004). The payload is a direction enum plus a `0..1` number —
  inert, granting no capability. The existing queued `sendToShell` path and the
  generic preload `on()` mean no preload change is required.
- **Alternatives considered**: folding the arm state into `state:changed` (rejected:
  it is not persisted state and would invite writing it); a renderer→main poll
  (rejected: push is already the pattern).

## 7. Coexistence with the mouse `swipe` / `app-command` paths

- **Decision**: keep the 002 `app-command` and `swipe` handlers unchanged for mouse
  thumb buttons. Add a coalescing guard: if a `swipe` event arrives within a short
  window after the custom detector saw a trackpad gesture stream, ignore it, so one
  physical swipe cannot navigate twice. A discrete `swipe` with no preceding gesture
  stream (a mouse driver's synthesized event) still navigates.
- **Rationale**: a real two-finger trackpad swipe can emit the OS `swipe` event *and*
  the wheel/gesture stream when the system setting includes two fingers; without the
  guard, history would move twice, and the two paths even disagree on raw direction.
  The guard also preserves the shipped mouse behavior (FR-014).
- **Alternatives considered**: removing the `swipe` handler (rejected: it would
  regress mouse drivers, 002's shipped behavior); preferring `swipe` over the
  detector (rejected: `swipe` cannot support the armed overlay).

## 8. Development preview (constitution)

- **Decision**: add a dev-only Developer-menu item that arms the overlay in a
  representative state (alternating Back/Forward) and holds it, via a
  `previewHistoryArm()` method, absent from packaged builds.
- **Rationale**: the constitution requires transient shell surfaces to be previewable
  in development so their look and motion can be iterated with HMR (specs/008); the
  overlay is hard to hold on screen for styling otherwise.
- **Alternatives considered**: relying on live swipes for styling (rejected: a
  transient ~200ms surface cannot be reliably styled that way, which is the exact
  problem 008 exists to solve).

## 9. Lifecycle, pause, and multi-window safety

- **Decision**: the `input-event` listener is per window and removed on close. The
  arm is cleared on `blur`, `hide`, `close`, any history navigation from another
  source (`did-navigate` / `did-navigate-in-page`), and while the palette, loading
  veil, failure view, extension status, or a dev preview owns the window. Every
  window owns its own `HistoryGesture` and armed state.
- **Rationale**: a window that loses focus mid-gesture or is navigating for another
  reason must not keep a stale armed signal on screen (FR-006); per-window ownership
  is Principle V and mirrors the proximity tracker's model in 013.
- **Alternatives considered**: a single process-wide gesture state (rejected: a swiped
  background window could arm the focused one).

## 10. Spike to retire before UI work (M0) — RETIRED 2026-09-30

Run on a real Mac trackpad with an env-gated probe in
`src/main/shell/gesture-probe.ts` (temporary; deleted after this entry). The probe
summarised one line per gesture so the answer was readable rather than a raw event
dump.

### 10.1 Findings

- **Deltas are not available in `input-event`.** Across every sampled gesture the
  probe reported `carrier=none`: not one event exposed `deltaX` or `deltaY` when
  read directly. Section 1's premise was wrong — Electron 44's `input-event` gives
  the lifecycle but not the travel. **Deltas must come from the DOM `wheel` event
  relayed by the guest preload**, and the phases come over `input-event`. The two
  necessarily travel on different channels.
- **The phase lifecycle is reliable.** Every isolated gesture reported exactly one
  `gestureScrollBegin`, N `gestureScrollUpdate`s, and exactly one
  `gestureScrollEnd`, with the begin landing at 0-1% of the gesture — always
  before any update.
- **Released momentum never opens a new gesture.** Across every sample, ends were
  greater than or equal to begins (one run: 12 ends to 11 begins). Momentum keeps
  delivering `gestureScrollUpdate`s but never a `gestureScrollBegin`.
- **`gestureScrollEnd` lands after the fling decays**, not when the fingers lift:
  measured at ~100% of a 1.2s gesture, with 0-8 trailing updates. Firing on it
  would therefore feel roughly a second late.

### 10.2 Consequences for the design

- The detector latches on `gestureScrollBegin` and commits **at most once per
  gesture**; a committed or cancelled gesture can only be reopened by the next
  begin. Because momentum never begins, **no cooldown timer and no idle fallback
  are needed** — the machinery specced in T017 for exactly that problem is
  superseded, and the double-fire risk that motivated it is closed at the source.
- Navigation fires when the swipe **crosses** the commit distance, not on
  `gestureScrollEnd`, because that end is not a finger-lift signal.
- Travel outside a begun gesture is dropped rather than treated as a new gesture,
  so the tail of a finished gesture cannot reopen it.
- Thresholds are fractions of the window width rather than raw pixel deltas, since
  the delta scale is device- and settings-dependent and was not measurable in
  absolute terms (the probe could not report magnitudes at all).
- A **native addon is not justified.** It would only add `momentumPhase`, and the
  findings show momentum is already inert. It remains the only way to get deltas
  into the main process, but the deltas are needed in the renderer-facing path
  anyway, so a native dependency plus `asarUnpack` work in
  `electron-builder.yml` buys nothing. `specs/015` therefore ships with **no native
  dependency**.
- Electron PR #49235 (`swipeGesture`, giving direction/phase/progress from
  `trackSwipeEventWithOptions:`) would express this cleanly, but it is unmerged
  and absent from Electron 44. Noted as a future option, not a dependency.

### 10.3 Known limitation

macOS routes scroll to the view under the pointer, so swiping with the pointer
outside the window, or over focused DevTools, delivers nothing to the guest view
and the gesture does nothing. This is inherent to wheel-based detection; the
DevTools case is required behaviour (FR-016), the outside-the-window case is
accepted and documented.

## 11. Pivot: the gesture is native (2026-10-01)

§10 shipped a wheel-relay detector with **no native dependency**. That decision
was reversed during implementation: the wheel path could follow progress and guard
page scroll, but it never got AppKit's rubber-band physics or its release
decision, and it depended on macOS handing the gesture through at all. The
implemented feature is instead a small macOS Node-API addon.

- **Decision**: `native/swipe-navigation/swipe-navigation.mm` installs an
  `NSEvent` scroll-wheel monitor and calls `trackSwipeEventWithOptions`, which
  owns the rubber-band physics and answers at release whether the swipe
  completed. While a gesture is tracked its scroll is swallowed so the page does
  not also scroll. The addon decides nothing about navigation: `onBegin` asks
  JavaScript whether to track (history available? page at its side edge? not over
  DevTools?) and where the target is, `onProgress` reports the travel, and
  `onEnd` reports the release outcome.
- **Rationale**: AppKit is the only source of the two things the wheel path
  could not provide — the physical tracking and the release decision — and the
  addon's `gestureAmount` gives a real `0..1` progress that drives the armed
  overlay and shrinks back as the gesture cancels. It also removes the split
  between the phase stream (`input-event`) and the delta stream (the guest
  preload's DOM `wheel`), which §10.1 had forced.
- **Cost**: a native addon, a clang++ build step (`scripts/build-native.mjs`),
  and `asarUnpack` for the `.node`. It is macOS-only and degrades to a no-op
  elsewhere, or when the addon fails to compile in development.
- **Superseded**: the pure `HistoryGesture` state machine, the `gesture:wheel`
  relay, the guest preload wheel listener, the `win.on("swipe")` OS event path,
  and the `GestureWheel` type are all removed. The `resolveScrollEdge` port
  (`src/shared/scroll-edge.ts`, reported over `page:scroll-edge`) replaces the
  older `canScrollHorizontally` heuristic; the armed overlay, the `history:armed`
  channel, the dev preview, and the shared `isHistoryArmedVisible` predicate are
  unchanged.
- **Provenance**: the addon is a clean-room implementation written against
  Apple's AppKit headers and Node's Node-API headers. It was informed by the
  approach Meru (zoidsh/meru, **AGPL-3.0**) uses, but shares no code with it.
- **Electron PR #49235** (`swipeGesture`, direction/phase/progress from
  `trackSwipeEventWithOptions:` in the main process) would remove the addon
  entirely. Still unmerged; when it lands, the addon can be swapped for the
  built-in API behind the same `swipe/navigation.ts` seam.

