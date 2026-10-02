# Tlachialoni

Tlachialoni — from Nahuatl, "a device for viewing, for seeing" — is a minimal
local browser for frontend development: a frameless window that renders a local
dev server edge-to-edge with real Chromium DevTools docked inside the same window
— and essentially no other browser chrome. Each window is one target, and you can
open as many windows as you have dev servers (`⌘N`), each fully independent.

The only UI is transient and keyboard-first:

- `⌘N` — open a new window (blank, with the location entry focused and the logo
  watermark on the empty page); `⌘W` closes it
- `⌘P` — toggle the command palette (type a target like `:5173`, or run a command)
- `⌘L` — edit the current target, with recent pages listed and grouped by origin
- `⌘T` — jump to the theme picker
- `Tab` / `Shift+Tab` — cycle the palette's groups (Location, DevTools, View, Theme, Extensions, Other)
- Drag from the top of the window at any time, pointer only; hovering the top
  edge or resting there briefly reveals the strip
- `⌘B` — pin the window strip on screen (and, with it, the macOS window controls)
- `⇧⌘F` — toggle titlebar mode: the strip docks permanently as a title bar and the
  page moves below it, so the target and controls are always visible without covering
  the page
- `⌘⌥J` — toggle DevTools; `⌘1/2/3` dock it bottom/right/left
- `⌘J` — toggle keyboard focus between the page and DevTools
- `⌘⇧C` — element picker with hover highlight
- `⌘R` / `⇧⌘R` — reload / hard reload
- `⌘←` / `⌘→` — back / forward (native text behavior inside inputs)
- Two-finger horizontal swipe on the trackpad — back / forward, with an armed
  edge overlay that grows as the swipe commits and recedes as it cancels (the
  strip's back/forward buttons reflect the same availability)

Everything is themed with [Tlapalli](https://tlapalli.ackzell.dev) (eight mineral
variants, dark/light following the system) in Source Code Pro. Theme is
per-window: each window can use its own variant and color mode (the guest page
and DevTools still follow the OS).

## Extensions

Chrome extensions can be installed at runtime from the command palette — nothing
is bundled. Paste a Chrome Web Store link or extension ID and choose **Install
extension …**, or choose **Install Extension from Folder** for an unpacked
extension. Installs show a transient status surface with a spinner, the current
stage, and a download progress bar; each installed extension also appears in the
palette as a row you can enable, disable, update, or remove.

Extensions load only into the guest page, never into the shell UI. Electron
runs Manifest V3 background service workers, but a worker that throws while
starting up is torn down — and Electron doesn't compile `chrome.debugger`, so a
worker that touches it dies and takes its registration with it. That matters
more than it sounds: some framework developer tools use that background as the
bus between their DevTools panel and the page, so with the worker dead Angular
DevTools reports that your app isn't there while it can plainly see it. A
Manifest V2 background page survives the same throw, so when an extension has a
service worker background the app writes an MV2 rewrite of its manifest
alongside the installed copy and loads that instead, which gives the extension a
background context that stays alive. Only the manifest changes — no extension
code is patched, and the installed copy stays exactly as the store served it.
Because that changes how your extension declares itself, it says so: installing
or re-enabling one raises a warning that stays until you dismiss it, and its
palette row carries an `MV3→MV2` badge so you can see at a glance which
extensions were converted. If a rewrite fails to load, the app falls back to the
authored copy and the row keeps its `MV3` badge, because then the authored
worker is what runs and may not survive.

The rewrite is not applied to everything, because Manifest V2 cannot express
everything Manifest V3 can. Two cases are handled rather than converted: an
extension that runs part of itself in the page's own JavaScript world
(`world: "MAIN"`, which MV2 has no equivalent for) is left on its authored
manifest, and a background worker that loads its code with `importScripts` (also
MV3-only) has those imports hoisted into the MV2 `scripts` list. Converting the
first kind would break the extension outright to fix a background it may not even
need — Vue.js devtools is the case in point, as it reaches the page without its
background at all, worked before, and would not have worked after.

Two limits survive all of this. `chrome.debugger` is the reason the rewrite
exists at all — Electron doesn't compile the namespace, so signal breakpoints
inside framework debuggers won't work — and `chrome.scripting` is Chrome-only
surface Electron doesn't compile either, so an extension that leans on it for
injection still won't. axe DevTools leans on `chrome.debugger` for its entire
product, and Electron does not ship that namespace at all, so expect its panel to
open and then report that it cannot analyse the tab. That is the accurate outcome,
not a bug to chase. See `specs/019-mv2-background-shim/spec.md` for the details
and `spikes/mv2-background-shim/` for the spike that established this works on
Electron 44 — and the correction below it, which records that Electron does host
MV3 service workers and that `chrome.debugger` is what kills them.

A rewritten extension only affects pages that load after it: content scripts are
injected when a page loads, so an extension activated afterwards never reaches the
page already open. Reload the page, then re-select the extension's DevTools panel
— it stops looking for the application after about ten seconds.

## Requirements

- macOS 13+ (Apple silicon)
- Node 24.21+ and npm

## Development

```sh
npm install
npm run dev        # build and launch with renderer HMR
npm run build      # production build
npm run preview    # run the production build
npm run check      # format, lint, and type checks (Vite+)
npm run test       # unit tests (Vitest)
```

The default target is `http://localhost:3000`.

### Dev identity

A development run is a separate app from the installed one, in every place macOS
can tell two apps apart:

|                   | Installed app   | `npm run dev`       |
| ----------------- | --------------- | ------------------- |
| Dock / ⌘Tab name  | Tlachialoni     | Tlachialoni Dev     |
| Bundle identifier | `…tlachialoni`  | `…tlachialoni.dev`  |
| Profile directory | `…/Tlachialoni` | `…/Tlachialoni Dev` |

The separate profile is the point: cookies, installed extensions, and saved
windows live in `~/Library/Application Support/<name>`, so a shared profile means
an HMR session overwrites what the installed app restores on its next launch.

`app.setName()` alone cannot rename the dev app, because macOS reads the visible
name from the bundle. `scripts/dev-identity.mjs` (run automatically before
`dev`, `preview`, and `screenshots`) rewrites the three relevant `Info.plist`
keys in `node_modules/electron/dist/Electron.app` and re-signs it ad-hoc. Two
consequences:

- **Reinstalling `electron` reverts it.** Nothing breaks — the next `npm run dev`
  detects the original plist and re-patches.
- **Editing that plist invalidates its signature**, which is why the script
  re-signs. Removing the re-sign makes Electron fail to launch with a message
  that gives no hint of the cause.

To start over, delete `~/Library/Application Support/Tlachialoni Dev`.

### Surface previews

The transient shell surfaces are hard to trigger on demand (a slow server for
the loading veil, a dead one for the failure view, a real download for the
install status). In a dev build, the **Developer** menu puts each one into a
representative state and holds it there so you can style it with live HMR:

- **Preview Loading Veil**
- **Preview Failure View**
- **Preview Extension Install** (loops every phase, including progress)
- **Preview History Navigation** (alternates the armed edge overlay)
- **Stop Preview**

The extension preview can also start with the app:

```sh
TLACHIALONI_DEMO_STATUS=1 npm run dev
```

The Developer menu is absent from packaged builds. See
`specs/008-surface-preview/spec.md`.

## Packaging

```sh
npm run package      # build a standalone macOS app into release/
npm run package:local  # build a testable variant into release-local/
```

This produces `release/mac-arm64/Tlachialoni.app` plus a `.dmg` and a `.zip`.
Copy the `.app` to `/Applications` and launch it like any other Mac app — no
repository or terminal required.

### Testing a build without touching your installed app

`npm run package:local` builds `release-local/mac-arm64/Tlachialoni Local.app`,
which differs from the shipped app in its bundle id, its Finder name, and its
profile directory. Use it to check a build without disturbing real state.

It exists because a build sitting in `release/` alongside an installed copy is
its own hazard: both carry `com.ackzell.tlachialoni`, so macOS treats them as one
app and opening the second activates the first rather than launching it. Either
use `package:local`, or keep the installed app and delete
`release/mac-arm64/Tlachialoni.app` — don't keep both.

The build is unsigned (ad-hoc) for local use, so macOS blocks the first launch of
a copy that carries a quarantine flag. To open it, right-click the app → **Open**,
or run:

```sh
xattr -dr com.apple.quarantine /Applications/Tlachialoni.app
```

The icon is generated from committed artwork by `scripts/build-icons.sh`
(`resources/logo.svg` → `resources/icon.png` → `resources/icon.icns`). Developer ID
signing and notarization are intentionally deferred; `electron-builder.yml` leaves
room for them.

## Releasing

Releases are cut locally from Conventional Commit messages — no CI and no
publishing involved. The version lives only in `package.json` and drives the app
bundle, the artifact filenames, and the About panel.

```sh
npm run tag:first   # once: tag the current version as the baseline (e.g. v0.1.0)
npm run tag         # bump by the commits since the last tag, update CHANGELOG.md, commit, tag vX.Y.Z
npm run tag:minor   # force a minor bump
npm run tag:major   # force a major bump
```

Tag first, then package, so the artifact carries the release's date:

```sh
npm run tag && npm run package
```

The About panel shows the logo, the version, and the release date taken from the
`v<version>` tag's date (a build made before the tag is created falls back to the
build date). Tags and artifacts are local; pushing tags is a deliberate manual
step (`git push --follow-tags`) left for later.

## Design docs

This project is built spec-first with [Spec Kit](https://github.com/github/spec-kit).
See:

- `.specify/memory/constitution.md` — project principles
- `specs/001-minimal-browser/spec.md` — the feature specification
- `specs/001-minimal-browser/plan.md` and `tasks.md`
- `specs/003-standalone-packaging/spec.md` — standalone app packaging
- `specs/004-shell-motion/spec.md` — motion for the transient shell surfaces
- `specs/006-release-versioning-about/spec.md` — release versioning and the About panel
- `specs/007-extension-support/spec.md` — installing and managing extensions
- `specs/008-surface-preview/spec.md` — previewing transient shell surfaces in development
- `specs/009-macos-traffic-lights/spec.md` — native window controls bound to the strip
- `specs/010-palette-groups/spec.md` — grouped command palette and host-grouped recents
- `specs/011-grouped-os-menu/spec.md` — domain-grouped application menu
- `specs/012-multi-window/spec.md` — multiple independent windows
- `specs/013-always-on-drag-region/spec.md` — always-draggable window with a hover-revealed strip
- `specs/014-blank-watermark/spec.md` — the logo watermark on a blank, never-loaded window
- `specs/015-trackpad-swipe-navigation/spec.md` — two-finger swipe history navigation
- `specs/017-macos-dock-menu/spec.md` — the macOS Dock window menu and Dock-icon behavior
  (macOS now stays open when the last window closes, so the Dock stays available)
- `specs/019-mv2-background-shim/spec.md` — running extensions whose MV3 background dies here
- `specs/020-extension-load-narrowing/spec.md` — **pending**: narrow that rewrite to the
  extensions that need it, so most run as authored

## License

MIT — see `LICENSE`. Theme color values are derived from Tlapalli (MIT); see
`NOTICE`.
