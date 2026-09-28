# Tasks: Grouped Command Palette

- [x] T001 Spec for palette groups (`spec.md`).
- [x] T002 Catalog: `COMMAND_GROUPS`, `Scope`, `SCOPES`, `scopeLabel`, `nextScope`, per-command `group`, and `palette.openTheme` (`⌘T`) in `src/shared/commands.ts`.
- [x] T003 Rows: scope filtering with fallback support, group ordering, host-grouped expandable recents, flat page search, and per-row `group` in `src/renderer/src/composables/useCommands.ts`.
- [x] T004 Main: `openPalette(initial, scope)`, scoped `palette.editUrl` (`⌘L`) / `palette.openTheme` (`⌘T`) / `palette.open` (All), and scope on the `palette:open` payload (`src/main/shell/window.ts`).
- [x] T005 Menu: add `palette.openTheme` to `MENU_COMMAND_IDS` so `⌘T` works from DevTools focus (`src/main/index.ts`).
- [x] T006 Shell state: thread `paletteScope` through the preload payload and `useShell` into `App.vue`.
- [x] T007 Palette UI: chip row, Tab / Shift+Tab cycling, host expand/collapse (`→` / `←`), fallback hint, footer, Space-in-place, current-variant focus, and suppressed motion on group swaps (`src/renderer/src/components/CommandPalette.vue`).
- [x] T008 Recents caps: `MAX_RECENTS = 30`, `MAX_RECENTS_PER_HOST = 5`, per-origin capping in `mergeRecents` / `mergeRecentLists` (`src/main/state/schema.ts`).
- [x] T009 Unit tests: catalog groups and `⌘T`, scopes and cycling, scoped rows, host-grouped recents (`tests/unit/commands.test.ts`); per-origin and total recents caps (`tests/unit/store.test.ts`).
- [x] T010 Docs: update `specs/001-minimal-browser/contracts/commands-and-keys.md`, the palette acceptance scenarios / FR-005 / Recents entity in `specs/001-minimal-browser/spec.md`, and the README keybinding list.
- [x] T011 Verify: typecheck clean; 101 unit tests pass. Manual: `⌘L` lists host-grouped recents; `⌘T` lands on the active variant; `Tab` swaps groups without row buildup; `Space` commits a theme without dismissing.
