# Tasks: macOS Traffic Lights

- [x] T001 Spec for strip-bound native window controls (`spec.md`).
- [x] T002 Shared strip-surface predicate `isStripSurfaceVisible` (`src/shared/shell.ts`).
- [x] T003 Main: show/hide native controls with the strip via `syncWindowButtons()` in `AppWindow.relayout` (`src/main/shell/window.ts`).
- [x] T004 Shell: mount `DragStrip` from the shared predicate (`src/renderer/src/App.vue`).
- [x] T005 Reserve a left inset for the controls in the strip (`src/renderer/src/components/DragStrip.vue`).
- [x] T006 Unit-test the predicate (`tests/unit/shell.test.ts`).
- [x] T007 Verify: typecheck clean; 85 unit tests pass. Manual: cold launch shows no lights; `⌘B` shows them in the strip; palette open/close tracks them.
