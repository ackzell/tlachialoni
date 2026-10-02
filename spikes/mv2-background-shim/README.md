# Spike: MV2 background shim

Does an extension whose background Electron cannot host work anyway if we
declare it as an MV2 background page?

**Yes.** See `results.md` for the evidence, including the approach that failed
first and why. Shipped as `src/main/extensions/mv2-shim.ts`; the spec is
`specs/019-mv2-background-shim/spec.md`.

## Why it matters

Angular DevTools and axe DevTools relay messages between their DevTools panel and
the page through a background service worker. Electron cannot run those, so their
panels report that your app is missing while their own content scripts can see it
perfectly well. This is not a cosmetic breakage — for a framework developer tool,
it is the whole feature.

Vue devtools turns out to be the counter-example, and the reason it is worth
reading: it has a service worker too, but does **not** need it. Its panel reaches
the page over `inspectedWindow.eval` instead, so it worked all along, with the
worker dead. Rewriting its manifest fixed nothing and broke something else —
see `results.md`.

## Running it

Start your Angular app on `:4200` first, and **quit Tlachialoni** — two
processes cannot hold the same extension folder. From the repo root:

```sh
# Baseline: loads the authored MV3 manifest. Panel says "not detected".
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs

# Rewritten: declares an MV2 background page. Panel shows the component tree.
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs mv2
```

Point it elsewhere with `SPIKE_APP_URL=http://localhost:3001/`.

The probe reads the Angular DevTools copy already installed in the app's
extension folder and copies it to `~/.tlachialoni-mv2spike`. Nothing installed
is modified.

## Reading the outcome

| Terminal                                          | Panel          | Meaning                                            |
| ------------------------------------------------- | -------------- | -------------------------------------------------- |
| `LOADED Angular DevTools` (no `rewrote`)          | Angie          | Baseline. Worker never started.                    |
| `LOADED Angular DevTools 1.22.0` (with `rewrote`) | Component tree | The shim works.                                    |
| `LOAD FAILED: ...content_security_policy`         | —              | MV2 needs the CSP string, not the MV3 object       |
| `LOAD FAILED: ...anything else`                   | —              | A field we do not translate yet; the text names it |

## Warnings that are fine

```
Manifest version 2 is deprecated, and support will be removed in 2025.
'scripting' requires manifest version of at least 3.
Permission 'debugger' is unknown or URL pattern is malformed.
```

The last one is a real capability gap — `chrome.debugger` does not exist in
Electron — but it is not what this spike is measuring.
