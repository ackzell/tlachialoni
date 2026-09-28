# Tlachialoni

Tlachialoni — from Nahuatl, "a device for viewing, for seeing" — is a minimal
local browser for frontend development: one frameless window that renders a local
dev server edge-to-edge with real Chromium DevTools docked inside the same window
— and essentially no other browser chrome.

The only UI is transient and keyboard-first:

- `⌘P` — toggle the command palette (type a target like `:5173`, or run a command)
- `⌘B` — show/hide the draggable window strip
- `⌘⌥J` — toggle DevTools; `⌘1/2/3` dock it bottom/right/left
- `⌘J` — toggle keyboard focus between the page and DevTools
- `⌘⇧C` — element picker with hover highlight
- `⌘R` / `⇧⌘R` — reload / hard reload
- `⌘←` / `⌘→` — back / forward (native text behavior inside inputs)
- `⌘L` — edit the current target

Everything is themed with [Tlapalli](https://tlapalli.ackzell.dev) (eight mineral
variants, dark/light following the system) in Source Code Pro.

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

## License

MIT — see `LICENSE`. Theme color values are derived from Tlapalli (MIT); see
`NOTICE`.
