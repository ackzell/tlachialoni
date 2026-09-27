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
| `setPaletteVisible(false)`             | no     | Renderer-initiated; the renderer already finished its leave |
| `closePalette()` from navigate/failure | no     | Those paths grow to the veil or failure view anyway        |
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

Renderer-initiated palette close: `Esc` / outside click / activation flips the
local shown ref, lets `<Transition>` complete, and only then calls
`setPaletteVisible(false)` + `settled()`. Main is still `paletteOpen` during the
leave, so the shell view remains full-window for free.

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

**Palette close (immediate).**
`Esc` → local shown ref flips → 100 ms leave → after-leave: `settled()` then
`setPaletteVisible(false)` → main clears `paletteOpen`, refocuses the site view,
applies the recalculated mode with no defer.

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