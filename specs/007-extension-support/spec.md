# Feature Specification: Extension Support

**Feature Branch**: `007-extension-support`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "This browser should support chrome extensions. I avoided baking them in but now I want to install them from the google chrome store or something. Make sure the flow of installing while being chromeless still gives a sense of what is happening — a subtle spinner and messages that reflect the status of the installation process."

## Clarifications

### Session 2026-09-28

- Q: Which install paths should be supported? → A: Both — install from the Chrome Web Store by pasting a store URL or extension ID, and install an unpacked extension from a local folder.
- Q: Where should extensions run? → A: Only in the guest page's session. The shell UI moves to its own non-persistent partition so extensions can never reach it, and the guest's existing cookies/storage are left untouched.
- Q: How are installed extensions managed? → A: From the command palette only — dynamic per-extension rows for enable/disable and remove, plus static rows for install and reload. No new always-visible chrome.
- Q: How does a chromeless window communicate install progress? → A: A transient, themed status surface with a subtle spinner, a stage message, and a determinate progress bar while bytes are known; it auto-dismisses on success and stays until dismissed on error.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Install an extension from the Chrome Web Store (Priority: P1)

The developer presses `⌘P`, pastes a Chrome Web Store link or a 32-character
extension ID, and chooses **Install extension …**. The tool downloads the
package, unpacks it, loads it into the guest page's session, and remembers it for
future launches.

**Why this priority**: This is the request. Without a store install path there is
nothing to manage, observe, or persist.

**Independent Test**: Paste the React Developer Tools store URL, confirm the
extension appears in the palette afterward and its DevTools panel is present the
next time DevTools opens, then relaunch and confirm it is still enabled.

**Acceptance Scenarios**:

1. **Given** the palette is open, **When** the developer pastes a Chrome Web Store URL or a raw extension ID, **Then** an **Install extension** row appears naming the extracted ID.
2. **Given** that row is activated, **When** the download succeeds, **Then** the extension is unpacked into the tool's extension folder, loaded into the guest session, and persisted as enabled.
3. **Given** an installed, enabled extension, **When** the tool is relaunched, **Then** the extension is loaded again without any action.
4. **Given** an already-installed extension, **When** it is installed again, **Then** the existing copy is replaced (updated) rather than duplicated.

---

### User Story 2 - Watch the install happen (Priority: P1)

While an install runs, a small themed surface shows a subtle spinner and a
message that changes with the stage — looking up, downloading (with real byte
progress), verifying, unpacking, loading — then confirms success or explains the
failure. No modal, no permanently visible chrome, and the page underneath is
never resized.

**Why this priority**: A chromeless tool has no progress bars or dialogs; without
this the developer cannot tell whether a paste did anything. It is part of this
feature, not polish deferred to later.

**Independent Test**: Install a large extension and confirm the stage messages
advance, the progress bar tracks the download, and the success confirmation
appears and then leaves on its own; then trigger a failure (bad ID) and confirm a
readable error remains until dismissed.

**Acceptance Scenarios**:

1. **Given** an install is starting, **When** the first byte is requested, **Then** the status surface appears over the page without changing the page's size and reports the current stage.
2. **Given** the download is in flight and the response reports a length, **When** bytes arrive, **Then** the surface shows a determinate progress bar whose fill tracks the received fraction.
3. **Given** the download has no known length, **When** it is in flight, **Then** the spinner reads as indeterminate and the stage message still advances.
4. **Given** the install finishes, **When** the extension is loaded, **Then** the surface confirms the extension by name and dismisses itself shortly after.
5. **Given** an install fails, **When** the error is reached, **Then** the surface stays with a human-readable reason until the developer dismisses it with `Esc`, a click, or the dismiss command.
6. **Given** any install in progress, **When** the shell is in any state, **Then** the status surface is themed from Tlapalli tokens and respects reduced-motion.

---

### User Story 3 - Install an unpacked extension from a folder (Priority: P2)

The developer has an unpacked extension on disk. They choose **Install extension
from folder …**, pick the directory, and the tool validates it, copies it into
its own extension storage, and loads it.

**Why this priority**: The folder path is the durable fallback if the store
endpoint changes, and the only way to load local or self-built extensions. It is
valuable but secondary to the store path the user asked for.

**Independent Test**: Pick a folder containing a valid `manifest.json`, confirm
it loads and persists, then move the source folder away and confirm the installed
extension still loads on relaunch.

**Acceptance Scenarios**:

1. **Given** the directory picker is open, **When** the developer chooses a folder containing a readable `manifest.json`, **Then** the extension is copied into the tool's extension storage, loaded, and persisted as enabled.
2. **Given** a chosen folder with no readable `manifest.json`, **When** the picker returns, **Then** no copy is kept and the status surface explains the problem.
3. **Given** an extension installed from a folder, **When** its original folder is deleted or moved, **Then** the installed copy still loads on relaunch.

---

### User Story 4 - Manage installed extensions (Priority: P2)

From the palette, the developer sees each installed extension as a row that
toggles it enabled or disabled, and can remove it, update it (store installs), or
reveal the folder where extensions live.

**Why this priority**: Installing without the ability to disable or remove would
be a trap; management is required for the feature to be safe, but it is thin
compared to installing.

**Independent Test**: Disable an extension and confirm its content scripts stop
injecting; enable it and confirm they return; remove it and confirm the folder
and record are gone.

**Acceptance Scenarios**:

1. **Given** a loaded extension, **When** the developer chooses **Extension: {name}**, **Then** it is disabled (unloaded) and its row reports it as disabled, persisted across relaunch.
2. **Given** a disabled extension, **When** the developer chooses it again, **Then** it is loaded and reported as enabled.
3. **Given an installed extension, **When** the developer chooses **Remove Extension: {name}**, **Then** it is unloaded, its folder and record are deleted, and the row disappears.
4. **Given** a store-installed extension, **When** the developer chooses **Update Extension: {name}**, **Then** the newest package is downloaded and replaced as in a fresh install.
5. **Given** any installed extensions, **When** the developer chooses **Reveal Extensions Folder**, **Then** the folder opens in the system file manager.

---

### User Story 5 - Extensions stay out of the shell (Priority: P1)

Installed extensions run against the developer's local site, never against the
tool's own palette and surfaces, and their state survives launches.

**Why this priority**: Without this isolation an extension can break the very UI
used to manage it, and reload-on-launch is what makes persistence meaningful.

**Independent Test**: Install an extension whose content script matches all pages,
then confirm the palette still renders and behaves; confirm enabled extensions are
present after a relaunch.

**Acceptance Scenarios**:

1. **Given** an extension with broad host permissions, **When** it is loaded, **Then** its content scripts may run in the guest page but never in the shell surfaces.
2. **Given** enabled extensions, **When** the tool launches, **Then** each is loaded before the guest page's first load so first-paint behavior matches.
3. **Given** a persisted extension whose folder no longer exists, **When** the tool launches, **Then** the failure is reported and the rest of the extensions still load.

---

### Edge Cases

- **Offline or blocked network**: a store install reports a network failure and leaves no partial folder behind.
- **Malformed CRX or manifest**: the package is rejected before anything is loaded or persisted; the temporary download is removed.
- **Path-traversal entries in a package**: archive entries that would escape the destination directory are refused, and the install fails rather than writing outside the extension root.
- **Extension already loaded at the same path**: reinstalling replaces the folder; the previously loaded instance is unloaded first so the new files take effect.
- **Missing folder at launch**: disabled, reported, and kept as a record so the developer can remove or reinstall it.
- **Unsupported APIs**: a store extension that uses APIs Electron does not implement loads with warnings; the tool reports that it loaded, not that it is fully functional.
- **Palette closed mid-install**: the install continues and the status surface still reports progress.
- **Shell never loaded the status event**: the status is queued and delivered once the shell subscribes, matching the existing shell message queue.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST install extensions from the Chrome Web Store by a store URL or a raw extension ID, downloading the package, verifying its container header, unpacking it, and loading it as an unpacked extension.
- **FR-002**: The system MUST install an unpacked extension from a developer-chosen folder, copying it into the tool's own extension storage so the installed copy does not depend on the source folder.
- **FR-003**: The system MUST refuse a folder or package without a readable `manifest.json` and MUST leave no partial install behind.
- **FR-004**: The system MUST persist, for each installed extension, its identity, name, version, source (store or folder), enabled state, and install time, and MUST restore that state across launches.
- **FR-005**: The system MUST load every enabled extension at launch, before the guest page's first navigation, because Electron does not remember extensions between runs.
- **FR-006**: The system MUST show a transient status surface during installs and updates, with a subtle spinner, a message naming the current stage, and a determinate progress bar whenever a byte total is known.
- **FR-007**: The status surface MUST confirm success by the extension's name, dismiss itself after a short delay, and remain with a human-readable reason on failure until dismissed by `Esc`, a click, or a command.
- **FR-008**: The status surface MUST overlay the page without changing the page's layout or viewport size, and MUST be themed exclusively from Tlapalli tokens, including under reduced motion.
- **FR-009**: The system MUST load extensions only into the guest page's session; the shell MUST run in a separate session that no extension can inject into (FR-028).
- **FR-010**: The system MUST make enable, disable, remove, update, reload, install-from-folder, and reveal-folder reachable from the keyboard and listed in the command palette (constitution III). A store install MUST be offered as a palette row when the input is a store URL or ID, rather than as a standalone command that would do nothing until a URL is typed.
- **FR-011**: The system MUST unload an extension before removing its files, and MUST delete both its folder and its record on removal.
- **FR-012**: The system MUST validate archive entry paths and refuse any that would escape the extension's destination directory.
- **FR-013**: The system MUST NEVER bundle, pre-install, or automatically install an extension; every install is an explicit developer action (constitution II).
- **FR-014**: The system MUST NOT disturb the guest page's current navigation when the extension list changes, beyond the effects of loading or unloading the extensions themselves.
- **FR-015**: The persisted state schema MUST accept the extension list, and sanitization MUST drop malformed records while keeping the rest of the state valid.

### Key Entities _(include if feature involves data)_

- **InstalledExtension**: one developer-installed extension — a stable local slug (its folder name), the platform-assigned ID, display name, version, source (`store` or `folder`), enabled flag, and install time.
- **Extension install status**: the transient phase (looking up, downloading, verifying, unpacking, loading, done, error), the extension name or ID, the message, and optional byte progress, shown only on the status surface.
- **Extension root**: the directory under the app's user-data area where unpacked extension folders live; never inside the application bundle.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer can go from a pasted store URL to a loaded extension in one palette submission, with visible progress at every stage.
- **SC-002**: 100% of enabled extensions are loaded after relaunch with no manual action.
- **SC-003**: The page's inner dimensions are unchanged by the status surface appearing or leaving.
- **SC-004**: A failed install leaves zero bytes of partial extension on disk and shows exactly one readable reason.
- **SC-005**: No extension code executes in the shell surfaces in any scenario.
- **SC-006**: Every extension capability is invocable from the keyboard and listed in the palette.

## Assumptions

- Electron supports only unpacked extensions, so store installs download and unpack a `.crx` container; the download uses Google's public update endpoint and may be unavailable or change, in which case the folder install path remains.
- Electron implements a subset of Chrome extension APIs (content scripts, DevTools pages, Manifest V3 background service workers, and Manifest V2 background pages), but omits `chrome.debugger` and `chrome.scripting`, and tears down an MV3 service worker that throws while starting up — which an unguarded `chrome.debugger` access does. So some store extensions will load and function only partially. The tool reports load success, not full compatibility.
- The primary platform remains macOS; the store download and folder copy add no platform-specific behavior beyond the existing directory picker and file manager reveal.
- Extensions are installed only by the developer; the tool ships with none and never installs one on the developer's behalf.
