# Data Model: Release Versioning & About Panel

This feature has no database. Its "data" is release metadata that flows from the
repository into the packaged app. The rules below keep one source per value.

## Entities

### Version

- **Meaning**: the semantic version of the app (`MAJOR.MINOR.PATCH`, with optional
  prerelease). Example: `0.2.0`.
- **Declaration site**: `package.json` → `version`. This is the only place it is
  written by hand or by a tool.
- **Consumers**: `app.getVersion()` (About panel), electron-builder (bundle and
  artifact filenames), the tag name `v<version>`.
- **Produced by**: `pnpm tag` / `tag:minor` / `tag:major` (bump);
  `tag:first` leaves it unchanged for the baseline.

### Release tag

- **Meaning**: the annotated git tag that marks a released version.
- **Shape**: `v<version>` (e.g. `v0.2.0`), created by `commit-and-tag-version`.
- **Date**: its `creatordate` is the authoritative release date.
- **Invariant**: `v<version>` matches the `version` in the release commit's
  `package.json`.

### Release date

- **Meaning**: a `YYYY-MM-DD` date shown in the About panel as the day the running
  version was released.
- **Derivation at build**: `creatordate` of `refs/tags/v<version>`; if absent, the
  build day.
- **Declaration site**: computed in `electron.vite.config.ts`, injected as
  `__APP_RELEASE_DATE__` into the main bundle. Not stored in `package.json`.
- **Display**: `formatReleaseDate` renders it long-form (e.g. `September 28, 2026`)
  in the About panel's `credits`.

### Changelog

- **Meaning**: `CHANGELOG.md`, the human-readable history of releases.
- **Produced by**: the tag commands (Conventional Commits → sections).
- **Invariant**: a release adds exactly one top entry, matching the new version
  and date.

### Artifact

- **Meaning**: the packaged output a user installs (`Tlachialoni.app` inside a
  `.dmg` and `.zip`) produced by `pnpm package`.
- **Version stamp**: bundle version and filenames derive from `package.json`.

## State transitions

```text
commits since vX.Y.Z
        │  pnpm tag
        ▼
 version bumped ──► CHANGELOG entry ──► release commit ──► tag vX'.Y'.Z'
        │
        │  pnpm package  (build after tagging)
        ▼
 artifact stamped with version; About resolves release date from the tag
```

## Validation rules

- The version string MUST be a valid semver (enforced by the release tool).
- A release MUST NOT be created if `v<version>` already exists.
- The release date MUST always resolve to a valid `YYYY-MM-DD`; the formatter falls
  back to the input string unchanged if it cannot parse it.
- No release metadata may be read from the network or the source tree at runtime.
