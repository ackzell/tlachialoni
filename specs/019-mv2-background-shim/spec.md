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
  `world` removed.
- **FR-007**: A manifest MV2 cannot express MUST be left untouched. Specifically:
  MV2 manifests, MV3 without a service worker, and module service workers.
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
- **SC-002**: Vue.js devtools and axe DevTools behave the same way without any
  extension-specific code.
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
  was not derivable from the schema.
- **SC-008**: Installing a rewritten extension tells the developer to reload the
  page, and reloading does make the extension take effect.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Electron drops MV2 support | Medium | Fallback (FR-004) degrades to today's behaviour, never to an error. The badge makes the state visible. Deprecation warnings surface in stderr. |
| Rewrite loads but breaks subtly | Low | Manifest-only change; authored copy retained verbatim (FR-002). |
| MV3-only manifest field we don't translate | Medium | Parser rejects → fallback. Non-blocking. |
| Extension behaviour depends on a *suspended* background | Low | `persistent: true` (FR-003). |

## Migration

None required. `mv2Shimmed` is additive and defaults to `false`.

Extensions installed before this feature are picked up on their next launch or
**Extensions → Reload extensions**, because `load` backfills a missing rewrite
(FR-016). No reinstall, and no action from the developer — the badge changing
from `MV3` to `MV3→MV2` is the only visible difference.

Writing the rewrite only in `commit` would have left every pre-existing install
loading exactly as before, with nothing in the log to say why: a missing rewrite
and a declined one are indistinguishable from the load path. That was the
original implementation, and it is the reason FR-016 exists.