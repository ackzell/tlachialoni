# Quickstart: Validating Multi-Window Instances

How to prove the feature end to end. Entities and shapes live in `data-model.md`;
the concrete rules in `contracts/window-lifecycle.md`, `contracts/ipc-routing.md`,
and `contracts/state.schema.json`.

## Prerequisites

- macOS 13+ with Node 24 and dependencies installed (`npm install`).
- Two local dev servers to tell apart, e.g. `python3 -m http.server 3000` and
  `python3 -m http.server 5173` (or any two dev servers on loopback/private hosts,
  which is all the local-target policy allows).
- A clean checkout of this branch (`012-multi-window`).

## Run

```sh
npm run dev      # launch with renderer HMR
npm run check    # format, lint, type checks
npm run test     # unit suite
```

## Automated checks

| Test | Covers |
| --- | --- |
| `tests/unit/store.test.ts` | v2 → v3 migration; window-record merge by id never drops a sibling; recents merge unchanged |
| `tests/unit/commands.test.ts` | `window.new` exists with `⌘N`; `window.close` carries `⌘W`; both are palette-listed |
| `tests/unit/geometry.test.ts` (new) | cascade offset; off-screen / malformed bounds fall back to a visible default; minimum-size clamp |

All must pass, and `npm run check` must be clean.

## Manual scenarios

### S1 — New Window opens blank with the location entry (FR-001, FR-011; decision C)

1. Launch; confirm one window at the default target.
2. Press `⌘N`.
3. **Expect**: a second window appears, showing the themed backdrop with the
   command palette open in the **Location** scope and an empty, focused input; the
   first window is unchanged behind it.
4. Press `Esc` without typing.
5. **Expect**: the window stays open and blank; `⌘L` reopens the target entry.

### S2 — Reachable three ways (FR-002, FR-003, FR-010)

1. Confirm **File → New Window** and the palette row for **New Window** both open
   a window, each time one window per invocation.
2. Confirm the File menu contains **New Window** `⌘N` and **Close Window** `⌘W`,
   and the Window menu shows Minimize/Zoom/Front without a duplicate Close.

### S3 — Windows are independent (FR-005, FR-009; US2)

With two windows: point one at `:3000` and the other at `:5173`; then, in one
window, navigate, reload, click a link, go back/forward, toggle DevTools
(`⌘⌥J`), change its dock side (`⌘1/2/3`), toggle the strip (`⌘B`), and change its
theme (`⌘T`) and color mode.
**Expect**: the other window's page, surfaces, and theme never change. Take one
window to a dead port and confirm only it shows the failure view.

### S4 — Theme is per-window; shared data fans out (FR-008, FR-009; US4)

With two windows, change the theme (`⌘T`) and color mode in one.
**Expect**: only that window changes; the other keeps its own theme (S3). The
guest page and docked DevTools keep following the OS color scheme, regardless of a
window's override. Load a new target in one; confirm it appears in the other's
recents (`⌘L`). Install or toggle an extension; confirm it applies to both windows.

### S5 — Extension status goes to the right window

Start an extension install from one window's palette.
**Expect**: the status surface appears only in that window, not in its siblings.

### S6 — Close and quit (FR-007)

With three windows, close one.
**Expect**: the other two stay open and usable. Close the remaining two.
**Expect**: the app quits when the last one closes.

### S7 — Restore on relaunch (FR-014, FR-015; decision B; US3)

1. Open three windows at clearly different positions, on different targets (leave
   one blank).
2. Quit with `⌘Q`.
3. Relaunch.
4. **Expect**: the same three windows reappear, in order, at their saved positions;
   the two with targets reload them, the blank one opens with the location entry.

### S8 — Bad geometry falls back (FR-017)

1. Quit, edit the state file (`app.getPath('userData')/state.json`) so one window's
   `bounds` is far off-screen or malformed.
2. Relaunch.
3. **Expect**: that window opens at a visible default; the others restore normally.

### S9 — v2 migration (data-model.md)

1. Replace `state.json` with a v2 document (single `target`/`bounds`/surface
   scalars, `schemaVersion: 2`).
2. Launch.
3. **Expect**: exactly one window opens with the old target, frame, DevTools,
   strip, and theme; installed extensions and recents survive; the file is
   rewritten as schema 3 with the theme fields inside the window record.

### S10 — Accelerators with DevTools focused (FR-006)

Focus the docked DevTools panel and press `⌘N`.
**Expect**: a new window opens (the menu accelerator fires despite DevTools having
focus).

## Done when

- S1–S10 behave as described.
- `npm run check` and `npm run test` are green.
- No second window produces an IPC "second handler" error, and closing windows
  never leaves a stale routing entry.
