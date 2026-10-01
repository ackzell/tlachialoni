# Implementation Plan: macOS Dock Window Management

**Branch**: `017-macos-dock-menu` | **Date**: 2026-10-01 | **Spec**: `specs/017-macos-dock-menu/spec.md`

**Input**: Feature specification from `/specs/017-macos-dock-menu/spec.md`

## Summary

Add a native macOS Dock menu and match native Dock-icon behavior, layered on the
existing `BaseWindow` window set. The implementation is main-process only and adds
no IPC, no renderer change, and no persisted field:

- The **Dock menu** is set with Electron's `app.dock.setMenu(...)` (macOS only). It
  contains **New Window** and a **Recent** submenu built from the shared recents the
  palette already shows, **grouped by origin** in the palette's shape. The
  open-window list is **not** built: macOS/AppKit appends its own native window list
  (with the key window checked), which already satisfies FR-003–FR-005.
- Because the native Dock menu is static once set, it is **rebuilt and re-set** when
  its app-specific content could be stale — a window is created or closed, which also
  re-reads recents.
- Choosing a recent **opens a window on that target**; New Window reuses the existing
  `manager.createNew()` path, so Dock and in-app behavior cannot diverge (FR-011).
- The Dock icon click is handled with `app.on("activate")`: focus an existing
  window, or create one when the app is running with none (FR-007/FR-008).
- `window-all-closed` stops quitting **on macOS** so the Dock affordance survives
  (standard macOS behavior, FR-009); non-macOS keeps quitting when the last window
  closes (FR-014).

All dock-menu construction is a **pure template builder** (unit-testable) plus a few
manager methods that own the Electron call, keeping the change isolated to the
main-process shell/window management code (FR-013).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Electron `app.dock` / `Menu` (macOS native Dock API) and
the existing `BaseWindow` + two `WebContentsView` architecture. **No new runtime
dependency.** No new IPC channel, no preload change, no renderer change.

**Storage**: none new. The feature reads live windows from `WindowManager` and the
existing shared `recents` list from `StateStore`; `WindowRecord` and
`SCHEMA_VERSION = 3` are unchanged.

**Testing**: Vitest via `vp test` for the pure `buildDockMenuTemplate` builder
(item order, labels, separators, section omission, click routing). The native Dock
menu itself cannot be inspected by the headless Electron harness (`dock-test.ts`),
so end-to-end behavior is covered by the manual macOS `quickstart.md`; the existing
lifecycle (`window-all-closed` / `activate`) is exercised by the current harness
runs staying green.

**Target Platform**: macOS 13+ (Apple silicon) for the Dock feature; every other
platform is intentionally unchanged.

**Project Type**: desktop app (Electron main + preload + renderer).

**Performance Goals**: rebuilding the Dock menu is O(live windows + recents) and
runs only on create/close/rename — no per-frame or per-tick work; activating a
window settles in under 1s (SC-001, SC-004).

**Constraints**: main-process shell/window management only; no renderer coupling, no
guest-page access (constitution II); no new command, no new shortcut, no new color;
non-macOS behavior byte-for-byte unchanged. The macOS lifecycle change is deliberate
and scoped (FR-009).

**Scale/Scope**: one new small module plus edits to the manager, `AppWindow` title
exposure, and app lifecycle wiring — roughly five files plus one test.

**Resolved unknowns** (the only Technical Context uncertainties; resolved in
`research.md`):

- Whether the Dock menu can be mutated after being set, or must be rebuilt and
  re-set on every change.
- Whether the OS-level "Recent Documents" API fits an app whose "projects" are URLs.
- How a specific window is reliably raised when the app is not frontmost or the
  window is minimized or on another Space.
- Whether leaving the app running after the last window closes is safe with the
  existing `before-quit` → `beginQuit()` record-preservation logic.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.2.5) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | The Dock menu is an **OS-level surface**, not window chrome: it paints zero pixels inside the window and adds nothing to the guest page. The chromeless window is untouched. |
| II. The Guest Page is Sacred | Nothing is injected into, read from, or layered over the guest page (FR-013). The feature only observes window titles the app already sets and the shared recents the app already stores. |
| III. Keyboard-First Ergonomics | No new capability is introduced that lacks a keyboard/palette path: New Window is `⌘N` + palette; opening a recent target is reachable via the palette and `⌘L`; window activation already exists through the macOS Window menu and Mission Control. The Dock menu is an accelerator, never the only path. |
| IV. Real Chromium DevTools, Docked | Untouched; activation shows/focuses the whole window (and its docked DevTools) as before. |
| V. One Target Per Window | Recent projects open a **new** window with one target; no tabs or in-window multiplexing (FR-006). No window controls another. |
| VI. Identity Through Tlapalli | No new visual surface and no new color: the menu is native AppKit. |
| Technology Foundations | No dependency change; electron-vite builds, Vite+ remains the checks layer; the JSON store is read-only here. |
| Security & Isolation | No new IPC channel, no new preload method, no capability change: Dock actions call the manager's existing create/focus logic directly. Guest isolation and navigation policy are unchanged. |
| Packaging & Distribution | No new runtime assets or entitlements; the feature ships in the existing main build. |
| Development Workflow | Spec precedes code (this document); `vp check`, `vp test`, and typecheck must pass before commit. |

**Gate result**: PASS — no blocking violations. Complexity Tracking is empty.

**Deliberate change from `012-multi-window`** (not a constitution change):
`012`'s window-lifecycle contract states "the app quits when the last window
closes." FR-009 requires standard macOS behavior so the Dock stays available, so on
macOS the app now stays alive with no windows (the Dock icon then creates one); all
other platforms keep the existing quit-on-last-close. This is recorded in
`contracts/dock-menu.md` and `research.md`.

**Post-design re-check (after Phase 1)**: PASS. `contracts/dock-menu.md` adds no IPC
channel and no capability; `data-model.md` adds no persisted field and no schema
bump; `quickstart.md` proves menu composition, live sync, activation, New Window,
recents, and Dock-icon behavior, plus non-macOS parity. No new scope beyond the spec
was introduced.

## Project Structure

### Documentation (this feature)

```text
specs/017-macos-dock-menu/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── dock-menu.md     # Phase 1 output
├── checklists/
│   └── requirements.md  # /speckit.specify output
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts                  # app.on("activate") → manager.activate();
│   │                             # window-all-closed → quit only off macOS
│   └── shell/
│       ├── dock-menu.ts          # NEW: pure buildDockMenuTemplate, grouped recents
│       └── window-manager.ts     # refreshDockMenu(); focusWindow(); activate();
│                                 # openTarget(target); shared spawnNew(target)
└── (no preload / renderer / shared / window.ts changes)
tests/
└── unit/
    └── dock-menu.test.ts         # NEW: template + grouping cases
```

**Structure Decision**: Keep the Dock feature inside the existing window-management
code. The menu's *shape* is extracted into a pure, Electron-free
`buildDockMenuTemplate` (testable like `geometry.ts`), while the manager owns the one
`app.dock.setMenu(...)` call and the action routing, and `index.ts` owns app-lifecycle
wiring. No new IPC, no schema change, no renderer change.

## Design Details

### `src/main/shell/dock-menu.ts` (new, pure)

```ts
export interface DockRecentEntry { url: string }
export interface DockRecentGroup { origin: string; label: string; items: DockRecentEntry[] }
export interface DockMenuActions {
  newWindow: () => void;
  openRecent: (url: string) => void;
}
export function groupRecentsByOrigin(recents: readonly DockRecentEntry[]): DockRecentGroup[];
export function buildDockMenuTemplate(
  recents: readonly DockRecentEntry[],
  actions: DockMenuActions,
): Electron.MenuItemConstructorOptions[];
```

- Imports only the `Electron.MenuItemConstructorOptions` **type** (no runtime
  Electron), so it is unit-testable. Reuses `recentHost()` from `state/schema.ts`
  as the origin key, the same one the palette's grouping and the recents cap use.
- Template order: **New Window**; separator; a **Recent** submenu when
  `recents.length > 0`. Empty sections are omitted (FR-015).
- Recents are grouped by origin: group label `host:port`, child label path (+
  query/hash). An origin with exactly one entry renders as a **leaf** (no
  drill-down), labeled by host, or host + path when the path is not the root.
- The open-window list is **not** built here: macOS appends its own (see research.md
  "Post-implementation correction").

### `src/main/shell/window-manager.ts`

- `refreshDockMenu()`: no-op unless `process.platform === "darwin"`; `app.dock` is
  optional (`app.dock?.`). Pulls fresh recents (`store.refreshRecents()`), builds
  the template, and calls `app.dock?.setMenu(Menu.buildFromTemplate(template))`.
- Call `refreshDockMenu()` from `spawn()` (after the window is wired) and from
  `handleClosed()`; those are the points where the recent list may have changed.
- `focusWindow(id)`: ignore unknown/destroyed; `restore()` if minimized; `show()`;
  `focus()`; `app.focus({ steal: true })`; `touch(id)`. Used by `activate()` only —
  the Dock window list is macOS's.
- `activate()`: `focused()` → `focusWindow`; else `createNew()` (the Dock icon path).
- `openTarget(target)`: create a window at a specific validated target, reusing the
  same record/inheritance rules as New Window.
- Refactor `createNew()` and `openTarget()` onto one private `spawnNew(target: string
  | null)` so the two cannot drift.

### `src/main/index.ts`

- Register `app.on("activate", () => manager.activate())` after `boot()`.
- Change `window-all-closed` to `if (process.platform !== "darwin") app.quit()`.
- `before-quit` → `beginQuit()` is unchanged; quitting via `⌘Q` still preserves the
  saved window set. A window the user closes is still forgotten by `handleClosed`
  (the quit flag is only set on real quit).

## Delivery Order

1. **M1 — Pure builder**: add `src/main/shell/dock-menu.ts` and
   `tests/unit/dock-menu.test.ts`.
2. **M2 — Manager wiring**: `focusWindow`, `activate`, `openTarget`, shared
   `spawnNew`, and `refreshDockMenu` called from `spawn`/`handleClosed`.
3. **M3 — Lifecycle**: `app.on("activate")` and the macOS `window-all-closed` guard
   in `index.ts`.
4. **M4 — Validation**: run `quickstart.md` on macOS; run `vp check`, `vp test`, and
   `npm run typecheck`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| The native Dock menu is static once set, so it goes stale | Rebuild and re-set it on window create/close; the pure builder makes the recents section directly testable |
| **Duplicating macOS's own window list** | Do not build a window list — AppKit already appends one (with the key window checked). This happened once and was removed; research.md records it |
| `app.dock` is undefined off macOS | Every call is behind `process.platform === "darwin"` and `app.dock?.`, so non-macOS is a no-op (FR-014) |
| Raising a window on another Space or while the app is inactive fails | `app.focus({ steal: true })` + `restore()`/`show()`/`focus()`; fallback to `win.moveTop()` if needed (recorded in research) |
| The macOS lifecycle change strands a half-open app with no windows | With no windows there are no surfaces to strand; the app menu stays valid and `activate` restores a window; quitting still works |
| `activate` fires before the window set exists | The handler is registered after `boot()` and `activate()` guards an empty set |
| The recents submenu is empty or huge | Omit the section when empty; the list is the same bounded, de-duplicated recents the palette shows (30 overall, 5 per origin) |
| Grouping mistakes dev servers apart | Group by **origin**, not hostname, reusing the palette's `recentHost` key, so `localhost:3000` and `localhost:5173` stay distinct |
| An unparseable url produces a nonsense label | `hostOf`/`pathOf`/`singleLabel` fall back to the raw url; a test pins it |
| Recent targets opening duplicate windows | Accepted for this iteration: a recent opens a window on that target, matching the "reopen" intent and FR-006 |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
