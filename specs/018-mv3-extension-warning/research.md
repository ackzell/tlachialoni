# Research: MV3 Extension Detection & Warning

## R1: Electron MV3 service worker support

**Decision (corrected 2026-10-02)**: Electron hosts Manifest V3 background
service workers. It tears one down if it throws while evaluating its top level,
and `chrome.debugger` is not compiled into Electron, so a worker that touches it
dies at startup.

**Rationale**: The original entry here claimed Electron does not support MV3
service workers and read `Service worker registration failed. Status code: 15` as
proof. That was wrong — the worker runs first, and the status is reported after
it throws. A probe on Electron 44.5.1 shows a clean MV3 worker registering,
running, and staying alive, and an unguarded `chrome.debugger` access killing it.
See `spikes/mv2-background-shim/results.md` ("Corrected mechanism").

**Alternatives considered**: None — the absent namespace is a platform
limitation, not a choice. The MV2 rewrite that works around it is `specs/019`.

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
