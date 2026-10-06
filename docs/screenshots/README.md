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

A window is a `BaseWindow` holding two stacked `WebContentsView`s — the guest page
underneath a fully transparent shell overlay — and `BaseWindow` has no
`capturePage` at all. Rather than compose the layers by hand, each frame is taken
from the window server with `screencapture -o -x -l <windowID>`, which is the only
way to get the whole window: the traffic lights, the rounded corners and the docked
DevTools panel belong to no webContents, so `capturePage` can never show them.

The window id is resolved from `GetWindowID` when that helper is installed, and
from Electron's own `getMediaSourceId()` otherwise; both are logged on a run, so
the assumption that they agree is visible. `-o` omits the drop shadow and `-x`
silences the shutter. The window is sized to the display, held in front, and its
pointer-reveal sampler is frozen for the run, because a cursor resting near the top
edge would otherwise add the strip to every frame.

Capturing the window server needs macOS **Screen Recording** access, and the first
run prompts for it. If it has been denied, the run says so and falls back to the
composited webContents layers, which need no permission but cannot show the native
chrome (the traffic lights are drawn back in). Grant it under System Settings →
Privacy & Security → Screen Recording — the dev build appears as
**Tlachialoni Dev**, because the dev-identity pre-hook renames the unpackaged
Electron bundle. Either backend can be forced:

```sh
TLACHIALONI_SCREENSHOTS_CAPTURE=contents pnpm screenshots  # composited fallback
```

Committed images are capped to 1440px on the long edge and normalised to sRGB, and
DevTools and the guest page are captured with the dark color scheme pinned so the
set is consistent. Each state is checked to be on screen before it is captured, and
for the element-picker shot a small control is found at runtime, since a fixed point
tends to land on the body.

## States

| File                                       | State                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| `01-blank-location-armed`                  | A fresh blank window, location palette armed                |
| `02-blank-watermark-dark`                  | Blank window, palette dismissed, dark                       |
| `03-blank-watermark-light`                 | Same, light mode                                            |
| `04-palette-all`                           | Command palette, **All** group                              |
| `05-palette-location-recents`              | **Location**, recents grouped by origin, one host expanded  |
| `06-palette-devtools`                      | **DevTools** group                                          |
| `07-palette-view`                          | **View** group                                              |
| `08-palette-theme`                         | **Theme** group, active variant highlighted                 |
| `09-palette-extensions`                    | **Extensions** group, with the `MV3` / `MV3→MV2` badges     |
| `10-palette-other`                         | **Other** group                                             |
| `11-palette-fallback`                      | A query with no in-group match widens to every group        |
| `12-palette-error`                         | A rejected (non-local) target reports inline                |
| `13-theme-obsidian` … `20-theme-fire-opal` | The palette in each Tlapalli variant                        |
| `21-loading-veil`                          | Loading veil                                                |
| `22-failure`                               | Failure view, with target and reason                        |
| `23-status-resolving`                      | Install status: resolving                                   |
| `24-status-downloading`                    | Install status: determinate download                        |
| `25-status-verifying`                      | Install status: verifying                                   |
| `26-status-done`                           | Install status: done                                        |
| `27-status-error`                          | Install status: error                                       |
| `28-status-warning`                        | MV3 service-worker warning, which waits to be dismissed     |
| `29-page-loaded`                           | A loaded page, edge-to-edge                                 |
| `30-strip-dark`                            | Strip pinned, dark                                          |
| `31-strip-light`                           | Strip pinned, light                                         |
| `32-titlebar-mode`                         | Titlebar mode: the strip docked, the page laid out below it |
| `33-devtools-bottom`                       | DevTools docked bottom                                      |
| `34-devtools-right`                        | DevTools docked right                                       |
| `35-devtools-left`                         | DevTools docked left                                        |
| `36-picker-hover`                          | Element picker armed, hovering an element                   |
| `37-history-overlay-back`                  | Armed history swipe, Back                                   |
| `38-history-overlay-forward`               | Armed history swipe, Forward                                |
