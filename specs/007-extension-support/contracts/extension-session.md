# Contract: Extension Session & Status Surface

## Sessions

| WebContents | Session | Extensions |
| --- | --- | --- |
| Guest page (`site-view.ts`) | default session | loaded here |
| Shell UI (`shell-view.ts`) | named, non-persistent (`partition: "shell"`) | never |
| DevTools front-end | created by Chromium | inherits the guest's DevTools extensions |

Extension loading happens once at `app.whenReady`, before the guest view's first
navigation, into `session.defaultSession`:

```ts
const manager = new ExtensionManager({ store, session: session.defaultSession, root });
await manager.loadAll();
```

## Shell messages

`extension:status` (main → shell), payload `ExtensionStatus` as defined in
`data-model.md`. Queued until the shell reports ready, like the existing
`viewport:*` messages.

Dismissal is a command, not a dedicated channel: the renderer calls
`runCommand("extensions.dismissStatus")`, main clears the surface and defers the
collapse through the settle protocol (004).

## Rendering rules (`InstallStatus.vue`)

- Visible while `phase` is `resolving | downloading | verifying | extracting |
  loading`, or `done`/`error` before dismissal.
- Spinner: a small themed ring; with `prefers-reduced-motion` it holds still.
- Message: the phase message; when `name` is known it names the extension.
- Progress bar: determinate from `received / total` while `downloading` and
  `total` is non-null; otherwise an indeterminate sweep.
- `done` auto-dismisses after ~1.6s; `error` waits for `Esc`, a click, or the
  dismiss command.
- The surface overlays the page: it must not change the page's inner dimensions
  (verified by the existing snapshot harness pattern).

## Shell mode

`AppWindow.desiredShellMode()` returns `"full"` while a status is visible, so
the surface is never clipped by a collapse; when it is dismissed, the collapse
defers until the surface's leave transition settles.
