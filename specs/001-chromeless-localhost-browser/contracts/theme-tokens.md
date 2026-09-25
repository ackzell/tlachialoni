# Contract: Theme Tokens (Tlapalli)

The shell consumes only CSS custom properties. Values come from Tlapalli and are
generated into a committed module; nothing else in the app may hard-code a color
(constitution VI; FR-016–FR-018).

## CSS variable contract

| Variable           | Role                              | Tlapalli source (VSCode key)  |
| ------------------ | --------------------------------- | ----------------------------- |
| `--lb-bg`          | App/canvas background             | `editor.background`           |
| `--lb-bg-elevated` | Elevated surface (palette, strip) | `editorWidget.background`     |
| `--lb-surface`     | Control fill                      | `button.background`           |
| `--lb-fg`          | Primary text                      | `editor.foreground`           |
| `--lb-fg-muted`    | Secondary text                    | `descriptionForeground`       |
| `--lb-fg-subtle`   | De-emphasized text                | `editorLineNumber.foreground` |
| `--lb-border`      | Hairlines and dividers            | `panel.border`                |
| `--lb-accent`      | Links / active text               | `textLink.foreground`         |
| `--lb-signature`   | Brand accent swatch / focus ring  | `activityBarBadge.background` |
| `--lb-selection`   | Selected row / text selection     | `editor.selectionBackground`  |
| `--lb-hover`       | Hover fill                        | `list.hoverBackground`        |
| `--lb-error`       | Error text / failure view accent  | `list.errorForeground`        |
| `--lb-progress`    | Loading indicator                 | `progressBar.background`      |

Notes: `focusBorder` is unusable as a ring (it equals the background), hence
`--lb-signature` for focus. Alpha values are 8-digit `#RRGGBBAA` and are valid CSS
as-is. Where the consolidated source does not expose a key, fall back to the
VSCode `colors` map from `themes/tlapalli-<slug>[-light]-theme.json`.

## Variants

`obsidian`, `gold`, `turquoise`, `quartz`, `lapis-lazuli`, `amethyst`, `jade`,
`fire-opal` — each with a dark and a light token set (16 combinations).

## Generation

- `scripts/build-theme-tokens.ts` reads the consolidated Tlapalli source
  (`ackzell/tlapalli-vscode-theme`, `zed-themes/tlapalli.json`; VSCode `colors`
  maps as fallback) and emits `src/shared/theme-tokens.ts`: a map of
  `variant → mode → { [cssVariable]: value }`. Both main (window background) and
  the renderer import it.
- The generated file is committed, so builds need no network access. Re-run the
  script only when the upstream theme changes.

## Application

- `theme/apply.ts` sets the CSS variables on the document root and marks
  `data-variant` / `data-mode` for any CSS that needs to branch.
- Resolved mode = `colorMode` when `dark`/`light`, otherwise the system
  preference; main also sets `nativeTheme.themeSource` so docked DevTools follow
  (FR-017).
- Typography is `'Source Code Pro Variable'` (from
  `@fontsource-variable/source-code-pro`), with a system monospace fallback.

## Attribution

Tlapalli is MIT-licensed, © 2026 Axel Uriel Martínez Castillo (ackzell.dev).
Color values are derived and reused under that license; ship the notice in
`NOTICE` and do not reuse the Tlapalli logo assets as this app's icon.
