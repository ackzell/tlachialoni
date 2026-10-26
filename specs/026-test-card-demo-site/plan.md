# Implementation Plan: Test Card Demo Site

**Branch**: `026-test-card-demo-site` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-test-card-demo-site/spec.md`

## Summary

Add a small Vite + Vue 3 single-page app at `examples/test-card`, started by
`pnpm test-card` and served on the default local target. It is the guest page for
recording Tlachialoni clips: a calm, neutral test card with three Vue Router
pages, one clearly marked edit-points module, a `sessionStorage` load proof, and
a local JSON probe.

The edit points are a reactive config object plus CSS custom properties in one
file, `src/edit-points.ts`. Vite HMR updates the page in place; the module
self-accepts its updates so a save does not force a full reload and the load
count stays put. The app is a real Vue SPA with named components, so the Vue
DevTools extension inspects a real component tree and reactive state. No runtime
dependency is added beyond Vue and Vue Router; Vite and the Vue plugin already
exist in the repository.

The example is repository demo content. It is not bundled into the packaged
Tlachialoni app and adds no shell, preload, main-process, or stored-state change.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Vue 3.5 `<script setup>`, Node 24.22

**Primary Dependencies**: Vue 3.5; Vue Router 4 (new, the only added runtime
dependency); Vite 7 and `@vitejs/plugin-vue` (existing dev dependencies); system
font stack. No UI, state, test, or icon dependency.

**Storage**: Browser `sessionStorage` for the per-tab load proof, one JSON value
under `test-card:load-proof`. No application store, database, cookie, or
`localStorage` change.

**Testing**: Vitest unit tests for the pure load-proof, probe URL, and edit-point
normalization helpers; manual quickstart for the six visual scenarios. Checks:
`pnpm check`, `pnpm test`, `pnpm typecheck` (extended to the example).

**Target Platform**: Chromium inside Tlachialoni (Electron 44) on macOS, served
from a local Vite dev server. Recording target: 1440×900 at 2× scale. The page
also works in any current Chromium.

**Project Type**: desktop application plus one local demo web app; a single Vite
SPA under `examples/test-card`.

**Performance Goals**: a saved edit reaches the screen in under one second without
a full reload; the local probe settles in under one second; route changes are
instant; the idle page does zero work and paints identical consecutive frames.

**Constraints**: no external fonts, images, services, or requests; no shell or
preload integration; no dependency beyond Vue and Vue Router; neutral monochrome
page with at most one accent; follows the device color scheme; three pages plus a
fallback; one marked edit file; placeholder copy in one marked location; the app
is not bundled into the packaged artifact.

**Scale/Scope**: 3 routes plus fallback, about 10 small modules/components, 1
static JSON endpoint, 1 root script, 1 example TypeScript config, 3 unit-test
files, and 2 short docs updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / rule | Assessment |
|------------------|------------|
| I. Chromeless by default | PASS — the example is guest content. It adds no shell surface, strip, title bar, or window chrome, and changes no shell default. |
| II. The Guest Page is Sacred | PASS — the demo is an ordinary guest page with no preload, Node, or shell access. Tlachialoni neither injects into it nor reads its state. It is loaded as a normal local target. |
| III. Keyboard-First Ergonomics | PASS — no shell capability changes. Inside the page, navigation and the primary actions use native links and buttons with visible focus states. |
| IV. Real Chromium DevTools, Docked | PASS — the app exists to exercise real docked DevTools and the Vue DevTools extension. It uses no substitute and changes no dock behavior. |
| V. One Target Per Window | PASS — the app is one local target. Vue Router keeps the three pages inside one document, so the target stays single. |
| VI. Identity Through Tlapalli | PASS — Tlapalli governs the shell, not guest content. The demo deliberately does not consume theme tokens. Shell themes and the DevTools theme repaint unchanged; the page stays neutral. |
| Security & Isolation | PASS — the page has no privileged API, no external host, and one same-origin static JSON request. The Vue DevTools extension remains developer-installed in the guest session, never bundled. |
| Packaging & Distribution | PASS — `examples/` is outside the packaged `out/**` and `resources/**` file list. The app remains standalone and unchanged. |
| Development Workflow & checks | PASS — specs precede code; the example is covered by `pnpm check`, `pnpm test`, and an added example typecheck. No spike is needed because Vite, Vue, and Vue Router are established. |

No violations. Complexity Tracking is not required.

**Post-design re-check (after Phase 1)**: the design adds one example app, one
root npm script, one typecheck script, one root runtime dependency (`vue-router`),
three unit-test files, and two documentation updates. It adds no shell, preload,
main-process, packaged, or persisted surface. Every gate above still passes, and
no complexity justification is needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-test-card-demo-site/
├── plan.md                       # This file
├── research.md                   # Phase 0 output
├── data-model.md                 # Phase 1 output
├── quickstart.md                 # Phase 1 output
├── contracts/
│   └── test-card.md              # Phase 1 output
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
examples/test-card/
├── README.md                     # NEW: start command, edit points, recording map
├── index.html                    # NEW: mount point, critical scheme style, inline favicon
├── vite.config.ts                # NEW: root, Vue plugin, port 3000, SPA fallback
├── tsconfig.json                 # NEW: strict example typecheck
├── public/
│   └── probe.json                # NEW: static local probe response
└── src/
    ├── main.ts                   # NEW: app, router, one-time load proof, styles
    ├── App.vue                   # NEW: shared frame, edit vars, header, RouterView
    ├── router.ts                 # NEW: three routes, titles, fallback
    ├── edit-points.ts            # NEW: THE edit file — reactive config + CSS vars + HMR
    ├── styles.css                # NEW: neutral tokens, scheme, type scale, layout
    ├── lib/
    │   ├── load-proof.ts         # NEW: sessionStorage counter + time (DOM-free core)
    │   ├── probe-url.ts          # NEW: deterministic local probe URL (pure)
    │   └── probe.ts              # NEW: browser fetch, timing, readable result
    ├── components/
    │   ├── PageHeader.vue        # NEW: identity, nav, load proof
    │   ├── LoadProof.vue         # NEW: large counter + last-load time
    │   └── LandmarkPanel.vue     # NEW: heading, swatch, button, status card
    └── views/
        ├── CardOne.vue           # NEW: page 01, unique specimen
        ├── CardTwo.vue           # NEW: page 02, unique specimen
        ├── CardThree.vue         # NEW: page 03, unique specimen
        └── NotFound.vue          # NEW: unknown-path fallback

tests/unit/
├── test-card-load-proof.test.ts  # NEW: counter, persistence, fallback
├── test-card-probe-url.test.ts   # NEW: unique local URL
└── test-card-edit-points.test.ts # NEW: value normalization + CSS vars

package.json                      # MODIFIED: test-card + typecheck:example + vue-router
pnpm-lock.yaml                    # MODIFIED: vue-router resolution
README.md                         # MODIFIED: Development section points at the example
```

**Structure Decision**: One Vite SPA under `examples/test-card`, reusing the
repository's existing Vite, Vue, and Vue plugin installation. The root script
runs that config directly, so the maintainer installs once and starts the page
with one command. Vue Router keeps the three pages in one document: link and
history moves do not count as full loads, which is what makes the load proof
distinguish a reload from navigation. `edit-points.ts` is the only file the
recording edits; all other modules consume it. The example has no package of its
own, no workspace entry, and no second install step.

## Complexity Tracking

> No constitution violations — no justification needed. The example is guest
> content outside the packaged artifact, and the only new runtime dependency is
> Vue Router.
