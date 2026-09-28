# Validation: Shell Motion

**Feature**: `specs/004-shell-motion/` | **Date**: 2026-09-27

Two kinds of checks: machine-verifiable probes run against the built app through
the existing snapshot harness (`TLACHIALONI_UI_SNAPSHOT=1`), and perceptual checks
that need a human watching the motion. The animation *timing* itself cannot be
machine-verified here.

## Automated evidence

The repo's `runUiSnapshot` harness was used to drive the built app (with a local
server on `:4321`; a refused target on `:4598` for the failure path). Because this
session has no display surface, `capturePage()` cannot produce PNGs, so the probe
run read the DOM and the shell view's visibility directly instead. Observed:

```json
{
  "paletteResult": { "ok": true },
  "paletteMounted": true,
  "stripMounted": true,
  "stripText": "localhost:4321",
  "failureMounted": true,
  "failureCard": true,
  "failureText": true,
  "failureVisible": true,
  "settleVisibleBeforeHide": true,
  "settleVisibleDuringLeave": true,
  "settleVisibleAfterSettle": false
}
```

Reading:

- **Segments reconstruct the label exactly** — `stripText` is `localhost:4321`,
  so the `:`-and-`/` split plus separator reattachment preserves the target text.
- **The settle gate holds the collapse** — 40 ms after hiding the strip the shell
  view is still visible (`settleVisibleDuringLeave: true`), so the exit was not
  cut, and 700 ms later it is hidden (`settleVisibleAfterSettle: false`), so the
  ack/timeout opened the gate and zero chrome returned.
- **Every surface mounts** — palette, strip, and failure view (card + copy) render
  with the transition wrappers in place, with no renderer errors.

## Scenario status

| Scenario | Machine | Perceptual | Notes |
| -------- | ------- | ---------- | ----- |
| S1 palette grow/shrink | mounted | **PASS** | Grow-on-open / shrink-on-close confirmed by the developer |
| S2 strip choreography | **PASS** | **PASS** | Label reconstruction and cut-free hide verified; segment/control stagger confirmed by the developer |
| S3 row animation | mounted | **PASS** | Rows unfold in and shrink out; developer confirmed correct behaviour. Residual: mild choppiness during very fast typing (enter/leave overlap) |
| S4 veil fade-out | indirect | **PASS** | Developer confirmed the surface transitions rather than cutting |
| S5 failure view | **PASS** | **PASS** | Mounts with card and copy on a refused target; enter/leave confirmed |
| S6 reduced motion | — | **PASS** | Reduce Motion ON: all four surfaces snap instantly. Toggled back off: motion resumes with no restart (FR-005, SC-004) |
| S7 interruption / zero chrome | **PASS** (zero chrome) | **PASS** | Shell hidden after settle; developer confirmed no sticks or residue while toggling |
| S8 automated checks | **PASS** | — | `npm run test` (45), `npm run check`, `npm run typecheck`, `npm run build` |

## Remaining manual pass

None outstanding. Every scenario in `quickstart.md` S1–S8 is now either
machine-verified or confirmed by the developer in `npm run dev`.

The only known imperfection is the fast-typing choppiness on palette rows
(enter/leave overlap), recorded under S3 and in
`spikes/row-animation/results.md`. It is a tuning matter, not a defect: reduce
`--tb-motion-fast` or `--tb-motion-stagger` to taste.

## Notes

- **Row animation resolved and shipped (2026-09-28)**: the palette now animates
  rows with the Vue-docs technique (`TransitionGroup` + `:css="false"` + JS
  hooks), staggered on entry, shrinking on leave, with a fixed row height. The
  spike (`specs/005-row-animation-spike/`) proved the earlier duplication came
  from the volatile `Open <query>` row key, and the fix (a stable `Row.key`) makes
  every technique pass. The developer confirmed correct behaviour by hand and
  noted only mild choppiness during very fast typing, tunable via the motion
  tokens.
- All scenarios validated (2026-09-28): the developer walked S1–S7 in
  `npm run dev` and confirmed the surfaces animate, rows behave, interruption is
  clean, and reduced motion snaps every surface instantly then resumes without a
  restart. Nothing is outstanding.
- **Pacing amendment (2026-09-27)**: the developer judged the first cut too fast.
  The token set moved to 160/220/300 ms with a 36 ms stagger and a 0.96 palette
  scale, and the spec budgets were re-baselined to match (FR-002, SC-002,
  `contracts/motion-tokens.md`). The main-process settle safety timeout moved to
  500 ms to stay above the longest leave.
- **Row animation fixed** (2026-09-27): the palette row `TransitionGroup` left
  duplicated rows and a growing list. Root cause was the volatile `Open <query>`
  row key; fixed by a stable `Row.key` plus a fixed row height, then re-implemented
  with the Vue-docs JS-hook technique. Recorded in research R10 and
  `spikes/row-animation/results.md`.
- One probe target (`:4599`) was already occupied on this machine, which made the
  failure view appear to be missing; switching to a free port (`:4598`) produced
  the expected failure view. No code change was involved.
- No implementation artifacts are left behind: the probe modifications lived only
  in the gitignored `out/` build and were removed by rebuilding.