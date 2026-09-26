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
| S3 | DevTools placement: toggle + dock sides + persistence | FR-008 | PASS *(manual)* | Toggle is reload-free (page state survives). Dock sides `⌘1/2/3` reflow with no overlap; resize reflows together. Side + open/closed state restored across relaunch. Findings: toggle rebound from `⌘⇧J` to `⌘⌥J` at the user's request; dock-side switching works but could feel more fluid (accepted for now). |
| S4 | Picker: hover highlight, click inspects, disarm, no residue | FR-012, FR-013, SC-004 | PASS *(auto + manual)* | Overlay count while armed = 1, after disarm = 0 (auto). Hover highlights exactly one element with no layout shift; click selects it in DevTools, opening DevTools when closed; `Esc` and navigation disarm; no residue after disarm. |
| S5 | Drag strip: toggle, drag, controls, no page relayout, persistence | FR-009, SC-002 | PASS *(manual)* | `⌘B` toggles; dragging the strip moves the window; reload/DevTools/close controls work; the strip floats over the page with no content shift; visibility restored across relaunch for both shown and hidden. |
| S6 | Reload / hard reload / back / forward + editable guard | FR-010, FR-011 | PASS *(manual)* | `⌘R` reloads; `⇧⌘R` bypasses cache (normal reload served `200 (from service worker)`, hard reload hit the network `304`); `⌘←/⌘→` move through history; `⌘←/⌘→` move the caret inside a focused page field. Findings: the loading veil is now a target-load indicator only, so page-initiated reloads/link clicks never cover the view (see Handoff); mouse back/forward thumb buttons navigate history (macOS delivers them as `swipe` events, Windows/Linux via `app-command`). |
| S7 | Theming: 8 variants, system dark/light + override, DevTools follow | FR-016–FR-018, SC-006 | PASS *(manual)* | Checks 1–6 PASS. All 8 variants re-skin every shell surface instantly from the palette (no restart, <1s); the mode row shows the engaged mode and cycles `system → dark → light`, persisted across relaunch with DevTools matching. Live OS follow while in `system` mode was fixed with a `nativeTheme` "updated" listener. Typography is bundled Source Code Pro (`out/renderer/assets/*.woff2`, no network). Findings: palette now live-previews a highlighted theme row and restores the persisted variant on dismiss; the strip shows host + path plus an http/https lock; `--lb-fg-subtle` is blended 15% toward `--lb-fg` for legibility and the active palette row's meta lifts to `--lb-fg-muted`. |
| S8 | Loading + failure view with Retry / Edit URL | FR-019, FR-021 | PASS *(manual)* | Checks 1–5 PASS. A slow-but-alive target shows the themed veil naming the target being loaded (no white flash) and never trips the failure view; an unreachable target shows the themed failure view naming it with a readable reason ("Connection refused"). Retry shows the veil then renders once the server is up. Findings/fixes: the veil now names the incoming target (not the last loaded); Edit URL prefills the failed target; a target load clears the failure view; added **Go Back** to return to the last working target (shown only when one differs). |
| S9 | Local-only policy: reject public URLs, external links/popups to system browser | FR-001, FR-006, FR-015 | pending | |
| S10 | Multiple instances: independent windows, merged recents, shared prefs | FR-023, FR-004 | pending | |
| S11 | Checks: `npm run check`, `npm run test` | constitution (workflow) | PASS *(auto)* | `vp check` clean (44 formatted, 0 lint); `vp test` 30 passed; production build green |

**Overall**: in progress — S0, S11 verified automatically; S1–S8 passed; S9–S10 pending.

## Handoff — resuming validation

**Fixes landed** (S2 re-verified; committed):
- `src/main/shell/commands.ts` — command handlers may return a `CommandResult`
- `src/main/shell/window.ts` — `⌘L` prefills the live URL; navigations update the
  current URL; `runCommand` propagates validation failures
- `src/main/shell/site-view.ts` — emits `onNavigated` for `did-navigate` and
  in-page (SPA) navigations

**S6 finding**: `window.ts` now raises the loading veil only for target loads
(palette/launch/Retry). Page-driven spinner activity (site reloads, link clicks,
iframes) no longer covers the view, since the old frame stays visible until the
new one commits. A site whose own reload loop previously flashed the veil now
stays quiet.

**S7 fixes landed** (this change):
- `scripts/build-theme-tokens.ts` — `--lb-fg-subtle` blended `SUBTLE_FG_MIX = 0.15`
  toward `--lb-fg`; regenerated `src/shared/theme-tokens.ts`
- `src/main/shell/window.ts` — live OS dark/light follow in `system` mode
  (`nativeTheme` "updated"), transient palette variant preview, 36px strip height
- `src/renderer/src/components/CommandPalette.vue` — live preview on highlight,
  engaged-mode / current-variant annotations, active-row meta contrast
- `src/renderer/src/components/DragStrip.vue` — host + path, http/https lock
- `src/renderer/src/composables/useCommands.ts` — theme-state row annotations

**S8 fixes landed** (this change):
- `src/main/shell/window.ts` — `viewport:loading` carries the incoming target;
  `palette.editUrl` accepts an explicit target; failed payload includes
  `previousUrl`; new `failure.dismiss` command
- `src/renderer/src/components/LoadingVeil.vue` — shows the target being loaded
- `src/renderer/src/components/FailureView.vue` — Edit URL uses the failed
  target; new "Go Back" action
- `src/renderer/src/composables/useShell.ts` — tracks `loadingTarget`, clears the
  failure view on a target load
- `src/renderer/src/utils/target.ts` — shared strip/veil URL formatter

**To rebuild before testing**: `npm run dev`

**Next up**: S9 (local-only policy), S10 (multi-instance).

**Reminder**: keep app-menu accelerators as the shortcut mechanism (they work
while DevTools has focus); dock shortcuts are `⌘1`/`⌘2`/`⌘3`.
