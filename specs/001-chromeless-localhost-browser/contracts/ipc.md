# Contract: IPC Surface

The renderer never sees raw `ipcRenderer`. Both preloads expose a minimal, typed
API over `contextBridge`; all handlers validate their input in the main process.
There are two bridges: the **shell** preload (Vue surfaces) and the **site** preload
(the guest page's picker/focus bridge, inert until armed).

## Shell bridge (`src/preload/shell.ts`)

| Channel | Kind | Payload | Semantics |
| --- | --- | --- | --- |
| `state:get` | invoke → | — | Returns the sanitized persisted state |
| `command:run` | invoke → | `{ id: string, arg?: unknown }` | Runs one command through the registry; returns `{ ok, reason? }` |
| `target:validate` | invoke → | `{ input: string }` | Returns `{ ok, url?, reason? }` for palette inline feedback |
| `theme:setVariant` | invoke → | `{ variant: VariantSlug }` | Persists and applies a variant |
| `theme:setColorMode` | invoke → | `{ mode: 'system' \| 'dark' \| 'light' }` | Persists and applies a mode |
| `picker:arm` / `picker:disarm` | invoke → | — | Controls the picker session |
| `window:close` | invoke → | — | Closes the current window (strip close button) |
| `palette:visibility` | send → | `{ open: boolean }` | The renderer reports palette open/closed (keeps main's layout in sync) |
| `shell:ready` | send → | — | The renderer has mounted and subscribed; main flushes queued messages |
| `state:changed` | ← on | `PersistedState` | Main pushes the full state (includes recents) |
| `theme:apply` | ← on | `{ variant, colorMode, resolved }` | Main tells the shell which tokens to apply |
| `palette:open` | ← on | `{ initial: string }` | Main asks the shell to show the palette (prefilled) |
| `palette:close` | ← on | — | Main asks the shell to dismiss the palette |
| `viewport:loading` | ← on | `{ loading: boolean }` | Drives the loading veil (FR-021) |
| `viewport:ready` | ← on | `{ url: string }` | First successful content signal |
| `viewport:failed` | ← on | `{ url: string, reason: string }` | Drives the failure view (FR-019) |
| `devtools:changed` | ← on | `{ open: boolean, mode }` | Keeps picker/strip/palette state in sync |

Recents are delivered inside `state:changed` (a separate `recents:changed`
channel was unnecessary).

## Site bridge (`src/preload/site.ts`)

Runs in the guest's isolated world. It does **not** expose anything to page
scripts; it only talks to main and, while armed, manages a transient overlay.

| Channel | Kind | Payload | Semantics |
| --- | --- | --- | --- |
| `site:focus-editable` | send → | `{ editable: boolean }` | Maintains the shortcut guard for `⌘←` / `⌘→` |
| `picker:hover` | send → | `{ x: number, y: number }` | Pointer position in view-relative DIPs |
| `picker:picked` | send → | `{ x: number, y: number }` | Click position for `inspectElement(x, y)` |
| `picker:armed` | ← on | `{ armed: boolean }` | Starts/stops the overlay; `false` always cleans up |

## Rules

- **Validation**: `command:run` rejects unknown ids; `target:validate` applies the
  local-target policy (`src/main/nav/policy.ts`); URLs are never passed to
  `loadURL` without passing the policy.
- **Readiness**: main queues shell messages until `shell:ready`, so nothing sent
  during startup (theme, state, palette) is lost.
- **Cleanup**: on window `closed`, main closes every view's `webContents`.
- **No page globals**: the site bridge never attaches anything to the page's
  `window` and never injects DOM except the armed picker overlay.
- **Failure reason** is a human-readable string derived from the Chromium error
  code; a late failure from a superseded navigation is ignored.
