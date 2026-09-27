# Phase 1 Data Model: Standalone macOS Application Packaging

Packaging introduces no application data at runtime — the existing `userData`
state store is unaffected. The "data" here is build-time metadata and artifacts,
modeled so identity and icons have exactly one declaration site.

## Entity: App Identity

The single source of truth for the installed app's name and identifier.

| Field          | Meaning                                   | Declared in                    | Consumed by                                   |
| -------------- | ----------------------------------------- | ------------------------------ | --------------------------------------------- |
| `name`         | npm/package name (`tlachialoni`)          | `package.json`                 | dev tooling, output naming                    |
| `productName`  | Human-facing bundle name (`Tlachialoni`)  | `electron-builder.yml`         | app bundle, Finder, application menu, ⌘Tab    |
| `appId`        | Stable bundle identifier (`com.ackzell.tlachialoni`) | `electron-builder.yml` | macOS bundle identity, preferences            |
| `version`      | Semantic version (`0.1.0`)                | `package.json`                 | bundle `CFBundleShortVersionString`           |
| `author`       | Copyright/author string                   | `package.json`                 | bundle metadata, About panel                  |
| `icon`         | `resources/icon.icns`                     | `electron-builder.yml`         | bundle `CFBundleIconFile`, Dock, Finder        |

**Validation rules**

- `appId` MUST be a reverse-DNS string and MUST NOT change between releases once
  the app stores state (`userData` is keyed by appId/name).
- Every field above has exactly one declaration site (FR-003); no value is
  duplicated in `src/main/index.ts`.
- `productName` MUST differ from the runtime default ("Electron") so the installed
  app shows its own name (SC-003).

## Entity: Icon Artifact

The icon pipeline, from editable source to the bundle icon.

| Artifact        | Path                    | Format / size            | Role                                   |
| --------------- | ----------------------- | ------------------------ | -------------------------------------- |
| Source art      | `resources/logo.svg`    | SVG                      | human-editable origin                  |
| Master raster   | `resources/icon.png`    | PNG, 1024², 8-bit RGBA   | `.icns` input; dev dock icon           |
| Bundle icon     | `resources/icon.icns`   | ICNS (16…1024)           | packaged app icon                      |

**State / derivation**

```text
logo.svg ──(export, manual)──▶ icon.png ──(scripts/build-icons.sh: .iconset + iconutil)──▶ icon.icns
```

**Validation rules**

- `icon.png` MUST be square with an alpha channel and MUST be 8-bit (kept small).
- `icon.icns` MUST contain every size macOS requests (16, 32, 128, 256, 512, and
  their `@2x`); the generation script MUST fail loudly if a size is missing
  (edge case: "icon source missing/malformed → fail, don't silently ship default").
- The `@2x` sizes (up to 1024) MUST be generated from the 1024² master so retina
  renders are not upscaled (SC-004).

## Entity: Build Output

The ignored directory where the artifact is produced and previous builds replaced.

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Directory    | `release/` (gitignored)                           |
| Contents     | `mac-arm64/tlachialoni.app`, `tlachialoni-<v>.dmg`, `tlachialoni-<v>-mac.zip` |
| Producer     | the single documented packaging command           |
| Idempotency  | re-running replaces prior output without touching tracked files |

**Validation rules**

- The command MUST NOT write outside `out/` and `release/` (FR-006, FR-009).
- A pre-existing artifact in `release/` MUST be replaced, not corrupted (edge
  case: "previous artifact present").

## Relationships

```text
App Identity (1) ──drives──▶ Build Output
Icon Artifact (1) ──provides icon──▶ App Identity
Icon Artifact (source) ──derives──▶ Icon Artifact (master) ──derives──▶ Icon Artifact (bundle)
```

No entity is persisted at runtime; all are build-time. There are no state
transitions beyond the icon derivation chain and artifact (re)generation.
