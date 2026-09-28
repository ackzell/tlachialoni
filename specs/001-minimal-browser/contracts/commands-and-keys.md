# Contract: Commands and Keybindings

Both the palette and the keybindings invoke the same command registry, so no
capability exists in only one place (constitution III; FR-020). Accelerators are
intercepted in the main process via `before-input-event` on whichever view has
focus, then dispatched through `command:run` semantics.

## Command catalog

| Command id             | Palette label                | Accelerator           | Notes                                                 |
| ---------------------- | ---------------------------- | --------------------- | ----------------------------------------------------- |
| `palette.open`         | Toggle Command Palette       | `⌘P`                  | Toggles; opens empty with recents + commands listed   |
| `palette.editUrl`      | Edit Current URL             | `⌘L`                  | Opens palette prefilled with the current target       |
| `target.navigate`      | Go to…                       | (palette input)       | Validated against the local-target policy             |
| `strip.toggle`         | Toggle Window Controls       | `⌘B`                  | Explicit toggle; overlay, does not move the page      |
| `view.reload`          | Reload                       | `⌘R`                  |                                                       |
| `view.hardReload`      | Hard Reload                  | `⇧⌘R`                 | Bypasses cache                                        |
| `view.back`            | Back                         | `⌘←`                  | Disabled with no history; yields in editable fields   |
| `view.forward`         | Forward                      | `⌘→`                  | Disabled with no history; yields in editable fields   |
| `devtools.toggle`      | Toggle DevTools              | `⌘⌥J`                 | Reopens on the persisted side; `⌥` avoids the `⇧` slot macOS leans on |
| `devtools.dock.bottom` | Dock DevTools Bottom | `⌘1` | Plain Command+number; `⇧⌘3/4/5` are macOS screenshots |
| `devtools.dock.right` | Dock DevTools Right | `⌘2` |  |
| `devtools.dock.left` | Dock DevTools Left | `⌘3` |  |
| `focus.toggle`        | Toggle Focus (Page / DevTools) | `⌘J` | Moves keyboard focus between the page and the docked DevTools |
| `picker.toggle`        | Inspect Element (arm/disarm) | `⌘⇧C`                 | Hover highlight; click selects in DevTools            |
| `theme.variant.<slug>` | Theme: <Variant Name>        | —                     | Eight commands, one per mineral variant               |
| `theme.cycleMode`      | Cycle Color Mode             | —                     | `system → dark → light`, persisted                    |
| `failure.retry`        | Retry                        | (failure view button) | Shown only while the target is unreachable            |
| `failure.dismiss`      | Go Back to Last Target       | (failure view button) | Returns to the last working target; hidden when none  |
| `window.close`         | Close Window                 | —                     | Strip close button; no accelerator to avoid accidents |
| `app.quit`             | Quit                         | `⌘Q`                  | OS-standard                                           |

`VariantSlug` ∈ `obsidian`, `gold`, `turquoise`, `quartz`, `lapis-lazuli`,
`amethyst`, `jade`, `fire-opal`.

## Dispatch and precedence

1. **Picker armed**: `Esc` and `⌘⇧C` disarm; all other picker input goes to the
   overlay (clicks select rather than reach the page).
2. **Palette open**: the palette owns keyboard input; `Esc` closes it and returns
   focus to the page; `↑` / `↓` move the highlight, scrolling the list to keep it
   in view; `Enter` runs the highlighted command or navigates.
3. **Editable focus**: when `site:focus-editable` reports an editable element,
   `⌘←` / `⌘→` are not intercepted and perform native text navigation (FR-011).
4. **Otherwise**: registered accelerators are captured before the page sees them.
5. **While DevTools has focus**: the page's `before-input-event` never fires, so the same commands are also registered as application-menu accelerators (the macOS **View** menu) and fire app-wide, wherever focus is. This only helps for chords DevTools does not itself bind: `⌘P`, for example, is consumed by the DevTools front-end when it is focused, so `⌘J` (`focus.toggle`) exists to move keyboard focus back to the page without the mouse.
6. **Mouse / swipe history**: the mouse's back/forward thumb buttons navigate history — on macOS mouse drivers deliver them as synthesized `swipe` events (`left` → back, `right` → forward); on Windows/Linux as `app-command` `browser-backward` / `browser-forward`.

## Guard rails

- `view.back` / `view.forward` are palette-disabled when the site view has no
  history in that direction.
- `⌘⇧C` intentionally shadows Chromium's built-in inspect shortcut; our picker
  provides the hover highlight and selects via the site view, so the behavior
  matches what a browser dev expects.
- The palette shows the accelerator next to each command; the catalog is the single
  source of truth for those labels.
