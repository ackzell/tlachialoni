# Contract: Release Identity

Version and release date each have exactly one source. This contract keeps the
About panel from drifting away from the tag and the bundle.

## Declaration sites

| Value         | Declaration site                                             | Example value            |
| ------------- | ------------------------------------------------------------ | ------------------------ |
| `version`     | `package.json` → `version`                                   | `0.2.0`                  |
| release tag   | git tag `v<version>` (created by `pnpm tag`)              | `v0.2.0`                 |
| release date  | `electron.vite.config.ts` → `creatordate` of `refs/tags/v<version>` | `2026-09-28`      |
| injected date | `__APP_RELEASE_DATE__` (electron-vite `define`, main bundle)  | `"2026-09-28"`           |
| About credits | `src/main/index.ts` → `formatReleaseDate(__APP_RELEASE_DATE__)` | `Released September 28, 2026` |

## Rules

- **Single source**: no version literal and no release-date literal is written in
  source. `src/main/index.ts` reads the version via `app.getVersion()` and the date
  via the injected constant only.
- **Baked in**: the release date is resolved at build time and embedded in the
  bundle. The packaged app MUST NOT invoke git, read the source tree, or use the
  network to obtain it (003 FR-005).
- **Fallback**: when `v<version>` does not exist (untagged/dev build), the build
  date is used and the About panel still renders.
- **Correct order**: tag the release before packaging it, so the artifacts carry
  the tag's date. A build made before tagging legitimately reports the build date.
- **Format tolerance**: an unparseable date string is shown verbatim rather than
  causing an error.

## Verification (see `quickstart.md`)

1. `pnpm tag:first` (or a later `pnpm tag`) → `git tag` shows `vX.Y.Z`.
2. `pnpm package` → install and open the About panel.
3. The panel's version equals `package.json`; its release date equals the tag's
   date; the logo is unchanged.
