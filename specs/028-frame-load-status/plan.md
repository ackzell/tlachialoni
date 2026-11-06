# Implementation Plan: Frame Load Status

**Branch**: `028-frame-load-status` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-frame-load-status/spec.md`

## Summary

Fill a failed frame's rectangle with the window's base surface and state the
reason inside it. Chromium leaves a blocked frame as an opaque white canvas with
no error page, so the tool draws the box itself. The box lives in the guest page,
in a closed shadow root, because a shell overlay can only learn a frame's
rectangle after the page has already reflowed and therefore trails it; a box in
the page is placed after layout and before paint. The reason vocabulary is the
one the main-frame failure page already uses, enriched with the framing policy
observed in the page's console output.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Vue 3.5.43, Node 24, Electron 44.5.1

**Primary Dependencies**: Electron `WebContents` frame load events and the
console-message event; the preload's isolated world, a closed shadow root, and
`ResizeObserver`; the existing `CommandRegistry` and transient-surface machinery.
No new dependency.

**Storage**: None. Markers are runtime state and are never persisted.

**Testing**: Vitest through `vp test`. The reason mapping, the framing-policy
parsing, and the marker rules are pure functions in `src/shared/`, so they carry
unit tests in `tests/unit/`. The drawn box needs a DOM, so it is checked by the
Developer-menu preview, and for real by the test card's `/frames` page, which
embeds three frames that fail and one that loads.

**Target Platform**: macOS desktop app (Electron). No platform-specific code.

**Project Type**: Desktop application with a main process, a preload bridge, and a
Vue renderer.

**Performance Goals**: A marker appears within 1 second of the frame failure. A
scroll or resize update moves the box in the same layout pass as the frame; it is
one `getBoundingClientRect` and four style writes per marked frame.

**Constraints**: One transient host node in a closed shadow root while a frame is
marked, and no other page change (constitution II, amended to 2.3.0). No
always-visible chrome (constitution I). The host must not change the page's
viewport size, must not intercept input, and must sit beneath every shell surface
— which it does by construction, because the page is below the shell view.

**Scale/Scope**: One shared module, one preload module, one event on the guest
view, one field on the window, one Developer-menu entry, and the tests around the
shared rules.

## Measured Findings

Measured against Electron 44.5.1 with a local page framing
`https://yehyecoa-vue.ackzell.dev/`, which sends
`Content-Security-Policy: frame-ancestors 'self' https://ackzell.dev`:

| Observation | Value |
| --- | --- |
| Console message | `Framing '…' violates the following Content Security Policy directive: "frame-ancestors …". The request has been blocked.` |
| Frame load failure | code `-27`, `ERR_BLOCKED_BY_RESPONSE`, `isMainFrame: false` |
| Frame document after the block | URL `null`, no body, no children |
| Pixels painted inside the frame | none; the captured image shows an empty box |
| Ordering | console message arrives before the frame load failure |

This disproves the "Chromium paints its own refused-to-connect page" assumption:
the tool must report the case itself. The measured ordering is also what makes
the policy-enrichment step possible.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Verdict | Evidence |
|-----------|---------|----------|
| I. Chromeless by Default | Pass | Nothing is painted unless a frame fails. The marker then replaces a place that is already broken, and it clears with the page's own navigation. |
| II. The Guest Page is Sacred | Pass (as amended to 2.3.0) | One host node in a closed shadow root while a frame is marked, removed on recovery, dismissal, or navigation. The page's own nodes, styles, and scripts are untouched. The amendment records why: Electron cannot substitute a document in the frame slot. |
| III. Keyboard-First Ergonomics | Pass | The marker reports state only; it adds no capability, so nothing new must be reachable from the palette. Escape keeps its existing jobs. |
| IV. Real Chromium DevTools, Docked | Pass | No change to docking. DevTools frames are a different web contents and are not monitored (FR-016). |
| V. One Target Per Window | Pass | Markers belong to the window's current page and are cleared when that page navigates. |
| VI. Identity Through Tlapalli | Pass | Main pushes the active variant's five `--tb-*` values to the page whenever the theme changes, so the box follows the window. |
| Security & Isolation | Pass | The guest receives one main-to-preload message and answers with one address list; nothing reaches page scripts, and the shadow root is closed. |
| State | Pass | Nothing is persisted. Markers are cleared on navigation, so a stale report cannot survive a relaunch. |
| Packaging & Distribution | Pass | No runtime asset or build change. |
| Development Workflow | Pass | Spec precedes code. `pnpm check`, `pnpm typecheck`, and `pnpm test` remain the gates. |

## Design

### 1. Shared rules — `src/shared/failure.ts` (new)

Move the reason mapping out of `src/main/shell/site-view.ts` so both surfaces
share it, and add the rules a frame marker needs.

```ts
export type FramingPolicy = "frame-ancestors" | "x-frame-options";

export function failureReason(errorCode: number, errorDescription: string): string;
export function isIgnorableFailure(errorCode: number): boolean;      // -3, 0
export function isResponseBlocked(errorCode: number): boolean;       // -27
export function framingPolicyInConsole(message: string): FramingPolicy | null;
export function framedUrlInConsole(message: string): string | null;
export function frameFailureReason(
  errorCode: number,
  errorDescription: string,
  policy: FramingPolicy | null,
): string;
```

`frameFailureReason` returns the policy-specific sentence for a blocked frame,
and otherwise delegates to `failureReason`. That keeps FR-004 (name the policy
family) and FR-005 (shared vocabulary) in one tested place.

### 2. Guest view — `src/main/shell/site-view.ts`

- Remove the private `failureReason`; import from the shared module.
- Add `onFrameFailed: (failure: FrameFailure) => void` to `SiteViewEvents`.
- Track the framing policy from `console-message`. Parse with the shared helpers,
  keep a small bounded map keyed by address, and keep the most recent policy as a
  fallback: Chromium quotes the page's own address when the refused frame is
  same-origin, so a URL lookup alone misses those. Both are cleared on a
  main-frame navigation.
- In `did-fail-load`:
  - keep the main-frame path exactly as it is;
  - for a subframe, ignore `isIgnorableFailure`;
  - for a response block with no policy seen yet, defer emission by a short tick
    (150 ms) so the console message that precedes it can land;
  - never borrow a policy for a failure that is not a response block, so a refused
    connection is never labelled as a framing refusal;
  - emit `onFrameFailed` with the address, the reason, and the policy.

The sub-resource case is already excluded: a frame load failure is only raised
for a frame's own document, never for an image or script inside it.

### 3. Window — `src/main/shell/window.ts`

- Field `frameMarkers: FrameMarker[]`, one entry per failed address.
- `handleFrameFailed` adds a marker through the shared rule, holds it while the
  veil is up, then hands the set to the page. It stands down while the failure
  page owns the window (FR-016).
- `pushFrameMarkers()` sends `{ markers, style }` to the guest. `style` carries the
  five theme values the box needs, from the active variant and resolved mode, so
  the page never reads the shell's stylesheet (FR-015).
- `pushTheme()` re-pushes the markers after a variant or color-mode change.
- `onFrameMissing(urls)` drops the markers whose frames the page can no longer
  place, which is the only way to retire a marker whose iframe was removed or
  repointed (FR-014).
- `dismissFrameMarkers()` clears the set; it runs on a main-frame navigation and on
  a main-frame failure.
- Markers are not dismissible (FR-011).
- `previewFrameNotice()` sets one marker with `preview: true`, which the page draws
  as a centred card because no frame exists to place it on (FR-018);
  `stopSurfacePreview` and `enterDevPreview` clear it with the other previews.

### 4. Shared marker rules — `src/shared/frame-notice.ts` (new)

- `FrameFailure`, `FrameMarker`, `FrameNoticeStyle`, `FrameNoticeUpdate`.
- `addFrameMarker` (one per address), `dropFrameMarkers` (removes the addresses
  the page reported missing).

### 5. Guest marker — `src/preload/frame-marker.ts` (new)

- One host node per page, appended to `document.documentElement`, with a closed
  shadow root. It is `position: fixed; inset: 0; pointer-events: none`, so it
  cannot change layout or take input (FR-012, FR-013).
- One absolutely positioned box per marker, filled with the pushed base surface
  and unbordered, so the frame reads as a hole down to the window's base surface
  (FR-003). A short frame drops the reason line rather than clipping it.
- Position comes from the frame's own `getBoundingClientRect()`, applied inside a
  `ResizeObserver` callback — which runs after layout and before paint — and in the
  page's `scroll` and `resize` handlers. That is the whole point of living in the
  page: no IPC sits between the reflow and the paint (FR-009, FR-010).
- The page reports an address back to main when no iframe points at it any more
  (FR-014, FR-018).
- `preview: true` draws the same box as a centred card, for the Developer menu.

### 6. Preload wiring — `src/preload/site.ts`

- `frame:markers` carries the set and the theme; it replaces the old
  `frame:watch` / `frame:rects` measurement protocol entirely.
- A `MutationObserver` runs only while a marker is up, so a script that swaps or
  removes the iframe takes its marker with it.

### 7. Developer menu — `src/main/index.ts`

Add **Preview Frame Notice** beside the other transient previews. The menu stays
absent from packaged builds.

## Project Structure

### Documentation (this feature)

```text
specs/028-frame-load-status/
├── plan.md              # This file
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── failure.ts               # NEW: reasons, policy parsing, frame reason
│   └── frame-notice.ts          # NEW: marker types + rules
├── main/
│   ├── index.ts                 # Developer menu entry
│   └── shell/
│       ├── site-view.ts         # frame failure events + policy tracking
│       └── window.ts            # marker state, theme push, preview
└── preload/
    ├── site.ts                  # frame:markers wiring + DOM observer
    └── frame-marker.ts          # NEW: draws the boxes in the page

tests/unit/
├── failure.test.ts              # NEW: reason + policy parsing
└── frame-notice.test.ts         # NEW: marker rules
```

## Phase Plan

1. Shared rules and their unit tests.
2. Guest view: policy tracking and the frame failure event.
3. Guest marker in the preload, drawn in a closed shadow root.
4. Window: marker state, theme push, missing-frame pruning, preview.
5. Constitution II amendment, recorded before the page is touched.
6. Developer menu.
7. Docs: README surface list and the failure report, spec status.
8. Gates: `pnpm check`, `pnpm typecheck`, `pnpm test`.

## Risks

| Risk | Mitigation |
| --- | --- |
| A page with many broken embeds floods the page | One marker per distinct address, each confined to its own frame's rectangle (FR-008). |
| The console message arrives after the frame failure for `X-Frame-Options` | Emit without the policy family rather than delay the report; the reason still says the response headers blocked the frame. |
| A lazily inserted frame fails after the page is ready | Markers are cleared on navigation, not on page-ready, so a late failure still reports. |
| A stale measurement retires a marker added after it was requested | Reports carry the watch generation; older ones are ignored. |
| A frame is repointed at a working address without a page navigation | A frame that no longer points at the failed address is not reported, so its marker is pruned. |
| The marker trails its frame while the window is dragged | Solved by moving the box into the page: it is placed in the page's own layout pass. A shell overlay, a guessed rectangle, and hiding during the drag were each measured and rejected. |
| The marker steals input from the page | The host, the layer, and the box are all pointer-transparent. |
| A frame failure is reported for DevTools | DevTools is a separate web contents and is not monitored. |
