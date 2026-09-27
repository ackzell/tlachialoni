# Quickstart Validation Guide: Minimal Browser

How to run the app and prove the feature works end to end. This is a validation
guide, not an implementation guide; see `plan.md` for structure and `data-model.md`
/ `contracts/` for the interfaces.

## Prerequisites

- macOS 13+ (Apple silicon).
- Node 24.21+ and npm (already satisfied in the dev environment).
- A local dev server to point at; any app serving `http://localhost:3000` works.
- The project scaffolded and dependencies installed from the electron-vite
  `vue-ts` template (see `tasks.md` for the exact order).

## Commands

| Command           | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Build and launch the app with shell HMR (electron-vite dev) |
| `npm run build`   | Production build                                            |
| `npm run preview` | Run the production build                                    |
| `npm run check`   | `vp check` — format, lint, and type-check                   |
| `npm run test`    | `vp test` — Vitest unit tests                               |

## Validation scenarios

### S0 — Spike gate (constitution: spike-first) — M0

1. Launch a minimal frameless window with one site view loading `http://localhost:3000`.
2. Open DevTools with `mode: 'bottom'`, then switch to `right`, then `left`.
3. Resize the window; drag it by the strip.

**Expected**: DevTools are visibly docked inside the window on all three sides;
the page reflows with no overlap or dead space; the window drags. If docking does
not work, stop and apply the fallback in `research.md` before building shell UI.

### S1 — Core render (Story 1; FR-001–FR-003; SC-001, SC-002)

With a server on port 3000, launch on a clean profile. The window shows the site
edge to edge with DevTools docked at the bottom and **no** URL bar, tabs, or menu.
Relaunch: the same target loads. Resize: page and DevTools reflow together.
Confirm the guest page exposes no Node/Electron globals (sandbox and context
isolation active).

### S2 — Palette (Story 2; FR-005–FR-007, FR-022)

`⌘P` opens a centered palette listing commands and recents. Type `:5173` and
submit → the view navigates to `http://localhost:5173`. Submit `file:///etc` → it is
rejected with feedback and the target is unchanged. `Esc` and clicking outside both
close the palette and return focus to the page. `⌘L` opens the palette prefilled
with the current target.

### S3 — DevTools placement (Story 3; FR-008)

`⌘⇧J` toggles DevTools without reloading the page. `⌘⇧1/2/3` dock bottom/right/left
and the page reflows. Quit and relaunch: side and open state are restored.

### S4 — Picker (Story 4; FR-012, FR-013; SC-004)

`⌘⇧C` arms picking; moving the pointer highlights exactly one element at a time and
the page's layout does not shift. Clicking the element reveals it selected in
DevTools (opening DevTools if closed). `Esc` disarms and the highlight disappears.
After disarming, inspect the page: no tool-added elements, styles, or listeners
remain. Arm the picker, then navigate: it disarms automatically.

### S5 — Drag strip (Story 5; FR-009; SC-002)

By default no chrome is visible. `⌘B` reveals the strip; dragging it moves the
window; the reload, DevTools, and close controls work; the strip **floats** over
the page without changing the page's layout. The strip's visibility survives a
relaunch.

### S6 — Reload and history (Story 6; FR-010, FR-011)

`⌘R` reloads; `⇧⌘R` bypasses cache. After visiting two pages, `⌘←` and `⌘→` move
through history; with focus inside a text field, `⌘←`/`⌘→` move the caret instead
of navigating.

### S7 — Theming (Story 7; FR-016–FR-018; SC-006)

Select each of the eight variants from the palette; every shell surface updates
immediately and the docked DevTools follow. Cycle the color mode
(`system → dark → light`); the shell and DevTools stay in sync; relaunch with an
override while the system is the opposite mode and confirm it is honored.

### S8 — Failure and loading (Story 8; FR-019, FR-021)

Point the tool at a port with nothing listening. A themed failure view names the
target and offers Retry and Edit URL. Start the server and choose Retry → the site
renders. On a slow server, a themed loading indicator shows until the content
appears, with no white flash.

### S9 — Local-only policy (FR-001, FR-006, FR-015)

A palette entry for a public internet address is rejected. Clicking a link in the
dev site that points off-host opens the system browser and leaves the view on its
current target. `window.open` popups also open in the system browser.

### S10 — Multiple instances (FR-023; FR-004)

Launch a second instance: it opens an independent window with its own target.
Change the target in one; the other is unaffected. Both targets appear in recents.
Theme changes and dock side are shared; quitting the second instance does not
close the first.

### S11 — Checks

`npm run check` passes cleanly. `npm run test` passes the unit suite (URL policy
and normalization, recents merge/dedupe/bound, state defaults, token mapping).
