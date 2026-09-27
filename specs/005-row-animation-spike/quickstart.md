# Quickstart: Palette Row Animation Technique (Spike)

## Prerequisites

- Node 24.21+, dependencies installed (`npm install`).
- The Playwright Chromium headless shell, already cached under
  `~/Library/Caches/ms-playwright/chromium_headless_shell-*/`.

## Run

```sh
node spikes/row-animation/probe.mjs          # all candidates, JSON verdicts
node spikes/row-animation/probe.mjs --tech=c # a single candidate
```

The probe prints one JSON object per candidate:

```json
{ "tech": "B", "passed": true, "maxNodes": 9, "modelRows": 9,
  "duplicateIds": [], "ghostNodes": 0, "widthStable": true,
  "warnings": [], "failures": [] }
```

## Reading the result

- `maxNodes` greater than `modelRows` at any sample is accumulation.
- `duplicateIds` non-empty is the 004 duplication.
- `ghostNodes` counts rows that are opaque but detached or outside the list box.
- `failures` lists which of the five checks (research R3) broke, with the
  keystroke index.

## Decision

Use `spikes/row-animation/results.md` for the verdict table and the recommended
technique. Adoption is a follow-up edit to `specs/004-shell-motion/` — re-enable
row animation there only with the passing technique, then re-run that feature's
quickstart S3.

## Spec coverage

| Step | Requirement |
| ---- | ----------- |
| Probe over real `buildRows` | FR-001 |
| JSON verdicts | FR-002 |
| Same query sequence for all candidates | FR-003 |
| Duplication/ghost/growth recorded | FR-004 |
| Single recommendation + conditions | FR-005 |
| Vue-version behavior + warnings recorded | FR-006 |