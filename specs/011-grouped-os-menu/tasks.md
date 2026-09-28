# Tasks: Grouped OS Menu

- [x] T001 Spec for domain top-level menus (`spec.md`), including the HIG/Chrome/VS Code research that chose domain menus over literal group names.
- [x] T002 Replace the flat `MENU_COMMAND_IDS` View menu with `MENU_SECTIONS` (View, History, DevTools, Theme, Extensions) and a Window menu in `src/main/index.ts`.
- [x] T003 Build every item from the catalog (`menuItemFor`), stripping the `Theme:` prefix for variant items and leaving `view.back` / `view.forward` without accelerators (`NO_OS_ACCELERATOR`).
- [x] T004 Keep the dev-only Developer preview menu appended after Window.
- [x] T005 Docs: document the menu bar in `specs/001-minimal-browser/contracts/commands-and-keys.md` and list 011 in the README design docs.
- [x] T006 Verify: typecheck, lint, build, and the full unit suite stay green; dev server restarted with the new menu.
