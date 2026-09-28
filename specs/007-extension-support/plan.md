# Implementation Plan: Extension Support

**Feature Branch**: `007-extension-support`

**Created**: 2026-09-28

**Spec**: `specs/007-extension-support/spec.md`

## Summary

Let the developer install Chrome extensions into the guest page at runtime —
from the Chrome Web Store by URL/ID or from an unpacked folder — and manage them
from the command palette. Extensions load only into the guest page's session; the
shell moves to its own session so extension code can never touch the tool's UI.
Installs report their progress on a transient, themed status surface with a
spinner and staged messages, because a chromeless window has nowhere else to
show it.

## Technical Context

- **Runtime**: Electron 44 (Chromium/Node from `process.versions`), macOS.
- **Extension API**: `session.extensions.loadExtension(path)`. Unpacked only;
  persistent sessions only; must be re-loaded every launch. No MV3 background
  service workers.
- **New dependency**: `fflate` (pure JS, already transitively present) for CRX
  payload extraction; promoted to a direct dependency.
- **State**: existing JSON `StateStore`, schema version 1 → 2.
- **UI**: Vue 3 shell renderer; a new transient surface participates in the
  existing settle protocol (004) and motion tokens.

## Architecture

### Sessions

The guest page (`site-view.ts`) keeps the default session, where extensions are
loaded. The shell (`shell-view.ts`) moves to a named non-persistent partition
(`partition: "shell"`). This scopes extensions to the guest without moving or
resetting the guest's cookies and storage, and it denies extension code any
access to the palette and other shell surfaces.

### Modules

| Module | Responsibility |
| --- | --- |
| `src/shared/extension-id.ts` | Pure: recognize a Chrome Web Store URL or raw ID. |
| `src/main/extensions/crx.ts` | Pure-ish: CRX2/CRX3 header offset, safe extraction, manifest validation. |
| `src/main/extensions/store.ts` | Download a store package with byte progress. |
| `src/main/extensions/manager.ts` | Reconcile with state, install/toggle/remove/update, emit status. |
| `src/main/extensions/types.ts` | Shared status/report types. |

### Persistence

`PersistedState` gains `extensions: InstalledExtension[]`. `sanitizeState`
validates each record (slug/id/name/version strings, known source, boolean
enabled, numeric install time) and drops the malformed ones, keeping the rest of
the state valid. `StateStore.setExtensions(list)` writes the list; membership is
last-writer-wins like the other scalar preferences.

### Boot

`app.whenReady` builds the `StateStore` and `ExtensionManager`, loads every
enabled extension into `session.defaultSession`, then constructs the window. The
manager is process-level so re-activating a window reuses the loaded extensions.

### Status surface

The manager emits `ExtensionStatus` phases; `AppWindow` forwards them to the
shell over `extension:status` and keeps the shell full-window while a status is
visible (`desiredShellMode`). The renderer's `InstallStatus.vue` shows the
spinner, stage message, and progress bar, auto-dismissing `done` and holding
`error` until the developer dismisses it. Dismissal is an IPC command
(`extensions.dismissStatus`) so `Esc` from the page, a click, or the palette can
all trigger it, and the collapse is deferred through the settle protocol.

## Constitution Check

- **I. Chromeless by default** — the status surface is transient and overlays the
  page; no new permanent chrome.
- **II. Guest page is sacred** — extensions are a sanctioned, developer-initiated
  exception; loaded only into the guest session, never the shell (amendment
  2.2.0).
- **III. Keyboard-first** — every capability is a palette command with a stable
  ID.
- **IV. Real DevTools** — DevTools extensions are the primary beneficiaries; no
  reimplementation.
- **V. One target per window** — unaffected; extensions attach to the single
  guest page.
- **VI. Tlapalli** — the status surface uses tokens and motion variables only.

## Risks

- Store extension compatibility is partial by Electron's design; documented in
  the spec's assumptions, reported honestly at install time.
- The store download endpoint is unofficial; the folder path is the fallback.
- Extracting attacker-controlled archives demands path validation (FR-012).
