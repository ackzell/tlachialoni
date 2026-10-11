# Quickstart: DevTools Theme

## See it

```
pnpm dev
```

Open the docked DevTools (`⌘⌥J`), then cycle themes (`⌘T`) — the panel follows
the window's variant and colour mode live, including dark/light. Switch windows
(`⌘N`) and each keeps its own.

The theme is applied to the *guest page's* DevTools. The guest page itself still
follows the OS, deliberately.

## Retune it

Two knobs live in `scripts/build-theme-tokens.ts`; re-run
`node scripts/build-theme-tokens.ts` after changing either, and commit the
regenerated `src/shared/devtools-theme-tokens.ts`.

| constant | meaning |
|---|---|
| `SELECTION_LIGHTNESS` / `SELECTION_SATURATION` | the selected-row fill: the mineral's hue at this saturation/lightness (`0.13` / `0.75` today) |
| `SELECTION_CONTRAST` | the ratio a selected row's node text must clear (`4.5`) — tokens already above it are left untouched |

Because the lift is contrast-driven, raising the fill's lightness automatically
lifts the tokens further; the ratio holds without touching the token values.

## Tune colours without a rebuild *(dev only)*

`devtools-theme.override.json` at the repo root (gitignored) is read live — edit
it and the panel repaints within about a second, no restart. Its path is printed
at startup as `devtools theme override: …`, and each load logs a summary line so
you can see an edit land.

```json
{
  "dark": { "--sys-color-tonal-container": "hsl(178 75% 13%)" },
  "light": {}
}
```

Any custom property can be moved, and a `--color-ref-*` key also writes its
`--ref-palette-*` twin. It is applied last, so it beats the generated palette.

> Note: the override is gitignored, so VS Code's search skips it by default.
> Toggle **Search: Use Ignore Files** off, or open the path directly.

## Inspect what applies where *(dev only)*

```sh
pnpm dev:inspect
```

(This is `pnpm dev` with `TLACHIALONI_INSPECT_DEVTOOLS=1`.) It docks DevTools and
opens a second window **inspecting the DevTools front-end**, so its Elements and
Styles panes show the inline `--color-ref-*` / `--sys-color-*` properties and
which rules consume each (`--app-color-toolbar-background` →
`--sys-color-surface4`, `.crumb.selected` → `--sys-color-tonal-container`, …).

Port defaults to `9333`; override with `TLACHIALONI_INSPECT_PORT`. This appends a
local debug port, so it is dev-only and gated by `!app.isPackaged`.

## Map: what to change for what

| you see | rule | property |
|---|---|---|
| tab strip / toolbar | `.tabbed-pane-header` | `--app-color-toolbar-background` → `--sys-color-surface4` (light) / `--sys-color-base` (dark) |
| selected row / crumb fill | `.crumb.selected`, `.selection` | `--sys-color-tonal-container` |
| selected row text (lifted) | `.node-label-*`, `.webkit-html-tag` | the inline tokens on the row |
| panel background | — | `--sys-color-surface` / `--sys-color-cdt-base-container` |

## Refresh the screenshots

```
pnpm screenshots
```

Captures the shell, palette and docked-DevTools shots into `docs/screenshots/`
from a throwaway `userData` and a local stub page, so a live `pnpm dev` session
is untouched. `TLACHIALONI_SCREENSHOTS_DIR` and `TLACHIALONI_SCREENSHOTS_URL`
override the output directory and target.
