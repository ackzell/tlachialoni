# Research: MV2 Background Shim

Predecessor: `specs/018-mv3-extension-warning/research.md` R1, which recorded
"Electron does not support Manifest V3 service workers" and treated that as a
hard stop. That was wrong — Electron does host MV3 service workers; see
`spec.md` "Correction". What follows is still the workaround, for the worker that
dies on `chrome.debugger`.

## R1: Why the symptom looked like a detection bug

**Decision**: Treat "Angular application not detected." as a *transport* failure,
not a detection failure.

**Rationale**: Angular DevTools' detection runs in the page and works. Its
`detect_angular_bundle.js` reported `isAngular: true` — visible in the panel's
own console during the spike. The result then had to travel to the panel through
the background service worker, which died at startup on `chrome.debugger`. The
panel polls
`queryNgAvailability` on a 500 ms interval and, after a fixed threshold, gives
up and renders the "not detected" screen unconditionally.

**Alternatives considered**: That `[ng-version]` was absent (the app is a dev
build; the element is there). That the content script failed to inject (it ran,
and relayed a handshake).

**Diagnostic worth keeping**: the message appears ~10 seconds after selecting the
panel, never instantly. Timing is the tell that separates "the page has no
Angular" from "the answer cannot get to me".

## R2: Why hosting the worker in a page does not work

**Decision**: Abandoned. Chromium delivers `chrome.runtime.onConnect` only to the
*declared* background context.

**Rationale**: The idea was that a plain extension page loading the worker script
would receive the ports, on the theory that `onConnect` fires in any live
extension context that registers a listener. In Chrome that is true for a popup
or options page. Electron did not cooperate: the listener registered cleanly and
no port was ever delivered — neither a success log nor the
`Received a connection from an unknown sender` warning that a rejected port would
have produced.

**Alternatives considered**: Injecting the worker source into a page we render
ourselves (rejected: `chrome.*` is unavailable outside an extension origin).
Bridging from the main process (rejected: no supported API observes extension
port traffic).

**Consequence**: any fix must give Chromium a genuine background context, which
means declaring one in a manifest.

## R3: Electron still accepts MV2 manifests

**Decision**: Rewrite the manifest to MV2 with a background page.

**Rationale**: Chrome removed MV2 in stages through 2025 and deleted the
developer flags by Chrome 150/151. Electron 44.4.5 ships Chromium 152, so this
looked closed. It is not:

```
ExtensionManifestV2Disabled             0 occurrences in the Electron binary
ExtensionManifestV2Unsupported          0
ExtensionManifestV2Availability         0
ExtensionManifestV2DeprecationWarning   0
```

Electron does not enable those switches, so an MV2 manifest loads — with a
`Manifest version 2 is deprecated` warning. Confirmed end to end: the Angular
panel showed the full component tree.

**Alternatives considered**: Waiting for Electron to implement MV3 service workers
(rejected: unimplementable here, and the need is immediate). Shipping a patched
Angular DevTools (rejected: per-extension, unmaintainable, and the mechanism is
generic).

## R4: Persistent, not an event page

**Decision**: `background: { scripts: [...], persistent: true }`.

**Rationale**: MV2 also permits non-persistent event pages, which unload after
~30 seconds idle. That is the same class of failure as a service worker that dies
at startup: the panel would connect, then silently lose its background
mid-session. Port longevity is the feature.

## R5: Which fields must be translated

**Decision**: Translate the MV3-only shapes Electron's MV2 parser rejects; decline
the manifest when MV2 cannot express it at all.

**Rationale**: One field was load-blocking and not obvious from the manifest:
Electron rejects the MV3 `content_security_policy` **object** with
`Invalid value for 'content_security_policy'`. MV2 requires the plain
extension-pages string. The rest (`action`, `web_accessible_resources`,
`host_permissions`, content-script `world`) are either renamed or rejected less
loudly, but all are wrong under MV2 and worth fixing while we are here.

Anything untranslatable — `declarative_net_request` is the realistic case — is
left in place rather than half-converted. If the parser then refuses the
manifest, the authored copy loads and the developer is no worse off than before.

**Alternatives considered**: Dropping unknown keys wholesale (rejected: silently
changes behaviour, harder to debug than a fallback). Maintaining a fork of each
extension (rejected).

## R6: Why a sibling directory rather than an in-place rewrite

**Decision**: Write the rewrite to `<root>/.shim/<slug>/` and leave the installed
copy untouched.

**Rationale**: Three reasons, in order of weight.

1. **Reversibility.** `load()` can always fall back to a byte-identical authored
   copy. An in-place rewrite that Electron refuses leaves the developer with an
   extension that can only be reinstalled by hand.
2. **Truthfulness.** `readManifest()` on the authored copy keeps describing the
   extension. If it read the rewrite, `detectMv3ServiceWorker` would flip to
   `false` and the palette would lose both the fact that a conversion happened
   and the ability to distinguish "converted and working" from "converted and
   broken".
3. **Debuggability.** `Reveal extensions folder` shows what was installed; the
   dot-prefixed `.shim` keeps the rewrite out of the developer's way.

Cost is a second on-disk copy per rewritten extension, written once at install.

## R7: `chrome.debugger` cannot be provided

**Decision**: Out of scope. Documented as a platform limit.

**Rationale**: Angular DevTools uses `chrome.debugger` for signal breakpoints —
stepping through `ngOnInit` and similar. Electron reports
`Permission 'debugger' is unknown` at load, and the bundle throws on it.
`chrome.debugger` and `chrome.scripting` are implemented in
`chrome/browser/extensions/api/`; Electron compiles
`electron/shell/browser/extensions/api/` instead. The former is absent from the
binary (0 occurrences), the latter present (2). This is upstream Electron work and
cannot be added from the app.

**Consequence**: the component tree, properties, and inspector all work; signal
breakpoints do not. Recorded so it is not later mistaken for a regression in the
rewrite.

## R8: Do not reload the page; tell the developer to

**Decision**: The rewrite notice tells the developer to reload the page. The app
does not reload it for them.

**Rationale**: Content scripts are injected when a page loads, at
`document_start` and `document_idle`. An extension that becomes active after the
current document loaded never reaches it, so something has to reload the page
before the extension can apply. Chromium has the same gap and tells you to reload
the tab.

Reloading automatically was implemented and reverted. It does not work, and the
reason is specific to Angular DevTools' panel: it polls for the application every
500ms for ~20 ticks, then gives up and holds `angularStatus = DOES_NOT_EXIST`
permanently. A reload that lands after that budget is spent leaves the panel
reading "application not detected" no matter what the page is doing. Only
re-selecting the panel re-runs detection, which is why a manual reload appeared to
fix it — that gesture re-selected the panel too.

So the automatic reload bought nothing and cost a surprising page reload. The
notice carries the instruction instead, where the developer sees it at the moment
it is relevant and can pair it with re-selecting the panel.

**Alternatives considered**: Reloading and also forcing the panel to re-detect
(rejected: the panel is Chromium's own surface; we have no supported way to
re-run its detection). Extending the app's poll window (rejected: not ours to
extend). Leaving the reload manual but undocumented (rejected: the developer
cannot know the page is the reason it looks inert).

## R9: Auto-apply, with no opt-in

**Decision**: Rewrite every eligible extension automatically.

**Rationale**: An extension whose service worker would die at startup cannot be
made worse by attempting a rewrite — that background is already gone — and the
fallback (R6) means every failure path lands on today's behaviour. Rewriting
automatically rather than opt-in is deliberate: the developer hitting the exact
problem this spec exists to fix should not have to know to look for a setting.

The honest caveat, added after the mechanism was corrected (see spec.md
"Correction"): a service worker and a background page are not the same thing, so
an extension whose worker runs fine can still behave differently once it is a
page. Rewriting is therefore a default, not a guarantee, and `MAIN_WORLD_REQUIRED`
plus the load fallback exist to keep the known-bad cases out. Whether the rewrite
should be narrower — applied only where a worker is known to die — is an open
question this spec does not settle.

The one cost is silence, which is why the badge and the install message report
the conversion rather than making it invisible (FR-010, FR-011).