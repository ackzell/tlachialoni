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

## Verification (see `quickstart.md`)

1. `npm run dev` → Dock shows the app icon (not the default Electron icon).
2. `npm run package` → install `release/…/Tlachialoni.app` to `/Applications`.
3. Launch from Spotlight → bundle name and icon are the app's own in the Dock,
   ⌘Tab, menu, and About panel.
