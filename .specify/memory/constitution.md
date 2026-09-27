# Tlachialoni Constitution

## Core Principles

### I. Chromeless by Default

The window shows the developer's work and nothing else. Every shell surface is
transient: the drag strip is hidden until explicitly toggled, the command palette
exists only while invoked, and the failure view appears only when the target is
unreachable. The tool MUST NOT ship a URL bar, tab strip, menu bar, status bar,
or any always-visible browser chrome. When all shell surfaces are dismissed, the
visible tool chrome is zero pixels.

Rationale: the entire value of this tool is a distraction-free viewport for a
running app. Any permanent chrome erodes that value and duplicates the browser
the developer already has.

### II. The Guest Page is Sacred

The developer's site (the guest page) renders in an isolated, sandboxed context
with no privileged runtime access. The shell MUST NOT persistently modify the
guest page's DOM, styles, or scripts. The single sanctioned exception is the
armed element picker's transient overlay, which MUST be removed on selection,
cancel, or navigation.

Rationale: the tool inspects an application under development. Polluting that
application with the tool's own code would corrupt the very thing being
debugged and invalidate frontend work.

### III. Keyboard-First Ergonomics

Every shell capability MUST be reachable from the keyboard and listed in the
command palette. No capability may depend on discovering a hidden mouse target,
and hover affordances are accelerators, never the only path. Keybindings are
documented and stable.

Rationale: a chromeless window removes the menus and buttons users normally
navigate; keyboard completeness is what makes zero chrome livable.

### IV. Real Chromium DevTools, Docked

Frontend inspection MUST use genuine Chromium DevTools docked inside the same
window as the page (bottom, right, or left). Reimplementations, embedded
substitutes, or forced-separate DevTools windows are not acceptable. Dock
position and open state persist across launches.

Rationale: the tool exists for frontend debugging; only the real DevTools
provide the panels, protocol, and behavior developers rely on — and docking is
why the runtime was chosen.

### V. One Target Per Window

Each window renders exactly one http/https target at a time. Tabs and target
multiplexing within a window are prohibited. Multiple independent instances MAY
run concurrently so parallel related projects can be open side by side; instances
do not control one another and each window is responsible only for its own
target. The default target is `http://localhost:3000`; any other target is one
palette edit away.

Rationale: one target per window keeps the window and its DevTools pairing
simple to reason about. Parallel projects are a real need, but they belong in
separate windows rather than tabs — the browser the developer already has is
where multi-target browsing belongs.

### VI. Identity Through Tlapalli

The shell's visual language comes exclusively from the Tlapalli theme system:
its mineral variants (obsidian, quartz, jade, amethyst, turquoise, lapis lazuli,
gold, fire opal), dark and light modes, monochrome discipline, and Source Code
Pro typography. Colors MUST derive from Tlapalli tokens, not ad-hoc values.

Rationale: a personal tool should feel like its owner's work, and a single token
source keeps the small UI coherent without a design system of its own.

## Technology Foundations

- **Runtime**: Electron (current stable, 44.x line). Chosen because docked
  Chromium DevTools are native to it. NW.js and Electrobun were evaluated and
  rejected specifically because neither docks Chromium DevTools in-window.
- **Build**: electron-vite, scaffolded from its Vue + TypeScript template,
  which understands Electron's main/preload/renderer split.
- **Checks**: Vite+ supplies lint, format, and test through `vp check` and
  `vp test`. `vp dev` / `vp build` MUST NOT replace electron-vite's dev/build;
  Vite+ is a checks layer, not the app build.
- **UI**: Vue 3 + VueUse + TypeScript. Node 24 already satisfies every
  toolchain requirement; no runtime pin is required.
- **State**: a small JSON store under Electron's `userData` directory, safe for
  concurrent instances (shared preferences and merged recents; per-window values
  are last-writer-wins). No database, no config-file editing by the user.

## Security & Isolation Requirements

- The guest view MUST run sandboxed with context isolation and no Node access.
- Navigation is limited to http/https. Other schemes entered via the palette
  MUST be rejected with visible feedback.
- Popups and `window.open` from the guest MUST open in the system browser, never
  inside the tool.
- Transient picker injection MUST clean up on selection, cancel, or navigation;
  no residual listeners or elements may remain.

## Development Workflow

- Spec Kit drives development: constitution → `/speckit.specify` → clarify →
  plan → tasks → implement. Specs precede code for every feature.
- Risk retirement is spike-first. The docked-DevTools-in-a-frameless-window
  proof MUST succeed before UI is built on top of the architecture. If the
  architecture assumption fails, the fallback is documented before proceeding.
- The repository is MIT-licensed and runs from source (`npm run dev`).
  Packaging, code signing, and distribution are explicitly deferred until the
  interaction model is proven.
- All changes MUST pass `vp check`, and `vp test` where tests exist, before
  commit.

## Governance

- This constitution supersedes ad-hoc decisions; conflicts resolve in its favor.
- Amendments require a documented change and a semantic version bump: MAJOR for
  principle removal or redefinition, MINOR for a new principle or materially
  expanded guidance, PATCH for clarifications that do not change meaning. The
  Last Amended date is updated with every amendment.
- Reviews and Spec Kit checklists MUST verify constitutional compliance.
  Complexity or scope must be justified against Principle V (One Target Per
  Window); proposals that violate a principle require an amendment first.

**Version**: 2.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
