# Implementation Plan: Shell Motion

**Branch**: `004-shell-motion` | **Date**: 2026-09-27 | **Spec**: `specs/004-shell-motion/spec.md`

**Input**: Feature specification from `/specs/004-shell-motion/spec.md`

## Summary

Give every transient shell surface a restrained entrance and exit so nothing
pops in or cuts out, without ever delaying input. The palette grows and shrinks
(scale + fade over a fading backdrop), the drag strip eases in and then
introduces itself — location segments (split on `:` and `/`) fade in with a
capped stagger, controls drop in after them, and the reveal replays on every
navigation — palette rows animate only when they newly match, and the loading
veil and failure view cross-fade instead of swapping. All timings come from one
small set of project-local motion tokens; the system reduced-motion preference
collapses everything to instant.

The one architectural change is coordination: main currently shrinks or hides
the shell `WebContentsView` the moment an overlay flag clears, which would cut
every exit animation. Main will defer that *visual* relayout for the two
main-initiated collapses (veil ready, strip hide) until the renderer reports its
leave finished (`shell:settled`), with a 400 ms safety timeout so motion is
always best-effort and never blocks state. Renderer-initiated closes (palette
dismissal) are already ordered after the leave, so they apply immediately.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24.21 (development); Electron 44.4.5
(Chromium 152, bundled Node 24.18)

**Primary Dependencies**: Vue 3.5 (built-in `<Transition>` / `<TransitionGroup>` —
no new dependency), VueUse, electron-vite 5, Vite+ 1.0.0-rc (`vp check` / `vp test`)

**Storage**: none new — the 001 persisted store (`schemaVersion`, `PersistedState`)
is untouched; motion is runtime-only and follows no new preference

**Testing**: Vitest via `vp test` for the pure segment splitter
(`splitTargetLabel`); manual and slow-motion validation for overlays, because the
shell lives in a `WebContentsView` with no DOM test harness

**Target Platform**: macOS 13+ (Apple silicon), matching 001

**Project Type**: desktop app (Electron main + preload + renderer)

**Performance Goals**: each surface transition settles within 200 ms and the full
strip sequence within 400 ms (spec SC-002); transitions animate opacity and
transform only, so frames stay on the compositor (60 fps); zero dropped
keystrokes while transitions run (SC-003)

**Constraints**: motion lives only in the shell renderer — the guest page is never
touched; shell-view bounds changes that would hide a still-animating surface are
deferred to a renderer ack with a timeout; reduced motion collapses all timing
tokens to `0.01ms` so end states are identical

**Scale/Scope**: four surfaces (palette, strip, veil, failure view), palette rows,
and micro-states; roughly ten files touched across renderer, preload, and main

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / requirement (constitution v2.1.0) | Plan compliance |
| --------------------------------------------- | --------------- |
| I. Chromeless by Default | Transitions animate only existing transient surfaces; the deferred relayout guarantees the shell view hides once a leave settles, so dismissed chrome still returns to zero pixels (FR-007, SC-005) |
| II. The Guest Page is Sacred | All motion is renderer-local to the shell; no guest DOM, styles, or scripts are touched; the strip still overlays without reflowing the page (FR-008) |
| III. Keyboard-First Ergonomics | Motion never gates a keyboard affordance: palette focus is immediate on show, leaving surfaces stop accepting pointer events, no keyboard path waits on an animation (FR-003, FR-018); no new commands or settings |
| IV. Real Chromium DevTools, Docked | Untouched — no changes to docking, toggling, or persistence |
| V. One Target Per Window | Untouched — motion is per-window and instances stay independent |
| VI. Identity Through Tlapalli | Motion adds no colors and no new painted surfaces; every painted value remains a Tlapalli token. Timing tokens are project-local (Tlapalli defines colors, not motion) and are explicitly timing/transform-only |
| Technology Foundations | Vue's built-in transitions keep the dependency list unchanged; electron-vite builds, Vite+ remains the checks layer; the JSON store is untouched |
| Security & Isolation | One added IPC signal (`shell:settled`) carries no payload and grants no capability; guest isolation, local-only navigation, and picker cleanup are unchanged |
| Packaging & Distribution | Motion CSS is bundled by the existing renderer build; no new runtime assets and no packaging changes |
| Development Workflow | Spec precedes code (this document); `vp check` and `vp test` must pass before commit; validation scenarios below retire the coordination risk |

**Gate result**: PASS — no violations. Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: PASS. `contracts/settle-protocol.md`
keeps the added IPC inert and bounded (one no-payload ack plus a 400 ms safety
timeout); `contracts/motion-tokens.md` keeps motion to timing/transform tokens
with no color values, so Principle VI stays intact; `data-model.md` adds no
persisted state; the quickstart proves zero-chrome, guest-untouched, and
reduced-motion end states. No new scope was introduced.

## Project Structure

### Documentation (this feature)

```text
specs/004-shell-motion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (motion tokens, settle protocol)
├── checklists/
│   └── requirements.md  # /speckit.specify output
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── ipc.ts                       # + ipcMain.on("shell:settled") handler
│   └── shell/
│       └── window.ts                # tracked shell mode + deferred relayout
├── preload/
│   └── shell.ts                     # + settled() bridge method
└── renderer/
    └── src/
        ├── main.ts                  # imports styles/motion.css
        ├── App.vue                  # Transition wrapper per surface
        ├── env.d.ts                 # + settled(): void on the API type
        ├── styles/
        │   ├── base.css             # (unchanged)
        │   └── motion.css           # NEW: motion tokens + reduced-motion clamp
        ├── composables/
        │   └── useShell.ts          # palette shown-state, settle signaling
        ├── utils/
        │   └── target.ts            # + splitTargetLabel()
        └── components/
            ├── CommandPalette.vue   # panel/backdrop transition, TransitionGroup rows
            ├── DragStrip.vue        # surface/segments/buttons choreography
            ├── FailureView.vue      # enter/leave fade
            └── LoadingVeil.vue      # leave fade
tests/
└── unit/
    └── target.test.ts               # + splitTargetLabel cases
```

**Structure Decision**: Keep the 001 layout — the shell stays a single Vue
renderer entry hosting all surfaces, and the only cross-process addition is the
settle ack between that renderer and `main/shell/window.ts`. Motion tokens live in
a dedicated renderer stylesheet alongside the existing `base.css` rather than in
the Tlapalli-generated module, because Tlapalli defines colors only.

## Delivery Order

1. **M1 — Tokens and the splitter**: `styles/motion.css` with the named timing set
   and the reduced-motion clamp; `splitTargetLabel()` in `utils/target.ts` with
   unit tests.
2. **M2 — Main coordination**: `shell:settled` IPC (preload, ipc, window),
   tracked shell mode, deferred relayout with the 400 ms safety timeout.
3. **M3 — Surface transitions**: `App.vue` transitions for veil, failure, and
   strip; palette grow/shrink in `CommandPalette.vue`; settle signaling from
   `useShell.ts` with the renderer-side fallback timer.
4. **M4 — Choreography**: strip segment stagger and sequential controls with the
   capped delays and replay-on-navigation keying; palette row enter/leave.
5. **M5 — Validation**: quickstart scenarios (slow-motion capture, rapid toggles,
   reduced motion, long targets, fast typing), `vp check`, `vp test`,
   `npm run typecheck`; record results in `validation.md`.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Main hides the shell view before an exit animation finishes | Defer relayout behind the `shell:settled` ack for the two main-initiated collapses; renderer-initiated closes already order the ack after the leave |
| An exit never completes (Vue leave hook missed, renderer busy) | Renderer fallback timer (~300 ms) sends the ack anyway; main's 400 ms timeout applies the relayout even with no ack |
| A late ack after a superseded relayout hides a re-shown surface | Supersede rule: a larger desired mode applies immediately and clears any pending settle; acks with nothing pending are no-ops |
| Animating `backdrop-filter` blur is expensive | Backdrop animates opacity only; blur radius is static |
| Fast typing makes rows flicker or lag | Rows animate enter/leave at 100/80 ms with no stagger and no move class; surviving rows keep their keys and never re-animate |
| Long targets push the sequence past budget | Stagger is capped (`min(segment index, cap)`); delays use the same token, so total stays under 400 ms |
| Reduced-motion users still wait for ack | Clamped `0.01ms` durations fire `after-leave` immediately; JS never adds delay on top |
| Motion is mistaken for a functional delay | Leaving surfaces set `pointer-events: none`; focus and typing are never tied to a transition |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.