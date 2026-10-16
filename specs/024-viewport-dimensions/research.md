# Phase 0 Research: Viewport Size Indicator

The feature lands inside patterns the repository already established — the
transient bottom-right confirmation (specs/023, the zoom indicator), the
transient full-window shell mode, and the DevTools front-end control channel
(specs/022, dock-side polling). Research therefore focused on the genuinely open
questions: **what exactly the "native DevTools indicator" is**, **how to stop it
while still matching its value**, **which quantity the indicator must show**, and
**where that value comes from without disturbing the guest page**.

---

## 1. What the "native indicator from DevTools" is

- **Decision**: The readout to match and suppress is the DevTools **Overlay**
  domain's *viewport size on resize* overlay. It is drawn by an `OverlayAgent`
  that DevTools creates for its own debugging session; it appears on the
  `PageResized` event, i.e. when the inspected page's viewport changes (window
  resize, or DevTools dock change). It is enabled per-agent via
  `Overlay.setShowViewportSizeOnResize({ show: true })`.
- **Rationale**: Confirmed against the DevTools front-end source
  (`OverlayModel.#showViewportSizeOnResize` defaults to `true`; `wireAgentToSettings()`
  calls `overlayAgent.invoke_setShowViewportSizeOnResize({ show })` when the model
  starts/resumes) and against Chromium/Puppeteer issue #6819, which documents the
  overlay as "shown when you resize the window and have DevTools opened" and drawn
  by the DevTools-created `OverlayAgent`.
- **Consequence**: The overlay only exists while DevTools is open. That is exactly
  why the spec requires the tool's own indicator to appear whether DevTools is
  open or closed (FR-005) — it is the superset.
- **Alternatives considered**: reading it as the DevTools "rulers" feature
  (`showMetricsRulersSettingDescriptor`) — rejected; that is a separate, opt-in
  decoration, not the automatic resize readout the request names.

## 2. Which quantity the indicator shows (and why it is the page viewport)

- **Decision**: The indicator reports the guest page's **layout viewport** in CSS
  pixels, `width × height` — the same quantity the DevTools overlay reports. This
  is the page's content area, i.e. it already excludes the titlebar inset and any
  docked DevTools panel; it is **not** the outer window frame.
- **Rationale**: The request says "the size of the window" but also requires the
  value to "match" the DevTools indicator, which reports the page viewport. The
  two are reconciled by reporting the page viewport, which is also the number a
  developer checks against a breakpoint — the whole point of the feature. The
  layout viewport shrinks when DevTools docks (verified in this repo:
  `dock-test.ts` shows page `innerHeight`/`innerWidth` drop for bottom/right
  docking) and when titlebar mode insets the page (also verified there), so the
  reported number tracks all of those.
- **Scrollbar nuance**: The DevTools overlay reports the layout viewport size
  *including* the classic scrollbar gutter (its number is a few px wider than the
  content box). On macOS with overlay scrollbars the gutter is zero, so the
  distinction is usually invisible; the spike (§9, S0) pins the exact comparison
  so the two agree pixel-for-pixel.
- **Alternatives considered**: the outer window size (`win.getBounds()`) — rejected;
  it would not match DevTools and would not change with a DevTools dock, which is
  not what a breakpoint-driven frontend developer wants.

## 3. Suppression must come from the DevTools session, not the page session

- **Decision**: Turn the overlay off **from the DevTools front-end** — the session
  that owns the visible `OverlayAgent` — rather than from the inspected page's own
  debugger session.
- **Rationale**: Overlay agents are **per CDP session**. Calling
  `Overlay.setShowViewportSizeOnResize({ show: false })` on a *page* session (e.g.
  Electron's `webContents.debugger`) does **not** stop the overlay, because
  DevTools' own session still has an agent with the flag `true`. This was
  reproduced and documented in Chromium/Puppeteer #6819 (a page-session call left
  the overlay visible; the maintainer's recommended fix was to send the command
  "from DevTools"). The DevTools front-end exposes exactly the setter we need:
  `OverlayModel.setShowViewportSizeOnResize(false)`.
- **Alternatives considered**:
  - *`webContents.debugger` on the inspected page* (`Overlay.setShowViewportSizeOnResize`):
    rejected — per-session; does not suppress DevTools' agent (#6819).
  - *Preventing `PageResized`*: rejected — would break real resize handling and
    DevTools layout features; far too broad.
  - *A global/browser-level flag*: none exists; the overlay state lives in
    `OverlayModel`.

## 4. How the suppression reaches the DevTools front-end

- **Decision**: Reuse the channel the repository already drives DevTools with:
  `webContents.devToolsWebContents.executeJavaScript(...)`, invoked from
  `DevToolsController`, and **re-asserted on the existing 1 s poll tick** (the
  same tick that theme-syncs and dock-syncs). The expression sends the overlay
  command over DevTools' own connection via the front-end host binding
  `InspectorFrontendHost.sendMessageToBackend`:
  `{ method: "Overlay.setShowViewportSizeOnResize", params: { show: false } }`.
  It lives in `src/main/shell/devtools-overlay.ts`
  (`suppressDevToolsResizeOverlay`), written defensively (falls back to
  `DevToolsAPI.sendMessageToBackend`) so an unknown front-end layout is a no-op
  rather than an error.
- **Rationale**: This is the documented "send it from DevTools" route (#6819):
  the readout is drawn by the OverlayAgent on DevTools' connection, so the command
  must go over that connection, not the page's. Probing the live front-end showed
  it exposes only the UI namespace `EUI` (with `DockController`) and no SDK model,
  so the raw host binding is the reachable path; `InspectorFrontendHost` (the same
  binding family the dock poll uses) provides it. Re-assertion is required because
  the front-end re-applies its own default (`true`) whenever its overlay model
  restarts — e.g. after a dock change reloads DevTools.
- **Verified (S1)**: `dock-test.ts` calls the helper against the live front-end and
  now reports `suppressed: true` (the message is sent on the DevTools connection).

## 5. Where the value comes from (without disturbing the guest page)

- **Decision**: Read the guest page's layout viewport from the guest view on the
  window's existing `resize` event, via a **read-only** guest read:
  `webContents.executeJavaScript("({ width: window.innerWidth, height: window.innerHeight })")`.
  Reads are serialized (a fast drag marks the next read dirty instead of piling
  round-trips on the guest renderer). No DOM, style, or script is modified.
- **Rationale**: The number must equal DevTools' (§2), and DevTools measures the
  *page*, so the page's own viewport is the source of truth. The guest read
  reflects every reduction of the page area — a docked DevTools panel and titlebar
  inset alike — which the outer window bounds and the window content bounds do
  not, and which `siteView.getBounds()` may not once the app re-asserts the view
  bounds after a resize. It is the repository's established way to read the real
  page viewport (`dock-test.ts`, `screenshots.ts`) and, being read-only, does not
  violate Principle II.
- **Alternatives considered**:
  - *`siteView.getBounds()`*: considered first as a synchronous native source, but
    the app sets the view bounds to the full content on every `relayout()`, so after
    a resize the view bounds no longer necessarily reflect a docked DevTools panel.
    Retained as the value the spike cross-checks against.
  - *`win.getContentBounds()`*: rejected — the whole window content; ignores docked
    DevTools and titlebar inset, so it would not match DevTools.
  - *A CSS/DOM probe injected into the page*: rejected — that would modify the
    guest page (Principle II), unlike a read-only evaluation.

## 6. Reusing the transient full-window shell surface

- **Decision**: A per-window `viewportStatus: { width: number; height: number } | null`.
  On a size change, main sets it, sends `viewport:changed { width, height }`, and
  calls `relayout()`. `desiredShellMode()` returns `"full"` while it is set (the
  default `band` covers only the top strip and cannot paint the bottom-right).
  A ~1.5 s dismissal timer fires `hideViewportStatus()`, which clears it, sends
  `viewport:changed null`, and calls `relayout(true)` so the collapse waits for
  the renderer's leave to settle.
- **Rationale**: This is exactly the zoom indicator's mechanism (specs/023
  research §7); reusing it keeps one transient-surface pattern in the codebase and
  guarantees the same non-blocking, settle-aware behavior (FR-007, FR-008, FR-015).
- **Alternatives considered**: rendering inside the `band` (cannot reach the
  bottom-right); a renderer-owned timer (main must coordinate the shell mode and
  the settle protocol anyway, so the clock stays with the state).

## 7. IPC and preload

- **Decision**: One new one-way main → shell channel, `viewport:changed`, carrying
  `{ width: number; height: number }` or `null`. Reuses the generic `on` bridge in
  `src/preload/shell.ts`; **no preload change**.
- **Rationale**: Identical to `zoom:changed` (specs/023); the bridge is already
  channel-agnostic. The shell treats the event as presentation only and never
  drives the window size.

## 8. Trigger wiring and the coexistence with zoom

- **Decision**: Drive from the existing `this.win.on("resize", …)` handler (already
  wired in `wireEvents`, already calling `relayout()` and persisting bounds). Show
  the indicator only when the size actually changes (ignore move-only and
  redundant resize events). Fix the bottom-right status stack so the zoom
  percentage and the size readout never occlude each other (FR-010).
- **Rationale**: The resize handler is the natural and complete trigger for
  FR-013 (interactive drag, maximize, restore, fullscreen, display change all fire
  it). DevTools **docking** also changes the page viewport but is not a window
  resize, so it is not a trigger; the value shown on the next resize is already
  correct because it is read fresh. Stacking is renderer-only layout.
- **Alternatives considered**: a separate native resize observer — rejected;
  `win.on("resize")` already exists and is the single source for geometry. Showing
  on a DevTools dock change too — out of scope for the request ("when it is
  resized"); can be added later without changing the contract.

## 9. Reduced motion, lifetime, and spikes

- **Reduced motion**: The indicator appears/disappears instantly under
  `prefers-reduced-motion`, with lifetime and shell timing unchanged (FR-016; the
  repository's transient-surface convention, specs/004).
- **Lifetime**: ~1.5 s after the last size change, matching the zoom indicator
  (Assumptions; SC-004 allows up to 2 s).
- **Spikes (risk retirement, spike-first rule)**:
  - **S0 — viewport source parity**: Resolved by design to the guest's read-only
    layout viewport (§5), which matches DevTools by construction and tracks every
    page-area reduction; the `dock-test.ts` assertion cross-checks it against the
    guest viewport with DevTools docked. A manual run confirms parity under
    bottom/right/left docking and titlebar mode.
  - **S1 — suppression route**: Resolved by §3/§4 — the readout is turned off from
    the DevTools front-end (`EUI.SDK.OverlayModel.setShowViewportSizeOnResize`),
    re-asserted on the poll tick; the `dock-test.ts` assertion reports whether the
    helper resolved against the live front-end. A manual run confirms it survives a
    dock change.

## 10. Not disturbing zoom, titlebar, or DevTools

- **Decision**: The new status is additive to `desiredShellMode()`; the new
  channel is additive to the bridge; the suppression only sets a DevTools overlay
  flag. Nothing about zoom state, the strip/titlebar layout, dock side, or theming
  changes.
- **Rationale**: Satisfies FR-012 by construction; the settle protocol already
  handles multiple transient surfaces (palette, veil, failure, status, zoom,
  history).
- **Verified plan**: The `dock-test.ts` harness already exercises docking,
  shortcuts, the picker, and titlebar mode; the new assertions (quickstart) extend
  it rather than adding a parallel harness.

---

## 11. Revision 2026-10-16 — in-page badges and the DevTools-panel resize

During validation the badge was moved from the shell overlay into the guest page,
for two reasons that turned out to be the same problem.

- **The DevTools panel resize was not observed.** Dragging the docked DevTools
  panel's divider changes the *page* viewport, but the shell/main process cannot
  see it: `siteView.getBounds()` does not change (verified: it stays `1440×900`
  while the page's `innerWidth` is `885`), its `bounds-changed` event never fires
  for a dock, and Electron's `WebContents` has no viewport-resize event. The page
  itself, however, does get a `resize` event — the same event Chrome's own
  readout uses.
- **Decision**: render both badges *inside* the page from the site preload
  (`src/preload/badges.ts`), so the page's own `resize` drives the size readout and
  `position: fixed; top; right` puts it exactly at the page's top-right — which
  follows the page's edges as the DevTools dock moves them (the zoom readout keeps
  the bottom-right corner). This replaces the
  shell-overlay + `viewport:changed` design and the window-`resize`-driven read
  (removed), and removes the shell's `desiredShellMode()` badge conditions (the
  badges no longer force the shell full-window).
- **Governance**: this is a third sanitized guest-page overlay, so Principle II
  was amended (constitution v2.3.0) to sanction the transient status badges on the
  picker's terms: pointer-through, no page-affecting behavior, elements removed
  when hidden, never exposed to page scripts.
- **Rejected alternative**: keep the badge in the shell and reconstruct the page
  rect (`innerWidth × zoomFactor`, content bounds, dock side, titlebar inset) while
  polling the page viewport to detect panel resizes — more fragile (multiple
  sources of truth) and a continuous per-frame poll on the user's page renderer
  versus an event the page already has.
- **Verified (harness)**: `zoomShown` and `suppressed` confirmed live; the size
  badge's `devtoolsResizeShown`/`matches` require a session that actually reflows
  the page (this dev box does not), and confirm on an interactive run.

### Follow-up: the pointer gate dropped zooms over most of the page

A regression report ("pinch and wheel zoom stopped working") traced to
`AppWindow.isPointerOverDevTools`, not to the badges: it treated the half of the
window nearest a docked DevTools as "over DevTools" and **silently dropped zoom
gestures there** — and it only applied while DevTools was open, so it surfaced
while testing this feature. It is now exact: `isPointerOverDevTools` uses the
page's own reported viewport (`page:viewport`) to place the panel's band, so a
gesture anywhere over the page reaches it and only a gesture actually over the
panel is skipped. Verified deterministically in the harness (`viewport.zoomGate`):
with the page at `1440×600` and a bottom dock, `y=300` is page, `y=700` is panel.

---

## 12. Final revision — the readouts render in the shell

Manual testing settled the architecture after two false starts, and this is the
shipped design.

- **In-page badges scaled with page zoom.** Rendering the readouts inside the page
  meant `setZoomFactor` scaled them too. Counter-scaling by the zoom factor
  (derived in-page from `devicePixelRatio`, applied in a `ResizeObserver` callback)
  was tried and still looked wrong: the counter-scale and the zoom render in
  different passes, so the badge visibly chased the zoom. **Decision**: render both
  readouts in the **shell overlay**, which page zoom never touches.
- **Placement without injection.** The readouts still sit at the page's corners, but
  main derives the corner insets: the page's **physical** rect is its reported
  viewport × the window zoom, positioned by the dock side and the titlebar inset.
  The renderer adds `STRIP_HEIGHT` to the size readout's top while the strip is up in
  overlay mode (in titlebar mode the page already starts below the strip).
- **Trigger without polling.** The trigger is the page's own reported viewport
  (`page:viewport`): the page's `resize` fires for a window resize, a **DevTools
  panel resize**, and a dock change, and it works with DevTools closed. No polling —
  it is the same signal a poll would sample, without the continuous cost. Reading
  the size from DevTools is not an option either: it is closed sometimes, and when
  open its front-end reports the whole window, not the page.
- **Zoom flicker.** Page zoom changes the CSS viewport, so it fires that `resize`.
  For ~400 ms after a zoom step the report is ignored for the size readout and the
  insets, so pinching shows only the zoom readout and never jitters the size
  readout's position (which also removed the vertical bob seen while pinching).
- **Shared look.** A single `Badge.vue` owns both readouts' styling and fade, so the
  two components are just value + corner.
- **Constitution unchanged.** Because nothing is injected into the page, Principle
  II's two exceptions stand; the v2.3.0 amendment (and a "third overlay") was
  reverted, and the rationale now notes the readouts render in the shell by design.
