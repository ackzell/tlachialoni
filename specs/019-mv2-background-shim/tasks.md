# Tasks: MV2 Background Shim

## 1. The transform

- [x] T001 Add `src/main/extensions/mv2-shim.ts` as a pure module (no Electron, no `node:fs`)
- [x] T002 Return `null` for manifests MV2 cannot express: MV2, no service worker, module worker, empty/non-string worker, non-object background
- [x] T003 Emit `manifest_version: 2` and `{scripts: [worker], persistent: true}`
- [x] T004 Flatten the `content_security_policy` object to its extension-pages string
- [x] T005 Rename `action` → `browser_action`
- [x] T006 Flatten and dedupe `web_accessible_resources`
- [x] T007 Merge `host_permissions` into `permissions` and `optional_host_permissions` into `optional_permissions`
- [x] T008 Strip `world` from content scripts
- [x] T008a Decline the rewrite for extensions whose main-world content script is
      load-bearing (Vue.js devtools), and delete a stale rewrite that a later
      build would decline. Regression found after the spike: the spike only ever
      ran Angular, so `world` stripping was verified against an extension that
      does not need it.
- [x] T008b Hoist an `importScripts` worker's imports into `background.scripts`.
      Regression found the same way, and worse than T008a because it is invisible
      in `manifest.json`: axe DevTools' worker is 60 bytes and delegates via
      `importScripts`, which an MV2 background page does not have, so the rewrite
      loaded a background that threw on its first statement and reported the
      failure as `BackgroundRecorder is not running in a known context` in the
      inspected page.
- [x] T008c Return three outcomes from the worker inspection rather than two.
      The first version of T008b reported "no `importScripts` to hoist" and
      "cannot translate" as the same `null`, which declined every self-contained
      worker and silently stopped Angular DevTools being rewritten. Caught in the
      state file on a real machine, not by the tests, because every test had been
      written alongside the change it covered.
- [x] T009 Never mutate the input manifest

## 2. Loading

- [x] T010 Add `shimDirFor(slug)` resolving to `<root>/.shim/<slug>`
- [x] T011 Add `mv2Shimmed` to `LoadedExtension`
- [x] T012 Prefer the rewrite in `load()`, falling back to the authored copy and logging to stderr
- [x] T013 Add `writeShim()`: full copy plus rewritten manifest
- [x] T014 Extend `unload()` to consider both directories
- [x] T015 Keep the authored copy as the only fatal failure in `commit()`
- [x] T016 Write the rewrite in `commit()`, discarding any stale copy
- [x] T018a Backfill a missing rewrite in `load()` — an extension installed before this feature has none, and without it everything loaded exactly as before, silently
- [x] T030a Guard the backfill with a real store manifest, not only synthetic ones
- [x] T017 Delete both directories in `remove()`

## 3. State

- [x] T018 Add `mv2Shimmed` to `InstalledExtension`
- [x] T019 Default it in `sanitizeExtensions()` additively
- [x] T020 Include it in `patch()`'s change comparison
- [x] T021 Set it in both `load()` and `commit()`

## 4. Surface

- [x] T022 Badge `MV3→MV2` on a rewritten extension, `MV3` only when the rewrite failed
- [x] T023 Emit a dismissable `warning` naming the rewrite on install and on re-enable, carrying the MV3-only API caveat
- [x] T024 Repeat the conversion report on re-enable
- [x] T025 Rewrite the MV3 warning to name the failed fallback

## 5. Verification

- [x] T026 Unit-test every transform rule and every decline path
- [x] T027 Assert the input manifest is unmutated
- [x] T028 Test the badge for shimmed / broken / clean
- [x] T029 Test `mv2Shimmed` defaulting
- [x] T030 `npm run typecheck`, `npx vitest run`, `npm run check` all pass

## 6. Documentation

- [x] T031 Rewrite the README extensions section
- [x] T032 Add `spikes/mv2-background-shim/` with a re-runnable probe and results
- [x] T033 Record `chrome.debugger` / `chrome.scripting` as out of scope
- [x] T035 Tell the developer in the rewrite notice to reload the page, since extensions only reach a page that loads after them
- [x] T036 Tried and reverted: auto-reloading the guest. Angular DevTools' panel stops polling after ~10s and holds `DOES_NOT_EXIST`, so a reload alone does not revive it (research R8)
- [x] T034 Note that `specs/018` is superseded in part