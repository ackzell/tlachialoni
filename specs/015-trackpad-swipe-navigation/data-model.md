# Phase 1 Data Model: Trackpad Swipe History Navigation

No persisted shape changes. The store stays at **schema version 3** as 012 defined
it; this feature adds, reads, and writes **no** persisted field. The gesture, the arm
state, and the overlay are entirely runtime and are never written to
`state.json` nor carried on `state:changed`. The authoritative persisted shape
remains `specs/012-multi-window/contracts/state.schema.json`.

## Persisted

None. `WindowRecord` is untouched. There is no per-window preference for the
gesture: it is always on, keyboard-first, and carries no user configuration.

## Runtime entities

### Gesture

One in-progress two-finger horizontal movement, owned by one `AppWindow`.

| Attribute | Type | Notes |
| --- | --- | --- |
| `phase` | `"idle" \| "active" \| "done"` | `begin()` starts `active`; `end()` / idle closes it |
| `sumX` | number | Accumulated horizontal travel, normalized so **positive = toward Back** |
| `sumY` | number | Accumulated vertical travel, for the dominant-axis test |
| `armed` | `HistoryDirection \| null` | Non-null once `ARM_DISTANCE` is crossed with history available |
| `committed` | boolean | True after this gesture fired once; blocks a second commit |

The gesture is never persisted and never crosses windows.

### Arm state (the overlay signal)

| Attribute | Type | Notes |
| --- | --- | --- |
| `direction` | `"back" \| "forward"` | Determines the edge (Back → left, Forward → right) |
| `progress` | number `0..1` | `0` at `ARM_DISTANCE`, `1` at `COMMIT_DISTANCE`; drives the overlay's intensity |

Arm state is pushed as `HistoryArmed | null` on the `history:armed` channel and held
by the shell renderer in a `historyArmed` ref. It is transient: it exists only while
a gesture is armed.

### Shared predicate

```text
isHistoryArmedVisible(armed, paletteOpen) = armed !== null && !paletteOpen
```

Main uses it to decide whether the arm forces the shell to `full`; the renderer uses
it to decide whether `HistoryOverlay` mounts. Both read the same function so the
overlay and the overlay's pane cannot drift (mirrors 009 FR-004).

### Controller inputs and outputs

`src/main/shell/history-gesture.ts` — pure, no timers, time injected.

| Input (`update` sample) | Type | Meaning |
| --- | --- | --- |
| `deltaX` | number | Horizontal travel since the last sample, normalized positive = Back |
| `deltaY` | number | Vertical travel since the last sample |
| `scrollable` | boolean | Overscroll gate: `true` = page consumed the scroll, `false` = at a boundary |
| `canGoBack` | boolean | `navigationHistory.canGoBack()` for this window |
| `canGoForward` | boolean | `navigationHistory.canGoForward()` for this window |
| `now` | number | Monotonic ms, injected for testability and idle/cooldown logic |

| Output | Type | Meaning |
| --- | --- | --- |
| `armed` | `HistoryDirection \| null` | Current armed direction after this step |
| `commit` | `HistoryDirection \| null` | Direction to navigate now, or `null` |

| Method | Effect |
| --- | --- |
| `begin()` | Starts a new gesture (resets accumulators, `committed = false`) |
| `update(sample)` | Advances the gesture; returns the current outcome |
| `end()` | Closes the gesture; clears arm; returns the outcome |
| `reset()` | Abandons the gesture (blur, navigation, surface opened); clears everything |

### Constants (tuning values)

| Constant | Approx. value | Requirement |
| --- | --- | --- |
| `dominantRatio` | `1.2` | FR-003 (horizontal must clearly dominate) |
| `armDistance` | tuning | FR-005 (overlay appears) |
| `commitDistance` | `> armDistance`, tuning | FR-007 (navigation fires) |
| `releaseOffset` | `< armDistance`, tuning | FR-006 (hysteresis before clearing on reversal) |
| `idleMs` | ~150 | FR-004 (close a gesture stream that never emits an explicit end) |
| `swipeGuardMs` | ~300 | FR-014/section 7 (ignore an OS `swipe` that shadowed a trackpad gesture) |

Concrete distances depend on the units the M0 spike reports (pixels vs scroll ticks)
and are fixed at implementation; the requirement is only the ordering
`releaseOffset < armDistance < commitDistance`.

## State machine: gesture

```text
                   dominant-horizontal
        idle ─────────────────────────────► active (accumulating)
          ▲                                     │
          │ begin()                             │ |sumX| >= armDistance AND history in dir
          │                                     ▼
          │                                  armed ── progress 0 → 1 ──┐
          │                                     │                      │
          │   end() / reset() / blur /          │ |sumX| >= commitDistance
          │   reverse < releaseOffset           ▼                      ▼
          └────────────────────────────────── idle ◄──────── committed (navigate once)
                                                                      │
                                              further travel ignored ─┘ (until next begin)
```

Transitions and effects:

| Event | Arm/commit effect | Shell effect |
| --- | --- | --- |
| Gesture begins, vertical-dominant | none (treated as scroll) | none |
| `scrollable === true` (page consumed it) | no arm/commit | none |
| Horizontal-dominant past `armDistance`, history available | `armed = direction`, `progress` rises | shell → `full`, `history:armed` sent |
| Crosses `commitDistance` | navigate once, arm cleared | shell collapses (deferred) |
| Ends / reverse below `releaseOffset` before commit | arm cleared, no navigation | shell collapses (deferred) |
| History unavailable in that direction | no arm (FR-008) | none |
| Blur / hide / close | `reset()` | arm cleared, shell collapses |
| Another source navigates (`did-navigate*`) | `reset()` | arm cleared |
| Palette / veil / failure / status / dev preview opens | detection paused, `reset()` | none |

## Invariants

- Arm state is `null` unless a gesture is in progress with history available in the
  swiped direction.
- A gesture commits at most once; released momentum never produces a second
  navigation (FR-004, SC-004).
- The overlay and main's `full` shell mode derive from the same shared predicate, so
  they cannot disagree.
- No persisted field is read or written; the guest page is never read, injected, or
  modified (FR-009, SC-007).
- All state is per `AppWindow`; no cross-window channel or shared flag is introduced
  (FR-015).
