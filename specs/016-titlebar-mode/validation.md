# Validation: Titlebar Mode

Outcome record for `specs/016-titlebar-mode/spec.md`. Implementation was built first
and validated manually by the developer before the automated tests were added, per the
agreed fast-iteration workflow.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| TypeScript (node/preload/web) | `npm run typecheck` | PASS |
| Unit tests | `npm run test` | PASS — 164 tests (11 new) |
| Format + lint | `npm run check` | PASS — 85 files formatted, 0 lint issues |
| Headless layout harness | `TLACHIALONI_DOCK_TEST=1` (`src/main/dock-test.ts`) | Extended with titlebar assertions (inset bounds, `window.innerHeight` drop, surviving page sentinel, strip mounted, restored overlay); requires a GUI run and is not part of `vp test` |

Unit coverage added:

- `tests/unit/shell.test.ts` — `isStripSurfaceVisible` with `titlebarMode` (wins over
  the palette, the pin, and peek) and `titlebarInset(true|false)`.
- `tests/unit/commands.test.ts` — `titlebar.toggle` exists, is palette-listed, carries
  the `⇧⌘F` accelerator, and matches from raw input.
- `tests/unit/store.test.ts` — `titlebarMode` defaults to `false`, preserves an explicit
  value, stays independent per window, and composes into the renderer view.

## Manual validation (developer)

The developer's manual pass was approved. Covered:

- `⇧⌘F` docks the strip permanently and pushes the page below it; toggling off restores
  the full-bleed page and the strip leaves.
- The page's top is fully reachable (nothing covered) and the viewport reflows.
- Strip controls actuate; macOS window controls are shown with the docked strip.
- `⌘B` is inert while the mode is on and works normally afterward.
- Command palette, loading veil, failure view, and extension status render below the
  strip while it stays usable.
- Docked DevTools (bottom/right/left) sit below the strip.
- Toggling does not reload the page.
- Resize, fullscreen, relaunch persistence, and per-window independence.

The M0 spike items (research §8–§10) were retired by this pass; no fallback was needed.

## Governance

The Principle I PATCH clarification proposed in `plan.md` was applied to
`.specify/memory/constitution.md` (v2.2.5 → v2.2.6, Last Amended 2026-10-01):
an opt-in, per-window, explicitly toggled docked title bar that displaces the guest
page below it is permitted; the default remains zero painted chrome.

## Deferred (out of scope)

The docked strip's bottom border is not visible in some states. This predates titlebar
mode — the overlay strip shows the same symptom — and is tracked for a separate fix.
