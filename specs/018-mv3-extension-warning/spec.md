# Feature Specification: MV3 Extension Detection & Warning

**Feature Branch**: `018-mv3-extension-warning`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "When I install a Manifest V3 extension that uses a service worker background, it loads but the background script crashes with confusing errors like 'Cannot read properties of undefined (reading onEvent)' and 'Service worker registration failed. Status code: 15'. I want the app to detect MV3 extensions and warn me that they won't work properly, so I'm not confused by runtime errors."

## Clarifications

### Session 2026-10-01

- Q: Should MV3 extensions be blocked from loading entirely? → A: No — many MV3 extensions have content scripts and DevTools pages that work fine. Only the background service worker is unsupported. Load the extension but warn about the limitation.
- Q: Where should the warning appear? → A: In the existing transient status surface, as a warning phase between "loading" and "done". The warning should be dismissible and not block the extension from loading.
- Q: Should the warning appear at install time, load time, or both? → A: Both. At install time, warn immediately after unpacking. At boot, warn when loading persisted extensions.
- Q: What about MV3 extensions without a service worker? → A: Only warn when `background.service_worker` is present. MV3 extensions with only content scripts or DevTools pages work fine and don't need a warning.
- Q: Should the warning be per-extension or global? → A: Per-extension. Each MV3 extension gets its own warning in the status surface.
- Q: When the status surface shows an MV3 warning, should it be a distinct "warning" phase (separate from "loading" and "done"), or should it reuse the existing "done" phase with a warning flag? → A: A distinct "warning" phase — separate from "loading" and "done", with its own styling and behavior. The warning MUST be dismissible and MUST NOT auto-dismiss like a normal toast; it stays until the developer dismisses it.
- Q: What should the exact warning message say when an MV3 extension with a service worker is detected? → A: "This extension uses Manifest V3 service workers, which {appName} doesn't support. Its background functionality won't work, but content scripts and DevTools pages will." The app name MUST be sourced from the app's identity (product name), not hardcoded, so a rename propagates without code changes.
- Q: When multiple MV3 extensions are loaded at boot, how should the warnings be presented? → A: Not at all. Superseded by the next clarification.
- Q: If a developer dismisses an MV3 warning at boot, should it appear again on the next launch? → A: Superseded by the next clarification.
- Q: A workspace of MV3 extensions showed a card listing all of them on every launch, which the developer dismissed without reading. How often should the warning interrupt? → A: Only when the extension is installed or re-enabled — the moments the developer is deciding whether to keep it. The standing fact lives on as an `MV3` badge in the command palette's extension list, so it stays discoverable without recurring. Boot and reload are silent.
- Q: Where is the standing fact stored? → A: As a `mv3ServiceWorker` boolean on the persisted extension record, re-derived from the manifest on every load so it stays correct after an update and back-fills onto records written before the field existed.
- Q: Should the MV3 warning also be logged to the console for debugging purposes? → A: Status surface only — no logging. The warning is informational and the surface is the primary feedback mechanism. The app has no visible console (the docked DevTools is for the guest page), so console logs would be lost noise.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Install an MV3 extension and see a warning (Priority: P1)

The developer installs a Manifest V3 extension from the Chrome Web Store. The app detects that the extension uses a service worker background and shows a warning in the status surface: "This extension uses Manifest V3 service workers, which {appName} doesn't support. Its background functionality won't work, but content scripts and DevTools pages will."

**Why this priority**: This is the core request. Without detection, the developer sees confusing runtime errors and doesn't understand why the extension isn't working.

**Independent Test**: Install an MV3 extension with a service worker background. Confirm the status surface shows the warning after loading. Confirm the extension still loads and its content scripts work.

**Acceptance Scenarios**:

1. **Given** an MV3 extension with `background.service_worker` is being installed, **When** the extension is unpacked and loaded, **Then** the status surface shows a warning that the extension uses MV3 service workers and its background functionality won't work.
2. **Given** the warning is shown, **When** the developer dismisses it, **Then** the extension remains loaded and functional for content scripts and DevTools pages.
3. **Given** an MV3 extension without `background.service_worker` is installed, **When** it is loaded, **Then** no warning is shown.

---

### User Story 2 - See the standing limitation in the extension list (Priority: P1)

The developer has an MV3 extension installed. The install warning has long since been dismissed, but the limitation is still true. The extension's row in the command palette carries an `MV3` badge, so the fact is one glance away without a card interrupting every launch.

**Why this priority**: The warning is only useful if the fact outlives it. A card on every launch gets dismissed unread; a badge is consulted when the developer wonders why an extension is quiet.

**Independent Test**: Install an MV3 extension, dismiss the warning, then open the command palette's Extensions group and confirm the row is badged. Relaunch and confirm no card appears but the badge remains.

**Acceptance Scenarios**:

1. **Given** a persisted MV3 extension, **When** the developer opens the command palette, **Then** the extension's toggle row shows an `MV3` badge.
2. **Given** an extension that is not MV3-with-service-worker, **When** the developer opens the command palette, **Then** its row shows no badge.
3. **Given** persisted MV3 extensions, **When** the app launches, **Then** no warning card is shown.

---

### User Story 3 - MV3 extensions still load despite the warning (Priority: P1)

The developer installs an MV3 extension. The warning is shown, but the extension still loads and its content scripts and DevTools pages work.

**Why this priority**: The warning should inform, not block. MV3 extensions with content scripts are still useful.

**Independent Test**: Install an MV3 extension with content scripts. Confirm the content scripts inject into the guest page despite the warning.

**Acceptance Scenarios**:

1. **Given** an MV3 extension with content scripts, **When** it is loaded, **Then** the content scripts inject into the guest page.
2. **Given** an MV3 extension with a DevTools page, **When** DevTools is opened, **Then** the extension's DevTools panel is present.

---

### Edge Cases

- **MV3 extension with both service worker and content scripts**: warn about the service worker, but content scripts still work.
- **MV3 extension with only a service worker**: warn and the extension is effectively non-functional.
- **MV2 extension**: no warning, loads normally.
- **Extension with no background at all**: no warning.
- **Manifest with `background.service_worker` but also `background.scripts`**: warn, since the service worker takes precedence in MV3.
- **Warning dismissed but extension still loading**: the warning should not block the load; it's informational.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST detect Manifest V3 extensions by checking `manifest_version === 3` in the extension's `manifest.json`.
- **FR-002**: The system MUST detect service worker backgrounds by checking for `background.service_worker` in the manifest.
- **FR-003**: When an MV3 extension with a service worker background is detected, the system MUST show a warning in a distinct "warning" phase of the status surface (separate from "loading" and "done"). The warning states that the extension uses MV3 service workers, which the app doesn't support, and that its background functionality won't work.
- **FR-004**: The warning MUST NOT block the extension from loading. The extension MUST still be loaded and its content scripts and DevTools pages MUST function.
- **FR-005**: The warning MUST appear exactly where the developer is deciding whether to keep an extension: at install time (store or folder) and when a disabled extension is re-enabled. The warning MUST NOT appear at boot or on `extensions.reload`. Boot is silent because an already-installed extension is a settled decision, and a card on every launch is dismissed unread.
- **FR-010**: The system MUST persist whether each installed extension uses an MV3 service worker, re-deriving it from the manifest on every load so it stays correct across updates and back-fills onto records written before the field existed (a missing or non-boolean value reads as `false` and is corrected by the next load).
- **FR-011**: The system MUST show an `MV3` badge on the command palette's toggle row for an extension whose persisted MV3 flag is true, and no badge otherwise. The badge is the standing, non-interrupting form of the warning.
- **FR-006**: The warning MUST be dismissible by the developer (via `Esc`, a click, or the dismiss command). The warning MUST NOT auto-dismiss; it stays until dismissed. Dismissal lasts for the session only — the warning shows again on the next launch.
- **FR-007**: The system MUST NOT show a warning for MV2 extensions or MV3 extensions without a service worker background.
- **FR-008**: The warning message MUST be clear and actionable, explaining what won't work and what will. The message template is: "This extension uses Manifest V3 service workers, which {appName} doesn't support. Its background functionality won't work, but content scripts and DevTools pages will." The app name MUST be sourced from the app's identity (product name), not hardcoded.
- **FR-009**: The system MUST NOT log the MV3 warning to the main process output. The status surface is the sole feedback mechanism for this informational warning.

### Key Entities

- **MV3 detection result**: a boolean indicating whether the extension is MV3 with a service worker background, derived from the manifest at install/load time and persisted as `InstalledExtension.mv3ServiceWorker`.
- **MV3 badge**: the standing `MV3` marker on an extension's palette row, driven by that persisted flag.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of MV3 extensions with service worker backgrounds trigger the warning at install time.
- **SC-002**: 100% of MV3 extensions with service worker backgrounds show the warning on install and on re-enable, and 0% show it on boot or reload.
- **SC-003**: No MV2 extensions or MV3 extensions without service workers trigger the warning.
- **SC-004**: MV3 extensions with content scripts still inject those scripts into the guest page.
- **SC-005**: The warning is dismissible and does not block the extension load.

## Assumptions

- Electron does not support MV3 service workers, and this is unlikely to change in the near term.
- MV3 extensions with content scripts and DevTools pages are still useful and should not be blocked.
- The existing status surface infrastructure (007) is sufficient for showing the warning; no new UI surface is needed.
- The command palette's existing extension rows are where the badge lives; no separate extensions panel exists or is planned for this feature.
- The persisted `mv3ServiceWorker` field is additive and defaulted, so the schema version is unchanged and no migration step is required.
- The warning is informational only; the developer is responsible for deciding whether to keep the extension installed.
