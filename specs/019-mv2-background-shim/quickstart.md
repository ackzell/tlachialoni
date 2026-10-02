# Quickstart: MV2 Background Shim

## Verifying the premise

Start an Angular app on `:4200`, quit Tlachialoni, then from the repo root:

```sh
# Baseline — panel says "Angular application not detected."
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs

# Rewritten — panel shows the component tree
./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs mv2
```

Full results, including the approach that failed first, are in
`spikes/mv2-background-shim/results.md`.

## Trying it in the app

1. `npm run dev`
2. Command palette → **Install extension …** → paste
   `ienfalfjdbdpebioblfackkekamfmbnh` (Angular DevTools) or any other MV3
   extension with a background service worker.
3. A warning appears saying the extension was rewritten from MV3 to V2. It stays
   until you dismiss it with Esc or a click — deliberately not a passing toast,
   since the app changed how your extension declares itself.
4. The palette row carries an `MV3→MV2` badge.
5. **Reload the page**, then open DevTools (`⌘⌥J`) → **Angular** panel → the tree
   loads.

Both parts of step 5 are needed. Content scripts are injected when a page loads,
so an extension activated afterwards never reaches the page already open. And the
panel gives up looking for the application after ~10 seconds and only looks again
when you re-select it.

Extensions installed before this change are picked up automatically on the next
launch or **Extensions → Reload extensions** — the rewrite is regenerated at load
time when missing. Watch for the badge changing from `MV3` to `MV3→MV2`.

## Reading the badge

| Badge | Meaning |
| --- | --- |
| `MV3→MV2` | Converted, running as an MV2 background page. |
| `MV3` | Could not convert. The authored MV3 worker is what runs and may not survive. |

## If the panel still says "not detected"

1. **Quit Tlachialoni fully** (⌘Q), then relaunch. A probe can pass while the app
   fails, because a probe starts a clean Electron process and cannot see stale
   on-disk state. See `results.md` → "A stale rewrite can look like a random
   failure".
2. Check the badge. `MV3` means the rewrite did not load and the reason is in the
   terminal running the app.
3. `mv2Shimmed` in `~/Library/Application Support/Tlachialoni/state.json` tells
   you what the app decided. `true` on all three extensions is the working state.

## What will not work

Signal breakpoints inside framework debuggers. They need `chrome.debugger`, which
Electron does not implement — it is not part of the Chromium subset Electron
compiles. Everything else (tree, properties, inspector, highlighting) works.

## Rebuilding the transform

`src/main/extensions/mv2-shim.ts` is pure. Test it without a browser:

```sh
npx vitest run tests/unit/extensions.test.ts
```