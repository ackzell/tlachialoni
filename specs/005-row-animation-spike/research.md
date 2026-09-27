# Phase 0 Research: Palette Row Animation Technique (Spike)

## R1. Where to run the harness: Chromium, not jsdom

**Decision**: Run candidates as real Vue pages in Chromium (the Playwright
headless shell already cached at `~/Library/Caches/ms-playwright`), driven by a
small probe script.

**Rationale**: The failure under investigation lives in the transition lifecycle —
specifically what happens to nodes while a leave is pending and while the list
scrolls. jsdom implements neither transitions nor layout, so it cannot observe the
ghost, the growth, or the duplication. Chromium can observe all three.

**Alternatives considered**: jsdom/Vitest (`@vue/test-utils`) — no transition
lifecycle, no `scrollWidth`/`clientWidth`; would produce false confidence.
Rejected. A screenshot-only manual check — not machine-verifiable, and the whole
point is a repeatable verdict. Rejected.

## R2. Candidate set

**Decision**: Test five techniques, spanning "no animation" to "full FLIP".

| # | Technique | What it probes |
| - | --------- | -------------- |
| A | Plain `v-for` (current shipped state) | Baseline; proves the harness can pass |
| B | `TransitionGroup`, `tag="ul"`, enter only | Is entry-only safe? |
| C | `TransitionGroup`, enter + leave, `position: absolute` (the 004 technique) | Reproduces the 004 artifact? |
| D | Plain `v-for` + CSS `@keyframes` on newly added keys | Entry animation with no lifecycle at all |
| E | `TransitionGroup` with `move` (FLIP) + stable keys, enter only | Does reorder animation reintroduce artifacts? |

**Rationale**: A is the control. C is the regression under investigation. B and D
differ in *whether a lifecycle exists at all* — the key question, because a
lifecycle is what can leave a node behind. E tests whether reorder animation
(every keystroke changes ordering via `fuzzyScore`) is the actual trigger.

**Alternatives considered**: only testing B and D (the two plausible winners) —
fails SC-004, which requires attempting to reproduce the 004 artifact. Rejected.

## R3. What the probe asserts

**Decision**: After each keystroke, and again after transitions settle, assert:

1. rendered row nodes === model rows (`rows.length`)
2. no two rendered nodes share a command id
3. no rendered node is detached, mis-anchored, or outside the list's content box
4. `clientWidth` constant across keystrokes; height never exceeds the ceiling
5. model rows are reflected within one frame of the keystroke

**Rationale**: These five are exactly the reported symptoms (duplication, ghost,
growth, width jump) plus the non-negotiable typing responsiveness from 004's
FR-003/FR-014.

## R4. Independent variables to record

**Decision**: For each candidate record: console warnings (notably Vue's
`position: absolute` transition deprecation), the DOM node count over time, whether
rows leave the node tree at all, and whether `move` classes fire.

**Rationale**: The 004 investigation surfaced a Vue deprecation warning that had
been firing since before the change; knowing which techniques trigger it informs
the recommendation's cost (SC-003, FR-006).

## R5. Serving the harness

**Decision**: Serve the harness over a tiny static HTTP server so candidates can
`import` the app's real modules (`useCommands.ts`, `commands.ts`) as ES modules,
with `vue` resolved from `node_modules`.

**Rationale**: Reusing the real `buildRows` satisfies FR-001 and prevents the
harness from validating behavior the app does not actually have.

**Alternatives considered**: duplicating the row logic in the harness — would
drift from the app and invalidate the result. Rejected.