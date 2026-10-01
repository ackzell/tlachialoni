# Contract: Titlebar Layout Protocol

Defines the runtime interface between main, the shell renderer, and the macOS window
controls for titlebar mode. The mode is durable per-window state; nothing here adds an
IPC channel or a capability.

## Shared predicate and inset helper (authoritative)

`src/shared/shell.ts`:

```ts
export const STRIP_HEIGHT = 30;

/** Whether the strip surface should be on screen. */
export function isStripSurfaceVisible(
  state: { stripVisible: boolean; peeking?: boolean; titlebarMode?: boolean },
  paletteOpen: boolean,
): boolean {
  if (state.titlebarMode === true) return true;
  return (state.stripVisible || state.peeking === true) && !paletteOpen;
}

/** Vertical inset of the guest content when the strip is docked. */
export function titlebarInset(titlebarMode: boolean): number {
  return titlebarMode ? STRIP_HEIGHT : 0;
}
```

- **Consumers**: the shell renderer (whether `DragStrip` mounts, and `--shell-inset`)
  and main (`syncWindowButtons`, whether the traffic lights show; `relayout`, the site
  bounds). Both sides MUST use these functions/constants so they cannot disagree
  (spec FR-007/FR-012, 009 FR-004).
- `titlebarMode` short-circuits the predicate: the docked strip is visible even while
  the palette or another full-window surface is up.
- `titlebarInset` is the single value for both main's `siteView.setBounds` `y` and the
  renderer's `--shell-inset` custom property.

## Command

| Command id | Label | Accelerator | Palette | Group |
| --- | --- | --- | --- | --- |
| `titlebar.toggle` | Toggle Titlebar Mode | `⇧⌘F` (`{ meta, shift, code: "KeyF" }`, label `⇧⌘F`) | yes | `other` |

- Dispatched through the existing `command:run` IPC and `CommandRegistry`; registered
  in `AppWindow.registerCommands` as `() => this.toggleTitlebar()`.
- Added to the **View** menu, so it carries an OS accelerator and works while DevTools
  has focus (existing `menuItemFor` path).
- `⇧⌘F` is unbound elsewhere in `COMMANDS` and is not claimed by DevTools.

## State channel (no new channel)

`state:changed` / `getState()` add one field on the existing window view:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `titlebarMode` | boolean | `false` | Persisted per window; drives the renderer gating and inset |

No new channel, no new preload method, and no new capability. `useShell` stores it in
`ShellState` and `App.vue` reads it.

## Layout contract (main)

`src/main/shell/window.ts`:

- `relayout()` sets `siteView.setBounds({ x: 0, y: inset, width, height: max(0, height
  - inset) })` where `inset = titlebarInset(titlebarActive())`. It does this on every
  relayout, so a resize recomputes the inset.
- `desiredShellMode()`: `full` when a full-window surface is up; otherwise `strip` when
  `titlebarActive()`; otherwise the existing pinned/peek/band rule.
- `applyShellMode("strip")` sizes `shellView` to `STRIP_HEIGHT`; `"full"` sizes it to
  the whole window.
- `syncWindowButtons()` passes `titlebarMode` into `isStripSurfaceVisible`, so the
  traffic lights are shown for the whole time the docked strip is on screen.
- `toggleTitlebar()` flips the flag and relayouts: enabling applies immediately;
  disabling restores the site to full at once and defers the shell `strip → band`
  shrink through the settle protocol (`contracts/settle-protocol.md`, 004/013).
- `proximityPaused()` includes `titlebarActive()`; enabling clears any peek.
- `toggleStrip()` (`⌘B`) returns early while `titlebarActive()` (FR-015).

Layout identity while the mode is on and no surface is up:

```text
strip:  { x: 0, y: 0,               width, height: STRIP_HEIGHT }
content:{ x: 0, y: STRIP_HEIGHT,    width, height: windowHeight - STRIP_HEIGHT }
```

The two regions tile the window exactly — no overlap, no gap.

## Renderer contract

`src/renderer/src/...`:

- `App.vue` computes `stripVisible` from `isStripSurfaceVisible({ ...state,
  peeking }, paletteOpen)`, so the strip is always mounted in titlebar mode; the
  always-on `DragBand` remains mounted beneath it (harmless; the opaque strip covers
  it).
- `App.vue` adds an `is-titlebar` class to `.shell-root`; `styles/base.css` maps that to
  `--shell-inset: 30px` (`0` otherwise). Full-window surfaces
  (`CommandPalette`, `LoadingVeil`, `FailureView`, `InstallStatus`, `BlankView`,
  `HistoryOverlay`) offset their top by `var(--shell-inset)` so their content occupies
  the area below the strip.
- The strip keeps `z-index: 2` above the surfaces, so it is never hidden or displaced
  and its controls stay clickable.

## Lifecycle / edge behavior

- Toggling never navigates: no `loadURL`, and `did-start-loading`/`did-finish-load` do
  not fire (FR-006).
- A resize while the mode is on recomputes the inset; the strip height stays constant
  (FR-013, SC-006).
- Docked DevTools live inside `siteView`, so opening, closing, or re-docking keeps the
  panel below the strip (FR-011).
- Fullscreen keeps the strip docked; leaving fullscreen re-applies the layout (FR-016).
- Multi-window: `titlebarMode` is per `WindowRecord`, and every read is per
  `AppWindow`; no cross-window channel or shared flag is introduced (FR-008).
- If the shell renderer is not ready, the existing queued `state:changed` path delivers
  the flag, so an early toggle is not lost.
