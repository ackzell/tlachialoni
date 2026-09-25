# Contract: Commands and Keybindings

Both the palette and the keybindings invoke the same command registry, so no
capability exists in only one place (constitution III; FR-020). Accelerators are
intercepted in the main process via `before-input-event` on whichever view has
focus, then dispatched through `command:run` semantics.

## Command catalog

| Command id | Palette label | Accelerator | Notes |
| --- | --- | --- | --- |
| `palette.open` | Show Command Palette | `⌘P` | Opens empty; recents + commands listed |
| `palette.editUrl` | Edit Current URL | `⌘L` | Opens palette prefilled with the current target |
| `target.navigate` | Go to… | (palette input) | Validated against the local-target policy |
| `strip.toggle` | Toggle Window Controls | `⌘B` | Explicit toggle; overlay, does not move the page |
| `view.reload` | Reload | `⌘R` | |
| `view.hardReload` | Hard Reload | `⇧⌘R` | Bypasses cache |
| `view.back` | Back | `⌘←` | Disabled with no history; yields in editable fields |
| `view.forward` | Forward | `⌘→` | Disabled with no history; yields in editable fields |
| `devtools.toggle` | Toggle DevTools | `⌘⇧J` | Reopens on the persisted side |
| `devtools.dock.bottom` | Dock DevTools Bottom | `⌘⇧1` | |
| `devtools.dock.right` | Dock DevTools Right | `⌘⇧2` | |
| `devtools.dock.left` | Dock DevTools Left | `⌘⇧3` | |
| `picker.toggle` | Inspect Element (arm/disarm) | `⌘⇧C` | Hover highlight; click selects in DevTools |
| `theme.variant.<slug>` | Theme: <Variant Name> | — | Eight commands, one per mineral variant |
| `theme.cycleMode` | Cycle Color Mode | — | `system → dark → light`, persisted |
| `failure.retry` | Retry | (failure view button) | Shown only while the target is unreachable |
| `window.close` | Close Window | — | Strip close button; no accelerator to avoid accidents |
| `app.quit` | Quit | `⌘Q` | OS-standard |

`VariantSlug` ∈ `obsidian`, `gold`, `turquoise`, `quartz`, `lapis-lazuli`,
`amethyst`, `jade`, `fire-opal`.

## Dispatch and precedence

1. **Picker armed**: `Esc` and `⌘⇧C` disarm; all other picker input goes to the
   overlay (clicks select rather than reach the page).
2. **Palette open**: the palette owns keyboard input; `Esc` closes it and returns
   focus to the page; `Enter` runs the highlighted command or navigates.
3. **Editable focus**: when `site:focus-editable` reports an editable element,
   `⌘←` / `⌘→` are not intercepted and perform native text navigation (FR-011).
4. **Otherwise**: registered accelerators are captured before the page sees them.

## Guard rails

- `view.back` / `view.forward` are palette-disabled when the site view has no
  history in that direction.
- `⌘⇧C` intentionally shadows Chromium's built-in inspect shortcut; our picker
  provides the hover highlight and selects via the site view, so the behavior
  matches what a browser dev expects.
- The palette shows the accelerator next to each command; the catalog is the single
  source of truth for those labels.
