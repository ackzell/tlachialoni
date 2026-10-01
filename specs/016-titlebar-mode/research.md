# Phase 0 Research: Titlebar Mode

The Technical Context had no `NEEDS CLARIFICATION` markers: the runtime, storage, and
shell architecture are fixed by 001/004/009/012/013, and the product decisions were
resolved while specifying (opt-in per-window mode; `⇧⌘F` plus a palette row; the strip
keeps its current height and the page gets the remainder; `⌘B` is superseded while the
mode is on; new windows start in overlay mode). The decisions below are the
implementation choices that follow, plus the three spike items that must be retired
before UI work. Section numbers are referenced from `plan.md` M0 and from
`contracts/titlebar-layout-protocol.md`.

## 1. Layout: inset the guest view below a docked shell strip

- **Decision**: In titlebar mode, inset the guest `WebContentsView` to
  `{ x: 0, y: STRIP_HEIGHT, width, height - STRIP_HEIGHT }` and keep the shell
  `WebContentsView` at `{ x: 0, y: 0, width, STRIP_HEIGHT }` (or full-window while a
  full-window surface is up). The strip paints in the shell view's top band; the page
  and docked DevTools occupy the site view below it.
- **Rationale**: The window is already `BaseWindow` + two stacked `WebContentsView`s
  with the shell transparent except where it opts into pointer events, and 013 already
  resizes the shell view between `DRAG_BAND_HEIGHT`, `STRIP_HEIGHT`, and `full`. Making
  the guest view the inset element is the smallest change that yields a *real* reflow
  (the page's viewport shrinks) rather than a fake translate/clip, which FR-005
  requires. The two views then tile the window with no overlap at rest, and the
  existing settle protocol still governs the shell's shrink when the mode is turned
  off.
- **Alternatives considered**:
  - *Keep the site view full and paint an opaque strip over the page's top* (rejected:
    that is a permanent overlay, not a pushed layout — the top of the page stays
    hidden, violating FR-004 and the whole point of the feature).
  - *A third `WebContentsView` for the titlebar* (rejected: a second shell renderer
    would duplicate `DragStrip` and its traffic-light/state coordination for no gain).
  - *CSS-only inset inside the guest page* (rejected: it modifies the guest page —
    constitution II — and cannot move docked DevTools).

## 2. Shell modes: reuse `full | strip | band`

- **Decision**: Keep the 013 `ShellMode = "full" | "strip" | "band"`. In titlebar mode,
  `desiredShellMode()` returns `full` when a full-window surface is up and `strip`
  otherwise; the site inset is computed independently of the shell mode. No `docked`
  mode is added.
- **Rationale**: `strip` already sizes the shell view to exactly `STRIP_HEIGHT`, which
  is what a docked strip needs; `full` already hosts every transient surface. Adding a
  fourth mode would duplicate those bounds and force a new settle branch. The only new
  concept is "the page starts lower," which belongs to the site bounds, not the shell
  mode.
- **Alternatives considered**: a dedicated `docked` shell mode (rejected: identical
  bounds to `strip`, plus new transitions and a second source of truth); growing the
  shell to `full` always in titlebar mode (rejected: it would paint an unnecessary
  full-window transparent view at rest).

## 3. Strip visibility and traffic lights from one predicate

- **Decision**: Extend the shared predicate to
  `isStripSurfaceVisible(state, paletteOpen)` where `titlebarMode` short-circuits to
  `true`; keep it the single predicate read by the renderer (whether `DragStrip`
  mounts) and by main (`syncWindowButtons`, whether the macOS traffic lights show).
  Add a shared `titlebarInset(titlebarMode)` helper returning `STRIP_HEIGHT` or `0`.
- **Rationale**: 009 FR-004 and 013 already make this predicate the one place the
  strip surface and its native controls cannot drift. A docked strip is a strip
  surface that is always on, including over the palette, so expressing it as a
  short-circuit keeps both consumers correct with no new channel and no duplicated
  rule. The inset helper keeps main's site bounds and the renderer's surface offset on
  the same constant.
- **Alternatives considered**: a separate `titlebarVisible` signal pushed on a new
  channel (rejected: `titlebarMode` is durable per-window state and already travels on
  `state:changed`; a second channel would invite drift); letting `paletteOpen` suppress
  the docked strip (rejected: FR-012 requires the strip to stay while surfaces are up).

## 4. Full-window surfaces under the docked strip

- **Decision**: While a full-window surface (palette, loading veil, failure view,
  extension status, dev preview, blank watermark, history overlay) is up, the shell
  view spans the window but each surface offsets its top by the content inset
  (`--shell-inset` = `STRIP_HEIGHT` under `.is-titlebar`). The strip keeps `z-index`
  above the surfaces.
- **Rationale**: The surfaces must own the content area below the strip and must not
  hide or displace it (FR-012), while the strip must stay visible and clickable. The
  existing stacking (strip `z-index: 2`, surfaces `auto`) already puts the strip on
  top; offsetting the surfaces' top keeps their content out from under it and keeps
  the backdrop from dimming it behind the opaque strip.
- **Alternatives considered**: shrinking the shell view to the content area while a
  surface is up (rejected: the strip lives in the same view and would be clipped);
  leaving surfaces full-bleed and relying on the opaque strip to cover the top 30px
  (rejected: simplest, but it would hide the top of centered surface content and read
  as "the strip covers the palette," contrary to FR-012).

## 5. Peek dormancy and `⌘B`

- **Decision**: While `titlebarActive()`, `proximityPaused()` returns true (so the
  hover/peek sensor neither reveals nor dismisses), any peek is cleared on toggle-on,
  and `toggleStrip()` (`⌘B`) returns early so it neither shows a second strip nor
  changes the persisted pin. Turning the mode off restores the peek sensor and `⌘B`
  unchanged.
- **Rationale**: With a permanent strip there is nothing to reveal or dismiss, and a
  `⌘B` that mutated `stripVisible` would surprise the developer when the mode is later
  turned off (FR-015). Leaving the persisted pin untouched means the overlay layout the
  developer had before the mode is exactly the one they get back.
- **Alternatives considered**: keep sensing but ignore results (rejected: needless
  wakeups); let `⌘B` toggle the pin invisibly (rejected: a hidden state change that
  later manifests — worse than a clean no-op).

## 6. Persistence without a schema bump

- **Decision**: Add `WindowRecord.titlebarMode: boolean` defaulting to `false` and teach
  `sanitizeWindowRecord` to coerce it; keep `SCHEMA_VERSION = 3`.
- **Rationale**: The field is additive and safely defaulted: an older file without it
  reads `false`, and an older app version rebuilds records from known fields and simply
  drops the unknown one. 012 already reads the `windows` array before the version gate,
  so no migration path is triggered. A version bump would add ceremony without changing
  any behavior.
- **Alternatives considered**: bump to schema 4 (rejected: no migration is needed and
  the guard already handles an absent field; 013/015 also deliberately held schema 3);
  store the mode as a shared/global preference (rejected: it is per-window by spec
  FR-008 and constitution V).

## 7. Command, accelerator, and menu

- **Decision**: Add the `titlebar.toggle` command (`Toggle Titlebar Mode`, `⇧⌘F`,
  palette group `other`, listed) and add it to the **View** menu. Register it in
  `AppWindow.registerCommands` as `() => this.toggleTitlebar()`.
- **Rationale**: Placing it beside `strip.toggle` in the catalog and the View menu
  groups the two chrome toggles and gives it the same OS-accelerator path that keeps
  shortcuts working while DevTools has focus. `⇧⌘F` is unbound today (checked against
  the full catalog) and is not claimed by DevTools.
- **Alternatives considered**: `group: "view"` (rejected: `strip.toggle` lives in
  `other`, and the two belong together); an action-menu-only entry (rejected: every
  shell capability must be palette-listed — constitution III).

## 8. Spike: docked DevTools follow the inset

- **Decision (to retire in M0)**: verify that insetting the guest `WebContentsView`
  relocates and resizes docked Chromium DevTools on **bottom**, **right**, and **left**
  docks, with `window.innerHeight`/`innerWidth` reflecting the reduced guest viewport
  and DevTools still interactive below the strip.
- **Rationale**: DevTools dock inside the guest view's own region (proven by the
  existing `runDockSelfTest`). The whole FR-011 promise rests on that region being the
  inset site view. If a dock side does not follow, the fallback is to re-open DevTools
  on its dock side after a bounds change, and to record the limitation.
- **Alternatives considered**: none that avoid the native call; the existing headless
  harness already measures docked DevTools, so the spike is cheap.

## 9. Spike: a bounds change preserves guest state (no reload)

- **Decision (to retire in M0)**: plant a sentinel on the guest `window` object and a
  history entry, toggle titlebar mode on and off, and confirm the sentinel survives,
  the history stack is intact, and `did-start-loading`/`did-finish-load` do not fire.
- **Rationale**: FR-006 and SC-003 require toggling to be a pure layout change. A
  `WebContentsView.setBounds` is expected to behave like a window resize (no
  navigation), but a sentinel makes it observable and protects against a regression
  that silently reloads.
- **Alternatives considered**: trust the API and assert only `innerHeight` (rejected:
  cheap to prove, and a reload would be a severe, user-visible regression).

## 10. Spike: traffic lights, the 30px strip, and fullscreen

- **Decision (to retire in M0)**: confirm the native traffic lights sit inside the
  docked 30px strip and remain correct in fullscreen (where macOS manages them), then
  re-apply the strip layout on leaving fullscreen.
- **Rationale**: 009 established the lights track the strip predicate and the strip
  reserves a 68px left inset. A permanent strip means the lights are always shown in
  this mode; the only new risk is the fullscreen handoff.
- **Alternatives considered**: hide the strip in fullscreen (rejected: it would break
  the mode's promise and the layout that depends on the strip's height).

## 11. M0 outcomes

The three M0 items (docked DevTools under the inset, no reload across a bounds change,
and traffic lights + the 30px strip including fullscreen) were retired by manual
validation during the implementation review; no fallback was needed. The permanent
strip docks at `STRIP_HEIGHT` above the inset guest view, docked DevTools follow the
inset on every dock side, toggling is a pure bounds change with no reload, and the
layout holds on resize and across fullscreen. The headless harness
(`TLACHIALONI_DOCK_TEST`) now also asserts the inset bounds, the reduced
`window.innerHeight`, the surviving page sentinel, and the restored overlay.

## 12. Deferred follow-up

The docked strip's bottom border is not visible in some states. This predates titlebar
mode (the overlay strip shows the same symptom) and is intentionally out of scope here;
it is tracked for a separate fix.

