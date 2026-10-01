# Phase 0 Research: macOS Dock Window Management

The Technical Context had no unresolved `NEEDS CLARIFICATION` markers: the runtime
(Electron 44 `BaseWindow` + `WebContentsView`), the window model
(`012-multi-window`), the shared recents list, and the product decisions (standard
macOS lifecycle on macOS, recents = the URL projects the palette shows) are fixed by
the spec and the constitution. The sections below record the implementation choices
and the alternatives rejected. Section numbers are referenced from `plan.md`.

## Post-implementation correction (2026-10-01)

The first implementation added the open-window list to **our** Dock menu, which
produced two window lists: AppKit already appends a native window list — with the
key window checked — to every app's Dock menu. Electron's Dock Menu guide says the
default Dock menu "will come with system-provided window management utilities,
including the ability to show all windows, hide the app, and switch between
different open windows." The original research below (§1, §3, §4) missed this
platform default and built a parallel window list that was unnecessary, duplicating
the system one.

Corrected decision: our Dock menu carries only **New Window** and **Recent
Projects**. Raising a window and the live, checked window list are the OS's job, so
there is no custom window list, no `titleLabel`/`onTitleChange` plumbing, and no
rename-sync code. `focusWindow` remains only for the Dock-icon click path
(`activate()`). The code, tests, and the artifact corrections reflect this.

## 1. Setting the Dock menu

- **Decision**: Build the menu with `Menu.buildFromTemplate(...)` and hand it to
  `app.dock.setMenu(menu)` on macOS only, containing **only** the app-specific
  items (New Window + recent projects). Because the native Dock menu is a static
  `NSMenu` once set, **rebuild and re-set** it when the app-specific content could
  have changed (a window is created/closed, which also re-reads recents), and treat
  the builder as pure so the content is testable. Do **not** add an open-window
  list: macOS provides one (see the correction above).
- **Rationale**: `app.dock.setMenu` is Electron's native macOS Dock-menu API (the
  spec explicitly asks for native APIs) and `app.dock` is already used for
  `setIcon` in `configureAppIdentity`. A pure template builder keeps the
  Electron-free logic unit-testable, matching `geometry.ts`.
- **Alternatives considered**:
  - *Extend the application menu instead* (rejected: that is the top menu bar, not
    the Dock icon's menu; the spec asks for the Dock menu specifically).
  - *A native addon / AppKit `.mm` bridge* (rejected: `app.dock.setMenu` is exactly
    the native surface; an addon would duplicate it and add a native build step).
  - *Set the menu once at launch* (rejected: the recent list would go stale).
  - *Add our own window list* (rejected: it duplicates the system list — the
    original mistake, corrected above).

## 2. "Recent documents/projects"

- **Decision**: Populate a **Recent** submenu from the existing shared `recents`
  list (the URL targets the command palette already lists), and open a window on the
  chosen target. Do **not** use `app.addRecentDocument`. Group the entries by
  origin exactly as the palette does — group keyed by `recentHost(url)`, group label
  `host:port`, child label path (+ query/hash) — and render an origin that has
  exactly one entry as a **leaf** rather than a drill-down. No Dock-specific cap is
  applied; the Dock shows the same bounded list the palette shows.
- **Rationale**: The app has no file-document model; its "projects" are local
  targets. `app.addRecentDocument` takes **file paths**, is surfaced by the OS under
  a "Recent Documents" section, and would open the path with the default handler —
  none of which matches a URL target. Reusing `recents` makes the Dock and the
  palette show the same set (confirmed in the spec) and needs no new storage. Grouping
  by origin — not hostname — is what keeps `localhost:3000` and `localhost:5173`
  apart, which is how dev servers differ; it reuses `recentHost`, the same key the
  palette's grouping and the recents cap already use, so the two cannot drift. A
  single-entry group gets no submenu because one level deeper to show one item adds
  nothing, and the leaf keeps the path when it carries information.
- **Alternatives considered**:
  - *`app.addRecentDocument(path)`* (rejected: file-path semantics; no document to
    point at; the OS section would be wrong and un-clearable per-target).
  - *A separate Dock-only recent list* (rejected: a second source of truth that
    would drift from the palette's recents).
  - *A flat url list with no origin grouping* (rejected: dev-server ports would be
    indistinguishable; grouping is the palette's established shape).
  - *A drill-down level even for a single entry* (rejected: a pointless extra click;
    the user flagged it, and a leaf reads better).
  - *A Dock-specific display cap* (rejected for now: the shared 30/5 bounds are
    already modest, and a second cap is a policy question, not a code one).

## 3. Why we do not build our own window list

- **Decision**: Do not include the open windows in our Dock menu at all. macOS
  provides a native, live window list — with the key window checked — and activates
  the chosen window for us, satisfying FR-003/FR-004/FR-005.
- **Rationale**: The system list is already synchronized (it reads live window
  titles), already shows the active-window checkmark, and is the native look the
  spec asks for. Building a parallel list produced a visible duplicate and dead
  code (`titleLabel`, `onTitleChange`, `dockWindowEntries`), all since removed
  (see the correction above). Rebuilding our menu remains only about keeping the
  recent list fresh.
- **Alternatives considered**:
  - *Our own list alongside the system one* (rejected: two identical lists — the
    bug this section corrects).
  - *Suppress the system list* (rejected: Electron exposes no API for it; the only
    AppKit lever, `NSWindow.isExcludedFromWindowsMenu`, is unexposed and would hide
    every window from the list).

## 4. Activating a specific window

- **Decision**: `focusWindow(id)` = ignore unknown/destroyed → `restore()` when
  minimized → `show()` → `focus()` → `app.focus({ steal: true })` → update the
  focus stack. It is used by `activate()` (the Dock-icon click path) only; choosing
  a window from the *Dock menu* is handled by macOS's own window list.
- **Rationale**: On macOS, calling `win.focus()` does not reliably bring a window
  forward when the app is not the active app; `app.focus()` activates the app and
  `show()`/`focus()` then raise the window. This reuses the manager's existing
  focus bookkeeping (`touch`).
- **Alternatives considered**:
  - *Only `win.focus()`* (rejected: unreliable from the Dock when the app is
    inactive).
  - *`win.moveTop()`* (kept as a fallback if `show()`/`focus()` proves insufficient
    on another Space; it does not focus, so it is secondary).

## 5. Dock icon click and the macOS lifecycle

- **Decision**: Handle `app.on("activate")` → `manager.activate()`: focus the
  most-recently-focused window if any exist, otherwise create a new one. Change
  `window-all-closed` to quit **only when `process.platform !== "darwin"`**, so the
  app stays resident on macOS with no windows.
- **Rationale**: This is the standard macOS pattern and the only way "clicking the
  Dock icon … create[s] a new one when appropriate" can ever occur (with
  quit-on-close there is no running-with-no-windows state). It is scoped to macOS,
  satisfying FR-009/FR-014, and is a deliberate, documented change from `012`'s
  "closing the last window quits the app."
- **Alternatives considered**:
  - *Keep quitting on all platforms* (rejected: contradicts FR-009 and the explicit
    "normal macOS app behavior" requirement).
  - *Recreate via `app.relaunch()` on a second Dock click* (rejected: a full process
    restart is heavy and not how macOS apps behave).

## 6. Safe with the existing quit/record logic

- **Decision**: Leave `before-quit` → `manager.beginQuit()` and the `handleClosed`
  record-preservation logic exactly as they are.
- **Rationale**: `quitting` is only set on a real quit (`⌘Q`). Closing the last
  window on macOS no longer quits, so `handleClosed` still removes that window's
  record (a user close is forgotten), which is the existing, correct behavior;
  quitting with windows open still preserves their records. The only observable
  change is that the process outlives its last window on macOS.
- **Alternatives considered**:
  - *Set `beginQuit()` when the last window closes on macOS* (rejected: it would
    wrongly keep a user-closed window's record and restore it next launch).
  - *Hide the app (`app.hide()`) instead of staying visible* (rejected: not needed;
    the Dock menu and window list must remain usable).

## 7. New Window from the Dock

- **Decision**: Reuse the existing `manager.createNew()` (refactored onto a shared
  `spawnNew(target)` with `openTarget`), which is exactly the `window.new` command's
  path: a blank window with the location entry armed, cascaded, inheriting the
  focused window's theme/dock side.
- **Rationale**: FR-011 requires the Dock's New Window to behave identically to the
  in-app command; sharing the code path guarantees it. Opening a recent is the same
  path with a target instead of `null`.
- **Alternatives considered**:
  - *Open a second `window.new` code path in the Dock click handler* (rejected:
    duplication that can drift).
  - *Create at the default target for a recent/Dock-new window* (rejected:
    `DEFAULT_TARGET` is the cold-start default (012 FR-013); Dock New Window matches
    the in-app New Window, and a recent uses its own target).

## 8. Isolation and testing

- **Decision**: Keep everything in the main process: a pure
  `buildDockMenuTemplate` (`src/main/shell/dock-menu.ts`) with unit tests, plus
  manager methods and an `index.ts` lifecycle hook. Add **no** IPC channel, preload
  method, renderer change, or persisted field.
- **Rationale**: FR-013 forbids renderer coupling, and the native Dock menu cannot
  be exercised by the headless Electron harness, so pure unit tests cover the menu's
  shape and the manual macOS `quickstart.md` covers the live behavior.
- **Alternatives considered**:
  - *Drive the Dock menu from the renderer* (rejected: violates FR-013 and would
    need a new IPC channel).
  - *Assert the Dock menu in `dock-test.ts`* (rejected: Electron exposes no getter
    for the set Dock menu, so there is nothing headless to assert).
