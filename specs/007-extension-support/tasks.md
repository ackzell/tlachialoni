# Tasks: Extension Support

Ordered by dependency. Each task is independently verifiable.

## Setup

- [x] T001 Amend the constitution (Principle II + security) to sanction developer-installed extensions (v2.2.0).
- [x] T002 Add `fflate` to `package.json` dependencies.

## Foundational

- [x] T003 `src/shared/extension-id.ts` — `parseExtensionId(input)`; unit tests.
- [x] T004 `src/main/extensions/crx.ts` — `crxZipOffset`, `extractCrxToDir` (path-safe), `readManifest`; unit tests with synthetic CRX/zip buffers.
- [x] T005 `src/shared/extensions.ts` — `InstalledExtension`, `ExtensionStatus`, phase union.
- [x] T006 `src/main/state/schema.ts` + `store.ts` — schema v2, `extensions` field, sanitizer, `setExtensions`; extended `tests/unit/store.test.ts`.

## Core

- [x] T007 `src/main/extensions/store.ts` — `crxDownloadUrl`, `downloadCrx(url, onProgress)` streaming with byte progress.
- [x] T008 `src/main/extensions/manager.ts` — root paths, `loadAll`, `installFromStore`, `installFromFolder`, `setEnabled`/`toggle`, `remove`, `update`, `reloadAll`, `revealRoot`; emits status and change notifications; concurrency-guarded.
- [x] T009 `src/main/shell/shell-view.ts` — `partition: "shell"`.
- [x] T010 `src/main/index.ts` + `window.ts` — construct store/manager, load extensions at ready, register extension commands, forward status, `desiredShellMode` includes the status surface, `handleInput` dismisses a finished status with `Esc`.

## UI

- [x] T011 `src/preload/shell.ts` + `src/renderer/src/env.d.ts` — no new channel needed; `runCommand` covers dismissal.
- [x] T012 `src/shared/commands.ts` — static extension commands (install, install folder, reload, reveal, dismiss).
- [x] T013 `src/renderer/src/composables/useShell.ts` — `extensionStatus` ref + `extension:status` subscription.
- [x] T014 `src/renderer/src/composables/useCommands.ts` — extension rows (typed install, per-extension toggle/remove/update); `ShellState.extensions`.
- [x] T015 `src/renderer/src/components/CommandPalette.vue` — dispatch extension rows, inline prompt for the store command.
- [x] T016 `src/renderer/src/components/InstallStatus.vue` — spinner, stage message, progress bar, done auto-dismiss, error hold.
- [x] T017 `src/renderer/src/App.vue` — mount `InstallStatus` in a settle-participating transition.

## Verify

- [x] T018 `npm run test` — 74 tests pass, including 12 new extension tests.
- [x] T019 `npm run typecheck` and `npm run build` clean (`vp check` flags only the pre-existing generated `CHANGELOG.md`).
- [x] T020 Manual/spike: real store download + unpack of React Developer Tools; Electron loads it (MV3 with `devtools_page`) and a content script injects into a guest page; the shell session holds no extensions and refuses to load any. UI snapshot captured the status surface at a determinate 63% with no page resize, and its dismissal.
