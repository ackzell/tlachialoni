# Results

Established by hand on **Electron 44.4.5 / Chromium 152.0.7977.130**, macOS
arm64. Every claim below is from that run, not from documentation.

## The symptom

Angular DevTools 1.22.0, installed through the app's own extension flow, showed
its panel with "Angular application not detected." The same extension worked in
real Chrome against the same app. Vue.js devtools and axe DevTools — also MV3,
also with background service workers — showed the same class of failure.

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

With no worker, the panel never learns a page exists. It polls
`queryNgAvailability` every 500 ms, and after its give-up threshold renders
Angie — which is why the message appears ~10 seconds in rather than instantly.

Detection itself was never broken. `app/detect_angular_bundle.js` found the
`[ng-version]` element correctly and reported `isAngular: true`; the result just
had nowhere to go.

## Evidence the worker never ran

Chrome profile at `~/Library/Application Support/Tlachialoni`:

- `Service Worker/Database/000003.log` holds many `:REG:` /
  `;REG:chrome-extension://ienfalfjdbdpebioblfackkekamfmbnh/` pairs —
  registered and torn down repeatedly — and **no**
  `INITDATA_UNIQUE_ORIGIN` entry for that origin, which every extension whose
  worker actually started did get.
- `app/background_bundle.js` appears nowhere in the profile except its own
  manifest. It was never compiled.
- Loading the extension logs Chromium's own verdict:
  `Service worker registration failed. Status code: 15`.

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

One real failure on the way: Electron rejects the MV3-shaped
`content_security_policy` **object** with
`Invalid value for 'content_security_policy'`. MV2 requires the plain
extension-pages string. That was the only non-mechanical field.

## `chrome.debugger` is not fixable from here

Angular DevTools uses it for signal breakpoints (stepping through `ngOnInit` and
friends). It is absent, and the bundle throws on it:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'onEvent')
```

Electron states it directly on load: `Permission 'debugger' is unknown`.
`chrome.debugger` and `chrome.scripting` live in `chrome/browser/extensions/api/`
— the Chrome-only layer. Electron compiles
`electron/shell/browser/extensions/api/` instead, which exists (control: 2
occurrences) while the former does not (0 occurrences). Making these work is
upstream Electron work, not something the app can add.

**Net effect:** tree, properties, and inspector work. Signal breakpoints do not.
This is a platform limit, and should not be filed as a regression against the
rewrite.

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
authored MV3 copy, dead background, "application not detected". The rewrite
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
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs      # baseline: not detected
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs mv2  # rewritten: full tree
```

Quit Tlachialoni first — two processes cannot hold one extension folder.
