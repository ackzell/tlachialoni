# Feature Specification: DevTools Theme

**Feature Branch**: `022-devtools-theme`
**Created**: 2026-10-11
**Status**: Implemented

## Problem Statement

The tool's own surfaces are Tlapalli per window, but the docked Chromium DevTools
followed the OS. On a dark obsidian window with a light system appearance the
panel came up light, and none of the mineral identity reached the surface the
developer actually reads all session. The [Tlapalli VS Code
themes](https://github.com/ackzell/tlapalli-vscode-theme) exist precisely so
that tooling carries the palette; the DevTools panel was the one place it
stopped.

## What DevTools actually reads

Three facts shape the whole design, and each was established against the shipped
front-end (Electron 44.5.1, Chromium 152) rather than assumed:

1. **One reference layer feeds everything.** `design_system_tokens.css` derives
   every semantic `--sys-color-*` token from a small reference palette
   (`--color-ref-*`), each declared as `var(--color-ref-x, <fallback>)`. Move the
   reference stops and the whole panel follows.
2. **The host supplies that layer through a stylesheet.** Electron serves
   `devtools://theme/colors.css` (the DevTools theme data source, Electron 32+),
   and `ThemeSupport` appends it on load. Anything written as an *inline* custom
   property on `<html>` outranks it, and outranks DevTools re-applying its own
   theme from settings.
3. **Custom properties cross shadow boundaries; stylesheets do not.** The
   Elements tree, the breadcrumb and the node labels render inside
   `shadowrootmode="open"` roots with bundled component styles. No stylesheet we
   inject can reach them — which is why a stylesheet-based approach was built
   first, verified to be dead, and deleted.

## Approach

1. **Generate a reference palette per variant** from the same Tlapalli themes the
   shell already consumes (`scripts/build-theme-tokens.ts` →
   `src/shared/devtools-theme-tokens.ts`): a neutral ramp anchored on the
   variant's own dark and light backgrounds, plus accent ramps. One palette per
   variant is enough because DevTools selects the dark or light stops itself via
   the `theme-with-dark-background` class — which we force to the window's
   resolved mode.
2. **Override what the reference layer cannot reach**, per mode:
   - `--sys-color-surface1..5` — the toolbar/menu chrome, which Chromium builds
     by mixing a hardcoded `#6991d6` (light) / `#d1e1ff` (dark) into the base.
     Rebuilt from the variant's own accent ramp.
   - `--sys-color-token-*` — the syntax colours, which point at fixed hue
     families (blue/green/orange/pink…) that are not host-overridable. Mapped
     from each theme's own `tokenColors` TextMate scopes.
   - `--sys-color-tonal-container` — the selection fill.
3. **The selection tone is the mineral's own hue**, saturated and deepened
   (`hsl(hue 75% 13%)`), rather than the reference ramp's washed-out
   `secondary30`. A neutral mineral (obsidian) has no hue to saturate and stays
   neutral rather than being handed an arbitrary one.
4. **Lift the selected row.** DevTools paints a selected row's node text with the
   raw token colours — tuned for the panel background, unreadable on the
   selection tone. Tokens below **4.5:1** against that tone are blended toward
   the foreground until they clear it, and written **inline on the selected
   row**, which is the only channel into the shadow-rooted text. Two details are
   load-bearing:
   - the rows live in shadow roots, so a shadow-piercing query is required —
     `document.querySelectorAll("li.selected")` matches nothing;
   - the breadcrumb's `:host` resolves `--override-node-text-label-color` **at
     the host**, above the row, so the row must re-declare the
     `--override-node-text-*` aliases or the crumb keeps the old colour.

## Requirements

- **FR-001** The docked DevTools render with the window's variant and resolved
  colour mode.
- **FR-002** Changing variant or colour mode repaints DevTools without reopening
  it, and a dock-side change (which reloads the front-end) self-heals.
- **FR-003** A selected row's node text clears 4.5:1 against the selection tone,
  in every variant and in both modes.
- **FR-004** The guest page's `prefers-color-scheme`, the shell's own surfaces
  and the OS theme are unaffected.
- **FR-005** *(dev only)* A live JSON override can move any palette property
  without a rebuild.
- **FR-006** *(dev only)* An inspector can be opened on the DevTools front-end,
  to see which variable applies to what.

## Findings worth keeping

Recorded because they cost real time and will recur on the next Electron bump:

- `webContents.openDevTools()` on a **DevTools** WebContents is a silent no-op —
  its type is `remote`, and Electron returns early. Inspecting the panel means
  remote debugging: `--remote-debugging-port` **and** `--remote-allow-origins`
  (Chromium ≥ 111 rejects the front-end's `devtools://devtools` WebSocket origin
  otherwise), then a bundled
  `devtools://devtools/bundled/inspector.html?ws=<target>` window.
- The `devtools://theme/colors.css` request only resolves because of Electron's
  theme data source; without it `#applyThemeToDocument` never runs and the
  front-end falls back to its own defaults.

## Verification

- `tests/unit/devtools-theme.test.ts` — reference-stop coverage per variant,
  monotonic neutral ramps, dark container stops held near the background,
  selection contrast ≥ 4.5:1 in both modes, and the shape of the injected script.
- `tests/unit/devtools-theme-override.test.ts` — the override loader's parsing,
  reload-on-mtime and failure handling.
- Manual, against real DevTools: with a synthetic shadow-rooted
  `devtools-node-text`, the selected row's label resolves to the lifted colour
  and reverts when deselected; on the real panel, both the tree row's
  `.webkit-html-tag` and the breadcrumb's shadow label move together.
