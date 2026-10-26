# Quickstart: Validating the Test Card Demo Site

A run and validation guide. It references
[contracts/test-card.md](./contracts/test-card.md) and
[data-model.md](./data-model.md) instead of repeating every detail. It contains
no implementation code.

## Prerequisites

- macOS with Tlachialoni available (`pnpm dev` or the installed app).
- Node 24.21+ and pnpm 11+.
- The repository dependencies installed.
- A screen recorder for the clip checks.
- Optional, for the Vue DevTools clip: the Vue DevTools extension installed in
  Tlachialoni's guest session.

## Setup

```bash
pnpm install
```

This installs Vue Router and the rest of the workspace dependencies. The example
has no separate install step.

## Run

Use two terminals, or run Tlachialoni in one and leave the demo server in the
other.

```bash
# terminal 1 — the guest page
pnpm test-card

# terminal 2 — the browser
pnpm dev
```

`pnpm test-card` prints the local address, normally `http://localhost:3000/`.
Open that address in Tlachialoni; the default target is already the same address.
If port 3000 is busy, Vite prints the next free port — enter that address with
`⌘L`.

## Automated checks

```bash
pnpm check        # format, lint, and Vite+ checks
pnpm test         # Vitest, including tests/unit/test-card-*.test.ts
pnpm typecheck    # node, preload, web, and the example app
```

Expected: all pass. The unit tests cover the load-proof math and storage
fallback, the unique local probe URL, and edit-point normalization. They do not
test the visual scenarios; use the tables below.

## Scenario validation

### S1 — Live edit

Open `examples/test-card/src/edit-points.ts` beside the browser.

| Step | Expected | Covers |
|------|----------|--------|
| Change `accentHue` from 24 to 200 and save. | Within one second the swatch, page marker, focus ring, and accent rule change hue. The load count and last-load time do not change. | US2.1/2.5, FR-016/017, SC-002 |
| Change `headline` to a longer sentence and save. | The largest heading updates in place, wraps inside the viewport, and does not clip. | US2.2, FR-018 |
| Change `layout` from `"split"` to `"stacked"` and save. | The action rail moves from the right side to the top band; the stage rearranges with no overlap. | US2.3, FR-019 |
| Visit the other two pages. | They use the new accent, headline, and layout. | US2.4, FR-020 |
| Set `accentHue` to `900` or clear the headline, then restore it. | The page falls back to a valid hue or the default headline; it never blanks. | Edge case, FR-021 |
| Replace one copy string and save. | Only that copy changes; no layout or style edit is needed. | FR-022, SC-012 |

A full page reload during a save is a failure: the load count would increment.
The save must go through the self-accepting edit module (research §2).

### S2 — Element picker

| Step | Expected | Covers |
|------|----------|--------|
| Press `⌘⇧C` and hover the heading. | The highlight stays inside the heading; no neighboring region is touched. | US6.1, FR-012/046 |
| Hover the swatch, the primary button, and the status card in turn. | Each highlight is contained and visually distinct. | US6.1, FR-012/049 |
| Pick the heading and inspect DevTools. | The selected element is the heading whose text matches the page. | US6.2, FR-047 |
| Pick the swatch and inspect DevTools. | The element is the "Accent swatch" button, with a matching accessible name. | US6.2, FR-047 |
| Reload and pick again. | The four landmarks keep their order and general position. | US6.3, FR-048 |

### S3 — History

| Step | Expected | Covers |
|------|----------|--------|
| From Card 01, click `02 Grid`, then `03 Notes`. | Each page has a large, different identity and a unique specimen. | US3.1/3.2, FR-023/024/025, SC-006 |
| Press `⌘←` twice, then `⌘→` twice. | The destination page changes each time; the load count does not change. | US3.3, FR-027/029, SC-006 |
| Swipe back or forward on the trackpad. | The history arrow points the matching direction and the page changes. | US3.4, FR-028 |
| Open `/notes` directly in a new window or via `⌘L`. | The Notes page loads through the SPA fallback. | Edge case, FR-030 |
| In the DevTools Console, evaluate `document.title` on each page. | The three titles are unique (`01 Signal · Test Card`, `02 Grid · Test Card`, `03 Notes · Test Card`). | US3.4, FR-023/028 |
| Open `/missing`. | The NotFound view appears with a link home; no server error. | FR-030 |

Tlachialoni's history overlay is directional, not a list of entries. The page
identity and the destination change carry the visible proof.

### S4 — Reload proof

| Step | Expected | Covers |
|------|----------|--------|
| Note the count and time. Press `⌘R`. | The count increases by one and the last-load time updates. Both stay visible without scrolling. | US4.1/4.2, FR-031/033/034, SC-005 |
| Press `⇧⌘R`. | The count increases by one again. | US4.5, FR-035 |
| Navigate to another page, then back. | The count stays the same. | US4.3, FR-032 |
| Press `⌘←` / `⌘→`. | The count stays the same. | US4.6, FR-029 |
| Open a new Tlachialoni window and load the address. | The count starts at 1 and the time is fresh. | US4.4, FR-032 |
| Take a still before and a still after a reload. | Both count and time are readable and different. | SC-005 |

A count that changes on a route move means the app is doing full-page navigation,
not Vue Router navigation.

### S5 — Docked DevTools

| Step | Expected | Covers |
|------|----------|--------|
| Press `⌘⌥J`, then `⌘1` to dock DevTools at the bottom. | The panel docks; the page stays usable. | US5, FR-045 |
| Confirm the Console is empty while the page is idle. | No page log appears without an action. Vite's own dev-client messages may appear if verbose/debug output is enabled; they are dev-server output. | FR-044 |
| Click "Run local check". | One console line names the page and action. The Network panel shows one `probe.json?at=…` request. The status card shows the status and elapsed time within one second. | US5.1/5.2, FR-038/039/040, SC-008 |
| Click "Run local check" again. | A second, separate Network entry appears. The status card and console update. | US5.3, FR-041 |
| Click "Accent swatch". | One short console line appears; no request is made. | FR-038 |
| Block `*probe.json*` in DevTools Network request blocking, then click the primary action. | The status card shows a readable failure; the page stays usable; a console error appears. Remove the block afterward. | US5.5, FR-043 |
| Check the Network panel for external hosts. | There are none. | FR-042, SC-013 |

### S6 — Themes and color scheme

| Step | Expected | Covers |
|------|----------|--------|
| Switch macOS between light and dark. | The page follows within one second, with no reload and no flash of the wrong scheme on the next load. | US7.1/7.2/7.3, FR-051/052/054, SC-010 |
| Cycle all eight shell themes and both shell color modes. | The shell changes color; the page stays neutral apart from its one accent. | US7.4, FR-050/053, SC-009 |
| Reload in each scheme. | The first paint is already in the correct scheme. | FR-052, SC-010 |
| Set the page accent to a hue close to a shell theme's accent. | The page still reads as a neutral card with one accent, not as a theme preview. | FR-050/053 |

## Supporting checks

| Check | Steps | Expected |
|-------|-------|----------|
| Vue DevTools | Install Vue DevTools in the guest session, open it, load the page. | A real component tree appears (`App`, `PageHeader`, `LoadProof`, `LandmarkPanel`, page views) and the reactive `editPoints` object is inspectable. |
| Offline | Turn off Wi-Fi after the dev server is running, then reload and run the probe. | The page, routes, reload proof, and probe still work. The Network panel shows only localhost. |
| Side-docked DevTools | Dock DevTools right or left, then reload. | The stage stacks; there is no horizontal scroll; the load proof and primary action remain visible. |
| Bottom-docked DevTools | Dock DevTools bottom, then run the primary action. | The primary button and the status card stay in the top region without scrolling. |
| Port conflict | Occupy port 3000, then run `pnpm test-card`. | Vite prints the next free address; the page works there; enter it with `⌘L`. |
| New tab vs reload | Open a second Tlachialoni window, then reload each window. | Each window keeps its own count; a reload does not share state with the other window. |
| Reduced motion | Enable Reduce Motion in macOS. | The page has no transitions; nothing else changes. |
| Copy replacement | Replace every copy string in `edit-points.ts` in one sitting. | The page renders the new copy with no structural or style edit; the layout still fits. |
| Unknown path | Open `/missing`. | NotFound with a working link home; no server error. |

## Compression check

1. Record a 10-second idle clip of the test card at 1440×900, 2× scale.
2. Record a 10-second clip of the current guest content (the showcase page used
   for recordings) at the same window size and scale.
3. Encode both with the same recorder, codec, quality, frame rate, and duration.
4. Compare the file sizes.

The test card should be at least 20% smaller. The idle page paints identical
frames, uses flat neutral fills with no images or noise, and changes only on
action.

## What failure looks like

- **A save reloads the page and the count increases** → the edit module is not
  self-accepting, or the component is re-initializing the load proof.
- **A live edit takes more than a second** → the CSS variables are not bound to
  the reactive config, or the wrong file is being edited.
- **The accent does not change** → `--accent-h` is not applied at the root, or
  the CSS does not consume it.
- **The layout toggle does nothing obvious** → the stage uses fixed grid columns
  instead of `--stage-columns`/`--stage-areas`.
- **The count increments on a link click** → navigation is a full page load, not
  a Vue Router move.
- **The count does not increment on reload** → it is stored in memory or in a
  component, not in `sessionStorage` from `main.ts`.
- **The Network panel shows no probe** → the JSON is imported at build time
  instead of fetched.
- **Repeated probes show one Network entry** → the URL has no unique cache-busting
  query or `no-store`.
- **The Console has lines before any action** → the app logs on mount or route
  change; only actions should log.
- **A picker highlight touches a neighbor** → the landmark spacing is too tight.
- **The page flashes the wrong scheme** → the inline first-paint style in
  `index.html` is missing or the tokens are only applied after mount.
- **The primary button is below the fold under bottom-docked DevTools** → the
  action rail or the compact-height query is missing.
- **The page looks like a Tlapalli theme preview** → guest CSS imported shell
  tokens or uses more than one accent.
- **Vue DevTools shows no app** → the page was loaded from a static build or the
  extension is not installed in the guest session.
