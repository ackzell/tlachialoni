# Quickstart: Validating the Load Rim

A run guide to prove the feature works end-to-end. It references
[contracts/reload-indicator.md](./contracts/reload-indicator.md) and
[data-model.md](./data-model.md) rather than repeating them. It contains no
implementation code.

## Prerequisites

- macOS; Node 24 and `pnpm` available.
- A local target to load. The default is `http://localhost:3000`; start any dev
  server there (for example `npx serve` in the repo root, or an app you are
  working on). Any local `http://localhost:*` target works.
- A second same-origin path and at least one link, so link clicks and palette
  navigations can be tried.
- Optional, for the slow-load feel: a target with a small artificial delay (for
  example a route handler that waits ~1 s before responding) so the rim is easy to
  watch.

## Setup

```bash
pnpm install
```

## Automated checks (fast)

```bash
pnpm check     # lint + format (vp check)
pnpm test      # vitest (vp test) — includes tests/unit/reload.test.ts
pnpm typecheck # tsc + vue-tsc across node/preload/web
```

Expected: all pass, including the reload/navigation predicate tests.

## Run

```bash
pnpm dev
```

## Validation scenarios

| # | Scenario | Steps | Expected | Covers |
|---|----------|-------|----------|--------|
| S1 | Normal reload | Load a target, press `⌘R` | A soft rim wraps all four edges of the page and fades when the reload finishes; the page stays visible underneath (no full-screen veil) | US1.1/1.4/1.5, FR-001/002/005, SC-001/004 |
| S2 | Hard reload | Press `⇧⌘R` | The heavier inner rim appears and trails the base pulse; it fades when loading finishes | US2.1/2.2/2.3, FR-004, SC-002 |
| S3 | Link click | Click a link to another page | The rim appears for the load; the old page stays visible until the new one commits | US1.2, FR-003/006, SC-008 |
| S4 | History | Use `⌘←` / `⌘→` | The rim appears for the history load | US1.3, FR-003, SC-008 |
| S5 | Same-origin palette navigation | Use `⌘L` or `⌘P` to go to another path on the same origin | The rim appears; the veil stays down | US1.3, FR-003/006, SC-008 |
| S6 | Site switch | Use `⌘L` to go to a different origin | The full-screen veil appears; no rim | US3.1, FR-006/007 |
| S7 | Command palette reload | Open `⌘P`, run **Reload**, then **Hard Reload** | Both show the same rims as the shortcuts | US1.6, FR-003 |
| S8 | Strip button | Open the strip and click Reload | The normal rim appears | US1.6, FR-003 |
| S9 | Page-initiated reload | Run `location.reload()` in the page (or trigger a meta refresh) | The normal rim appears | edge case, assumption |
| S10 | Blank window | Open a new window (`⌘N`) with no target and trigger Reload | No rim | US1.7 |
| S11 | Retry from failure | Stop the dev server, load the target, press Retry | The veil owns the load; no rim | US3.2, FR-007 |
| S12 | Repeated reload | Press `⌘R` several times quickly | One rim; it refreshes/continues rather than stacking | US3.3, FR-008, SC-005 |
| S13 | Superseded load | Start a slow reload, then navigate to a different origin with `⌘L` | The rim disappears; the veil takes over | US3.4, FR-015 |
| S14 | Load failure | Start a reload, then make the server refuse the connection | The rim disappears and the failure view appears | US3.5, FR-005/007 |
| S15 | Titlebar mode | Enable titlebar mode (`⇧⌘F`), reload | The rim wraps the page area below the docked strip | edge case, FR-009 |
| S16 | Pinned / peeking strip | Pin the strip (`⌘B`) or hover the top edge, then reload | The rim starts below the visible strip, not through it | edge case, FR-009 |
| S17 | Light page, dark theme | Set the shell to amethyst dark and load a white page; reload | The rim's dark contrast ring keeps a clear edge on the white page | FR-016, SC-007 |
| S18 | Light page, light theme | Set the shell to amethyst light and reload the white page | The accent core remains clearly visible | FR-016, SC-007 |
| S19 | Reduced motion | Enable *Reduce motion* in System Settings, load both ways | The rims are static (no breathing/echo) and still clearly indicate activity | edge case, FR-013 |
| S20 | Click-through | With a rim visible, click and hover where it paints | The click/hover reaches the guest page; nothing is intercepted | FR-011, SC-006 |
| S21 | DevTools open | Dock DevTools, reload | The rim wraps the page area; DevTools is unaffected | edge case, FR-009 |
| S22 | Guest page untouched | Load, then inspect the page's DOM and styles | No rim node, style, or script exists in the guest page | constitution II, FR-012 |
| S23 | Dev preview | Open the Developer menu and choose **Preview Load Rim** / **Preview Hard Reload Rim** | Each holds its rim on screen; **Stop Preview** clears it | FR-014 |

## Visual capture

```bash
pnpm screenshots   # or: pnpm gifs
```

The `reload` scene drives a real normal reload and a real hard reload and samples
the rim mid-flight. Inspect the frames for the two distinct treatments; the
surface exposes `data-tlachialoni-reload-indicator` and `data-kind` for scene
selectors.

## What failure looks like

- **No rim on `⌘R`** → the navigation hook is missing, or the pending kind is
  cleared before the navigation starts (contract §1).
- **No rim on a link click or history move** → the rim gate is still restricted to
  reloads; any unveiled in-place navigation should show it (research §1).
- **A rim on a site switch** → the veil should be the sole surface; the rim gate
  is not checking `showLoading`/failure (contract §1).
- **The full-screen veil appears on a reload** → the reload is being routed
  through a veiled `loadTarget` instead of the reload path.
- **A hard reload looks identical to a normal one** → the pending kind is not
  reaching the navigation, or the inner rim/echo is not rendered.
- **The rim is clipped or missing under the strip** → the shell did not expand to
  `full`, or the strip offset was not applied (contract §3).
- **The rim washes out on a white page with a dark shell theme** → the dark
  contrast ring/shadow is missing; the accent core alone is not enough.
- **Clicks stop reaching the page while the rim shows** → the component opted into
  pointer events, or the shell mode/placement is wrong.
- **Rims still animate under Reduce Motion** → the media query is missing or
  overridden.
