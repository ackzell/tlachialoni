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

Page-backed shots use the test card at `http://localhost:3000/` when it is
running. Otherwise they fall back to a small in-process stub page. Point the run
at another app to use it instead:

```sh
TLACHIALONI_SCREENSHOTS_URL=http://localhost:3000 pnpm screenshots
```

> Capture is development tooling only: the entry point is gated on the env var in
> `src/main/index.ts`, and `runScreenshots` is never reachable in a packaged
> build. See `src/main/screenshots.ts`.

## GIFs

The same harness also records the README's animated demos:

```sh
pnpm gifs
```

That builds the app, runs it with `TLACHIALONI_SCREENSHOTS_MODE=scenes`, and then
assembles the result. The state walk above writes one still per state; the scene
walk drives one real interaction per command and records an ordered set of frames
per scene, so each README shortcut can show what it actually does.

- **Storyboard frames** hold long enough to read and are checked against a
  selector before capture, exactly like the state walk, so a frame is never taken
  from a state that silently failed to apply.
- **Burst frames** run back to back with almost no settle, so a transition that is
  slow enough — DevTools docking, a page reloading — is sampled moving instead of
  jumped over. A frame identical to the one before it is dropped, and its hold is
  folded into the previous frame; that is also what makes a settled end state
  linger rather than flash past. The shell's own entrance animations are faster
  than one window capture (~250 ms), so a burst there yields nothing and none is
  taken.

Frames land in `docs/screenshots/.frames/` (gitignored) with a `manifest.json`
describing the order and hold of each frame. `scripts/build-gifs.mjs` turns that
into `docs/gifs/<scene>.gif` and a `docs/gifs/tour.gif` that runs every scene in
order. Re-assemble without re-capturing with `pnpm gifs:assemble`, and set
`--width` to change the output size (default 960 px on the long edge; the README
renders them near ~830 px wide).

Page-backed scenes run on `localhost:3000` rather than an ephemeral port, so a
typed target and the recents group read the way they do on a real machine. When a
dev server already owns that port it is used as the page; otherwise the stub is
served there instead. The `themed-devtools` scene needs the real test card — it
loads `TLACHIALONI_SCREENSHOTS_SHOWCASE_URL` (default
`http://localhost:3000/`, the `pnpm test-card` server) with the palette and the
DevTools panel both open — and is skipped with a warning in the manifest when that
URL does not answer, so a missing server can never produce a silently wrong GIF.
Capture a single scene while iterating with
`TLACHIALONI_SCREENSHOTS_SCENES=palette,strip`.

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
for the element-picker shots targets are found at runtime, since a fixed point
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
| `29-page-loaded`                           | The test card, edge-to-edge                                 |
| `30-strip-dark`                            | Strip pinned, dark                                          |
| `31-strip-light`                           | Strip pinned, light                                         |
| `32-titlebar-mode`                         | Titlebar mode: the strip docked, the page laid out below it |
| `33-devtools-bottom`                       | DevTools docked bottom                                      |
| `34-devtools-right`                        | DevTools docked right                                       |
| `35-devtools-left`                         | DevTools docked left                                        |
| `36-picker-hover`                          | Element picker hovering the accent swatch                   |
| `37-history-overlay-back`                  | Armed history swipe, Back                                   |
| `38-history-overlay-forward`               | Armed history swipe, Forward                                |

## Scenes

The scene walk (`pnpm gifs`) is the GIF set. Each scene is one command, and the
frames it records become `docs/gifs/<name>.gif`:

| GIF               | Command             | What the frames show                                                        |
| ----------------- | ------------------- | --------------------------------------------------------------------------- |
| `new-window`      | ⌘N, ⌘W              | a blank window: the location palette armed, then the dark watermark         |
| `extensions`      | (Extensions)        | the store row on the blank window, then an install through every state      |
| `palette`         | ⌘P, `Tab` / `⇧Tab`  | the palette opening, Tab cycling the groups, a target typed and committed   |
| `location`        | ⌘L                  | the target editor: prefilled, recents grouped by origin, expanded, filtered |
| `theme-picker`    | ⌘T                  | the Theme group with the selection walking variants, then Light/Dark/System |
| `light-mode`      | —                   | light mode with the palette open, then DevTools, then both at once          |
| `strip`           | top-edge reveal, ⌘B | the strip hidden, then pinned, dark and light                               |
| `titlebar`        | ⇧⌘F                 | the strip docked as a title bar, with the page laid out below it            |
| `devtools`        | ⌘⌥J, ⌘1/2/3         | DevTools docked bottom, right, then left                                    |
| `picker`          | ⌘⇧C                 | the picker walking the heading, swatch, button, and card                    |
| `reload`          | ⌘R, ⇧⌘R             | a page reloaded, sampled mid-flight                                         |
| `history`         | ⌘← / ⌘→, swipe      | the armed edge overlay, both directions                                     |
| `themed-devtools` | (theming)           | the test card with the palette and DevTools open, the variants sweeping     |

`docs/gifs/tour.gif` is every scene in order. The strip's proximity reveal is
frozen for a capture run — a cursor resting near the top edge would otherwise add
the strip to every frame — so the strip is pinned with ⌘B rather than hovered.

⌘J has no scene: moving keyboard focus changes no pixels, so a GIF of it would be
one still. The capture demonstrated it — both frames came out byte-identical and
the duplicate was dropped.
