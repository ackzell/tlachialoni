# Research: MV3 Extension Detection & Warning

## R1: Electron MV3 service worker support

**Decision**: Electron does not support Manifest V3 background service workers. This is a known limitation of Electron's extension API.

**Rationale**: Electron implements a subset of Chrome extension APIs. MV3 extensions use `background.service_worker` as their background process, but Electron only supports Manifest V2 background pages. When an MV3 extension is loaded, the service worker registration fails with status code 15, and the background script crashes.

**Alternatives considered**: None — this is a platform limitation, not a choice.

## R2: Detection approach

**Decision**: Detect MV3 extensions by checking `manifest_version === 3` and `background.service_worker` in the manifest at install/load time.

**Rationale**: The manifest is the source of truth for extension capabilities. Checking these two fields is sufficient to determine if an extension will hit the MV3 service worker limitation. No runtime detection is needed.

**Alternatives considered**:
- Runtime detection (try to register the service worker and catch the failure) — too late, the extension has already loaded and crashed.
- Checking only `manifest_version === 3` — too broad, MV3 extensions without service workers work fine.

## R3: Warning presentation

**Decision**: Show the warning in a distinct "warning" phase of the existing status surface, with all warnings listed simultaneously.

**Rationale**: The status surface already has a phase-based state machine (resolving, downloading, verifying, extracting, loading, done, error). Adding a "warning" phase is consistent with the existing pattern. Showing all warnings at once (rather than queuing) is simpler and more transparent.

**Alternatives considered**:
- Reusing the "done" phase with a warning flag — less clear, conflates success with warning.
- A separate toast-like surface — adds new UI complexity for a simple informational message.

## R4: Dismissal behavior

**Decision**: The warning is dismissible and stays until dismissed. Dismissal lasts for the session only — the warning shows again on the next launch.

**Rationale**: The warning is about a persistent limitation, not a one-time event. Showing it every session ensures the developer is always informed. No persistence is needed in the state store, keeping the data model simple.

**Alternatives considered**:
- Persisting dismissal in the state store — adds complexity for little benefit.
- Auto-dismissing like a toast — the warning is important enough to require explicit dismissal.

## R5: Logging

**Decision**: No logging to the main process output. The status surface is the sole feedback mechanism.

**Rationale**: The app has no visible console (the docked DevTools is for the guest page). Console logs would be lost noise. The warning is informational, not an error, so it doesn't belong in error logging.

**Alternatives considered**:
- Console.warn in the main process — invisible to the developer in production.
- Logging only in dev builds — inconsistent behavior between dev and production.
