# Feature Specification: MV2 Background Shim

**Feature Branch**: `019-mv2-background-shim`
**Created**: 2026-10-02
**Status**: Implemented
**Supersedes**: `specs/018-mv3-extension-warning/` (partially — the `MV3` badge
remains, but only for extensions the rewrite could not save)

## Problem Statement

Electron cannot host Manifest V3 background service workers. An MV3 extension
still loads, but its background context never starts.

For most extensions this is a partial loss. For framework developer tools it is
total, because they use that background as the message bus between their
DevTools panel and the inspected page. Angular DevTools 1.22 routes every
message through it: the panel opens a port, the content script opens another,
and only the background joins them. With no background, the panel never learns a
page exists and reports "Angular application not detected." — while its own
content script, in the same page, has correctly found the Angular app.

The developer sees a broken tool and has no way to act on it. Reinstalling,
reloading, or reopening the panel changes nothing, because the cause is not the
page or the extension.

## User Story

As a developer using Angular, Vue, or React in this browser, I want the matching
DevTools panel to actually connect, so I can inspect my component tree without
switching to a different browser.

**Why this priority**: It is the difference between a DevTools integration being
usable and being decorative. Everything else in the extension story is
polish; this is the feature working at all.

## Scope

### Out of Scope

- **`chrome.debugger` and `chrome.scripting`.** Chrome-only API surface Electron
  does not compile (`chrome/browser/extensions/api/` is absent from the Electron
  binary; `electron/shell/browser/extensions/api/` is present). Signal
  breakpoints inside framework debuggers will not work. Upstream Electron work.
- **Patching extension code.** The manifest is rewritten; no shipped JavaScript
  is touched.
- **Module service workers.** `background.type: "module"` cannot be expressed as
  MV2 classic `scripts`. Left alone.
- **Extensions that need the main world.** MV2 has no `world` key, so a rewrite
  demotes main-world content scripts to the isolated world. For Vue.js devtools
  that is fatal and the extension is left on its authored manifest (FR-007a).
- **Translating `declarative_net_request`.** If the MV2 parser rejects the
  manifest, the authored copy is loaded instead — today's behaviour.

### In Scope

- Rewriting an MV3 manifest with a classic service worker into an MV2
  background-page manifest.
- Preferring the rewrite at load; falling back to the authored copy.
- Telling the developer, at install and afterwards in the palette, which of the
  two happened.

## Requirements

### Functional Requirements

- **FR-001**: When an extension is installed, updated, or loaded, and its
  manifest is MV3 with a non-module `background.service_worker`, the app MUST
  write a rewritten copy of the extension to `<extensions>/.shim/<slug>/` with an
  MV2 manifest declaring `{scripts: [worker], persistent: true}`.
- **FR-002**: The rewrite MUST leave the installed copy byte-identical to what was
  installed. All rewriting happens in the sibling `.shim` directory.
- **FR-003**: The background MUST be declared `persistent: true`. A non-persistent
  event page suspends after ~30s idle and drops the very ports the rewrite exists
  to keep alive.
- **FR-004**: The app MUST prefer the rewritten copy when loading an extension.
  If loading it throws, the app MUST fall back to the authored copy and log the
  reason to stderr.
- **FR-005**: Only a failure of the *authored* copy MAY delete the installed
  extension. A rejected rewrite MUST NOT cost the developer their extension.
- **FR-006**: `persistent: true` aside, the rewrite MUST translate MV3-only
  manifest shapes that Electron's MV2 parser rejects: `content_security_policy`
  object → extension-pages string, `action` → `browser_action`, wrapped
  `web_accessible_resources` → flat list, `host_permissions` → `permissions`,
  `optional_host_permissions` → `optional_permissions`, and content-script
  `world` removed. Removing `world` demotes a main-world script to the isolated
  world, which is only safe where the extension reaches the page another way
  (FR-007a).
- **FR-007**: A manifest MV2 cannot express MUST be left untouched. Specifically:
  MV2 manifests, MV3 without a service worker, module service workers, and workers
  whose top-level code is not only `importScripts`.
- **FR-007c**: A worker that loads its code with `importScripts` MUST have those
  imports hoisted into `background.scripts`, resolved relative to the worker's own
  directory, in order. `importScripts` is a `WorkerGlobalScope` method and an MV2
  background page has no equivalent, so carrying the worker across unchanged
  produces a background page that throws on its first statement — an extension
  that loads, registers, and is then silently missing everything the worker was
  for. A worker mixing `importScripts` with other top-level code MUST be declined,
  since no `scripts` list reproduces it.
- **FR-007d**: The caller MUST supply the worker's source text. A rewrite decision
  made from the manifest alone cannot see `importScripts`, which appears only in the
  worker file, so omitting it silently reintroduces FR-007c's failure. A worker
  that cannot be read MUST be declined rather than assumed empty.
- **FR-007e**: Inspecting a worker MUST distinguish three outcomes — no
  `importScripts` at all, an `importScripts` shim that translates, and one that
  does not. The first two both produce a valid rewrite and MUST NOT be reported
  alike, because collapsing "nothing to do" into "decline this" silently stops
  rewriting every self-contained worker, which is the majority of them. A nullable
  result MUST NOT carry two meanings that require opposite handling.
- **FR-007a**: The rewrite MUST be declined for an extension whose main-world
  content script is load-bearing, listed in `MAIN_WORLD_REQUIRED` in
  `src/main/extensions/mv2-shim.ts`. No manifest field distinguishes such a
  script from an incidental one — Angular and Vue DevTools declare identically
  shaped ones and need opposite things — so the decision MUST be explicit data
  rather than inferred. The list MUST default to rewriting for anything
  unrecognised, and MUST be keyed on extension `name` rather than ID, since an
  unpacked extension's ID is derived from its load directory and so differs
  between the authored and rewritten copies.
- **FR-007b**: `load` MUST delete a rewrite it would now decline, not merely
  decline to refresh one. Eligibility depends on this code as well as on the
  manifest, so a copy written by an earlier build would otherwise keep being
  preferred forever, leaving a declined extension in exactly the state the
  decline exists to undo.
- **FR-008**: The extension record MUST persist whether the rewrite is currently
  loaded, as `mv2Shimmed`, alongside the existing `mv3ServiceWorker`.
- **FR-009**: `mv3ServiceWorker` MUST continue to describe the **authored**
  manifest, never the rewrite, so both facts survive.
- **FR-010**: The palette's toggle row MUST badge a rewritten extension
  `MV3→MV2`, and badge `MV3` only when the rewrite failed. An extension that
  never needed rewriting MUST be unbadged.
- **FR-011**: Installing or re-enabling a rewritten extension MUST emit a
  `warning` — not a `done` — stating that the manifest was rewritten from MV3 to
  MV2, that the installed copy is untouched, and that MV3-only APIs remain
  unavailable. A `warning` does not auto-dismiss, so the notice stays until the
  developer dismisses it (Esc or click); a `done` would vanish in ~1.6s, which is
  too quick for a conversion the developer did not request.
- **FR-011a**: The rewrite notice MUST NOT claim the extension is now fully
  functional. It MUST carry the same caveat the install path uses about MV3-only
  APIs.
- **FR-011b**: Installing or re-enabling an extension whose rewrite was declined
  for needing the main world MUST warn that its background will not run, that
  keeping MV3 is deliberate, and that the rest of the extension does work. It
  MUST NOT be worded as a failure: the same dead background leaves the same
  `MV3` badge, but the extension is working, and telling the developer otherwise
  is a claim they can disprove by opening the panel.
- **FR-012**: Installing or re-enabling an extension whose rewrite did not load
  MUST warn that both the service worker and the rewrite are unavailable.
- **FR-013**: Unloading and removing an extension MUST consider both the authored
  and rewritten directories, so no orphaned copy stays registered.
- **FR-014**: The rewrite MUST be regenerated on update, since `commit` is the
  single funnel for store installs, folder installs, and updates.
- **FR-015**: The transform MUST NOT mutate the manifest it is given.
- **FR-016**: `load` MUST write a missing rewrite rather than proceeding without
  one. An extension installed before this feature has none, and skipping the
  backfill would leave it loading exactly as it did before, with no signal that
  anything was missing. A declined manifest still writes nothing.
- **FR-017**: `commit` MUST discard a stale rewrite before swapping the
  extension in, so an update never leaves the previous version's rewrite
  registered.
- **FR-018**: The rewrite notice MUST tell the developer to reload the page. It
  MUST NOT reload the page on their behalf; see `research.md` R8.
- **FR-019**: The app MUST NOT reload the guest after an extension task. Doing so
  was tried and does not work: Angular DevTools' panel stops polling for the
  application after ~10 seconds and holds `DOES_NOT_EXIST` until it is
  re-selected, so a page reload alone leaves the panel reading "not detected".

### Non-Functional Requirements

- **NFR-001**: The transform is a pure function over a manifest, with no Electron
  and no `node:fs`, so it is unit-testable without a browser.
- **NFR-002**: New persisted state fields are additive and defaulted, so records
  written by earlier versions survive and are corrected on next load.
- **NFR-003**: A rewrite costs a second on-disk copy of the extension, written
  once at install. Acceptable for a dev tool with a bounded extension count.

## Success Criteria

- **SC-001**: Installing Angular DevTools 1.22.0 from the store yields a palette
  row badged `MV3→MV2`, and its DevTools panel shows the component tree.
- **SC-002**: axe DevTools is rewritten like Angular DevTools, with no
  extension-specific code. Vue.js devtools is **not** rewritten: its panel
  reaches the page over `inspectedWindow.eval` rather than through the
  background, so it works with a dead service worker and rewriting it breaks it
  (see `spikes/mv2-background-shim/results.md`).
- **SC-003**: Given a manifest Electron's MV2 parser rejects, the extension
  still loads and remains listed.
- **SC-004**: Given a manifest the transform declines, nothing is written to
  `.shim/` and loading is unchanged.
- **SC-005**: Every `vp check` and `npm run typecheck` passes; unit tests cover
  the transform, the badge, and state defaulting.
- **SC-006**: An extension installed *before* this feature gains a working
  background after a relaunch, with no reinstall and no user action.
- **SC-007**: The transform is verified against a real store extension manifest,
  not only synthetic ones — the field that broke during development (`content_security_policy`)
  was not derivable from the schema. Two further cases (`world: "MAIN"` and
  `importScripts`) were found only after shipping, both by reading real extensions,
  so this criterion is treated as a floor rather than as having been met once.
- **SC-009**: axe DevTools' rewrite declares the imports of its `importScripts`
  worker as `background.scripts`, and its `BackgroundRecorder` reaches the
  background rather than reporting a missing context.
- **SC-010**: Angular DevTools is still rewritten after the `importScripts` fix.
  It was silently lost when the first version of that fix reported "no imports to
  hoist" and "cannot translate" as the same value, and the badge did not
  distinguish the two because `MV3` was already in use for an unrelated state.
  Angular is the regression guard precisely because it was working before.
- **SC-011**: axe DevTools' panel opens and reports that it cannot analyse the
  tab, rather than throwing in the page. The scan itself cannot succeed: its
  product *is* a `chrome.debugger` session, and that namespace is absent from
  Electron entirely (see `results.md`). This criterion separates "the rewrite
  works" from "the extension can work here", which are not the same claim.
- **SC-008**: Installing a rewritten extension tells the developer to reload the
  page, and reloading does make the extension take effect.

## Correction: Vue.js devtools was never part of this failure

The problem statement above lists Vue.js devtools alongside Angular and axe as
showing "the same class of failure." That was wrong, and the error is what shipped
a regression. Vue does have a background service worker, but its panel reaches the
page over `chrome.devtools.inspectedWindow.eval` rather than through a port, so it
worked with that worker dead. Stripping `world` from its `prepare.js` — a
main-world script that installs the hook the panel polls for — stopped the Vue
panel being created at all.

Angular declares a main-world script too, so no manifest field separates the two
cases: Angular needs the background and its main-world script is incidental, Vue
needs the main world and its background is unused. The decision is therefore
explicit data (`MAIN_WORLD_REQUIRED`), defaulting to rewrite. Full evidence in
`spikes/mv2-background-shim/results.md`.

There was a second regression of the same shape, found after the Vue one was
fixed. axe DevTools ships a 60-byte worker whose whole body is
`importScripts("browser-polyfill.js","background.bundle.js")`. `importScripts` is a
`WorkerGlobalScope` method that an MV2 background *page* does not have, so the
rewrite loaded a background page which threw on its first statement. It surfaced
inside the inspected page as `BackgroundRecorder is not running in a known context`,
with nothing in the message to point at a background. The imports now become the
`scripts` list (FR-007c), which is what `importScripts` was achieving.

The durable lesson, and the reason this is recorded in the spec rather than only
in the code: **a manifest rewrite is not done when the manifest parses.** The spike
measured one extension and generalised from it, and `importScripts` is not visible
in `manifest.json` at all — it only appears on opening the worker file. A transform
has to be checked against every extension the product claims to support, and
against the files those manifests point at, not just the one that motivated it.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Electron drops MV2 support | Medium | Fallback (FR-004) degrades to today's behaviour, never to an error. The badge makes the state visible. Deprecation warnings surface in stderr. |
| Rewrite loads but breaks subtly | **Realised** | Stripping `world` demoted Vue devtools' `prepare.js` and killed its panel. Declined per-extension instead (FR-007a); authored copy retained verbatim throughout (FR-002). |
| A decline list becomes extension-specific | Medium | One declarative name list, defaulting to rewrite, with the evidence in `results.md`. No behaviour branches on identity anywhere else. |
| A rewrite loads but is missing behaviour | **Realised** | Stripping `world` broke Vue; `importScripts` killed axe's worker. The rewrite is not judged on the manifest parsing, but on what the loaded background can actually run (FR-007c). |
| MV3-only manifest field we don't translate | Medium | Parser rejects → fallback. Non-blocking. |
| Extension behaviour depends on a *suspended* background | Low | `persistent: true` (FR-003). |

## Migration

None required. `mv2Shimmed` is additive and defaults to `false`.

Extensions installed before this feature are picked up on their next launch or
**Extensions → Reload extensions**, because `load` reconciles the rewrite against
the manifest: it backfills a missing one (FR-016) and deletes one it would now
decline (FR-007b). No reinstall, and no action from the developer — for most, the
badge changing from `MV3` to `MV3→MV2` is the only visible difference. Vue.js
devtools already carrying a rewrite from a build with this bug are cleaned up the
same way, which is what makes the fix reach an existing install.

Writing the rewrite only in `commit` would have left every pre-existing install
loading exactly as before, with nothing in the log to say why: a missing rewrite
and a declined one are indistinguishable from the load path. That was the
original implementation, and it is the reason FR-016 exists.