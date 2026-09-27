# Phase 1 Data Model: Shell Motion

No persisted state changes. The 001 `PersistedState` schema (`schemaVersion`,
target, recents, dock mode, DevTools open, strip visibility, bounds, variant,
color mode) is untouched: motion is runtime-only and follows the OS
reduced-motion preference rather than a stored setting.

What follows are the runtime entities the feature introduces or formalizes.

## Surface transition lifecycle (renderer, per surface)

One instance per surface: palette, drag strip, loading veil, failure view. Palette
rows and strip segments are child elements of their surface's lifecycle.

| State      | Meaning                                              | Transitions                                                                 |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `idle`     | Surface not mounted or fully settled                 | show → `entering`; hide is a no-op                                            |
| `entering` | Enter classes applied; surface is interactive        | entered → `idle`; hide → `leaving` (reversal)                                 |
| `leaving`  | Leave classes applied; mounted, `pointer-events: none` | left → `idle` + settle signal; show → `entering` (cancels the leave)         |

**Invariants**

- A surface accepts input in `idle` and `entering`; never in `leaving`.
- The settle signal is emitted exactly once per completed leave — on `left`, or
  from the fallback timer if the lifecycle hook is missed; cancelled leaves do
  not signal.
- Reversal is class-level only; no state is persisted and no queue is kept, so a
  rapid show/hide/show ends in `entering`/`idle` with no residue (FR-004).

## Relayout gate (main, one per window)

Guards shell-view bounds changes so a leave is never cut.

| Field          | Type                        | Meaning                                                          |
| -------------- | --------------------------- | ---------------------------------------------------------------- |
| `shellMode`    | `full` \| `strip` \| `hidden` | The bounds currently applied to the shell view                   |
| `desiredMode`  | `full` \| `strip` \| `hidden` | Recomputed on every `relayout()` from overlay flags + strip flag |
| `pendingSettle`| boolean                     | A smaller relayout is waiting on the renderer ack or the timeout  |
| `settleTimer`  | timer \| null               | 500 ms safety timeout while `pendingSettle`                       |

**Transitions**

| Trigger                                   | Condition                                      | Effect                                                        |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `relayout(defer=true)` from veil-ready or strip-hide | `desiredMode` ranks smaller than `shellMode` and the shell is loaded | Enter `pendingSettle`; keep current bounds; start the timer   |
| `shell:settled` from the renderer         | `pendingSettle`                                | Clear pending and timer; apply the recomputed desired mode    |
| Timer expires (400 ms)                    | `pendingSettle`                                | Apply the recomputed desired mode                             |
| Any `relayout(defer=false)` with a larger-or-equal desired mode | —                                | Apply immediately; clear pending and timer (supersede rule)   |
| Window resize or shell not loaded         | —                                              | Apply immediately (no deferral)                               |

**Invariants**

- State broadcasts and `viewport:*` messages are never deferred — only the
  visual bounds change is.
- An ack with nothing pending is a no-op (late acks are harmless).
- If the shell renderer never acks, the gate opens at 400 ms; motion is
  best-effort and can never block the next state.

## Target label segments (pure function)

`splitTargetLabel(label: string): string[]`

| Aspect    | Rule                                                                  |
| --------- | --------------------------------------------------------------------- |
| Input     | The display label produced by `describeTarget` (host + path + search) |
| Split     | On `:` and `/`                                                        |
| Separators | Kept attached to the word they follow, so `join("")` reproduces the label (`localhost:5173/api` → `localhost:`, `5173/`, `api`) |
| Kept together | All other characters, including `?`, stay inside a segment (`users?tab=1`) |
| Ordering  | Preserved left to right; index drives the stagger delay               |
| Degenerate | Empty or malformed label yields a single segment (the whole string)   |

**Invariant**: concatenating the units reproduces the label exactly; the function
exists for presentation only and never feeds navigation or policy.

## Motion token set (static contract)

Defined once in `styles/motion.css`; see `contracts/motion-tokens.md` for values.
No entity state — included here to note it is pure presentation and carries no
persistence, no colors, and no per-variant values.