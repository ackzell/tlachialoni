# Tasks: Developer Surface Preview

- [x] T001 Spec and contract for the Developer menu previews (`spec.md`, `contracts/surface-preview.md`).
- [x] T002 Generalize the dev preview state in `AppWindow` (`devPreview` flag; `previewLoadingVeil`, `previewFailureView`, `previewExtensionStatus`, `stopSurfacePreview`).
- [x] T003 Force the shell full while a preview is active and end previews on a real navigation.
- [x] T004 Developer menu (dev builds only) with the three previews and Stop Preview.
- [x] T005 `TLACHIALONI_DEMO_STATUS=1` auto-starts the extension install preview.
- [x] T006 Snapshot hook `TLACHIALONI_SNAPSHOT_STATUS=demo|veil|failure`.
- [x] T007 Verify: veil, failure, and extension previews all render; typecheck/build clean; 81 unit tests pass.
