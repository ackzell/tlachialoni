# Contract: Sender-Routed IPC

The shell and site bridges are unchanged from 001/007 (see
`specs/001-minimal-browser/contracts/ipc.md`). What changes is **who handles a
message**: with more than one window, the process registers each channel once and
routes by `event.sender`.

## Requirements

- **Register once**: every `ipcMain.handle` / `ipcMain.on` channel is registered a
  single time for the process (today `registerIpc(appWindow)` runs in the
  `AppWindow` constructor and would throw on the second window).
- **Route by sender**: the handler resolves the `WebContents` that sent the
  message to its owning `AppWindow`. A window registers both its shell and site
  view webContents ids with the window manager when it is created and removes them
  when it is destroyed.
- **Per-window semantics**: any state a handler reads or writes belongs to the
  resolved window — its record (target, bounds, DevTools, strip) and its live
  surfaces. Shared scalars (theme, color mode, extensions) are process-wide.
- **Unknown sender**: a message from a webContents that maps to no window is
  ignored (never routed to an arbitrary window).

## Routing table (channels → window method)

| Channel | Kind | Handler acts on |
| --- | --- | --- |
| `state:get` | invoke | resolved window's composed view state |
| `command:run` | invoke | resolved window's command registry |
| `target:validate` | invoke | policy (process-wide; no window state) |
| `theme:setVariant` / `theme:setColorMode` | invoke | shared scalar, then fan out to all windows |
| `theme:previewVariant` | invoke | resolved window's transient preview only |
| `picker:arm` / `picker:disarm` | invoke | resolved window's picker |
| `window:close` | invoke | resolved window closes (via `window.close`) |
| `palette:visibility` | send | resolved window's palette state |
| `shell:ready` / `shell:settled` | send | resolved window's shell lifecycle |
| `site:focus-editable` | send | resolved window's editable-focus guard |
| `picker:hover` / `picker:picked` | send | resolved window's picker |

## Downstream pushes (main → renderer)

Pushes are addressed to a specific window's shell view; they never broadcast
except where noted.

| Channel | Target |
| --- | --- |
| `state:changed` | the window whose state changed; broadcast on a shared change |
| `theme:apply` | the window, or every window on a shared theme/color change |
| `palette:open` / `palette:close` | the window being driven |
| `viewport:loading` / `viewport:ready` / `viewport:failed` | the window whose page changed |
| `devtools:changed` | the window whose DevTools changed |
| `extension:status` | the window that initiated the extension action, else the focused window |

## Readiness and cleanup

- Main queues a window's shell messages until that window's `shell:ready`, as
  today; queues are per window.
- On a window's `closed`, the manager drops its webContents ids from the routing
  map, removes its state record, and lets its views be closed. No handler keeps a
  reference to a destroyed window.
