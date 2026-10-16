# Phase 1 Data Model: Viewport Size Indicator

The feature introduces one ephemeral per-window status (the readout's presence),
one reported value from the guest page, and one pure formatter. There is no new
persisted entity, no schema change, and no database; the readouts render in the
shell.

---

## Entity: Viewport Size

The guest page's layout viewport for one window, in CSS pixels.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `width` | integer (px) | the page's own `window.innerWidth` | The value DevTools reports. |
| `height` | integer (px) | the page's own `window.innerHeight` | |

**Derivation**: the guest preload reports `{ width, height }` on `resize`, `load`,
and `DOMContentLoaded` (`page:viewport`). This fires for a window resize, a
**DevTools panel resize**, and a dock change — so no polling is needed, and it
works with DevTools closed.

**Validation rules**:
- FR-002: whole pixels; the shell renders `formatViewportSize(size)`.
- FR-011: never persisted — it describes the current viewport and is recomputed on
  every change.
- A pre-layout (zero) report is ignored; a zoom-induced report is ignored for the
  readout and insets (zoom changes the CSS viewport but not the page's physical
  size).

---

## Entity: Viewport Indicator (readout)

An ephemeral, non-interactive shell overlay confirming a viewport change.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `viewportStatus` | `{ width, height } \| null` | `AppWindow`, per window, **not persisted** | `null` = not shown. |
| `zoomStatus` | `{ percent } \| null` | `AppWindow` | The sibling zoom readout. |
| `pageViewport` | `{ width, height } \| null` | `AppWindow` | The page's **physical** size (CSS × zoom), for the panel band and insets. |
| `insets` | `{ top, right, bottom }` | derived (§6 of the contract) | Places the readouts at the page's corners. |
| shell refs | `viewportSize` / `zoomLevel` (`{ …, insets }`) | `useShell` | Drive `<ViewportSizeIndicator>` / `<ZoomIndicator>`. |

**Lifecycle**:

```
  no change ──page resize OR zoom──▶ readout shown
                                       │  ▲
                        another change │  │ refreshes value; restarts its timer
                                       ▼  │
                                   readout shown
                                       │
                     ~1.5 s after the last change
                                       ▼
                                    removed
```

**Behavioral rules**:
- FR-001/006: shown within 100 ms of a change; updates live.
- FR-007: removed within 2 s of the last change; never permanent chrome.
- FR-008: `pointer-events: none`, `aria-hidden`; the page underneath stays
  interactive.
- FR-009/010: size at the page's top-right, zoom at its bottom-right, via insets.
- FR-012: presentation only; the page is not modified.
- FR-014: physical placement from the reported viewport × zoom + dock side.
- Strip offset (renderer): +`STRIP_HEIGHT` on the size readout's `top` in overlay
  mode while the strip is up.
- FR-016: reduced motion → instant show/hide.

---

## Entity: Viewport Size Formatter (pure)

`src/shared/viewport.ts` (the analogue of `src/shared/zoom.ts`), shared by the
shell renderer and Vitest.

| Function | Signature | Behavior |
|----------|-----------|----------|
| `formatViewportSize` | `(size) => string` | `"1280 × 720"` (U+00D7), whole pixels, clamping non-finite/negative. |
| `normalizeViewportSize` | `(size) => ViewportSize` | Whole, non-negative pixels. |
| `viewportSizeEquals` | `(a, b) => boolean` | Whether two reads are the same size (so a redundant resize does not re-show). |

---

## Relationship to existing entities

| Existing entity | Relationship |
|-----------------|--------------|
| Guest site preload (`src/preload/site.ts`) | Reports `page:viewport` on resize — the readout's value and trigger. Does not modify the page. |
| `AppWindow` (`src/main/shell/window.ts`) | Gains `viewportStatus`/`zoomStatus`, the page viewport, and the inset derivation; `desiredShellMode()` returns `full` while either readout shows. |
| `DevToolsController` (`src/main/shell/devtools.ts`) | Turns the DevTools resize readout off, re-asserted on its poll tick; its `isPointerOverDevTools` gate uses the physical page viewport. |
| Renderer shell (`App.vue`, `useShell`, `Badge.vue`, the two readouts) | The readouts; the shared `Badge` owns their look and fade. |
| `WindowRecord` (`src/main/state/schema.ts`) | **Unchanged** — no persisted field, no schema bump. |
| Zoom readout (specs/023) | Sibling readout on the shared `Badge`, at the page's bottom-right. |
