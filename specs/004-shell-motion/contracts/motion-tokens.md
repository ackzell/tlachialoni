# Contract: Motion Tokens

Project-local timing vocabulary for the shell renderer. Tlapalli defines colors;
this file defines **how** those surfaces move. Motion introduces no color values:
every painted surface remains Tlapalli-tokenized (constitution VI).

## CSS variable contract

Defined once in `src/renderer/src/styles/motion.css` on `:root`.

| Variable                  | Value                            | Role                                              |
| ------------------------- | -------------------------------- | ------------------------------------------------- |
| `--tb-motion-fast`        | `160ms`                          | Micro-feedback and row enter                      |
| `--tb-motion-base`        | `220ms`                          | Panel, strip surface, failure enter; segment fade |
| `--tb-motion-slow`        | `300ms`                          | Loading veil leave (the one relief-paced exit)    |
| `--tb-motion-ease-out`    | `cubic-bezier(0.2, 0, 0, 1)`     | Entrances and settling                            |
| `--tb-motion-ease-in`     | `cubic-bezier(0.4, 0, 1, 1)`     | Exits                                             |
| `--tb-motion-stagger`     | `36ms`                           | Per-segment and per-control delay step            |
| `--tb-motion-stagger-cap` | `6` (unitless)                   | Index cap used in `min()` for stagger compression |
| `--tb-motion-shift`       | `4px`                            | Small lift/drop distance                          |
| `--tb-motion-scale`       | `0.96`                           | Palette panel starting scale                      |
| `--tb-motion-row-leave`   | `90ms`                           | Palette row exit (faster than entry)              |
| `--tb-motion-row-stagger` | `20ms`                           | Palette row entry delay step                      |
| `--tb-motion-row-stagger-cap` | `5` (unitless)               | Cap for the row entry stagger                     |

The three `row-*` tokens are split from the surface tokens so the list can be
tuned without changing the palette panel or strip. They are what keeps fast
typing smooth: a shorter exit narrows the window in which a departing row and its
replacement are both on screen.

Amended 2026-09-27 (pacing): the first cut was 100/140/200 ms at 24 ms stagger;
the developer judged it too fast, so the whole set was nudged up and the spec
budgets in `spec.md` were re-baselined to match (see the Sequence budgets table).

Amended 2026-09-28 (row choppiness): `height` is no longer animated on leaving
rows — it is a layout property, so animating it reflowed the list every frame for
every departing row. Leaving rows animate `opacity` only and hold their slot for
the fade, and the row exit/stagger tokens above were introduced.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --tb-motion-fast: 0.01ms;
    --tb-motion-base: 0.01ms;
    --tb-motion-slow: 0.01ms;
    --tb-motion-stagger: 0ms;
    --tb-motion-shift: 0px;
    --tb-motion-scale: 1;
    --tb-motion-row-leave: 0.01ms;
    --tb-motion-row-stagger: 0ms;
  }
}
```

`0.01ms` (not `0`) keeps transition events and Vue's `after-leave` hooks firing,
so the settle protocol still completes. JavaScript may read
`matchMedia("(prefers-reduced-motion: reduce)")` as advice only; the tokens stay
the single source of timing.

## Surface choreography

Vue transition names are the vocabulary; each component owns its scoped styles.

| Surface / element      | Transition name | Enter                                                                 | Leave                                                        |
| ---------------------- | --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Palette backdrop       | `palette`       | opacity `--tb-motion-base` ease-out                                   | opacity `--tb-motion-fast` ease-in                           |
| Palette panel          | `palette`       | opacity `--tb-motion-base` + scale from `--tb-motion-scale`, ease-out | opacity `--tb-motion-fast` + scale to `0.98`, ease-in         |
| Palette result rows    | `palette-row` (JS hooks) | height `0 → var(--palette-row-height)` + opacity, delay `min(i, row-cap) * row-stagger` | opacity `--tb-motion-row-leave`; height is **not** animated |
| Strip surface          | `strip`         | opacity `--tb-motion-base` + translateY(calc(-1 * shift)) → 0          | opacity `--tb-motion-fast` + translateY to the negative shift |
| Strip segment *i*      | `strip-seg`     | opacity `--tb-motion-base` ease-out; delay `min(i, cap) * stagger`     | opacity `--tb-motion-fast`; no delay                          |
| Strip control *i*      | `strip-seg`     | opacity `--tb-motion-fast` + translateY(-shift) → 0; delay `(min(n, cap) + i) * stagger` | opacity `--tb-motion-fast`; no delay                          |
| Loading veil           | `veil`          | opacity `--tb-motion-base` ease-in                                    | opacity `--tb-motion-slow` ease-out                           |
| Failure view           | `failure`       | opacity `--tb-motion-base` + card translateY(shift) → 0, ease-out     | opacity `--tb-motion-fast` ease-in                            |
| Hover / selection fill | — (CSS only)    | `background-color --tb-motion-fast` ease-out                          | same                                                          |

`n` is the number of location segments after capping. Worst case (6 segments,
3 controls): last control delay `(6 + 2) * 36ms = 288ms`, plus its fast fade —
about **448ms**, under the 500 ms settle timeout and the spec's 500 ms budget.

Palette rows are the one surface driven from JavaScript rather than a CSS
transition name: `TransitionGroup` with `:css="false"` and `onBeforeEnter` /
`onEnter` / `onLeave` hooks over the Web Animations API, because the entry also
animates `height` and needs the `data-index` stagger from the Vue docs. Row height
is a fixed token, so the height animation moves between two constants and never
measures the DOM while typing.

## Rules

- Animate `opacity` and `transform` only, with one documented exception: palette
  row entry animates `height` between two fixed values so the list unfolds. Entry
  happens only when rows are added, and the row is one line tall, so the reflow is
  bounded. **Row exit must not animate `height`** — doing so reflowed the whole
  list every frame per departing row and read as choppiness during fast typing.
  No layout properties otherwise (width, top, filters). The palette backdrop's
  `backdrop-filter` blur is static.
- Leaving surfaces set `pointer-events: none`; interactive surfaces never accept
  input while `leaving`.
- Palette rows DO stagger on entry (`min(data-index, row-stagger-cap) *
  row-stagger`); no `move` class anywhere (reordering stays instant), and no
  `appear` — the stagger itself is the first-paint effect.
- No `appear` on the other `TransitionGroup`/`Transition` surfaces — their
  entrances carry first paint.
- `will-change` is applied only while the palette panel's transition classes are
  active.
- Focus and keyboard handling are attached to state, never to transition hooks.

## Sequence budgets

Re-baselined 2026-09-27 after the developer judged the first cut too fast. These
are the ceilings the implementation is measured against.

| Sequence                                   | Budget                                      |
| ------------------------------------------ | ------------------------------------------- |
| Any single surface enter or leave          | ≤ 300 ms (`--tb-motion-slow`)               |
| Strip: surface + segments + controls       | ≤ 500 ms total (worst case ≈ 448 ms)        |
| Palette: backdrop + panel                  | ≤ 220 ms                                    |
| Palette rows: entry wave (cap reached)     | ≤ 260 ms (5 × 20 ms + 160 ms)               |
| Palette rows: exit                         | 90 ms (`--tb-motion-row-leave`)             |
| Settle ack after a leave                   | ≈ leave duration (immediate under reduced motion) |
| Main-side settle safety timeout            | 500 ms from deferral (see settle-protocol)  |