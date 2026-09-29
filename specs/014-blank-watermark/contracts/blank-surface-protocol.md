# Contract: Blank Surface Protocol

Defines the runtime interface for the blank-page watermark: the shared predicate, the
main-process shell-mode rule, the renderer surface, and the derived mark. Nothing here
is persisted, and no IPC channel or capability is added.

## Shared predicate (authoritative)

`src/shared/shell.ts`:

```ts
export function isBlankSurfaceVisible(state: { target: string | null }): boolean {
  return state.target == null;
}
```

- **Consumers**: the shell renderer (`App.vue`, whether `BlankView` mounts) and main
  (`desiredShellMode()`, whether the shell stays full instead of collapsing to the
  band). Both MUST use this function so they cannot disagree, mirroring
  `isStripSurfaceVisible` (013 FR-008).
- `target` is the per-window record's page, `null` until a load commits.
- The predicate is deliberately independent of every other surface flag; the
  renderer additionally refuses to mount the surface while loading or failed, so
  those surfaces own the window (FR-003).

## Shell mode rule

`src/main/shell/window.ts`, `desiredShellMode()`:

```text
full  when paletteOpen || showLoading || failed || extensionStatus || devPreview
      || isBlankSurfaceVisible({ target: record?.target ?? null })
strip when isStripSurfaceVisible({ stripVisible, peeking })
band  otherwise
```

- A blank window MUST be `full`; the smaller `band` (10px) or `strip` (30px) modes
  size the shell view to a top band and would clip and hide the watermark (FR-004).
- This adds a case to the existing `full` set; no bounds logic and no
  settle-protocol change.
- The record's `target` flips from `null` on the first committed load
  (`handleReady` / `handleNavigated`), which is exactly when the watermark must go.

## Renderer surface contract

`src/renderer/src/components/BlankView.vue`, mounted from `App.vue`:

| Property | Requirement |
| --- | --- |
| Mount condition | `isBlankSurfaceVisible(state) && !loading && !failed` (FR-001, FR-003) |
| Paint order | bottom-most surface in `.shell-root`; beneath veil, failure, band, strip, palette, status (FR-003) |
| Input | `pointer-events: none`, `aria-hidden="true"`; never captures pointer/keyboard (FR-002) |
| Layout | full-window, centered mark, responsive size (FR-008) |
| Emphasis | faint opacity so it never competes with palette text (FR-008, SC-005) |

`App.vue` order (first = bottom): `BlankView`, veil, failure, `DragBand`, strip,
palette, status.

## Mark contract

`src/renderer/src/assets/logo.svg`:

- A copy of `resources/logo.svg` (committed source art) in which **only** `path334`
  and `path335` use `fill:currentColor`. Every other byte matches the source (FR-006).
- Imported as a raw string (`?raw`) and inlined into the document; it MUST NOT be
  used as a CSS background or `<img>` source, because `currentColor` only resolves in
  the live document.
- The host element sets `color: var(--tb-accent)`, so the two accents track the
  window's Tlapalli variant; the remaining artwork is fixed (FR-006).

## Light/dark contract

- The window's resolved mode (dark/light, already following the OS in "system" mode)
  selects the treatment.
- Light mode applies `filter: invert(1) hue-rotate(180deg)` to keep the mark visible
  while preserving the accent hue; dark mode applies no filter (FR-007).
- The rule is global (a component-scoped ancestor selector cannot reach
  `:root[data-mode]`); it is scoped by its `.blank` subject so it only reaches this
  surface.

## Failure / edge behavior

- **Loading / failure**: `App.vue` gates on `!loading && !failed`; those surfaces
  paint above and own input. If the window is still blank afterward, the watermark
  returns.
- **Palette**: painted above the watermark; the watermark may show faintly through the
  translucent backdrop but never reduces legibility.
- **Navigation**: the watermark disappears the moment a target commits and never
  returns for that window.
- **Multi-window**: every value here is per `AppWindow`; no cross-window channel or
  shared flag is introduced.
- **No new IPC**: the surface is driven entirely by the existing `state:changed`
  payload and the existing loading/failure channels.
