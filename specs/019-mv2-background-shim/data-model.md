# Data Model: MV2 Background Shim

## Entity: InstalledExtension (extended)

Two fields are added. Both are additive and defaulted, so records written by
earlier versions are preserved and corrected on the next load.

```ts
export interface InstalledExtension {
  slug: string;
  id: string;
  name: string;
  version: string;
  source: ExtensionSource;
  enabled: boolean;
  installedAt: number;

  /** The AUTHORED manifest is MV3 with a background service worker. */
  mv3ServiceWorker: boolean;

  /** The MV2 rewrite is written AND is the copy currently loaded. */
  mv2Shimmed: boolean;
}
```

### The two flags are deliberately independent

They answer different questions, and the palette needs both:

| `mv3ServiceWorker` | `mv2Shimmed` | Meaning | Badge |
| --- | --- | --- | --- |
| `false` | `false` | Never needed a rewrite | none |
| `true` | `true` | Authored MV3, running as an MV2 rewrite | `MV3→MV2` |
| `true` | `false` | Authored MV3, rewrite declined or rejected. Background is dead. | `MV3` |
| `false` | `true` | Not reachable — a rewrite implies MV3 | (defensive) |

`mv3ServiceWorker` is derived from the **authored** manifest on disk and never
from the rewrite. Were it derived from the rewrite it would flip to `false`
after shimming, and the badge would lose the fact that a conversion happened —
along with the ability to tell "converted and working" from "converted and
broken".

### Persistence

`sanitizeExtensions()` defaults both with `=== true`, so an absent field reads
as `false` rather than dropping the record. `StateStore.patchWindow`-equivalent
comparison in `ExtensionManager.patch()` includes `mv2Shimmed`, so a load that
changes only the shim state still saves.

## Directory layout

```
<userData>/extensions/
├── angular-devtools/              # exactly as installed or downloaded
├── vuejs-devtools/
└── .shim/                         # our rewrites; never shown in Reveal Folder
    ├── angular-devtools/          # full copy + rewritten manifest.json
    └── vuejs-devtools/
```

`.shim` is a dotted directory so it cannot collide with a slug (slugs are
sanitized to `[a-z0-9-]`) and so `revealRoot()` keeps showing only real
installs. A rewrite is a full copy rather than an in-place edit, which costs
disk but keeps the authored copy available as a fallback.

## Transform contract

```ts
export interface Mv2Shim {
  manifest: Record<string, unknown>;  // ready to serialize as manifest.json
  workerScript: string;               // the service worker the page now loads
}

export function shimMv3ToMv2(source: ExtensionManifest): Mv2Shim | null;
```

`null` means "leave this alone" — the caller's signal to write nothing. Pure:
no Electron, no `node:fs`.

### Field translation

| MV3 | MV2 | Why |
| --- | --- | --- |
| `manifest_version: 3` | `2` | Electron has no SW host. |
| `background: {service_worker}` | `{scripts: [w], persistent: true}` | A background *page*. Persistent, or it suspends and drops ports. |
| `content_security_policy: {extension_pages}` | `"script-src 'self'; …"` | Electron rejects the object form outright. |
| `action` | `browser_action` | MV3 rename. |
| `web_accessible_resources: [{resources, matches}]` | `["a.js", …]` | MV2 takes a flat list. |
| `host_permissions` | merged into `permissions` | No separate field in MV2. |
| `optional_host_permissions` | merged into `optional_permissions` | Same. |
| `content_scripts[].world` | removed | MV3-only; MV2 rejects the key. Demotes the script to the isolated world — see the decline below. |

### Declined (returns `null`)

- `manifest_version` is not 3
- no `background.service_worker`
- `background.type === "module"` — MV2 `scripts` loads classic scripts only
- `service_worker` is not a non-empty string
- `background` is not an object

## Invariants

1. The input manifest object is never mutated (FR-015). Tests assert this by
   comparing a JSON snapshot.
2. `web_accessible_resources` output is deduplicated, because the same path can
   appear in several MV3 entries with different `matches`.
3. A declined manifest produces no directory under `.shim/`.
4. A rewrite is regenerated on every `commit` — install, folder install, or
   update — and stale rewrites are removed (`rmSync` before write).