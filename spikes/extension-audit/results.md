# Results

## The question

Installing an MV3 extension has been a research task per extension: read the
manifest, read the worker, find the file the manifest points at, work out whether
the rewrite survives contact with it. Three extensions took three rounds of
exactly that, and two shipped regressions because the thing that broke was not in
the manifest.

The claim under test: **most of that research is mechanical, and can be a script.**

**Mostly yes.** Every mechanical failure is visible in two files before anything
is installed. What is left is one judgement per extension, and it needs a person.

## What it catches

Against the three extensions installed here, all three real bugs found this week
are reported without loading anything:

| Bug                            | Signal                                           | Caught by                                    |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| Vue's panel never created      | `world: "MAIN"` on `dist/prepare.js`             | `needs-human` on main world                  |
| axe's background threw on load | `importScripts` in `background-worker.bundle.js` | `+` background finding, with the script list |
| axe's scan cannot work         | `debugger` in `permissions`                      | `blocked` on api                             |

The `importScripts` one is the strongest evidence for doing this at all: it is
**invisible in `manifest.json`**. The audit finds it because it opens the worker
file, which is the only place it appears. A manifest-only check cannot see it, and
neither did the original spike.

## The limit, stated precisely

The audit can say an extension _uses_ `world: "MAIN"`. It cannot say whether it
_needs_ to.

- Angular: `app/devtools_connected_flag_bundle.js` sets
  `window.__NG_DEVTOOLS_CONNECTED__` — a flag telling Angular's own devtools to
  stand down. Demoting it to the isolated world costs nothing.
- Vue: `dist/prepare.js` installs `window.__VUE_DEVTOOLS_GLOBAL_HOOK__`, and
  `pages/devtools-background.html` polls `inspectedWindow.eval` for it and only
  calls `chrome.devtools.panels.create` once it appears. Demoted, the panel is
  never created.

Both manifests declare `<all_urls>`, `document_start`, one JS file, `world:
"MAIN"`. Identical shape, opposite requirement. Distinguishing them required
reading both bundles and reasoning about what each extension is for — not a fact
about the files.

So the audit reports `needs-human` for both, which is the correct answer and not
a gap in the implementation. `MAIN_WORLD_REQUIRED` in
`src/main/extensions/mv2-shim.ts` is where that judgement is recorded, and it
defaults to _rewrite_ so an unfamiliar extension is never silently spared.

## What it deliberately does not do

- **It does not rewrite.** It reports what the worker needs;
  `src/main/extensions/mv2-shim.ts` decides what to do. Two implementations of
  the same rule is the drift this exists to prevent.
- **It does not edit the decline list.** A tool that rewrote the list would make
  the judgement invisible, and the judgement is the part worth reviewing.
- **It does not launch Electron.** That keeps it fast enough to run on every
  install, and keeps it from touching the live extension folders.

## Verifying the absent-namespace list

`KNOWN_ABSENT_NAMESPACES` in `audit.mjs` is data with a stated method: scan the
Electron Framework binary for its compiled `"namespace":"…"` API tables. Electron
44 yields 60 namespaces, and `debugger` is not among them while `scripting` is —
which is why Angular's signal breakpoints fail and axe's whole product cannot run,
and also why `scripting` is only a warning rather than a blocker.

That is a fact about one Electron build and will drift. `probe.mjs` therefore
re-derives it at runtime and reports a `MISMATCH` if the hardcoded list and the
running binary disagree. **When upgrading Electron, run the probe** — a stale list
means the audit confidently reports the wrong thing, which is worse than not
running.

One caveat on that cross-check: `chrome` in Electron's main process is not the
extension `chrome`, so the probe confirms only that a name is absent from
Electron's own surface. Absence is decisive; presence is not proof of a working
API in an extension context. The list is only ever consulted for absence.

## For the next extension

1. `node spikes/extension-audit/audit.mjs <folder>` — mechanical risks, in seconds.
2. `blocked` findings: check whether that API is the product. If it is, the
   extension cannot work here and no amount of manifest work changes that. Say so
   rather than shipping a panel that opens and then fails.
3. `needs-human` on main world: read the main-world bundle and work out whether the
   page can see without it. Angular's is a flag; Vue's is the feature. That answer
   goes in `MAIN_WORLD_REQUIRED`, by name, with the reason in a comment.
4. Load it. Expect the badge to state which case applied.

Step 2 is new work each time, but it is now a five-minute judgement with the
relevant facts already gathered, rather than an open-ended investigation.
