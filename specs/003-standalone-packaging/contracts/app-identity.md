# Contract: App Identity & Icon

Every identity value has exactly one declaration site. This contract prevents the
name/icon from drifting between the development run and the installed bundle.

## Declaration sites

| Value         | Declaration site                                  | Example value             |
| ------------- | ------------------------------------------------- | ------------------------- |
| `name`        | `package.json` → `name`                           | `tlachialoni`             |
| `productName` | `package.json` → `productName`                    | `Tlachialoni`             |
| `version`     | `package.json` → `version`                        | `0.1.0`                   |
| `author`      | `package.json` → `author`                         | `Axel Uriel Martínez Castillo` |
| `appId`       | `electron-builder.yml` → `appId`                  | `com.ackzell.tlachialoni` |
| bundle icon   | `electron-builder.yml` → `mac.icon`               | `resources/icon.icns`     |
| dev dock icon | `src/main/index.ts` → `?asset` import             | `resources/icon.png`      |
| dev name / profile | derived: `productName` + `" Dev"`             | `Tlachialoni Dev`         |
| dev bundle id | derived: `appId` + `".dev"`                       | `com.ackzell.tlachialoni.dev` |
| local bundle id | `electron-builder.local.yml` → `appId`         | `com.ackzell.tlachialoni.local` |

Electron prefers `productName` over `name` for `app.getName()`, and electron-builder
inherits `productName` from `package.json` — so declaring it there alone drives both
the runtime name and the bundle name.

## Rules

- **Single source**: a name/identifier/icon path appears in exactly one place
  above. `src/main/index.ts` MUST NOT hard-code `"tlachialoni"` for the bundle
  identity; if it sets the application name, it derives from the same value
  (`app.getName()` / a shared constant) — not a second literal.
- **Consistency across surfaces**: after install, the *same* `productName` and icon
  MUST appear in Finder, the application menu, the About panel, the Dock, and the
  ⌘Tab switcher (SC-003). The runtime default ("Electron") MUST NOT be visible.
- **Dev parity**: `npm run dev` MUST show the same icon as the installed app (via
  `app.dock.setIcon`), so identity issues are caught before packaging.
- **Stability**: `appId` MUST remain constant across releases once shipped, because
  macOS preferences and state are keyed to it.

## Separation

The three identities below MUST NOT share on-disk state. Sharing is invisible in
the Dock but destructive: a development run rewrites the cookies, installed
extensions, and restored windows that the shipped app loads on its next launch.

| Identity                | Bundle id                          | `userData`                                             |
| ----------------------- | ---------------------------------- | ------------------------------------------------------ |
| shipped app             | `com.ackzell.tlachialoni`          | `~/Library/Application Support/Tlachialoni`            |
| development run         | `com.ackzell.tlachialoni.dev`      | `~/Library/Application Support/Tlachialoni Dev`        |
| local packaging variant | `com.ackzell.tlachialoni.local`    | `~/Library/Application Support/Tlachialoni Local`      |

- **A development run MUST NOT resolve `userData` to the shipped app's path.**
  `productName` alone does not separate them — it is shared by both. Only
  `src/main/index.ts`'s explicit `app.setPath("userData", …)` does. This is the
  single rule whose absence caused development and packaged builds to collide.
- **The test-harness sandbox takes precedence.** `TLACHIALONI_DOCK_TEST`,
  `UI_SNAPSHOT`, `EXTENSION_TEST`, and `SCREENSHOTS` redirect `userData` to a temp
  directory, and `npm run screenshots` launches an *unpackaged* build — so the dev
  branch MUST be an `else if` after that block, or a capture run lands on the
  development profile.
- **Bundle identity alone is not separation.** Setting `appId`/`productName` in
  `electron-builder.local.yml` changes what macOS displays, but `app.getName()`
  reads `productName` from the packaged `package.json`. `extraMetadata.productName`
  is what actually moves `userData`; without it the local variant keeps the
  shipped app's profile.

## Development bundle identity

`npm run dev` executes `node_modules/electron/dist/Electron.app`, whose
`Info.plist` reads `Electron` / `com.github.Electron`. `app.setName()` cannot
change what macOS shows, because AppKit reads `CFBundleName` from the bundle.
`scripts/dev-identity.mjs` therefore rewrites the three plist keys and re-signs
the bundle ad-hoc (editing the plist invalidates the signature npm ships). It is
idempotent, so `npm install electron` silently reverting the plist is repaired on
the next run.

## Verification (see `quickstart.md`)

1. `npm run dev` → Dock shows the app icon; the app menu and ⌘Tab read
   "Tlachialoni Dev". `ls ~/Library/Application\ Support/` shows no new writes to
   `Tlachialoni`.
2. `npm run package:local` → produces
   `release-local/mac-arm64/Tlachialoni Local.app` only — no dmg, no zip.
3. `npm run package` → install `release/…/Tlachialoni.app` to `/Applications`.
4. Launch from Spotlight → bundle name and icon are the app's own in the Dock,
   ⌘Tab, menu, and About panel.
