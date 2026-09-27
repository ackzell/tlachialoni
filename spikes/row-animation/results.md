# Results: Palette Row Animation Technique

**Run**: 2026-09-27 · `node spikes/row-animation/probe.mjs`
**Environment**: Chromium headless shell (`chromium_headless_shell-1187`), harness
served over localhost, real `buildRows` / `PALETTE_COMMANDS`, query sequence
`devtools` typed one character at a time.

## Verdict table

Probe run with the corrected sampling (see "Corrections during the run" below).

| #   | Technique                                               | Passed   | maxNodes | model rows | Duplicates        | Ghosts | Width stable | Warnings |
| --- | ------------------------------------------------------- | -------- | -------- | ---------- | ----------------- | ------ | ------------ | -------- |
| A   | Plain `v-for`, no animation                             | **PASS** | 15       | 15         | —                 | 0      | yes          | 0        |
| B   | `TransitionGroup`, enter only                           | FAIL     | 22       | 15         | `target.navigate` | 0      | yes          | 0        |
| C   | `TransitionGroup`, enter + leave + `position: absolute` | FAIL     | 22       | 15         | `target.navigate` | 0      | yes          | 0        |
| D   | Plain `v-for` + CSS `@keyframes` entry                  | **PASS** | 15       | 15         | —                 | 0      | yes          | 0        |
| E   | `TransitionGroup` with `move`/FLIP, enter only          | FAIL     | 22       | 15         | `target.navigate` | 0      | yes          | 0        |

## The finding

**The duplication is not caused by leave rules, `position: absolute`, or FLIP. It
is caused by `TransitionGroup` itself, and the row it duplicates is specifically
`target.navigate`.**

Every `TransitionGroup` variant — including B, which has _no leave rule at all_ —
accumulates exactly one extra node, and the duplicate id is always
`target.navigate`. The two non-`TransitionGroup` techniques neither accumulate nor
duplicate.

### Root cause

`buildRows` always emits a "type a target" row while a query is present
(`src/renderer/src/composables/useCommands.ts:48-54`):

```ts
rows.push({ kind: "target", id: "target.navigate", label: `Open ${trimmed}`, detail: "navigate" });
```

The palette row key is `row.id + row.label` (`CommandPalette.vue`), so this row's
key is `target.navigateOpen d`, `target.navigateOpen de`, `target.navigateOpen dev`
— **it changes on every keystroke**. `TransitionGroup` identifies elements by key,
so each keystroke:

1. mounts a new element for the new key, and
2. moves the previous element into its leave lifecycle, holding it in the DOM.

Because the row is replaced on _every_ keystroke, the previous node is still
mid-leave when the next one arrives. The result is a fully opaque duplicate that
stays in the DOM and grows the list — exactly the reported symptom. A plain
`v-for` reuses the existing DOM node for the same position, so nothing accumulates.

The `id` collision makes it worse: both the typed-target row and recent-target
rows use `id: "target.navigate"`, so the duplicate is not distinguishable by id.

### Why C looked worse in the app than in isolation

Candidate C also sets `position: absolute` on leaving rows. Inside the scrolling
`overflow-y: auto` list that additionally overlaid the list and added scroll
range, which is why C showed the _ghost_ artifact on top of the duplication. The
duplication itself, however, is reproduced here by B and E with no `position`
rule at all — so the ghost was a second, separable bug in the same attempt.

## Recommendation

**Adopt technique D: plain `v-for` plus a CSS `@keyframes` entry animation.**

- It passes all five checks, identical to the no-animation baseline A.
- It animates entry (the visible half of the effect and what the developer asked
  for) with no transition lifecycle, so there is no mechanism by which a node can
  be retained.
- No `TransitionGroup`, no `position: absolute`, no `move` class, and no Vue
  transition deprecation warning (0 warnings observed).

**Preconditions for the recommendation to hold**

1. **The `target.navigate` key must be made stable across keystrokes** before any
   `TransitionGroup`-based approach is reconsidered. As long as that row's key
   changes on every keystroke, _any_ keyed transition technique will accumulate
   it. This is the real prerequisite bug, independent of animation choice.
2. Exit animation is not available with D. Rows disappear instantly. If exit
   animation is later required, it must be reconsidered only after (1) is fixed
   and re-tested in this harness.
3. If F/LIP reorder animation is later wanted, technique E must first pass after
   (1); today it fails.

## Adoption cost (SC-003)

| Aspect                  | Cost                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Files touched           | `src/renderer/src/components/CommandPalette.vue` only (add class on new keys + one `@keyframes` + reuse the existing motion tokens) |
| Row key                 | unchanged (`row.id + row.label`) — the key is not part of technique D                                                               |
| Wrapper element         | none; rows stay a plain `<ul><li>` list                                                                                             |
| New dependency          | none; reuses `--tb-motion-fast` / `--tb-motion-ease-out`                                                                            |
| Vue lifecycle relied on | none (this is the point)                                                                                                            |

Alternative if stable keys are fixed later: technique B (TransitionGroup, enter
only) would give the same entry effect with a lifecycle, but it carries the
dependency on stable keys and gains nothing over D for entry-only.

## Corrections during the run

Two probe false positives were fixed before this verdict:

- `scrollHeight` (scroll range) was compared to the height ceiling; it must be
  `clientHeight`. Scrolling legitimately exceeds the collapsed box.
- Rows scrolled out of view were counted as ghosts. A ghost is now only a
  detached or zero-size node.

The ceiling check keeps a small slack for the list's border and padding.

## Caveats

- The harness reproduces the artifact reliably for every `TransitionGroup`
  variant, but it is a harness, not the app. Confirm the adopted technique against
  the real palette in the 004 quickstart S3 before shipping.
- The probe types one character at a time with ~40 ms/400 ms sampling. Real typing
  can be faster; a faster cadence would only increase overlap, so it cannot
  invalidate a passing technique, but it should be re-run for any candidate that
  relies on timing.
- `target.navigate` duplication was reproduced with the query sequence used here.
  It is key-driven, so it reproduces for any non-empty query.
