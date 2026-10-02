# Implementation Plan: MV3 Extension Detection & Warning

**Feature Branch**: `018-mv3-extension-warning`

**Created**: 2026-10-01

**Spec**: `specs/018-mv3-extension-warning/spec.md`

## Summary

Detect Manifest V3 extensions that use service worker backgrounds and tell the developer their background functionality won't work in this app. The warning appears in the existing transient status surface as a new "warning" phase, at the two moments the developer is deciding whether to keep the extension: install and re-enable. From then on the fact lives on as an `MV3` badge in the palette's extension list, so it stays discoverable without a card on every launch. The extension still loads — content scripts and DevTools pages work fine. No logging, no new UI surface.

**Design note**: the first implementation warned at boot as well. With a workspace of MV3 extensions that produced a card on every launch listing all of them, which the developer dismissed unread — the opposite of the intent. The warning is now a one-time interrupt plus a persistent badge, and `loadAll()` is silent.

## Technical Context

- **Runtime**: Electron 44 (Chromium/Node from `process.versions`), macOS.
- **Extension API**: `session.extensions.loadExtension(path)`. MV3 service workers are hosted, but Electron tears one down if it throws while starting up, and `chrome.debugger` is not compiled in.
- **State**: one additive field, `InstalledExtension.mv3ServiceWorker`, defaulted on read so no migration is needed. It is re-derived from the manifest on every load.
- **UI**: Vue 3 shell renderer; the existing `InstallStatus.vue` component gains a "warning" phase, and `CommandPalette.vue` gains an optional row badge.
- **New dependencies**: none.

## Architecture

### Detection

MV3 detection happens in `src/main/extensions/crx.ts` at manifest read time. A new function `detectMv3ServiceWorker(manifest)` checks `manifest_version === 3` and `background.service_worker` presence. It is a pure function over `manifest.raw`, so it is unit-testable without Electron.

### Status surface

The `ExtensionPhase` union gains `"warning"`, and `isActivePhase` returns `false` for it so it is terminal rather than in-flight. The manager emits a `warning` status **instead of** `done` from `commit()` (install) and `setEnabled()` (re-enable), through one `warnAboutMv3(name)` helper that holds the message template with `app.getName()` interpolated — so the two emission sites cannot drift.

### Persistence and the badge

`load()` writes the detection result to the record on every load, so the badge is always current and back-fills onto records written before the field existed. `buildRows` sets `Row.badge = "MV3"` on the extension's toggle row, and `CommandPalette.vue` renders it in the existing meta slot. No new component, no new surface.

### Boot and reload are silent

`loadAll()` loads extensions without touching the status surface, and `reloadAll()` keeps its plain "Reloaded extensions" confirmation. This also keeps the boot path free of status routing entirely: extensions load before the `WindowManager` exists, so a boot-time status would have had no window to route to. The badge is the boot-time report.

### Dismissal

The warning is dismissible via the existing `extensions.dismissStatus` command, `Esc`, or a click. There is no dismissal state to persist, because the warning is no longer repeated.

## Constitution Check

- **I. Chromeless by default** — the warning is shown in the existing transient status surface; no new permanent chrome.
- **II. Guest page is sacred** — extensions are loaded only into the guest session; the warning doesn't change this.
- **III. Keyboard-first** — the warning is dismissible via `Esc` and the dismiss command.
- **IV. Real DevTools** — unaffected; DevTools extensions are the primary beneficiaries.
- **V. One target per window** — unaffected.
- **VI. Tlapalli** — the warning uses existing status surface tokens and motion variables.

## Risks

- **False positives**: an MV3 extension with both `background.service_worker` and `background.scripts` — the spec says warn, since the service worker takes precedence in MV3.
- **App name changes**: the warning message uses `app.getName()`, so a rename propagates without code changes.
- **Stale badge**: if a manifest is replaced without the record being rewritten, the badge would lag. Mitigation: `load()` re-derives the flag on every load, so any launch or reload corrects it.
- **Silent regression**: a developer whose extension breaks may now only find out from the badge. Accepted — the badge is on the row they already open to manage that extension, and re-enabling re-warns.
