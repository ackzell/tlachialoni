# Feature Specification: Extension Load Narrowing

**Feature Branch**: `020-extension-load-narrowing`
**Created**: 2026-10-02
**Status**: Draft — not started. Gated on the spike below.
**Relates to**: `specs/019-mv2-background-shim/` — this narrows *when* that
rewrite is applied, it does not replace it.

## Why

`specs/019` rewrites every eligible MV3 extension to MV2 at install. The
correction recorded in that spec shows what the rewrite actually is: an
**error-tolerance shim**. Electron hosts MV3 service workers, but a worker that
throws while starting up is torn down, and `chrome.debugger` is the namespace
Electron does not compile that makes Angular DevTools' worker throw.

Applied blindly, though, the rewrite causes failures of its own, because MV2
cannot express several MV3 features:

- it strips `world: "MAIN"`, which made Vue.js devtools' panel disappear — a
  shipped regression;
- it strips `chrome.scripting` and cannot express `declarative_net_request`,
  module workers, or offscreen documents;
- it turns a service worker into a background page, which is a different runtime
  with different lifetime semantics.

And at least one of the repairs exists only to undo a self-inflicted break: axe
DevTools' `importScripts` problem is native to a worker, so its authored MV3 copy
never needed the hoisting the rewrite added.

The goal is the opposite of the current default: **run extensions as authored, as
Chrome does, and convert only the ones whose background provably dies.**

## Spike (do this first — it decides the design)

For each installed extension (Angular DevTools, axe DevTools, Vue.js devtools),
load the **authored MV3 copy with no rewrite** and record:

1. did `registration-completed` fire?
2. is the extension's scope in `serviceWorkers.getAllRunning()`?
3. does `serviceWorkers.startWorkerForScope(scope)` resolve or reject?
4. what does the DevTools panel actually do?

And in the same run: **does `chrome.scripting` exist in an MV3 context?** The
README says Electron does not compile it; `spikes/extension-audit/audit.mjs`
reports it as available on the authored copy. Electron's
`shell/browser/extensions/api/BUILD.gn` registers only `action`, `extension`,
`tabs`, `resources_private`, and `pdf_viewer_private`, which favours the README —
but one probe settles it, and it is load-bearing for the design.

A caution recorded up front: MV3 workers are event-driven and go dormant after
~30s idle, so `getAllRunning()` alone is **not** a health signal. What forces the
question is `startWorkerForScope()` — it resolves for a healthy worker and rejects
with `Failed to start service worker.` for a dying one. It is marked
`@experimental` in Electron's API, so gate on the stable `getAllRunning()` first
and treat it as confirmation.

### What each outcome implies

| Outcome | Consequence |
| --- | --- |
| Only Angular dies | The rewrite shrinks to one real case. `importScripts` hoisting and `MAIN_WORLD_REQUIRED` both become dead code that can be deleted. |
| Vue dies too | `MAIN_WORLD_REQUIRED` stays, but becomes evidence-based rather than a guess. |
| Nothing dies | The rewrite was solving a phantom; `specs/019` should be reconsidered from scratch. |

## Proposed design (only if the spike supports it)

Two decisions that should be split:

- **Install time, static** — `audit.mjs` already reads the manifest and worker
  without Electron. Use it to emit a specific, per-extension warning:
  *"Angular DevTools needs `chrome.debugger`, which this app doesn't ship — the
  component tree works, signal breakpoints won't."* That replaces today's generic
  notice with one the developer can act on.
- **Load time, runtime** — load the authored copy, check liveness, and only if the
  worker died unload it and load the shim. This inverts today's order and matches
  Chrome: extensions run as authored unless something is actually broken.

If this holds, most extensions are never touched, keep every MV3 feature they
have, and the `MV3→MV2` badge finally means "we had to convert this one."

## Non-goals

- **Stubbing `chrome.debugger`.** It would remove the need for the rewrite in a
  few lines, and that is exactly why it is rejected: a fake namespace tells the
  extension it *can* do something it cannot, turning a loud failure into a silent
  lie. It contradicts `specs/019` FR-011a and SC-011.
- **Replacing `specs/019`.** The rewrite stays; only its trigger changes.

## Related pending items

- **Upstream Electron PR**: compile `chrome/browser/extensions/api/debugger`.
  This removes the underlying cause entirely. Long odds, zero cost to file, and
  the evidence in `spikes/mv2-background-shim/results.md` ("Corrected mechanism")
  is unusually clean — it isolates the namespace and separates it from
  `scripting`, which *is* present.
- **Constitution correction**: `.specify/memory/constitution.md:96` states that
  NW.js and Electrobun were rejected "specifically because neither docks Chromium
  DevTools in-window". The NW.js half is unverified and likely wrong — its docs
  document full DevTools-extension support. The real reasons to reject NW.js are
  that its extension platform exposes only a subset of `chrome.*` (no
  `chrome.debugger`) and that extensions load only at launch via
  `--load-extension`. Needs a PATCH amendment with a version bump, and a NW.js
  spike to confirm the docking behaviour before wording it.
