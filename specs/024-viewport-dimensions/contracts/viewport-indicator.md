# Contract: Viewport Size Indicator

This contract fixes the externally observable interface of the feature. The size
readout (and the zoom readout it sits beside) render **in the shell overlay** —
never inside the guest page — so page zoom cannot scale them, while being
**placed at the guest page's corner** with insets derived from the page's reported
viewport. The built-in DevTools resize readout is suppressed.

---

## 1. Placement and hosting

- Both readouts render in the shell (Vue components `ZoomIndicator.vue` /
  `ViewportSizeIndicator.vue`) on a shared `Badge.vue` that owns the look and the
  fade. The size readout sits at the guest page's **top-right** corner; the zoom
  readout at its **bottom-right**. They occupy opposite corners and cannot occlude
  each other.
- The guest page is **not** modified (constitution II): the page only reports its
  own viewport; nothing is injected into the page.
- The shell spans the window (`full` mode) while a readout is visible so it can
  paint the page's corner, and collapses to zero chrome at rest.

## 2. Trigger contract

- The readouts are driven by the **page's own reported viewport**. The guest preload
  sends `page:viewport { width, height }` on `resize`, `load`, and
  `DOMContentLoaded`. That `resize` fires for a window resize, a **DevTools panel
  resize**, and a dock change — so no polling is needed, and it works with DevTools
  closed.
- **Zoom changes the page's CSS viewport** (so it fires that `resize` too). For
  ~400 ms after a zoom step the report is ignored for the size readout and the
  placement insets, so pinching shows only the zoom readout and never jitters the
  size readout's position.
- The zoom readout is triggered from main (keyboard/palette/gesture zoom).

---

## 3. Value contract

- **Quantity**: the guest page's layout viewport in CSS pixels, `width × height` —
  the same quantity the DevTools resize readout reports (the page's own
  `innerWidth`/`innerHeight`). Whole pixels; formatting is the single
  responsibility of `formatViewportSize` (`src/shared/viewport.ts`).
- **Lifetime**: visible immediately on the change and removed ~1.5 s after the last
  one; a burst keeps a single readout and restarts its timer.
- **No persistence**: nothing is written to the store; no schema change.

---

## 4. IPC contract

| Direction | Channel | Payload | Meaning |
|-----------|---------|---------|---------|
| guest → main | `page:viewport` | `{ width, height }` | The page's own viewport, after layout and on every page resize. |
| main → shell | `viewport:changed` | `{ width, height, insets }` | A page viewport change; show/refresh the size readout at this value and corner. |
| main → shell | `viewport:changed` | `null` | Its lifetime elapsed; hide it. |
| main → shell | `zoom:changed` | `{ percent, insets }` | A zoom change; show/refresh the zoom readout. |
| main → shell | `zoom:changed` | `null` | Its lifetime elapsed; hide it. |

**Rules**:
- Main ignores a pre-layout (zero) `page:viewport` report, so the pointer gate is
  permissive until a real size is known.
- Main ignores `page:viewport` reports inside the zoom-suppression window (§2) for
  the size readout and insets (a zoom does not change the page's physical size, so
  the stored value is still correct).
- `insets` = `{ top, right, bottom }` in device-independent pixels (see §6).

---

## 5. DevTools-native readout contract (suppression)

- The readout to suppress is the DevTools **Overlay** domain's viewport-size-on-
  resize overlay (`Overlay.setShowViewportSizeOnResize`), drawn by DevTools' own
  per-session `OverlayAgent`.
- **Suppression is driven from the DevTools front-end**, by sending
  `Overlay.setShowViewportSizeOnResize({ show: false })` over DevTools' own
  connection via the front-end host binding
  `InspectorFrontendHost.sendMessageToBackend` — see
  `src/main/shell/devtools-overlay.ts`; it is re-asserted on the existing DevTools
  poll tick (research §4).
- A page-session command (`webContents.debugger`) does **not** satisfy this
  contract; it leaves DevTools' own agent enabled (Chromium/Puppeteer #6819).

---

## 6. Placement contract (insets)

- The page's physical rect is the reported viewport × the window's zoom factor,
  placed by the dock side and the titlebar inset:
  - **bottom dock**: the panel occupies the lower band → `bottom = contentH − inset − pageH`, `right = 0`;
  - **right dock**: `right = contentW − pageW`, `bottom = 0`;
  - **left dock**: the page is on the right → `right = 0`, `bottom = 0`.
  - `top = titlebarInset`.
- The size readout uses `{ top, right }`; the zoom readout uses `{ right, bottom }`.
- **Strip offset (renderer)**: in overlay mode the strip floats over the page's top
  edge, so the size readout's `top` gains `STRIP_HEIGHT` while the strip is up
  (pinned or peeking). In titlebar mode the page already starts below the docked
  strip, so nothing is added.

---

## 7. Presentation contract

- On the shared `Badge`: fixed, 10 px corner margin, understated (small, tabular
  numerals), Tlapalli tokens (`--tb-bg-elevated`, `--tb-border`, `--tb-accent`),
  `pointer-events: none`, `aria-hidden`.
- Text: size `"{width} × {height}"`; zoom `"{percent}%"`.
- Reduced motion: instant show/hide (FR-016).

---

## 8. Testing contract

- **Unit** (`tests/unit/viewport.test.ts`): `formatViewportSize` (the `×`, rounding,
  non-finite/negative clamping) and `viewportSizeEquals`.
- **Integration** (`src/main/dock-test.ts`, `TLACHIALONI_DOCK_TEST=1`):
  `viewport.suppressed` (native readout off), `viewport.matches` (a reported
  viewport flashes the shell size readout with that value), `viewport.cleared`,
  `viewport.zoomShown` (the shell zoom readout renders), and `viewport.zoomGate`
  (the exact DevTools pointer band). `viewport.devtoolsResizeShown` is logged (a
  real dock change is environment-dependent).
- **Manual** (quickstart): the DevTools-panel-resize trigger, live-drag feel, strip
  offset, and reduced motion.
