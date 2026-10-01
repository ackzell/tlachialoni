# Contract: Extension Status Surface — Warning Phase

## Overview

The extension status surface gains a new `"warning"` phase. This contract defines the shape and behavior of the warning status.

## Status shape

```typescript
interface ExtensionStatus {
  phase: "resolving" | "downloading" | "verifying" | "extracting" | "loading" | "warning" | "done" | "error";
  name?: string;
  message: string;
  progress?: { received: number; total: number | null };
  error?: string;
}
```

`isActivePhase("warning")` is `false`, so the phase is terminal: `Esc` and a click dismiss it rather than being swallowed, and the surface implies no progress bar.

## Warning phase

### Emission

- Emitted **instead of** `done` when an install or a re-enable loads an extension whose manifest is MV3 with `background.service_worker`. It is the last status of that action.
- The `message` contains the full warning text with the app name interpolated.
- One extension per status. A list form is no longer needed: the phase only fires on a single install or re-enable, and the boot-time multi-extension card it replaced is gone (FR-005).
- Never emitted at boot or by `extensions.reload`. Both paths load extensions without touching the surface, because there is no window to route a boot status to and a per-launch card is dismissed unread.

### Message template

```
This extension uses Manifest V3 service workers, which {appName} doesn't support. Its background functionality won't work, but content scripts and DevTools pages will.
```

`{appName}` is sourced from the app's product name (`app.getName()`), not hardcoded. Held in one place — `ExtensionManager.warnAboutMv3` — so both emission sites cannot drift.

### Behavior

- The warning does **not** auto-dismiss.
- It stays until the developer dismisses it (via `Esc`, a click, or `extensions.dismissStatus`).
- It is not repeated on later launches. The standing fact is persisted as `InstalledExtension.mv3ServiceWorker` and badged in the palette instead, so there is no dismissal to persist or expire.
- The warning does **not** block the extension from loading; `loadExtension` has already resolved by the time it is emitted.

## Renderer behavior

- `InstallStatus.vue` renders the warning with an amber glyph (distinct from `done` green and `error` red), the message as the card's title, no subtitle, and a "Press Esc or click to dismiss" hint.
- The phase is excluded from `busy` (no spinner or progress bar) and from the `done` auto-dismiss timer.
- The auto-dismiss is driven by `shouldAutoDismiss(phase)`, a predicate over the status *value*, and the watcher runs with `immediate: true`. Both halves are load-bearing: `App.vue` mounts `InstallStatus` only while a status exists, so a status that is already finished on arrival — `Removed <name>`, the first and only status a removal emits — is the component's initial value and never fires a change watcher. Keying off the value is what makes removal behave like install; keying off a transition silently exempted it. The watcher also keys on `phase:message`, so a second `done` while one is on screen (`Removed A` then `Removed B`) re-arms instead of reusing the first timer.
- The dismiss command clears the warning.

## Companion surface: the `MV3` badge

Not part of this status contract, but the thing that outlives it. `Row.badge === "MV3"` is set on an extension's **Extension:** toggle row in the command palette when the persisted `mv3ServiceWorker` flag is true, and is unset for every other row. It is derived per render, never stored, and styled amber so it reads as the same fact the install warning stated (FR-011).
