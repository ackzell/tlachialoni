# T050 — Quickstart Validation Results

**Feature**: `001-chromeless-localhost-browser`
**Date**: 2026-09-25
**Method**: automated checks (marked *auto*) plus interactive confirmation (marked *manual*)

## How to run

```sh
# with any dev server up (default target http://localhost:3000;
# switch targets with Cmd+P, e.g. ":5173")
npm run dev
```

## Results

| # | Scenario | Requirement(s) | Result | Evidence / notes |
| - | -------- | -------------- | ------ | ---------------- |
| S0 | M0 spike: docked DevTools in a frameless window | constitution (spike-first), FR-002 | PASS *(auto)* | `LOCALBROWSER_DOCK_TEST=1`: baseline 1440x900; bottom -> innerHeight 600 (delta 300); right -> innerWidth 885 (delta 555) |
| S1 | Core render: frameless, edge-to-edge, DevTools docked, reflow, restore | FR-001–FR-003, SC-001, SC-002 | PASS *(manual)* | Checks 1,2,3,5 PASS. Check 4 PASS after the dock-side sync fix: a side chosen with DevTools' own controls is honored on relaunch. Findings: shortcuts must work while DevTools has focus (fixed via app-menu accelerators); dock shortcuts settled on plain `⌘1/2/3` (`⇧⌘3/4/5` are macOS screenshots). |
| S2 | Palette: open, shorthand, recents, rejection, dismissal, prefill | FR-005–FR-007, FR-022 | PASS *(manual)* | Checks 1–6 PASS. Check 3 fixed: an invalid target (`example.com`) shows a rejection message and keeps the palette open. Check 5 fixed: `⌘L` prefills the full live URL, including deep routes and SPA (`did-navigate-in-page`) changes. |
| S3 | DevTools placement: toggle + dock sides + persistence | FR-008 | pending | |
| S4 | Picker: hover highlight, click inspects, disarm, no residue | FR-012, FR-013, SC-004 | PASS *(auto, overlay lifecycle)* / pending (hover+inspect) | Overlay element count while armed = 1, after disarm = 0 |
| S5 | Drag strip: toggle, drag, controls, no page relayout, persistence | FR-009, SC-002 | pending | |
| S6 | Reload / hard reload / back / forward + editable guard | FR-010, FR-011 | pending | |
| S7 | Theming: 8 variants, system dark/light + override, DevTools follow | FR-016–FR-018, SC-006 | pending | UI captures confirm jade dark/light + palette/strip/failure styling |
| S8 | Loading + failure view with Retry / Edit URL | FR-019, FR-021 | pending | Failure view capture confirmed; loading veil not yet observed |
| S9 | Local-only policy: reject public URLs, external links/popups to system browser | FR-001, FR-006, FR-015 | pending | |
| S10 | Multiple instances: independent windows, merged recents, shared prefs | FR-023, FR-004 | pending | |
| S11 | Checks: `npm run check`, `npm run test` | constitution (workflow) | PASS *(auto)* | `vp check` clean (41 formatted, 0 lint); `vp test` 21 passed; production build green |

**Overall**: in progress — S0, S4 (partial), S11 verified automatically; S1, S2 passed; S3, S5–S10 pending.

## Handoff — resuming validation

**Fixes landed** (S2 re-verified; committed):
- `src/main/shell/commands.ts` — command handlers may return a `CommandResult`
- `src/main/shell/window.ts` — `⌘L` prefills the live URL; navigations update the
  current URL; `runCommand` propagates validation failures
- `src/main/shell/site-view.ts` — emits `onNavigated` for `did-navigate` and
  in-page (SPA) navigations

**To rebuild before testing**: `npm run dev`

**Next up**: S3 (DevTools placement: ⌘⇧J toggle, ⌘1/2/3 dock sides, persistence),
then S4 (picker hover + inspect), S5 (strip), S6 (reload/history), S7 (theming),
S8 (loading/failure), S9 (local-only policy), S10 (multi-instance).

**Reminder**: keep app-menu accelerators as the shortcut mechanism (they work
while DevTools has focus); dock shortcuts are `⌘1`/`⌘2`/`⌘3`.
