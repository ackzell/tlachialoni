# Data Model: MV3 Extension Detection & Warning

## One additive persisted field

`InstalledExtension` gains a boolean:

| Field | Type | Notes |
| --- | --- | --- |
| `mv3ServiceWorker` | `boolean` | True when the manifest is MV3 with `background.service_worker`. |

The status itself is transient, but the *fact* is persisted, because the warning
fires once and the palette badge has to keep reporting the same limitation
afterwards (FR-005, FR-010, FR-011).

| Concern | Decision |
| --- | --- |
| Schema version | Unchanged at 3. The field is additive and defaulted. |
| Older records | A missing or non-boolean value sanitizes to `false`; the extension is kept, not dropped. |
| Correction | Re-derived from the manifest on every load, so a back-filled record picks up its real value on the next launch and an updated manifest is reflected. |
| Deregistration | Removing the extension deletes the record and the flag with it. |
| Write cost | Included in `ExtensionManager.patch`'s change check, so a load that changes nothing writes nothing. |

## ExtensionStatus (transient, never persisted)

The existing `ExtensionStatus` type gains a new `"warning"` phase:

```typescript
type ExtensionStatusPhase =
  | "resolving"
  | "downloading"
  | "verifying"
  | "extracting"
  | "loading"
  | "warning"  // NEW
  | "done"
  | "error";
```

| Field | Type | Notes |
| --- | --- | --- |
| `phase` | `ExtensionStatusPhase` | Drives the surface. |
| `name` | `string?` | Extension name once known, else the ID. |
| `message` | `string` | Human-readable stage text. |
| `progress` | `{ received: number; total: number \| null }?` | Bytes, present while downloading. |
| `error` | `string?` | Present when `phase` is `error`. |

### Warning phase behavior

- The `warning` phase is emitted **instead of** `done` when an install or
  re-enable loads an extension with an MV3 service worker, so it is the last
  status of that action (FR-003).
- The `message` contains the full warning text with the app name interpolated.
- The warning does **not** auto-dismiss; it stays until the developer dismisses it.
- It is emitted for one extension at a time, because it only fires on a single
  install or re-enable — the boot-time multi-extension card it replaced would
  have needed a list form, and is no longer shown (FR-005).
- `isActivePhase("warning")` is `false`, so `Esc` and a click dismiss it rather
  than being swallowed, and no progress bar is implied.

## MV3 detection (derived, then persisted)

```typescript
/** True when manifest_version === 3 and background.service_worker is present. */
export function detectMv3ServiceWorker(manifest: ExtensionManifest): boolean;
```

Pure function over `manifest.raw`, so it is unit-testable without Electron. The
result is written to `InstalledExtension.mv3ServiceWorker` (see above); nothing
else is stored.

## Palette badge (transient view state)

`Row.badge?: string` carries `MV3` for an extension row whose persisted flag is
true. It is derived per render, never stored, and is unset for every other row
kind (FR-011).

## State transitions (no change)

The existing installed extension state machine is unchanged:

```
(absent) --install--> enabled --disable--> disabled --enable--> enabled
    ^                     |                     |
    |                     +-----remove----------+--> (absent)
    |                     |
    +-------remove--------+
```

The `warning` phase is a transient status, not a state transition.
