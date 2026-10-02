# Spike: extension audit

Before installing an extension: what will not work, and how sure are we?

**Static analysis covers the mechanical failures. It cannot cover the judgement
call, and says so.** See `results.md` for the evidence behind that claim and for
the three real bugs this would have caught.

## Running it

```sh
# One extension, from the repo root
node spikes/extension-audit/audit.mjs ~/Library/Application\ Support/Tlachialoni/extensions/<id>

# Everything installed
node spikes/extension-audit/audit.mjs ~/Library/Application\ Support/Tlachialoni/extensions/*/

# Machine-readable, for diffing verdicts between installs
node spikes/extension-audit/audit.mjs --json <dir>
```

`probe.mjs` is the same audit plus a runtime cross-check of the absent-namespace
list against Electron itself. It needs `electron` but installs nothing:

```sh
./node_modules/.bin/electron spikes/extension-audit/probe.mjs
```

## Reading the output

Severity is about _what we can conclude_, not how bad it is.

| Mark            | Meaning                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `+`             | Handled, or not a problem.                                              |
| `!` warn        | Will probably work, with a named caveat.                                |
| `!` blocked     | A capability is missing that no manifest change can supply.             |
| `!` needs-human | A fact about the extension, not its files. Only a person can settle it. |

Current output for the three extensions installed here:

```
Angular DevTools 1.22.0     will-load-but-parts-wont-work   (debugger, scripting, main world)
axe DevTools 4.138.0         will-load-but-parts-wont-work   (debugger; importScripts handled)
Vue.js devtools 7.7.7        needs-a-human-decision          (main world)
```

## What it is honest about

The audit reads `manifest.json` and the background worker file. It does **not**
launch Electron, and it does not know what an extension is _for_. So it reports
what an extension touches, never whether that touches matter.

Concretely, it cannot answer the question that matters most for framework
developer tools: whether a `world: "MAIN"` content script is the whole feature or
one incidental flag. Angular's sets `__NG_DEVTOOLS_CONNECTED__`; Vue's installs the
hook its DevTools page polls for. The manifests are structurally identical —
`<all_urls>`, `document_start`, one file — so no static check separates them, and
neither did reading the code, until the bundles were read side by side. That is why
`MAIN_WORLD_REQUIRED` in `src/main/extensions/mv2-shim.ts` is a hand-maintained
list: the judgement is real, and the honest place to put a real judgement is
somewhere a person can read and revise it.

The audit is therefore advisory. It never rewrites, and it never edits the decline
list. Its job is to make the question arrive already narrowed.

## Layout

| File         | Purpose                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `audit.mjs`  | The static audit. Pure Node — `node audit.mjs <dir>`, no Electron needed                              |
| `probe.mjs`  | Runs the audit over every install, then verifies the absent-namespace list against the running binary |
| `results.md` | Which bugs this catches, the limit of static analysis, and what to do about it                        |

## Cross-checked against the shipped transform

The audit is only useful if it agrees with what `mv2-shim.ts` actually does. That
was verified against all three installed extensions: worker's `importScripts` shim
→ 2 scripts hoisted, Angular's self-contained worker → rewritten, Vue → declined.
Run the same comparison any time one of them changes:

```sh
node spikes/extension-audit/audit.mjs <folder>   # what the audit believes
```

The audit deliberately holds no rewrite logic of its own — `workerKind` is a
_report_ of the worker's shape, and `mv2-shim.ts` is what acts on it. If the two
ever disagree, that is the bug.
