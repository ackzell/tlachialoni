# Screenshots

A capture of the shell's states, so the look and behaviour can be reviewed or
shared without recording a video. Regenerate them with:

```sh
pnpm screenshots
```

That builds the app and runs it with `TLACHIALONI_SCREENSHOTS=1`, which walks a
single window through each state and writes one PNG per state into this
directory. It runs against a throwaway `userData` directory seeded with a fixed
1440×900 window, sample history, and a few installed extensions, so it never
touches real state, and every run produces the same frame.

Page-backed shots use a small in-process stub page until a real dev server is
supplied. Point the run at a running app to use it instead:

```sh
TLACHIALONI_SCREENSHOTS_URL=http://localhost:3000 pnpm screenshots
```

> Capture is development tooling only: the entry point is gated on the env var in
> `src/main/index.ts`, and `runScreenshots` is never reachable in a packaged
> build. See `src/main/screenshots.ts`.

## The shorthand

A window is a `BaseWindow` holding two stacked `WebContentsView`s — the guest
page underneath a fully transparent shell overlay — and `BaseWindow` has no
`capturePage`. So each frame is composed: the page and the shell are captured
separately and drawn onto one canvas inside the shell renderer, where the result
matches what the window shows. Docked DevTools is a third layer, placed against
the docked edge.

Two things a `WebContentsView` capture cannot see are handled during composition:

- **macOS traffic lights** are real AppKit controls, so they belong to no
  webContents and appear in no capture. The strip reserves room for them, and they
  are drawn back in at that inset whenever the strip is on screen.
- **The page while DevTools is docked**: `capturePage()` on the inspected view
  returns the DevTools surface, not the page. The page is re-rendered at the
  docked viewport size in a hidden window instead, so it reflows correctly.

Committed images are capped to 1440px wide, and DevTools and the guest page are
captured with the dark color scheme pinned so the set is consistent. For the
element-picker shot, a small control on the page is found at runtime, since a
fixed point tends to land on the body.

## States

| File                                       | State                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| `01-blank-location-armed`                  | A fresh blank window, location palette armed               |
| `02-blank-watermark-dark`                  | Blank window, palette dismissed, dark                      |
| `03-blank-watermark-light`                 | Same, light mode                                           |
| `04-palette-all`                           | Command palette, **All** group                             |
| `05-palette-location-recents`              | **Location**, recents grouped by origin, one host expanded |
| `06-palette-devtools`                      | **DevTools** group                                         |
| `07-palette-view`                          | **View** group                                             |
| `08-palette-theme`                         | **Theme** group, active variant highlighted                |
| `09-palette-extensions`                    | **Extensions** group, installed extensions listed          |
| `10-palette-other`                         | **Other** group                                            |
| `11-palette-fallback`                      | A query with no in-group match widens to every group       |
| `12-palette-error`                         | A rejected (non-local) target reports inline               |
| `13-theme-obsidian` … `20-theme-fire-opal` | The palette in each Tlapalli variant                       |
| `21-loading-veil`                          | Loading veil                                               |
| `22-failure`                               | Failure view, with target and reason                       |
| `23-status-resolving`                      | Install status: resolving                                  |
| `24-status-downloading`                    | Install status: determinate download                       |
| `25-status-verifying`                      | Install status: verifying                                  |
| `26-status-done`                           | Install status: done                                       |
| `27-status-error`                          | Install status: error                                      |
| `28-page-loaded`                           | A loaded page, edge-to-edge                                |
| `29-strip-dark`                            | Strip pinned, dark                                         |
| `30-strip-light`                           | Strip pinned, light                                        |
| `31-devtools-bottom`                       | DevTools docked bottom                                     |
| `32-devtools-right`                        | DevTools docked right                                      |
| `33-devtools-left`                         | DevTools docked left                                       |
| `34-picker-hover`                          | Element picker armed, hovering an element                  |
