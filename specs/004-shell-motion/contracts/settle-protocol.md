# Contract: Shell Settle Protocol

Extends the 001 IPC contract (`specs/001-minimal-browser/contracts/ipc.md`) with
one renderer → main signal so exit animations are never cut by the shell view's
bounds shrinking. State channels (`state:changed`, `viewport:*`, `palette:*`) are
unchanged and are never deferred — only the visual bounds change waits.

## Channel

| Direction        | Channel         | Payload | Method                |
| ---------------- | --------------- | ------- | --------------------- |
| renderer → main  | `shell:settled` | none    | `ipcRenderer.send`    |

Bridge surface (`src/preload/shell.ts`, typed in `env.d.ts`):

```ts
settled(): void;   // send "shell:settled"
```

No main → renderer message is added. The renderer learns what to animate from the
existing `viewport:loading`, `viewport:ready`, `viewport:failed`, `palette:open`,
`palette:close`, and `state:changed` events.

## Main behavior

`relayout(defer?: boolean)` computes `desiredMode` (`full` | `strip` | `hidden`)
from `paletteOpen || showLoading || failed` → `full`, `stripVisible` → `strip`,
otherwise `hidden`. The applied mode is tracked in `shellMode`. A deferred
collapse keeps the current bounds until:

1. `shell:settled` arrives — apply the recomputed desired mode; or
2. the **500 ms** safety timer expires (`SHELL_SETTLE_TIMEOUT_MS`) — apply; or
3. any later `relayout` produces a desired mode that is not smaller than the
   current one — apply immediately and clear the pending wait (supersede).

Deferral applies only when the shell renderer is loaded and the desired mode
ranks smaller than the current one.

| Call site                              | Defer? | Why                                                        |
| -------------------------------------- | ------ | ---------------------------------------------------------- |
| `handleReady()` (veil leaving)         | yes    | Main-initiated; the veil needs its fade-out                |
| `toggleStrip()` when hiding            | yes    | Main-initiated by the `⌘B` hotkey; the strip needs its leave |
| `closePalette()`                       | yes    | The renderer owns the palette's leave; main keeps the shell full until it settles. When the close lands on the veil or failure view the desired mode is already `full`, so nothing defers |
| `setPaletteVisible(false)`             | no     | Renderer-initiated; the renderer already finished its leave |
| `loadTarget()`, `failure.retry`, `show()` | no  | Growing or first paint; nothing to cut                     |
| Window resize                          | no     | The shell view stays visible; bounds only                   |

Message ordering for deferred paths: broadcast/notify first (so the renderer
starts its leave), then call `relayout(true)`.

## Renderer behavior

`useShell.ts` owns the signaling so components stay declarative:

- `markSurfaceLeaving()` — called from each surface's `@leave` hook; increments a
  counter and arms a **300 ms** fallback timer (longer than any leave, shorter
  than main's safety).
- `markSurfaceLeft()` — called from `@after-leave`; decrements; when the counter
  reaches zero, cancel the fallback and send `settled()`.
- `@leave-cancelled` — decrements without sending; a re-show supersedes the
  collapse on the main side, so no ack is owed.
- The fallback timer guarantees a signal even if a lifecycle hook is missed.
- Under reduced motion the clamped tokens fire `after-leave` near-instantly; the
  protocol needs no special case.

Main-initiated palette close (hotkey): the renderer owns the palette's leave, so
main clears `paletteOpen`, sends `palette:close`, and calls `relayout(true)` — the
shell view stays full-window until the renderer reports finished. The renderer flips
its shown ref, lets the leave play, then `notifyPaletteClosed()` sends `settled()`
and `setPaletteVisible(false)`, which applies the collapsed mode with no defer.

## Sequences

**Veil ready (deferred).**
`did-finish-load` → `handleReady`: persist, `reportLoading(false)`, send
`viewport:ready` → renderer starts the 200 ms veil leave → `relayout(true)` marks
`pendingSettle` (applied mode stays `full`) → after-leave: `settled()` → main
applies `strip` or `hidden`.

**Strip hide (deferred).**
`⌘B` → store write, `broadcastState` → renderer runs the strip leave (~120 ms
surface) → `relayout(true)` marks `pendingSettle` (36 px stays applied) →
after-leave: `settled()` → main applies `hidden`.

**Palette close (deferred).**
`⌘P` / `⌘J` in main → `paletteOpen = false`, `palette:close` → renderer starts the
100 ms leave → `relayout(true)` marks `pendingSettle` (full-window stays applied) →
after-leave: `setPaletteVisible(false)` + `settled()` → main applies the
recalculated mode with no defer. `Esc` takes the same path from the renderer side,
with main still `paletteOpen` until the leave reports.

**Interrupted strip hide.**
Hide marks `pendingSettle`; show arrives before the ack → `relayout(false)` with
`strip ≥ strip` applies immediately and clears pending; the late `settled()` is a
no-op. The strip's cancelled leave never signals, and nothing is owed.

## Failure semantics

- The signal carries no payload and grants no capability; a compromised renderer
  can delay its own window's collapse by at most 500 ms.
- If the renderer is destroyed or unresponsive, the timer opens the gate; motion
  can never block a state change.
- If a deferred collapse is never acknowledged and the window closes first, the
  pending timer is cleared on `closed`.
- The ack is idempotent: extra `settled()` calls with nothing pending are no-ops.