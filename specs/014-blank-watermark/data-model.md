# Phase 1 Data Model: Blank-Page Watermark

**No persisted shape changes.** The store stays at **schema version 3** as 012 defined
it. The feature adds no field, removes nothing, and migrates nothing. "Blank" is
derived from the existing per-window `target`, and the watermark's appearance is
derived from existing theme tokens. The authoritative persisted shape remains
`specs/012-multi-window/contracts/state.schema.json`.

## Persisted

### WindowRecord (unchanged, relevant field only)

| Attribute | Type | Default | Purpose / requirements |
| --- | --- | --- | --- |
| `target` | string \| null | `null` | The window's page. `null` until a load commits — the blank signal this feature keys off (FR-001, FR-004). |

A blank window is "one whose `target` is `null` and whose guest view has never
committed a load." Main patches `target` on the first successful load
(`handleReady`) and on every navigation (`handleNavigated`), so the transition out of
"blank" is exactly the transition into "has a target."

## Runtime entities

### Blank surface

The decorative watermark layer in the shell renderer.

| Attribute | Value | Notes |
| --- | --- | --- |
| Painted | the logo mark, centered and faded | FR-001, FR-008 |
| Interactive | none (`pointer-events: none`, `aria-hidden`) | FR-002 |
| Mounted when | `isBlankSurfaceVisible(state) && !loading && !failed` | FR-003 |
| Painted beneath | command palette and its backdrop | FR-003 |
| Color source | `--tb-accent` → the mark's `currentColor` accents | FR-006 |
| Light mode | `invert(1) hue-rotate(180deg)` | FR-007 |
| Scaled | responsive to the window (`min(46vmin, 360px)`), centered | FR-008 |

### Blank predicate

Evaluated by both main and the renderer from the same shared function so they cannot
drift (mirrors `isStripSurfaceVisible`):

```text
isBlankSurfaceVisible(state) = state.target == null
```

| Consumer | Use | Requirement |
| --- | --- | --- |
| `App.vue` (renderer) | whether `BlankView` mounts | FR-001, FR-003 |
| `desiredShellMode()` (main) | whether the shell stays `full` instead of `band` | FR-004 (the surface would otherwise be clipped/hidden) |

### Shell mode

| Mode | When | Shell bounds |
| --- | --- | --- |
| `full` | palette, loading veil, failure view, extension status, dev preview, **or a blank window** | full window |
| `band` | otherwise | full width × `DRAG_BAND_HEIGHT` (36px) |

The blank case is added to the existing `full` set; no new mode is introduced.

### Derived mark

| Attribute | Value | Notes |
| --- | --- | --- |
| Source | `resources/logo.svg` (committed icon art) | unchanged |
| Bundle | `src/renderer/src/assets/logo.svg` | derived copy |
| Derivation | `path334` and `path335` use `fill:currentColor` | only difference from source (FR-006) |
| Transport | imported as a raw string (`?raw`) and inlined | required for `currentColor` to resolve |

## State machine: blank lifecycle

```text
   new window / restored null target
        │
        ├── palette armed ──► palette covers the watermark (backdrop above it)
        │        │
        │        └── dismissed, still blank ──► watermark visible, full shell
        │
        └── target commits ──► blank=false ──► watermark gone for good
                 ▲
   loading veil / failure view  ──►  surface owns the window; watermark yields,
                                     returns only if the window is still blank
```

Transitions and effects:

| Event | Watermark effect | Persisted effect |
| --- | --- | --- |
| Window starts with `target: null` | shown (once state arrives; not while loading/failed) | none |
| Location palette opens | painted beneath the palette backdrop | none |
| Location palette dismissed, still blank | remains shown; shell stays `full` | none |
| Target begins loading | hidden (loading veil owns the window) | none |
| Target commits | hidden permanently | `target` patched |
| Load fails on a blank window | hidden while the failure view is up | none |
| Variant changes | accent details re-resolve via `currentColor` | `variant` patched (existing) |
| Color mode changes | light/dark treatment re-resolves | `colorMode` patched (existing) |
| Window closed | nothing to clean up | record removed (existing) |

## Invariants

- The watermark is never visible while a target has loaded (FR-005); `target == null`
  is the sole gate.
- The watermark never captures input and never reduces the drag band's area (FR-002).
- The loader/palette/failure surfaces always paint above and behave identically
  (FR-003, FR-010).
- The derived mark differs from the committed source art only in the two
  `currentColor` fills (FR-006).
- No persisted field is added or changed (FR-009).
