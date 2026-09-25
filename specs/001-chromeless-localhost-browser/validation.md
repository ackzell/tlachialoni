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
| S1 | Core render: frameless, edge-to-edge, DevTools docked, reflow, restore | FR-001–FR-003, SC-001, SC-002 | PARTIAL *(manual)* | Checks 1,2,3,5 PASS (frameless, docked, reflow, zero chrome). Check 4 FAILed: a dock-side change made *inside* DevTools was not persisted (reopened right). Root cause + fix applied (`EUI.DockController.dockSide()` sync); re-verification pending. |
| S2 | Palette: open, shorthand, recents, rejection, dismissal, prefill | FR-005–FR-007, FR-022 | pending | |
| S3 | DevTools placement: toggle + dock sides + persistence | FR-008 | pending | |
| S4 | Picker: hover highlight, click inspects, disarm, no residue | FR-012, FR-013, SC-004 | PASS *(auto, overlay lifecycle)* / pending (hover+inspect) | Overlay element count while armed = 1, after disarm = 0 |
| S5 | Drag strip: toggle, drag, controls, no page relayout, persistence | FR-009, SC-002 | pending | |
| S6 | Reload / hard reload / back / forward + editable guard | FR-010, FR-011 | pending | |
| S7 | Theming: 8 variants, system dark/light + override, DevTools follow | FR-016–FR-018, SC-006 | pending | UI captures confirm jade dark/light + palette/strip/failure styling |
| S8 | Loading + failure view with Retry / Edit URL | FR-019, FR-021 | pending | Failure view capture confirmed; loading veil not yet observed |
| S9 | Local-only policy: reject public URLs, external links/popups to system browser | FR-001, FR-006, FR-015 | pending | |
| S10 | Multiple instances: independent windows, merged recents, shared prefs | FR-023, FR-004 | pending | |
| S11 | Checks: `npm run check`, `npm run test` | constitution (workflow) | PASS *(auto)* | `vp check` clean (41 formatted, 0 lint); `vp test` 21 passed; production build green |

**Overall**: in progress — S0, S4 (partial), S11 verified automatically; interactive scenarios pending.
