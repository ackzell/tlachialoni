# Data Model: Extension Support

## PersistedState (schema version 2)

Adds one field to the existing record; every other field is unchanged.

```jsonc
{
  "schemaVersion": 2,
  "extensions": [ /* InstalledExtension[] */ ]
  // ...target, recents, dockMode, devtoolsOpen, stripVisible, bounds, variant, colorMode
}
```

### InstalledExtension

| Field | Type | Notes |
| --- | --- | --- |
| `slug` | string | Stable local key; the folder name under the extension root. |
| `id` | string | Extension ID assigned by the platform; informational. |
| `name` | string | Manifest display name at last load. |
| `version` | string | Manifest version at last load. |
| `source` | `"store" \| "folder"` | Where it came from; store records can be updated. |
| `enabled` | boolean | Loaded at launch only when true. |
| `installedAt` | number | Epoch milliseconds. |

Sanitization rules: a record survives only if `slug`, `id`, `name`, and
`version` are strings, `source` is a known value, `enabled` is a boolean, and
`installedAt` is a finite number. Duplicate slugs collapse to the first. The list
is capped at `MAX_EXTENSIONS` (32).

## Extension root (on disk)

```
<userData>/extensions/<slug>/
```

- Each folder is a complete unpacked extension; nothing reads the original
  source folder after install.
- The store path writes into a sibling `<slug>.download` temp directory and
  renames it into place only after validation (atomic-ish replace).

## ExtensionStatus (transient, never persisted)

| Field | Type | Notes |
| --- | --- | --- |
| `phase` | `"resolving" \| "downloading" \| "verifying" \| "extracting" \| "loading" \| "done" \| "error"` | Drives the surface. |
| `name` | string? | Extension name once known, else the ID. |
| `message` | string | Human-readable stage text. |
| `progress` | `{ received: number; total: number \| null }`? | Bytes, present while downloading. |
| `error` | string? | Present when `phase` is `error`. |

The status is visible while `phase` is any active stage or while `done`/`error`
is still on screen; the window stays full-height for that duration.

## State transitions (installed extension)

```
(absent) --install--> enabled --disable--> disabled --enable--> enabled
   ^                     |                     |
   |                     +-----remove----------+--> (absent)
   |                     |
   +-------remove--------+
```

`update` re-runs install for a `source: "store"` record, replacing files in
place while keeping `installedAt` original and refreshing `id`/`name`/`version`.
