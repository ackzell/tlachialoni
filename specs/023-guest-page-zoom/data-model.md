# Phase 1 Data Model: Guest Page Zoom

The feature introduces one persisted per-window field, one ephemeral per-window status, and one
ephemeral gesture accumulator. There are no new persisted top-level entities and no database; state
lives in the existing JSON store.

---

## Entity: Zoom Level

The guest page's rendering scale for one window, expressed as an index into a fixed ladder.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `zoomIndex` | integer, `0 … ZOOM_STEPS.length - 1` | persisted in `WindowRecord` | Points at the current factor. Default index is the position of `1.0`. |
| derived: `factor` | number | `ZOOM_STEPS[zoomIndex]` | Passed to `webContents.setZoomFactor`. |
| derived: `percent` | integer | `Math.round(factor * 100)` | Shown by the indicator as `NN%`. |

**Ladder (`ZOOM_STEPS`)**: `[0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0]` — 25%–500% in standard browser steps.

**Default**: `DEFAULT_ZOOM_INDEX` = index of `1.0` (100%).

**Input sources** (all move the same ladder):
| Source | Direction | Notes |
|--------|-----------|-------|
| Keyboard | `⌘+` in, `⌘-` out, `⌘0` reset | one step per press (FR-004) |
| Command palette | *Zoom In / Out / Reset* | identical to the keyboard (FR-006) |
| Command + wheel | up in, down out | one step per `zoom-changed` event (FR-016) |
| Trackpad pinch | spread in, together out | accumulated to steps (FR-017); path set by the spike |

**Validation rules**:
- FR-001/002: stepping moves exactly one ladder position; the value is always a ladder member.
- FR-003: reset sets `zoomIndex = DEFAULT_ZOOM_INDEX` in one action.
- FR-013/FR-018: only ladder members are reachable by **any** input, including gestures — no
  continuous factor.
- FR-014: a step past either end clamps to the nearest end (`0` … `length - 1`); no error.
- FR-011/FR-012: per-window; persisted and reproduced after relaunch.
- Sanitization: a missing, non-integer, or out-of-range stored value falls back to
  `DEFAULT_ZOOM_INDEX`.

**State transitions**:

```
                 zoom in (+1)                         zoom out (-1)
   [min: 25%] ───────────────▶ … ▶ [100%] ▶ … ▶ [max: 500%]
      ▲   │                          ▲                │   ▲
      │   └────────── zoom out (-1) ─┘                │   │
      └────────────────────────── zoom in at max ─────┘   │
                          (no-op, stays at max)           │
   reset (⌘0): any state ───────────────────────────────▶ [100%]
```

- At `max`, an "in" input stays at `max` (no-op) and still reports the indicator; likewise `min`.
- `reset` from any state lands on `100%` and reports the indicator.

**Ownership contract**: the guest webContents is put in `setZoomMode("isolated")`, so our factor is
per-webContents while Chromium still renders it; the persisted `zoomIndex` is re-applied after each
top-level navigation commit so the window's scale survives target changes. (`manual` mode was rejected
— it changes the value but never repaints the page.)

---

## Entity: Gesture Accumulator (transient, not persisted)

Maps a continuous gesture onto the discrete ladder. There is **one accumulator per input source** per
window, so a mouse notch, a trackpad scroll, and a pinch never mix their leftover travel.

| Field | Type | Notes |
|-------|------|-------|
| `zoomMouseAccumulator` | number | Mouse-wheel travel (`deltaY` ~1–2 per event, ~10 events/notch). |
| `zoomWheelAccumulator` | number | Trackpad Command + scroll travel. |
| `zoomPinchAccumulator` | number | Pinch magnification. |
| threshold | constant | Travel at which one ladder step is emitted; the remainder carries over. |

**Thresholds** (tuned by hand): `ZOOM_WHEEL_MOUSE_STEP = 12`, `ZOOM_WHEEL_TRACKPAD_STEP = 120`,
`ZOOM_PINCH_STEP = 0.3`.

**Rules**:
- Each source is classified natively: a wheel event with no phase/momentum (`discrete`) is a mouse
  notch; a phased stream is a trackpad; a `magnify` event is a pinch.
- The mouse and trackpad have **opposite `deltaY` signs**, so only the trackpad path is negated.
- After 160 ms with no input the accumulators reset to `0`, so a gesture never "carries" across
  separate touches.
- The sign selects the direction: scrolling up / spreading → `view.zoomIn`.
- This entity is purely transient; it is never written to disk and never affects persistence beyond
  the `zoomIndex` steps it produces.

---

## Entity: Zoom Indicator

An ephemeral, non-interactive overlay that confirms a zoom change.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `percent` | integer | derived from the current Zoom Level | Rendered as `NN%` in the bottom-right corner. |
| presence | `ZoomStatus | null` (`{ percent: number }`) | main process, per window, not persisted | `null` means not shown. |

**Lifecycle**:

```
  no change ──zoom change──▶ visible(percent) ──~1.5 s with no further change──▶ hidden
                                 │  ▲
                    another zoom │  │ updates percent, restarts the timer
                                 ▼  │
                              visible(new percent)
```

**Behavioral rules**:
- FR-007: visible within 100 ms of any zoom change (keyboard, palette, wheel, or pinch).
- FR-008: disappears within 2 s of the last change; never permanent chrome.
- FR-009: `pointer-events: none`, `aria-hidden`; clicks/scrolls over it reach the page.
- FR-010: a shell surface; it never rescales with the page and the page never rescales it.
- SC-007: while hidden it paints zero pixels.
- Reduced motion: still appears and disappears, instantly.

---

## Relationship to existing entities

| Existing entity | Relationship |
|-----------------|--------------|
| `WindowRecord` (`src/main/state/schema.ts`) | Gains `zoomIndex: number`. Schema 3 → 4; additive and defaulted (older document reads as 100%). |
| Guest `WebContentsView` (`src/main/shell/site-view.ts`) | Set to `zoomMode = "isolated"` by the window; only its webContents is scaled. Never the shell or DevTools view. |
| Command catalog (`src/shared/commands.ts`) | Gains `view.zoomIn/Out/Reset` in the `view` group; `Accelerator` gains optional `shiftInsensitive` and `menuAccelerator`. |
| Shell surface state (`AppWindow`) | Gains `zoomStatus` (a transient full-window surface) and the three per-window gesture accumulators. |
| Renderer shell state (`useShell`) | Gains a read-only `zoomLevel` ref fed by the `zoom:changed` event. |
| Native swipe addon (`native/swipe-navigation`, `src/main/shell/swipe/`) | Extended: its `NSEvent` monitor now also reports Command + scroll and pinch via a new `onZoom` callback, routed to the window under the pointer. Swipe behavior is unchanged (research §12). |
