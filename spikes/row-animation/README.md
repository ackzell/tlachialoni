# Row Animation Spike Harness

Compares candidate techniques for animating command-palette result rows without
accumulating, duplicating, or resizing the list.

Full findings: `spikes/row-animation/results.md`.

## Run

```sh
node spikes/row-animation/probe.mjs            # all candidates
node spikes/row-animation/probe.mjs --tech=D   # a single candidate
```

Each candidate is a real Vue page rendering the app's actual `buildRows` output,
driven in Chromium and sampled after every keystroke.

## Layout

| File         | Purpose                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `server.mjs` | Serves the harness, transpiles the app's TS modules on the fly (esbuild), and resolves the `@shared/*` alias |
| `index.html` | Panel markup mirroring the real palette list CSS                                                             |
| `harness.js` | Mounts the selected candidate (`?tech=A..E`) over the real row model                                         |
| `probe.mjs`  | Drives every candidate and prints JSON verdicts                                                              |

## Candidates

| Tech | Technique                                                                          |
| ---- | ---------------------------------------------------------------------------------- |
| A    | Plain `v-for`, no animation (baseline)                                             |
| B    | `TransitionGroup`, enter only                                                      |
| C    | `TransitionGroup`, enter + leave + `position: absolute` (the original 004 attempt) |
| D    | Plain `v-for` + CSS `@keyframes` entry — **recommended**                           |
| E    | `TransitionGroup` with `move`/FLIP, enter only                                     |

## Requirements

- Node 24.21+
- A Playwright Chromium headless shell in `~/Library/Caches/ms-playwright`, or
  set `SPIKE_CHROMIUM=/path/to/headless_shell`

This directory is a spike and is excluded from the app's lint/format scope and
from `electron-vite`'s build; it ships nothing.
