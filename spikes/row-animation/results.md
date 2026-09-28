# Results: Palette Row Animation Technique

**Run**: 2026-09-27 (initial) · **Re-run**: 2026-09-28 (after the stable-key fix)
**Environment**: Chromium headless shell (`chromium_headless_shell-1187`), harness
served over localhost, real `buildRows` / `PALETTE_COMMANDS`, query sequence
`devtools` typed one character at a time.

## Verdict table

| #   | Technique                                               | Initial run | After stable-key fix | maxNodes (model 15) | Duplicates | Ghosts |
| --- | ------------------------------------------------------- | ----------- | -------------------- | ------------------- | ---------- | ------ |
| A   | Plain `v-for`, no animation                             | PASS        | PASS                 | 15                  | —          | 0      |
| B   | `TransitionGroup`, enter only                           | FAIL        | **PASS**             | 22                  | —          | 0      |
| C   | `TransitionGroup`, enter + leave + `position: absolute` | FAIL        | **PASS**             | 22                  | —          | 0      |
| D   | Plain `v-for` + CSS `@keyframes` entry                  | PASS        | PASS                 | 15                  | —          | 0      |
| E   | `TransitionGroup` with `move`/FLIP, enter only          | FAIL        | **PASS**             | 22                  | —          | 0      |

The re-run uses the harness's updated key function (`rowKey = row.key`), matching
the app after the fix in `src/renderer/src/composables/useCommands.ts`.

## The finding

**Root cause: a key that changed while the row persisted.** `buildRows` emits a
"type a target" row labelled `Open <query>`, so its key (`id + label`) changed on
**every keystroke**. `TransitionGroup` identifies elements by key, so each
keystroke mounted a new element and held the previous one through its leave
lifecycle. The row was replaced before the previous node finished leaving, so
fully opaque duplicates accumulated and the list grew. Candidate B had no leave
rule at all and still duplicated, which ruled out leave rules, `position:
absolute`, and FLIP as the cause.

**Fix**: `Row.key` is now a stable identity — `target.typed`,
`target.recent:<url>`, `command:<id>` — and the palette binds `:key="row.key"`.
After the fix every technique passes with zero duplicates, which confirms the
diagnosis: the engine was never the problem, the key was.

### Transient node count during a leave

B, C, and E peak at 22 nodes against 15 model rows in the _transient_ sample — a
leaving row coexists with its successor before the leave completes. That is
expected overlap, not accumulation: the settled count always returns to the model
count, and no duplicate ids are ever observed. It is worth knowing that this
overlap is what makes fast typing look "choppy": enter and leave animations run
concurrently on adjacent rows.

## What shipped

**The technique from the Vue docs** (`TransitionGroup` + `:css="false"` + JS
hooks), implemented in `src/renderer/src/components/CommandPalette.vue`:

- `onBeforeEnter` / `onEnter` / `onLeave` drive the Web Animations API (no GSAP
  dependency) using the existing motion tokens read at runtime.
- Enter staggers by `data-index` with the same cap as the earlier CSS approach.
- Height animates `0 ↔ var(--palette-row-height, 34px)`, so rows unfold; because
  the height is a fixed token, nothing is measured while typing.
- Reduced motion collapses each animation to 1 ms, so end states are identical.
- Row height is fixed (`34px`) with `min-width: 0` + ellipsis on the label, so a
  long target can never reflow the list.

This combines the doc's JS-hook technique with the two things the spike proved
are prerequisites: stable keys and a predictable row height.

## Corrections during the initial run

Two probe false positives were fixed before the first verdict:

- `scrollHeight` (scroll range) was compared to the height ceiling; it must be
  `clientHeight`. Scrolling legitimately exceeds the collapsed box.
- Rows scrolled out of view were counted as ghosts. A ghost is now only a
  detached or zero-size node.

The ceiling check keeps a small slack for the list's border and padding.

## Caveats

- The harness reproduces and clears the artifact reliably, but it is a harness,
  not the app. The shipped behaviour was confirmed by hand in `npm run dev`.
- The probe types one character at a time with ~40 ms/400 ms sampling. Real typing
  is faster, which increases enter/leave overlap — observed as a slight
  choppiness during rapid re-population, and tunable via the motion tokens.
- The transient-overlap peak (22 vs 15) is not asserted; only accumulation,
  duplicates, ghosts, width stability, and typing responsiveness are.
