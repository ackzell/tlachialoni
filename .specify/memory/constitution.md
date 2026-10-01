# Tlachialoni Constitution

## Core Principles

### I. Chromeless by Default

The window shows the developer's work and nothing else. Every shell surface is
transient: the drag strip is hidden until explicitly toggled, the command palette
exists only while invoked, and the failure view appears only when the target is
unreachable. The tool MUST NOT ship a URL bar, tab strip, menu bar, status bar,
or any always-visible browser chrome. When all shell surfaces are dismissed, the
visible tool chrome is zero pixels. Chrome is counted by painted pixels: an
invisible, pointer-only drag region across the top of the window is permitted and
is not the strip — the strip itself remains hidden until toggled, or transiently
revealed by the pointer. The strip MAY also be docked as a per-window,
explicitly toggled title bar that stays visible until toggled off and displaces
the guest page below it rather than overlaying it; this docked layout is opt-in,
never the default, and is the layout analogue of the permitted pinned strip.
Absent an explicit toggle, the default remains zero painted chrome. The
zero-pixel rule constrains chrome over the guest page; a window that has never
loaded a target has no page to obscure, so a decorative identity watermark on
that empty page is permitted, provided it is removed as soon as a target commits
and never intercepts input.

Rationale: the entire value of this tool is a distraction-free viewport for a
running app. Any permanent chrome erodes that value and duplicates the browser
the developer already has — so the default stays chromeless, and the docked title
bar exists only because the developer explicitly asked for it.

### II. The Guest Page is Sacred

The developer's site (the guest page) renders in an isolated, sandboxed context
with no privileged runtime access. The shell MUST NOT persistently modify the
guest page's DOM, styles, or scripts. Two exceptions are sanctioned, both
explicit and never implicit: the armed element picker's transient overlay, which
MUST be removed on selection, cancel, or navigation; and extensions the
developer chooses to install, which MAY modify the page by their own design.
Extensions are loaded only into the guest page's session and are never bundled,
pre-installed, or injected by the tool itself.

Rationale: the tool inspects an application under development. Polluting that
application with the tool's own code would corrupt the very thing being
debugged and invalidate frontend work. Developer-installed extensions are a
deliberate exception: they are the developer's own tooling, chosen and auditable
by them, and they belong to the inspected page rather than to the shell.

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
multiplexing within a window are prohibited. Multiple independent windows MAY
run concurrently — whether as separate application instances or as several
windows opened from one instance — so parallel related projects can be open side
by side. Windows do not control one another; each is responsible only for its own
target, geometry, DevTools, and strip/titlebar state. The default target is
`http://localhost:3000`; any other target is one palette edit away.

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
- **Packaging**: electron-builder turns the electron-vite `out/` build into the
  macOS artifact; the app icon is generated from committed source art.
- **Checks**: Vite+ supplies lint, format, and test through `vp check` and
  `vp test`. `vp dev` / `vp build` MUST NOT replace electron-vite's dev/build;
  Vite+ is a checks layer, not the app build.
- **UI**: Vue 3 + VueUse + TypeScript. Node 24 already satisfies every
  toolchain requirement; no runtime pin is required.
- **State**: a small JSON store under Electron's `userData` directory, safe for
  concurrent instances and multiple windows within one instance. Per-window state
  (the current target, window bounds, DevTools open state and dock side, strip
  visibility, titlebar-mode layout, theme variant, and color mode) is independent
  per window; the installed-extension list and recents are shared, with recents
  merged on write and the shared list last-writer-wins. A window's color mode
  governs the tool's own surfaces; the guest page's `prefers-color-scheme` and the
  docked DevTools follow the OS. No database, no config-file editing by the user.

## Security & Isolation Requirements

- The guest view MUST run sandboxed with context isolation and no Node access.
- Navigation is limited to http/https. Other schemes entered via the palette
  MUST be rejected with visible feedback.
- Popups and `window.open` from the guest MUST open in the system browser, never
  inside the tool.
- Transient picker injection MUST clean up on selection, cancel, or navigation;
  no residual listeners or elements may remain.
- Extensions MUST load only into the guest page's session; the shell MUST remain
  outside every extension's reach (FR-028 of `specs/007-extension-support/`).
- Extensions are installed only by explicit developer action. The tool MUST NOT
  bundle, pre-install, or silently install any extension, and MUST load only
  unpacked extension folders the developer installed through the palette.
- A developer-installed extension is arbitrary code with access to local
  development servers; the tool MUST treat installation as an explicit,
  visible action and MUST surface load failures rather than fail silently.

## Packaging & Distribution

The tool MUST ship as a standalone macOS application that runs without the
repository: an installable artifact (`/Applications/tlachialoni.app`) launched by
double-click, produced by one documented command from a clean checkout. Packaging
is a first-class build target, not an afterthought.

- The app bundle MUST carry the product name, version, identifier, and icon from
  a single source of truth; the same metadata drives the bundle, the menu, and
  the About panel.
- Runtime assets the app reads (icon, theme tokens, fonts) MUST be bundled into
  the artifact; the packaged app MUST NOT read them from the source tree or the
  network.
- The default pipeline MAY produce an ad-hoc/unsigned artifact for local use, but
  it MUST leave room for Developer ID signing and notarization without
  restructuring.

Rationale: a tool that only runs from its own repository is a project, not a
tool. Deferring packaging was correct while the interaction model was unproven;
it is now proven, so shipping is part of the product.

## Development Workflow

- Spec Kit drives development: constitution → `/speckit.specify` → clarify →
  plan → tasks → implement. Specs precede code for every feature.
- Risk retirement is spike-first. The docked-DevTools-in-a-frameless-window
  proof MUST succeed before UI is built on top of the architecture. If the
  architecture assumption fails, the fallback is documented before proceeding.
- Transient shell surfaces MUST be previewable in development builds so their
  look and motion can be iterated with live reload; such affordances are
  dev-only, MUST be absent from packaged builds, and are exempt from the
  palette-listing principle because they are not shipped capabilities (see
  `specs/008-surface-preview/`).
- The repository is MIT-licensed. The app runs from source (`npm run dev`)
  during development and MUST also be packageable into a standalone artifact
  (see Packaging & Distribution).
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

**Version**: 2.2.6 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-10-01
