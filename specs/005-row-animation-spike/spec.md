# Feature Specification: Palette Row Animation Technique (Spike)

**Feature Branch**: `005-row-animation-spike`

**Created**: 2026-09-27

**Status**: Complete (2026-09-28) — the technique is chosen and shipped; see
`spikes/row-animation/results.md`

**Input**: User description: "Let's give row animation another shot, or create a spike to see what technique is the best here."

## Why a spike

The first attempt (specs/004-shell-motion, User Story 3) animated palette result
rows with Vue's `<TransitionGroup>` plus enter/leave transitions and
`position: absolute` on leaving rows. In real use the list showed **duplicated,
fully opaque rows stacked vertically, and grew on every matching keystroke**.
Two of the three artifacts had identifiable causes; the duplication did not, and
two blind fix attempts made it worse. It was reverted.

This spike answers one question before any row animation is re-adopted: **which
technique animates row entry and exit without ever accumulating rows, leaving
ghosts, or lagging typing?**

## Scope

- **In scope**: choosing and proving a technique, with a runnable comparison
  harness and measured/observed evidence.
- **Out of scope**: shipping the animation. Adoption is a follow-up change to
  `specs/004-shell-motion/` once a technique passes.

## Method

A standalone harness renders the *real* `buildRows` output with each candidate
technique, with an automated probe that types a query character by character and
asserts, after every keystroke:

1. **No accumulation** — the number of rendered row nodes equals the number of
   model rows (`rows.length`), always.
2. **No duplicates** — no two rendered nodes resolve to the same command id.
3. **No ghost** — no row node is opaque-but-detached, mis-anchored, or outside the
   list's content box.
4. **No width/height jump** — the list's `scrollWidth` and `clientWidth` are
   constant across keystrokes, and its height never exceeds its ceiling.
5. **Responsive** — each keystroke's results are reflected within one frame.

Candidate techniques (see `research.md` for the considered set):

| # | Technique | Sketch |
| - | --------- | ------ |
| A | Plain `v-for`, no animation | Baseline: instant add/remove |
| B | `TransitionGroup`, enter only (no leave) | Fade/rise on entry, instant removal |
| C | `TransitionGroup`, enter + leave, `position: absolute` | The technique that failed in 004 |
| D | Plain `v-for` + CSS `@keyframes` on newly-keyed nodes | Enter only, no leave lifecycle |
| E | FLIP/reorder (`move` class) with enter/leave and a stable key | Movement animated, rows never unmounted unnaturally |

## Requirements

- **FR-001**: The harness MUST render real `buildRows` output, not mock rows.
- **FR-002**: The harness MUST be runnable headlessly and emit a machine-readable
  per-technique verdict for the five assertions in Method.
- **FR-003**: Each candidate MUST be run against the same query sequence so the
  comparison is like-for-like.
- **FR-004**: The spike MUST record, for each candidate, whether it reproduces the
  004 duplication and the two known artifacts (ghost, growth).
- **FR-005**: The spike MUST recommend exactly one technique and state the
  conditions under which the recommendation holds.
- **FR-006**: The recommendation MUST include the Vue-version behavior relied on
  (transition lifecycle, or absence of it) and any console warnings observed.

## Success Criteria

- **SC-001**: All five candidate techniques produce a verdict; none is left
  untested.
- **SC-002**: At least one technique passes all five assertions.
- **SC-003**: The recommended technique's adoption cost is stated (files touched,
  whether it changes the row key, whether it needs a wrapper element).
- **SC-004**: The 004 duplication is either reproduced under its original
  technique or explicitly recorded as not reproducible, with the conditions used.

## Assumptions

- The palette list keeps its current structure: a `<ul>` with `max-height: 46vh`,
  `overflow-y: auto`, `scrollbar-gutter: stable`, and rows keyed
  `row.id + row.label`.
- The row set is driven by `fuzzyScore` ordering, so matches can reorder as the
  query changes.
- Instant removal stays acceptable if no candidate animates exit safely; entry
  animation alone satisfies the spirit of FR-013.
- Adoption, if any, folds back into `specs/004-shell-motion/` rather than becoming
  a separate shipped feature.