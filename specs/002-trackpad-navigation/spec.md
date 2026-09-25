# Feature Specification: Trackpad & Mouse History Navigation

**Feature Branch**: `002-trackpad-navigation`

**Created**: 2026-09-25

**Status**: Draft — parked (mouse buttons shipped; trackpad pending)

**Input**: "The mouse has a couple of extra buttons I use in other browsers for
navigation." Follow-up: make the trackpad two-finger swipe navigate back/forward
like Safari, with a **sticky** feel — the gesture must not fire immediately, or
ordinary horizontal scrolling would be hijacked.

## Scope

1. **Mouse back/forward thumb buttons** — navigate history. (DONE, shipped.)
2. **Trackpad two-finger swipe** — navigate history, Safari-style (swipe right =
   back, swipe left = forward), with a threshold so horizontal scrolling never
   triggers it.

## User Story 1 — Mouse thumb buttons navigate history (Priority: P1, DONE)

The developer's back/forward thumb buttons move through the site's history, the
same way they do in Chrome/Safari.

**Acceptance**:
1. Visit two pages; press the mouse **back** button → goes back.
2. Press **forward** → goes forward.
3. Each press advances exactly one history entry (no double-steps).
4. With no history in that direction, the button does nothing.

**Status**: shipped in `c433a2d` (`feat: navigate history with mouse back/forward
buttons`). Implementation lives in `src/main/shell/window.ts`:

- macOS: the thumb buttons arrive as **`swipe`** events (mouse drivers such as
  Logitech Options+ synthesize `NSEventTypeSwipe`), mapped `left` → back,
  `right` → forward.
- Windows/Linux: `app-command` `browser-backward` / `browser-forward`.

## User Story 2 — Trackpad two-finger swipe (Priority: P2, PARKED)

A two-finger horizontal swipe on the trackpad navigates history, matching the
Safari/Chrome feel: the gesture commits only after crossing a threshold
("sticky"), so vertical and horizontal scrolling are unaffected.

**Acceptance**:
1. Swipe right with two fingers → back; swipe left → forward.
2. Vertical two-finger scroll never navigates.
3. Horizontal scroll of a horizontally-scrollable page never navigates.
4. One navigation per gesture, with no repeats from momentum.

## Findings so far (2026-09-25)

- Electron has **no native two-finger swipe navigation** (electron/electron#2683,
  still open).
- The `BaseWindow` **`swipe`** event fires for trackpad swipes only when
  `System Settings > Trackpad > More Gestures > "Swipe between pages"` is set to
  **"Swipe with two or three fingers"**. It implements the *older* macOS swipe
  (content does **not** follow the finger), not the modern Safari gesture.
  Reference: electron.d.ts `on(event: 'swipe', ...)` doc.
- A two-finger trackpad scroll reaches the site `WebContents` as interleaved
  `input-event` events: `mouseWheel` **and** `gestureScrollBegin` /
  `gestureScrollUpdate` / `gestureScrollEnd`. The delta values live on the event
  object as **native getters** and are therefore invisible to `JSON.stringify`
  (a probe printed only `{type, modifiers}`) — a detector must read the fields
  directly (e.g. `(input as any).deltaX`) rather than serialize the event.
- First attempt (listening for `mouseWheel` with `hasPreciseScrollingDeltas`)
  registered nothing, which led to the `gestureScroll*` discovery above.

## Next steps

1. **Probe the gesture fields**: log `gestureScrollUpdate` with direct property
   access (`deltaX`, `deltaY`, and any velocity/phase fields) to pin down units
   and sign.
2. **Choose the mechanism**:
   - *(a)* Rely on the `swipe` event and document the required macOS trackpad
     setting — cheap, but only covers the "older" gesture and depends on the
     user's System Settings.
   - *(b)* Custom detector over `gestureScrollBegin/Update/End`: accumulate
     horizontal delta, require `|sumX| > |sumY|` and a threshold, commit once at
     `gestureScrollEnd` with a cooldown. This is the real "sticky swipe".
3. **Visual follow (optional)**: the true Safari feel moves the page with the
   finger during the gesture (overscroll/rubber-band + a snap on commit). This
   needs view compositing/animation and is likely out of scope for a first cut;
   a plain threshold-commit is the pragmatic v1.
4. **Validate**: vertical scroll, horizontal scroll, single-commit, no momentum
   double-fire; then `npm run check` + `npm run test`.

## Notes

- Direction convention differs by input: the mouse driver's synthesized `swipe`
  is inverted (`left` → back) relative to Safari's two-finger wheel direction
  (`swipe right`/`deltaX > 0` → back). Confirm per-device and document.
