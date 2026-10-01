# Quickstart: macOS Dock Window Management

A runnable validation guide proving the feature end-to-end on macOS. It references
`contracts/dock-menu.md` (menu shape and action routing) and `data-model.md`
(derived entries) instead of repeating them. Implementation details live in
`plan.md` and `tasks.md`.

## Prerequisites

- macOS 13+ (Apple silicon), with the Dock visible.
- Node 24 and the repo dependencies installed (`npm install`).
- Two or more local dev servers to give the windows distinct titles, or any two
  local http targets (e.g. `http://localhost:3000`, `http://localhost:5173`).

## Run

```sh
npm run dev            # electron-vite dev, launches the app
```

Automated checks (all must be green, SC-007):

```sh
npm run typecheck
npm run check
npm run test
```

## Validation scenarios

### 1. Menu composition (FR-001, FR-002, FR-003, FR-015)

1. Launch the app with one window open.
2. Right-click (or click-and-hold) the Dock icon.
3. **Expected**: macOS's own window list appears at the top, showing the open
   window with a checkmark — this is the system list, not ours. Below it our menu
   shows **New Window**. With no recents, there is no Recent section and no stray
   separator. There must be **exactly one** window list — a second one is a bug.

### 2. Live sync on create, close, and rename (FR-005, FR-010, SC-002)

1. Open three windows (`⌘N` twice); point each at a distinct target so the titles
   differ.
2. Right-click the Dock icon: **Expected**: the system window list shows all three,
   in creation order, with the frontmost one checked.
3. Close the middle window (`⌘W`). Reopen the Dock menu: **Expected**: it is gone;
   the other two remain.
4. In a remaining window, navigate so the page title changes. Reopen the Dock menu:
   **Expected**: that entry shows the new title.
5. Repeat create/close/rename several times. **Expected**: never a stale entry,
   never a missing window (SC-002).

### 3. Activate a window (FR-004, SC-001)

1. Open three windows; move the first to another Space, minimize the second.
2. Right-click the Dock icon and choose the first in the **system** list.
   **Expected**: it comes to the front within ~1s.
3. Choose the minimized window. **Expected**: it is restored and focused.
4. **Expected**: the other windows are unchanged.

### 4. New Window from the Dock (FR-002, FR-011, SC-003)

1. With one window open, choose **New Window** from the Dock menu.
2. **Expected**: exactly one additional window opens with the location entry focused;
   the original stays open and unchanged — identical to `⌘N` / File → New Window.

### 5. Recent projects (FR-006, FR-012, SC-005)

1. Load two distinct targets (they are recorded in recents).
2. Right-click the Dock icon → **Recent**. **Expected**: the same URLs the command
   palette lists, **grouped by origin** — `localhost:3000` and `localhost:5173` must
   be separate entries.
3. An origin with several pages drills down one level to its paths. An origin with a
   **single** recent must be one selectable entry with no drill-down; it keeps the
   path in its label when the path is not the root (e.g. `localhost:5173/dashboard`).
4. Choose any entry. **Expected**: a window opens on that target.
5. With a fresh state and no recents, reopen the menu. **Expected**: no Recent
   section.

### 6. Dock icon click (FR-007, FR-008, FR-009, SC-004)

1. With one or more windows open, click the Dock icon. **Expected**: an existing
   window is brought to the front.
2. Close every window (do **not** quit). **Expected**: the app stays running (Dock
   icon remains, menu bar remains).
3. Click the Dock icon. **Expected**: a new window opens.
4. Quit with `⌘Q`, relaunch. **Expected**: the saved windows restore as before
   (existing 012 behavior preserved).

### 7. Non-macOS parity (FR-014, SC-006)

On a non-macOS host (or by inspection of the guards):

- No Dock menu is created (`refreshDockMenu` is a no-op off macOS, `app.dock?.`).
- Closing the last window still quits the app.
- No IPC, preload, renderer, or persisted-state change is present.

## Done when

- Scenarios 1–6 pass on macOS.
- `npm run typecheck`, `npm run check`, and `npm run test` are green.
- The unit suite includes `tests/unit/dock-menu.test.ts` covering menu order,
  labels, separator/section omission, and click routing.
