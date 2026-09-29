# Tlachialoni

Tlachialoni — from Nahuatl, "a device for viewing, for seeing" — is a minimal
local browser for frontend development: a frameless window that renders a local
dev server edge-to-edge with real Chromium DevTools docked inside the same window
— and essentially no other browser chrome. Each window is one target, and you can
open as many windows as you have dev servers (`⌘N`), each fully independent.

The only UI is transient and keyboard-first:

- `⌘N` — open a new window (blank, with the location entry focused); `⌘W` closes it
- `⌘P` — toggle the command palette (type a target like `:5173`, or run a command)
- `⌘L` — edit the current target, with recent pages listed and grouped by origin
- `⌘T` — jump to the theme picker
- `Tab` / `Shift+Tab` — cycle the palette's groups (Location, DevTools, View, Theme, Extensions, Other)
- `⌘B` — show/hide the draggable window strip (and, with it, the macOS window controls)
- `⌘⌥J` — toggle DevTools; `⌘1/2/3` dock it bottom/right/left
- `⌘J` — toggle keyboard focus between the page and DevTools
- `⌘⇧C` — element picker with hover highlight
- `⌘R` / `⇧⌘R` — reload / hard reload
- `⌘←` / `⌘→` — back / forward (native text behavior inside inputs)

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
supports a subset of extension APIs (content scripts, DevTools pages, and
Manifest V2 backgrounds — not Manifest V3 background service workers), so some
store extensions run only partially. See
`specs/007-extension-support/spec.md` for the details and limits.

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

### Surface previews

The transient shell surfaces are hard to trigger on demand (a slow server for
the loading veil, a dead one for the failure view, a real download for the
install status). In a dev build, the **Developer** menu puts each one into a
representative state and holds it there so you can style it with live HMR:

- **Preview Loading Veil**
- **Preview Failure View**
- **Preview Extension Install** (loops every phase, including progress)
- **Stop Preview**

The extension preview can also start with the app:

```sh
TLACHIALONI_DEMO_STATUS=1 npm run dev
```

The Developer menu is absent from packaged builds. See
`specs/008-surface-preview/spec.md`.

## Packaging

```sh
npm run package    # build a standalone macOS app into release/
```

This produces `release/mac-arm64/Tlachialoni.app` plus a `.dmg` and a `.zip`.
Copy the `.app` to `/Applications` and launch it like any other Mac app — no
repository or terminal required.

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

## License

MIT — see `LICENSE`. Theme color values are derived from Tlapalli (MIT); see
`NOTICE`.
