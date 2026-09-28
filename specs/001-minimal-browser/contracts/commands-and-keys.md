# Contract: Commands and Keybindings

Both the palette and the keybindings invoke the same command registry, so no
capability exists in only one place (constitution III; FR-020). Accelerators are
intercepted in the main process via `before-input-event` on whichever view has
focus, then dispatched through `command:run` semantics.

## Command catalog

Every command declares a `group`; the palette's group order and its `Tab` order
are derived from `COMMAND_GROUPS` in `src/shared/commands.ts` (FR-020).

| Command id             | Palette label                | Accelerator           | Group       | Notes                                                 |
| ---------------------- | ---------------------------- | --------------------- | ----------- | ----------------------------------------------------- |
| `palette.open`         | Toggle Command Palette       | `⌘P`                  | other       | Toggles; opens in All with every group listed         |
| `palette.editUrl`      | Edit Current Target          | `⌘L`                  | other       | Opens scoped to Location, prefilled with the target, recents below |
| `palette.openTheme`    | Browse Themes                | `⌘T`                  | other       | Opens scoped to Theme; the active variant is highlighted |
| `target.navigate`      | Go to…                       | (palette input)       | location    | Validated against the local-target policy             |
| `strip.toggle`         | Toggle Window Strip          | `⌘B`                  | other       | Overlay; does not move the page                       |
| `view.reload`          | Reload                       | `⌘R`                  | view        |                                                       |
| `view.hardReload`      | Hard Reload                  | `⇧⌘R`                | view        | Bypasses cache                                        |
| `view.back`            | Back                         | `⌘←`                  | view        | Disabled with no history; yields in editable fields   |
| `view.forward`         | Forward                      | `⌘→`                  | view        | Disabled with no history; yields in editable fields   |
| `devtools.toggle`      | Toggle DevTools              | `⌘⌥J`                 | devtools    | Reopens on the persisted side; `⌥` avoids the `⇧` slot macOS leans on |
| `devtools.dock.bottom` | Dock DevTools Bottom | `⌘1` | devtools | Plain Command+number; `⇧⌘3/4/5` are macOS screenshots |
| `devtools.dock.right` | Dock DevTools Right | `⌘2` | devtools |  |
| `devtools.dock.left` | Dock DevTools Left | `⌘3` | devtools |  |
| `focus.toggle`        | Toggle Focus (Page / DevTools) | `⌘J` | devtools | Moves keyboard focus between the page and the docked DevTools |
| `picker.toggle`        | Inspect Element (arm/disarm) | `⌘⇧C`                 | devtools    | Hover highlight; click selects in DevTools            |
| `theme.variant.<slug>` | Theme: <Variant Name>        | —                     | theme       | Eight commands, one per mineral variant               |
| `theme.cycleMode`      | Cycle Color Mode             | —                     | theme       | `system → dark → light`, persisted                    |
| `extensions.install`   | Install extension …          | —                     | extensions  | Contextual: offered when the input is a store URL/ID  |
| `extensions.installFolder` | Install Extension from Folder | —                 | extensions  |                                                       |
| `extensions.reload`    | Reload Extensions            | —                     | extensions  |                                                       |
| `extensions.revealFolder` | Reveal Extensions Folder  | —                     | extensions  |                                                       |
| `failure.retry`        | Retry                        | (failure view button) | other       | Shown only while the target is unreachable            |
| `failure.dismiss`      | Go Back to Last Target       | (failure view button) | other       | Returns to the last working target; hidden when none  |
| `window.close`         | Close Window                 | —                     | other       | Strip close button; no accelerator to avoid accidents |
| `app.quit`             | Quit                         | `⌘Q`                  | —           | OS-standard (app menu), not in the palette catalog    |

`VariantSlug` ∈ `obsidian`, `gold`, `turquoise`, `quartz`, `lapis-lazuli`,
`amethyst`, `jade`, `fire-opal`.

## Palette groups and scopes

- **Scopes** are All plus each group (`COMMAND_GROUPS`), in declaration order.
  `Tab` / `Shift+Tab` on the input cycle them, wrapping. The active scope shows
  as a chip and constrains the listed rows.
- **`⌘L` → Location**: the current target is prefilled and *selected* but is not
  an active filter until edited, so recents stay listed. Recents collapse to one
  row per **origin** (`scheme://host:port`); `→` expands an origin's pages, `←`
  collapses it (from a page, `←` collapses its parent in one press), and `Enter`
  opens the newest page for an origin.
- **`⌘T` → Theme**: entering the group highlights the active variant; clearing a
  typed query restores that highlight. Arrow keys live-preview; `Enter` commits
  and dismisses; `Space` with an empty query commits and keeps the palette open.
- **Scoped with fallback**: a query with no in-group match widens to all groups
  and the palette says so. The typed-target row is offered only in Location/All,
  and a pasted store URL only in Extensions/All (or via fallback).
- **Recents bound**: at most `MAX_RECENTS` (30) overall and
  `MAX_RECENTS_PER_HOST` (5) per origin, so one dev server cannot evict the rest.

## Dispatch and precedence

1. **Picker armed**: `Esc` and `⌘⇧C` disarm; all other picker input goes to the
   overlay (clicks select rather than reach the page).
2. **Palette open**: the palette owns keyboard input; `Esc` closes it and returns
   focus to the page; `↑` / `↓` move the highlight, scrolling the list to keep it
   in view; `Tab` / `Shift+Tab` cycle the group scope; `→` / `←` expand and
   collapse a host's recent pages; `Enter` runs the highlighted command or
   navigates; `Space` with an empty query runs it without dismissing (so a
   highlighted theme commits in place).
3. **Editable focus**: when `site:focus-editable` reports an editable element,
   `⌘←` / `⌘→` are not intercepted and perform native text navigation (FR-011).
4. **Otherwise**: registered accelerators are captured before the page sees them.
5. **While DevTools has focus**: the page's `before-input-event` never fires, so the same commands are also registered as application-menu accelerators and fire app-wide, wherever focus is. This only helps for chords DevTools does not itself bind: `⌘P`, for example, is consumed by the DevTools front-end when it is focused, so `⌘J` (`focus.toggle`) exists to move keyboard focus back to the page without the mouse.

## OS menu bar

The application menu is a set of Chrome/Safari-style **domain menus** built from
the same catalog (011-grouped-os-menu). It is static — the active theme, recents,
and per-extension state are not mirrored, since that would require rebuilding the
menu on every change.

| Menu | Items |
| ---- | ----- |
| View | Toggle Command Palette `⌘P`, Browse Themes `⌘T` · Reload `⌘R`, Hard Reload `⇧⌘R` · Toggle Window Strip `⌘B` |
| History | Back, Forward · Edit Current Target `⌘L` |
| DevTools | Toggle DevTools `⌘⌥J` · Dock Bottom/Right/Left `⌘1/2/3` · Toggle Focus `⌘J`, Inspect Element `⌘⇧C` |
| Theme | the eight variants · Cycle Color Mode |
| Extensions | Install from Folder, Reload Extensions, Reveal Extensions Folder |
| Window | Close Window · Minimize, Zoom, Front (standard roles) |

`view.back` / `view.forward` are deliberately listed **without** OS accelerators:
a menu key equivalent would be swallowed app-wide and break native `⌘←` / `⌘→`
text navigation (rule 3 above). Dev builds append a separate **Developer** menu of
surface previews (008-surface-preview).
6. **Mouse / swipe history**: the mouse's back/forward thumb buttons navigate history — on macOS mouse drivers deliver them as synthesized `swipe` events (`left` → back, `right` → forward); on Windows/Linux as `app-command` `browser-backward` / `browser-forward`.

## Guard rails

- `view.back` / `view.forward` are palette-disabled when the site view has no
  history in that direction.
- `⌘⇧C` intentionally shadows Chromium's built-in inspect shortcut; our picker
  provides the hover highlight and selects via the site view, so the behavior
  matches what a browser dev expects.
- The palette shows the accelerator next to each command; the catalog is the single
  source of truth for those labels.
- Recents are bounded at 30 total and 5 per origin so one dev server cannot evict
  the rest (010-palette-groups); `⌘T` is free because the app forbids tabs
  (constitution V).
