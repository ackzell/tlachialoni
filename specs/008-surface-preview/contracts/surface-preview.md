# Contract: Developer Surface Preview

## Scope

Development builds only (`!app.isPackaged`). A **Developer** menu starts and
stops previews of transient shell surfaces so they can be styled with live HMR.

## Menu

```
Developer
├─ Preview Loading Veil
├─ Preview Failure View
├─ Preview Extension Install
├─ ────────────
└─ Stop Preview
```

The menu is appended to the application menu only when `!app.isPackaged`. No
preview command is added to the shared command catalog, so none appears in the
palette or as a keybinding.

## Preview signals

Each preview drives the renderer through the same IPC a real occurrence uses, so
the surface component itself needs no dev-specific code.

| Preview | Signal sent | Renderer effect | Reset on stop |
| --- | --- | --- | --- |
| Loading Veil | `viewport:loading` `{ loading: true, url: "http://localhost:5173" }` | `loading` true, `failed` cleared → `LoadingVeil` shows | `viewport:loading` `{ loading: false, url }` |
| Failure View | `viewport:failed` `{ url: "http://localhost:3000", reason: "Connection refused", previousUrl: "http://localhost:5173" }` | `failed` set, `loading` false → `FailureView` shows | `viewport:ready` `{ url }` |
| Extension Install | `extension:status` `<ExtensionStatus>` on a repeating timeline | `extensionStatus` set → `InstallStatus` shows | `extension:status` `null` |

## Lifecycle rules

- **One at a time.** Starting a preview first ends any other preview and stops
  the extension simulation.
- **Shell mode.** While a preview is active, `AppWindow.desiredShellMode()`
  returns `full` so the surface is not clipped. The loading and failure previews
  carry their own `devPreview` flag; the extension preview already forces `full`
  via the live status.
- **Stop.** `stopSurfacePreview()` clears the flag, stops any simulation, clears
  the extension status, and defers the collapse through the settle protocol.
- **Real navigation wins.** `loadTarget()` drops any preview (and a running
  extension simulation) so the renderer follows the real load and the page stays
  interactive.

## Extension install timeline

`resolving` (0.8s) → `downloading` (24 frames, ~0.11s each, determinate progress
up to a fixed total) → `verifying` (0.6s) → `extracting` (0.8s) → `loading`
(0.6s) → `done` (1.6s) → `error` (2.2s) → repeat. This exercises the spinner,
the determinate bar, the indeterminate sweep, the success glyph, and the error
card.

## Snapshot hook

`TLACHIALONI_SNAPSHOT_STATUS=demo|veil|failure` renders the matching preview,
captures `tlachialoni-preview-<name>.png`, and stops it, for automated visual
review.
