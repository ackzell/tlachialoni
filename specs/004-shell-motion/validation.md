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
| S1 palette grow/shrink | mounted | **pending** | Panel/backdrop scale and fade need human eyes; typing-immediacy also manual |
| S2 strip choreography | **PASS** | **pending** | Label reconstruction and cut-free hide verified; segment/control stagger timing manual |
| S3 row animation | mounted | **pending** | Rows render; "new rows animate, survivors still" is visual |
| S4 veil fade-out | indirect | **pending** | Same gate proven on the strip path; the fade itself is visual |
| S5 failure view | **PASS** | **pending** | Mounts with card and copy on a refused target; enter fade is visual |
| S6 reduced motion | — | **pending** | Requires toggling System Settings → Accessibility → Display → Reduce Motion |
| S7 interruption / zero chrome | **PASS** (zero chrome) | **pending** | Shell hidden after settle; rapid-toggle and pointer behavior are manual |
| S8 automated checks | **PASS** | — | `npm run test` (39), `npm run check`, `npm run typecheck`, `npm run build` |

## Remaining manual pass

Run the app (`npm run dev`) with a live target and a dead port, then walk
`quickstart.md` S1–S7 with slow-motion capture for S1, S2, S4 and reduced motion
for S6. Record the outcome here.

## Notes

- **Pacing amendment (2026-09-27)**: the developer judged the first cut too fast.
  The token set moved to 160/220/300 ms with a 36 ms stagger and a 0.96 palette
  scale, and the spec budgets were re-baselined to match (FR-002, SC-002,
  `contracts/motion-tokens.md`). The main-process settle safety timeout moved to
  500 ms to stay above the longest leave.
- **Row animation reverted (2026-09-27)**: the palette row `TransitionGroup` left
  duplicated rows and a growing list, so the list is a plain `v-for` again. The
  technique is deferred to `specs/005-row-animation-spike/` (research R10); FR-013
  and US3 are rescoped accordingly. Row enter animation is therefore **not**
  present in this feature's shipped state.
- One probe target (`:4599`) was already occupied on this machine, which made the
  failure view appear to be missing; switching to a free port (`:4598`) produced
  the expected failure view. No code change was involved.
- No implementation artifacts are left behind: the probe modifications lived only
  in the gitignored `out/` build and were removed by rebuilding.