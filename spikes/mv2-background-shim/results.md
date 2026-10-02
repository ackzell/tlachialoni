# Results

Established by hand on **Electron 44.4.5 / Chromium 152.0.7977.130**, macOS
arm64. Every claim below is from that run, not from documentation.

> **Correction (2026-10-02): the worker was running.** The headline conclusion
> below — that Electron cannot host Manifest V3 background service workers — is
> wrong. Electron does host them. A worker that throws while evaluating its top
> level is torn down, and `Service worker registration failed. Status code: 15`
> is what Chromium reports _after_ that death, not a refusal to host the worker
> at all. Angular DevTools' worker starts, runs `PortMultiplexer.initialize()`,
> and then throws on `chrome.debugger.onEvent` — the one namespace Electron does
> not compile. The MV2 rewrite still works, but because a background _page_
> survives a top-level throw that kills a service worker, not because it enables
> service workers. The sections that follow are kept as written, with the false
> claims corrected in place; "Corrected mechanism" below has the experiment that
> settles it, and `worker-hosting-probe.mjs` reproduces it.

## Corrected mechanism

Re-verified on **Electron 44.5.1 / Chromium 152.0.7977.130** with minimal
extensions differing only in background shape and in whether they touch
`chrome.debugger`:

| Extension | Background          | Touches `chrome.debugger` | Result                                                     |
| --------- | ------------------- | ------------------------- | ---------------------------------------------------------- |
| A2        | MV3 service worker  | no                        | registers, runs, stays alive                               |
| A3        | MV3 service worker  | no (`chrome.storage`)     | registers, runs, `chrome.storage` works                    |
| B         | MV3 service worker  | unguarded                 | runs to the throw, then dies; registration reported failed |
| D         | MV3 service worker  | guarded (`try`/`catch`)   | registers, runs, stays alive                               |
| C         | MV2 background page | unguarded                 | loads; no fatal error is reported                          |

B and D are the decisive pair: identical bodies, one `try`/`catch` apart. The
worker is not missing from Electron — one unguarded access to an API Electron
does not ship is enough to kill it. `chrome.debugger` is absent outright: zero
`"namespace":"debugger"` and zero `Debuggee` entries in the Electron 44 binary,
against one `"namespace":"scripting"`.

The C row is the one this probe cannot settle alone: it shows the page loads and
reports no fatal error, but that listeners registered before the throw keep
working is established by the end-to-end result — the rewritten Angular extension
shows its full component tree (Approach 2, below).

```sh
./node_modules/.bin/electron spikes/mv2-background-shim/worker-hosting-probe.mjs
```

## The symptom

Angular DevTools 1.22.0, installed through the app's own extension flow, showed
its panel with "Angular application not detected." The same extension worked in
real Chrome against the same app. axe DevTools showed the same class of failure.

Vue.js devtools was in this list too, and that was wrong — see below. It looks
like the same problem from a distance and is not.

## The mechanism

Angular DevTools 1.22 routes **all** panel↔page messaging through its MV3
background service worker. Traced through the installed extension:

1. The panel opens a port to the worker:
   `chrome.runtime.connect({name: "" + chrome.devtools.inspectedWindow.tabId})`
   (`bundle/main.js`)
2. The content script opens another:
   `chrome.runtime.connect({name: document.title || location.href})`
   (`app/content_script_bundle.js`)
3. Only `app/background_bundle.js` joins them, via `PortMultiplexer.initialize()`
   → `chrome.runtime.onConnect` → `doublePipe()`. It relays
   `contentScriptConnected`, `frameConnected`, `backendReady`.

With the worker dead, the panel never learns a page exists. It polls
`queryNgAvailability` every 500 ms, and after its give-up threshold renders
Angie — which is why the message appears ~10 seconds in rather than instantly.

Detection itself was never broken. `app/detect_angular_bundle.js` found the
`[ng-version]` element correctly and reported `isAngular: true`; the result just
had nowhere to go.

## Evidence the worker started, then died

The original reading of this section concluded the worker never ran. That was
wrong — see the correction at the top of this file. The same evidence, read with
the worker's own error in view:

- Loading the extension logs the worker's own uncaught error first:
  `chrome-extension://ienfalfjdbdpebioblfackkekamfmbnh/app/background_bundle.js`
  → `Cannot read properties of undefined (reading 'onEvent')`, and only then
  `Service worker registration failed. Status code: 15`. A worker that never ran
  cannot produce the first line.
- `app/background_bundle.js` executes, reaches `chrome.debugger.onEvent` —
  absent from Electron — and throws while starting up, so Chromium tears the
  worker down and reports the registration as failed.
- The profile holds many `:REG:` /
  `;REG:chrome-extension://ienfalfjdbdpebioblfackkekamfmbnh/` pairs, registered
  and torn down repeatedly, and no `INITDATA_UNIQUE_ORIGIN` entry for that
  origin. That is consistent with a worker that died during startup, not with one
  that was never accepted.

## Approach 1 — host the worker in a page we create. Failed.

Tried loading the worker script from a plain extension page
(`bg-host.html` with a `<script src="app/background_bundle.js">` tag) in the hope
that `chrome.runtime.onConnect` would fire in any live extension context, as it
does in Chrome for a popup or options page.

It registered the listener cleanly — the `chrome.debugger` throw comes from
`f.initialize()` on the next statement, and the stack trace confirmed
`g.initialize(n)` had already completed. But **no port was ever delivered**:
neither `Creating two-way communication channel` (from `doublePipe`, on success)
nor `Received a connection from an unknown sender` (the `sender.tab` guard
failing) appeared. Chromium delivers `onConnect` only to the _declared_
background context. Abandoned.

## Approach 2 — rewrite the manifest to MV2. Worked.

Electron 44 does not compile Chromium's MV2 kill switches, so an MV2 manifest is
still accepted despite Chromium 152 having removed MV2 from Chrome proper:

```
ExtensionManifestV2Disabled            0 occurrences in the Electron binary
ExtensionManifestV2Unsupported         0
ExtensionManifestV2Availability        0
```

With the manifest rewritten, the extension loaded and the Angular panel showed
the **full component tree**, with working selection, property inspection, and
element highlighting.

Expected warnings during load, none of them load-blocking:

```
Manifest version 2 is deprecated, and support will be removed in 2025.
'scripting' requires manifest version of at least 3.
Permission 'debugger' is unknown or URL pattern is malformed.
```

Two real failures on the way. Electron rejects the MV3-shaped
`content_security_policy` **object** with
`Invalid value for 'content_security_policy'`; MV2 requires the plain
extension-pages string. And a worker that loads its code with `importScripts`
cannot run as a background page at all — see below, which is what axe hit.

Both were found by replaying real manifests. Neither is visible in the manifest
schema, which is the reason SC-007 asks for store manifests rather than synthetic
ones.

## Vue devtools was never broken, and rewriting it broke it

Recorded because it is a regression this feature caused, and because the reason
it looks so much like the Angular case is the trap.

Vue.js devtools 7.7.7 has a background service worker, so it appeared in the
symptom list above. But it does not use it. Its panel is created by
`pages/devtools-background.html`, which polls:

```js
chrome.devtools.inspectedWindow.eval(
  "!!(window.__VUE_DEVTOOLS_GLOBAL_HOOK__ && (window.__VUE_DEVTOOLS_GLOBAL_HOOK__.Vue || ...apps.length))",
  t => { if (t) chrome.devtools.panels.create("Vue", ...) }
)
```

`inspectedWindow.eval` reads the page's own JavaScript world directly. No
background, no port, no service worker. So Vue's panel never depended on its
worker, and the "same class of failure" reading was simply wrong.

The rewrite then broke it, because of a field the spike never had to reason
about. Vue's manifest declares:

```json
{
  "matches": ["<all_urls>"],
  "js": ["dist/prepare.js"],
  "run_at": "document_start",
  "world": "MAIN"
}
```

`prepare.js` is a **main-world** script, and its whole job is installing
`window.__VUE_DEVTOOLS_GLOBAL_HOOK__` plus the `__VUE_DEVTOOLS_KIT_*` RPC
channels into the page's world. MV2 has no `world` key at all — Chromium's
parser rejects it rather than ignoring it, with:

> The 'world' property is restricted to extensions with 'manifest_version' set to
> 3 or higher.

(string present in Electron 44's own binary, so this is not a version guess).
The rewrite therefore _demoted_ `prepare.js` into the isolated world, where the
hook it installs is invisible to the page. The eval above never becomes true, the
panel is never created, and the extension looks entirely dead — a worse outcome
than the dead worker it was already tolerating.

### Why Angular is not affected

Angular DevTools declares a main-world script too, which is why no manifest-level
signal separates the two cases:

|                  | main-world script does                                                                             | needs              |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------ |
| Angular DevTools | sets `window.__NG_DEVTOOLS_CONNECTED__` — a flag that tells Angular's _own_ devtools to stand down | the **background** |
| Vue.js devtools  | installs `__VUE_DEVTOOLS_GLOBAL_HOOK__` and the Kit RPC channels the panel polls for               | the **main world** |

Both declare `<all_urls>`, `document_start`, one JS file. Nothing in the manifest
says which script is load-bearing, so the app cannot work it out and must be told.
`MAIN_WORLD_REQUIRED` in `src/main/extensions/mv2-shim.ts` is that list, keyed on
extension name, defaulting to _rewrite_ so an unfamiliar extension is never
silently spared.

Stripping `world` remains correct for everyone else: Vue's legacy path and Angular's
detection both reach the page by injecting a `<script>` tag, and that works from
the isolated world.

### The stale-rewrite trap this hit

The rewrite on disk is what gets loaded, not the decision that produced it. An
extension already rewritten by an earlier build keeps loading that copy forever
unless the ineligible case _deletes_ it. `load()` now removes a rewrite it would
refuse to write today, so a fix like this takes effect on the next launch rather
than after a reinstall — otherwise Vue stays broken and it looks like the fix did
not work.

## `importScripts` is not available to an MV2 background page

The second regression this feature caused, and the more visible of the two.

axe DevTools 4.138 ships a 60-byte `background.service_worker` whose entire body is:

```js
importScripts("browser-polyfill.js", "background.bundle.js");
```

`importScripts` is a `WorkerGlobalScope` method. An MV2 background _page_ is a DOM
document and has no such function, so the rewritten background page throws on its
first statement and `background.bundle.js` never runs at all. The manifest still
loads, Chromium still reports success, and the extension is present in the panel —
so the failure surfaces somewhere else entirely. What axe showed was, in the
inspected page:

```
BackgroundRecorder is not running in a known context
    at #r (chrome-extension://…/content.bundle.js:2:8269)
    at async t.advancedRun (…)
```

which is the content script's `BackgroundRecorderClient` asking the background for
a handler and getting `undefined` back — the branch that throws when
`bridge.send("background", …)` yields nothing. No mention of a background, and
nothing wrong with the page under test.

MV2 expresses this directly: `background.scripts` loads its entries in order into
one shared global, which is exactly what `importScripts` was being used to
achieve. So the imports become the `scripts` list and the shim worker is not
referenced at all:

```json
{ "scripts": ["browser-polyfill.js", "background.bundle.js"], "persistent": true }
```

A worker that mixes `importScripts` with other top-level code is **declined**
rather than half-translated. There is no `scripts` list that reproduces it, and a
background page that loads but silently omits half its behaviour is harder to
diagnose than one that is never converted.

The generalisable lesson, and the reason this is written down: a manifest rewrite
is not finished when the manifest parses. `importScripts` is invisible in
`manifest.json` — it only appears when you open the worker file — so a check that
reads the manifest alone cannot find it. Angular's and Vue's workers are
self-contained and raise the question never occurs.

### How the first fix for this broke Angular

Worth recording, because it is the exact failure mode the section above warns
about, committed by the person who had just written that warning.

The helper first returned `string[] | null`, with `null` meaning "this worker uses
`importScripts` and I cannot translate it". But it was also reached for every other
worker, and a self-contained worker has no `importScripts` to hoist, so it returned
`null` too. Every self-contained extension was therefore declined — which is most
of them. Angular DevTools silently stopped being rewritten, and nothing said so:
its badge would have read `MV3`, which is a value the list already used for a
different state.

The tests all passed, because each one either used an `importScripts` worker or
asserted `null` and could not tell the two reasons apart. The distinction was only
visible in the state file on a real machine.

The fix is a three-way result — `self-contained`, `imports`, `untranslatable` — so
"nothing to do here" and "I refuse this one" cannot share a value again. Two rules
came out of it, both about failure modes rather than about this bug:

- **A nullable return should not carry two meanings that need opposite handling.**
  If a `null` means "leave it alone" in one branch and "rewrite it plainly" in
  another, one of them is wrong.
- **A change to a shared decision path needs a test that exercises the path for
  something that was _already_ working.** Every test here had been written
  alongside the feature it tested, so nothing covered "this input is unchanged by
  this change".

## `chrome.debugger` is not fixable from here

Angular DevTools uses it for signal breakpoints (stepping through `ngOnInit` and
friends). It is absent, and the bundle throws on it:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'onEvent')
```

That throw is also the reason the rewrite exists: it happens during the worker's
startup, so under the authored MV3 manifest it does not merely disable signal
breakpoints — it kills the whole background context. The MV2 rewrite is what
makes the rest of the worker survivable. Electron states the absence directly on
load: `Permission 'debugger' is unknown`.
`chrome.debugger` and `chrome.scripting` live in `chrome/browser/extensions/api/`
— the Chrome-only layer. Electron compiles
`electron/shell/browser/extensions/api/` instead, which exists (control: 2
occurrences) while the former does not (0 occurrences). Making these work is
upstream Electron work, not something the app can add.

**Net effect:** tree, properties, and inspector work. Signal breakpoints do not.
This is a platform limit, and should not be filed as a regression against the
rewrite.

axe DevTools depends on `chrome.debugger` far more centrally than Angular does —
its `background.bundle.js` uses `attach`, `sendCommand`, `onEvent` and `detach`,
and its whole product is a debugger protocol session. Fixing its worker gets it
running; it will still have no debugger to drive. Expect the panel to open and the
scan to fail, rather than the page throwing `BackgroundRecorder is not running in a
known context`.

**The namespace is absent outright, not merely reduced.** Electron's own API tables
list `"namespace":"scripting"` and no `"namespace":"debugger"` at all, so
`chrome.debugger.attach` does not exist to be called — there is no partial
implementation to work around. For axe this is the end of the road: its panel opens
and reports that it cannot analyse the tab, and that message is the accurate
outcome rather than a bug to chase.

## Reloading the page is not enough on its own

Worth stating plainly, because it looks like a bug and is not.

Angular DevTools' panel polls `queryNgAvailability` every 500ms for ~20 ticks.
Once that budget is spent it sets `angularStatus = DOES_NOT_EXIST` and stops
looking; only re-selecting the panel re-runs detection.

So after installing the extension you need **two** things:

1. a page reload, so the content scripts are injected, and
2. the panel re-selected, so it looks again

A reload that lands after the panel has given up leaves it reading "application
not detected" no matter what the page is doing. The app used to reload the page
automatically on install; that was tried and reverted, because it fixed neither
half and threw away a page for nothing. The install notice tells you to reload
instead.

## A stale rewrite can look like a random failure

Worth recording, because it cost real time and presented as a Dock-mode bug.

The first implementation wrote the rewrite only in `commit()` — at install and
update time. `load()` merely preferred one if it happened to exist. So an
extension installed _before_ the feature shipped loaded exactly as it always had:
authored MV3 copy, its worker dead on `chrome.debugger`, "application not
detected". The rewrite
directory did not exist to be found, and nothing in the log said so.

Worse, once `.shim/` did get populated, a **stale** rewrite and the authored copy
could disagree, and the symptom became intermittent: the panel connected to a
background that was not the one serving its content script. It read as though
`mode: "right"` were at fault, because that happened to be the dock side in use
when it was observed. Re-running produced a pass.

Two lessons, both now in the spec:

- **`load()` regenerates a missing rewrite** (FR-016). A missing rewrite and a
  declined one are indistinguishable from the load path, so absence must not be
  read as a decision.
- **Verify in the app, not only in a probe.** Every probe here launches a clean
  Electron process with one freshly-loaded extension, so by construction none of
  them can reproduce stale on-disk state. A probe that always passes tells you
  the mechanism works; it cannot tell you the app reaches it.

## Re-verifying

```sh
# The platform question: does Electron host MV3 background service workers?
# No extension needs to be installed; the probe builds its own fixtures.
./node_modules/.bin/electron spikes/mv2-background-shim/worker-hosting-probe.mjs

# The end-to-end question: does the rewrite make Angular DevTools' panel work?
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs      # baseline: not detected
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs mv2  # rewritten: full tree
```

Quit Tlachialoni first — two processes cannot hold one extension folder.
