# Phase 0 Research: Guest Page Zoom

The feature is small and lands inside patterns the repository already established, so research
focused on the genuinely open questions: how Chromium zoom behaves across navigation, how to match
the `+` chord, whether an OS menu accelerator would double-fire, how the transient indicator fits
the shell-mode machine, and — added by the clarifications session — how to capture **Command + wheel**
and **trackpad pinch** without disturbing the guest page, page scrolling, or the native swipe monitor.

---

## 1. Zoom mechanism on the guest page

- **Decision**: Apply zoom to the guest `WebContentsView`'s webContents with
  `webContents.setZoomFactor(factor)` (percent / 100), read it with `getZoomFactor()`, and own every
  zoom change by calling `webContents.setZoomMode("manual")`. Never touch the shell view or the
  DevTools webContents.
- **Rationale**: The guest page already renders in a dedicated sandboxed `WebContentsView`
  (`src/main/shell/site-view.ts`); webContents-level zoom scales exactly that view and nothing else,
  satisfying FR-010 by construction and Principle II (no DOM injection). `setZoomFactor` clamps to
  Chromium's displayable range (0.25–5.0), which is exactly the ladder's bounds. `manual` mode
  disables Chromium's own zoom handling while still dispatching `zoom-changed`, so the application is
  the single authority for the level (documented in the Electron 44 `webContents` reference).
- **Alternatives considered**:
  - *CSS transform / `zoom` injected into the page*: rejected — violates Principle II and fights the
    page's own layout.
  - *`setZoomLevel(level)`* (log scale, `factor = 1.2^level`): rejected as the primary API — forces a
    log/exp round-trip and makes readable ladder values (80%, 110%, …) inexact.
  - *Chromium's default (same-origin) zoom policy*: rejected — per-origin propagation contradicts the
    per-window model; `manual` removes it entirely (see §2).

## 2. Per-origin zoom memory vs per-window zoom

- **Decision**: `setZoomMode("manual")` makes the window record the single source of truth. Persist a
  `zoomIndex` step and re-apply `setZoomFactor` after each top-level navigation commit (`did-navigate`
  and `did-finish-load`).
- **Rationale**: Chromium's default zoom policy is same-origin and would both leak zoom across a
  target change and reset it on navigation, contradicting FR-011/FR-012. `manual` mode (which
  "persists across navigations") plus re-applying our value on navigation makes the per-window model
  authoritative. (Electron also offers `isolated` — per-webContents automatic handling — but that
  still lets Chromium drive the value; `manual` keeps us in control.)
- **Alternatives considered**: *Rely on Chromium's per-origin memory*: rejected. *`isolated` mode with
  no re-apply*: rejected — we would not control the exact ladder.

## 3. The zoom ladder

- **Decision**: A fixed, ordered ladder of factors mirroring standard browser steps:
  `[0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0]`;
  default index at `1.0`. Step in/out moves one index; both clamp at the ends. Percent =
  `Math.round(factor * 100)`.
- **Rationale**: Matches FR-013 and browser expectations, and stays within the 0.25–5.0 range
  Electron clamps to anyway.
- **Alternatives considered**: continuous multiplication (drifts, never a familiar percent) and a
  longer ladder (needless; every value is a whole percent from 25%–500%).

## 4. Matching the `⌘+` chord (the shift problem)

- **Decision**: Extend `Accelerator` with an optional `shiftInsensitive?: boolean`; `commandForInput`
  ignores Shift when it is set. Bind `view.zoomIn` to `{ meta: true, code: "Equal", shiftInsensitive: true }`
  so both `⌘=` and `⌘⇧=` (which types `+`) trigger it. Zoom out is `{ meta: true, code: "Minus" }`,
  reset is `{ meta: true, code: "Digit0" }`.
- **Rationale**: On a US layout `+` is Shift+`=`, so the strict `shift === false` match today would
  miss one of the two chords a developer might press; `⌘=` is also the conventional macOS zoom-in
  chord.
- **Alternatives considered**: two command entries for one id (pollutes the palette); making all
  accelerators shift-insensitive (Shift is meaningful for `⌘⇧F`, `⌘⇧R`); accelerator alternative
  lists (over-general for one chord).

## 5. OS menu accelerator for zoom-in

- **Decision**: Add the three commands to the View menu (`MENU_SECTIONS` in `src/main/index.ts`).
  Extend `Accelerator` with an optional `menuAccelerator?: string` and give `view.zoomIn`
  `"CommandOrControl+Plus"`, because `toElectronAccelerator` would otherwise render `code: "Equal"`
  as the invalid `"Equal"`. Zoom out maps to `Minus` → `-` and reset to `Digit0` → `0` through the
  existing mapping.
- **Rationale**: Menu entries make the shortcuts discoverable and provide the app-wide path
  documented in `specs/001-minimal-browser/contracts/commands-and-keys.md`; `"Plus"` is Electron's
  canonical `+` key name.
- **Alternatives considered**: accelerator-free menu items (fallback only; zoom has no native
  text-navigation conflict like `view.back`/`forward`).

## 6. Menu accelerator vs `before-input-event`: double-fire risk

- **Decision**: Register the commands both as OS menu accelerators and via the `before-input-event`
  dispatcher (`handleInput`, attached to the site view and, while DevTools is open, the DevTools
  webContents). `⌘=` (unclaimed by the menu) is handled by `before-input-event`; `⌘⇧=` (claimed by the
  menu's `Plus`) is handled by the menu. A single physical press must advance exactly one step in
  every focus context — a verified invariant (quickstart S4), not an assumption.
- **Rationale**: The contract documents this exact split (page `before-input-event` for page focus;
  menu accelerators for DevTools focus). Menu key equivalents are consumed before the web contents
  sees the key, so the two paths do not both run for the same chord.
- **Residual risk / fallback**: if any focus context steps twice, drop the menu accelerator for that
  item while keeping the palette entry (the guaranteed keyboard path per Principle III).

## 7. The transient indicator on a bottom-right, pointer-through surface

- **Decision**: Per-window `zoomStatus: { percent: number } | null`. On any zoom change main sets it,
  sends `zoom:changed { percent }`, and calls `relayout()`. `desiredShellMode()` returns `"full"`
  while `zoomStatus` is set (the default `band` only covers the top strip, so a bottom-right
  indicator would not paint). Main owns a ~1.5 s dismissal timer; on fire it clears `zoomStatus`,
  sends `zoom:changed null`, and calls `relayout(true)` so the collapse waits for the renderer's
  leave to settle. `ZoomIndicator.vue` is absolute bottom-right, `pointer-events: none`,
  `aria-hidden`, token-colored, with an instant path under `prefers-reduced-motion`.
- **Rationale**: Reuses the transient, non-blocking mechanism of the extension status and armed
  history overlay. `.shell-root` is already `pointer-events: none`; the indicator deliberately does
  not opt back in, so it never intercepts input (FR-009).
- **Alternatives considered**: rendering inside the `band` (cannot paint the bottom-right);
  keeping the shell full-window always (regresses specs/013); a renderer-owned dismissal timer
  (viable, but main must coordinate shell mode and the settle protocol anyway, so the clock stays
  with the state).

## 8. Persistence and schema

- **Decision**: Add `zoomIndex: number` to `WindowRecord`; bump `SCHEMA_VERSION` 3 → 4. Seed it in
  `defaultWindowRecord`, in `WindowManager`'s creation paths, and in `migrateLegacyWindow`.
  `sanitizeWindowRecord` clamps an out-of-range or non-numeric value to the default; an absent field
  reads as the default, like `titlebarMode`.
- **Rationale**: Mirrors the existing additive, defaulted field pattern so old documents upgrade
  transparently and a corrupt value can never open a window at an absurd zoom.
- **Alternatives considered**: a top-level setting (zoom is per-window); storing the factor instead of
  the index (the integer index keeps stepping exact).

## 9. Where the zoom policy lives

- **Decision**: A pure module `src/shared/zoom.ts` exporting the ladder (`ZOOM_STEPS`), the default
  index, and helpers (`zoomFactor`, `zoomPercent`, `stepZoom`, `clampZoomIndex`, and the
  gesture→step mapping). `commands.ts` and `window.ts` consume it; tests import it directly.
- **Rationale**: One source of truth shared by the main process and Vitest, keeping `window.ts` thin.
- **Alternatives considered**: inline the ladder in `window.ts` (untestable, drifts).

---

## 10. Command + mouse wheel (the wheel gesture)

- **Decision**: Capture it in the existing native `NSEvent` monitor in
  `native/swipe-navigation`, not in Electron or the guest page. The monitor now matches
  `NSEventMaskScrollWheel | NSEventMaskMagnify`; a scroll event whose modifier flags include
  `NSEventModifierFlagCommand` is reported to JS as a wheel zoom and **swallowed** (so it never
  scrolls the page or becomes a history swipe). A mouse wheel is a burst of ~10 precise events per
  notch (`deltaY` ~1–2 each), so the JS side accumulates its travel and advances one ladder step per
  threshold (`ZOOM_WHEEL_MOUSE_STEP`).
- **Rationale**: A local `NSEvent` monitor sees the event before it is dispatched to any view, so it
  works no matter which view is on top (page, shell overlay, or docked DevTools) — unlike a guest-page
  wheel listener, which the full-window indicator overlay could swallow. It also keeps the gesture out
  of the guest page entirely (Principle II) and gives the raw magnitude Chromium never surfaces to
  Electron. Swallowing is correct: Command + scroll should zoom, not scroll.
- **Alternatives considered**:
  - *Electron's `zoom-changed` event + `setZoomMode("manual")`*: rejected. `manual` mode is a trap —
    it changes the zoom *value* but never repaints the page (`setZoomFactor` updates the factor yet
    `devicePixelRatio` stays put; verified with a hidden-window probe). `isolated` mode renders
    correctly and is what ships.
  - *Parsing `input-event` `mouseWheel`*: rejected — the event carries only `type`/`modifiers`/
    `_modifiers`, no delta, so it cannot give a direction or magnitude.
  - *A site-preload wheel listener forwarding over IPC*: rejected — guest-side code (Principle II) and
    vulnerable to the overlay swallowing the event.
  - *Letting Chromium's built-in wheel zoom run*: rejected — it uses Chromium's own levels/steps and
    per-origin memory, not our ladder or per-window model.

## 11. Trackpad pinch

- **Decision**: Handle it in the same native monitor, via `magnifyWithEvent:` (`NSEventMaskMagnify`).
  The monitor reports the magnification delta and swallows the event; JS accumulates it and advances
  one step per `ZOOM_PINCH_STEP` (magnification), spreading = zoom in.
- **Rationale**: Electron disables visual (pinch) zoom by default, so there is no built-in behavior to
  reconcile; the `NSEvent` `magnification` is the only place the gesture's magnitude exists, and it is
  exactly what the wheel path already uses. This retired the feature's one real unknown (the plan's
  Phase 0 spike) — the answer was "the native monitor, like navigation".
- **Alternatives considered**: the plan's other candidates — `input-event` `gesturePinch*` (no
  magnitude in the public structure) and a site-preload `ctrl`+wheel reporter (guest-side, and the
  wheel deltas were tiny and unreliable) — both rejected in favour of the native path.

## 12. Not disturbing existing scroll and swipe behavior

- **Decision**: The native monitor swallows **only** Command + scroll and magnify; every other scroll
  event falls through to the swipe logic unchanged, and a Command + scroll gesture's momentum is
  swallowed too (`g_zoom_scroll_active`) so it can never become a swipe. The guest view uses
  `setZoomMode("isolated")` so Chromium renders our factor per webContents.
- **Rationale**: Satisfies FR-020 and SC-010 by construction. The swipe monitor already refuses
  non-horizontally-dominant gestures; Command + scroll is vertical and magnify is not a scroll at all.
- **Verified**: plain two-finger scroll still scrolls, and two-finger swipe navigation still works,
  with the gesture paths live.

## 13. Mouse vs trackpad: classification and delta signs

- **Decision**: Classify by gesture **phase**, not by `hasPreciseScrollingDeltas`. A wheel event with
  no phase and no momentum (`discrete = true`) is a mouse notch; a phased stream is a trackpad. The two
  devices also have **opposite `deltaY` signs** for the same physical direction, so the mouse path is
  not negated while the trackpad path is.
- **Rationale**: Many mice (including the one tested) report precise deltas, so `precise` cannot
  separate mouse from trackpad and made the mouse feel dead. Phase/momentum is the reliable split.
  Getting the sign right per device is what made "scroll up = zoom in" hold for both.
- **Tuning**: `ZOOM_WHEEL_MOUSE_STEP` (12, ≈ one notch), `ZOOM_WHEEL_TRACKPAD_STEP` (120),
  `ZOOM_PINCH_STEP` (0.3), and a 160 ms idle reset that clears leftover travel between gestures.

## 14. Keyboard shortcuts

- **Decision**: `view.zoomIn/Out/Reset` carry both an OS menu accelerator (`CommandOrControl+Plus`,
  `CommandOrControl+-`, `CommandOrControl+0`) and a `before-input-event` accelerator
  (`Equal`/`Minus`/`Digit0`). `shiftInsensitive` on zoom-in makes both `⌘=` and `⌘⇧=` resolve to it.
  A 20 ms dedupe in the command handler collapses a single press that arrives on both paths.
- **Rationale**: The OS accelerator makes the shortcuts show in the View menu and fire app-wide
  (including with DevTools focused); the `before-input-event` path covers the plain page. The
  `menuAccelerator` override exists because `code: "Equal"` has no Electron key name.
- **Alternatives considered**: `before-input-event` only (shortcut worked but the menu showed no
  hint); OS accelerator only (loses the page path).

## 15. Persistence debounce

- **Decision**: Persist `zoomIndex` ~300 ms after the last change (and on window close), not per step.
- **Rationale**: `StateStore.patchWindow` writes atomically with an `fsync`; doing that per gesture
  step stalled the main process and made fast input feel dropped.
- **Alternatives considered**: writing synchronously per step (the original bug); a renderer-owned
  timer (main must coordinate shell mode and the settle protocol anyway).

## 16. Reduced motion and the indicator

- **Decision**: Under `prefers-reduced-motion`, the indicator appears/disappears instantly but its
  lifetime and the shell expand/collapse timing are unchanged.
- **Rationale**: Expected motion behavior for transient surfaces in this repo (specs/004).
- **Alternatives considered**: skipping the indicator under reduced motion — rejected; it is a
  confirmation, not decoration.
