# Implementation Plan: Standalone macOS Application Packaging

**Branch**: `003-standalone-packaging` | **Date**: 2026-09-27 | **Spec**: `specs/003-standalone-packaging/spec.md`

**Input**: Feature specification from `/specs/003-standalone-packaging/spec.md`

## Summary

Turn the electron-vite `out/` build into a standalone macOS application: a
double-clickable `tlachialoni.app` (plus a `.dmg`) that runs without the repository,
carries the product name and icon, and is produced by one documented command.
electron-builder is the packager; the app icon is generated from the committed
source art (`resources/logo.svg` → `resources/icon.png` → `resources/icon.icns`);
the artifact lands in the already-ignored `release/` directory. Signing and
notarization remain deferred — the pipeline produces a locally usable unsigned
artifact and is structured so a Developer ID can be added later without rework.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24.21 (development); Electron 44.4.5

**Primary Dependencies**: electron-builder (new, build-time only); electron-vite
5.0.0 (app build/config); existing Vue 3 / VueUse / `@fontsource-variable/source-code-pro`
runtime dependencies and Vite+ checks layer are unchanged

**Storage**: N/A for this feature — packaging is build-time. The app's existing
`userData` JSON state is untouched.

**Testing**: Vitest (`vp test`) for any pure metadata/icon-resolution helpers; the
packaging itself is validated by the scripted build-and-launch scenarios in
`quickstart.md` (unit tests cannot install and launch a bundle)

**Target Platform**: macOS 13+ (Apple silicon, `arm64`); targets `dmg` + `zip`;
unsigned (ad-hoc) artifact for local use

**Project Type**: desktop app (Electron) — packaging/distribution feature

**Performance Goals**: one packaging command from a clean checkout completes in
under five minutes (SC-006)

**Constraints**: MUST succeed with no signing credentials (FR-007); MUST NOT mutate
tracked source files — only writes to ignored `release/` (FR-006, FR-009); MUST NOT
weaken the existing security posture; MUST work offline at runtime (FR-005)

**Scale/Scope**: one app bundle; one architecture (`arm64`); two mac targets
(`dmg`, `zip`); Windows/Linux and signing/notarization explicitly out of scope

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle / requirement (constitution v2.1.0) | Plan compliance                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Chromeless by Default                      | Packaging changes only the bundle, not the window; no chrome is added; SC-002 verified in quickstart                                           |
| II. The Guest Page is Sacred                  | No change to the guest view, sandbox, or picker; packaged app runs the same main code                                                          |
| III. Keyboard-First Ergonomics                | No new user capability; no keyboard surface is affected                                                                                        |
| IV. Real Chromium DevTools, Docked            | Electron ships real DevTools in the bundle; docking behavior is unchanged and re-verified in the installed app (quickstart)                    |
| V. One Target Per Window                      | Unaffected; packaging does not alter window/target semantics                                                                                   |
| VI. Identity Through Tlapalli                 | Icon derives from the committed source art; product identity is a single source of truth; theme tokens/fonts stay bundled                       |
| Technology Foundations                        | Uses the constitutionally named electron-builder and the existing electron-vite `out/` build; Vite+ remains checks-only                          |
| Security & Isolation                          | Asar packs the app; guest sandbox and local-only navigation are unchanged; no runtime network dependency introduced                            |
| Packaging & Distribution                      | Direct implementation: single-command artifact, single-source metadata, bundled assets, signing-ready-but-deferred                              |
| Development Workflow                          | Spec precedes code (this feature); changes pass `vp check` / `vp test`; packaging is now in scope per the v2.1.0 amendment                       |

**Gate result**: PASS — no violations. Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: PASS. `data-model.md` keeps identity and
icon paths as one source of truth; `contracts/packaging-command.md` fixes the
single-command interface and its ignored output; `contracts/app-identity.md` maps
every identity field to one declaration site; `quickstart.md` re-verifies the
constitutional guarantees (chromeless, docked DevTools, identity, offline UI) in
the *installed* app rather than only under the dev command. No new scope was
introduced, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-standalone-packaging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── packaging-command.md   # CLI/build contract
│   └── app-identity.md        # single-source-of-truth metadata contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify output)
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
tlachialoni/
├── electron-builder.yml             # NEW: packager config (appId, mac targets, icon, output)
├── package.json                     # productName/author + package scripts (build:packager)
├── electron.vite.config.ts          # unchanged
├── resources/                       # NEW: tracked build assets
│   ├── logo.svg                     # icon source art (moved from repo root)
│   ├── icon.png                     # 1024² 8-bit master raster (committed; dev dock icon)
│   └── icon.icns                    # generated macOS icon (committed or built by script)
├── scripts/
│   ├── build-theme-tokens.ts        # existing
│   └── build-icons.sh               # NEW: icon.png → icon.icns (iconutil iconset)
├── src/
│   └── main/
│       └── index.ts                 # app identity + dev dock icon (?asset), About panel
├── tsconfig.node.json               # add "electron-vite/node" types for ?asset
├── release/                         # ignored packager output (tlachialoni.app, *.dmg, *.zip)
└── README.md                        # document the packaging command and first-launch caveat
```

**Structure Decision**: single-project Electron layout. Packaging config lives at
the repository root (`electron-builder.yml`) beside the existing build config; all
icon artwork lives under `resources/` so it is version-controlled and never
collides with the gitignored `build/` directory that electron-builder uses by
default. No new source modules are introduced; the only runtime code change is app
identity and the development-only dock icon in `src/main/index.ts`.

## Phased Delivery

- **M1 — Metadata & icons**: commit `resources/logo.svg` + `resources/icon.png`;
  add `scripts/build-icons.sh` producing `resources/icon.icns`; declare
  `productName`, `author`, and identifier once; set the dev dock icon via `?asset`.
- **M2 — Packager config**: add electron-builder; `electron-builder.yml` with
  `appId`, `productName`, `files: out/**`, `mac.target = [dmg, zip]`,
  `mac.arch = arm64`, `mac.icon`, and `directories.output = release`.
- **M3 — Command & docs**: add the single `package` script; document prerequisites,
  output location, and the unsigned first-launch caveat in the README.
- **M4 — Verification**: run the quickstart scenarios against the installed bundle;
  confirm identity, offline UI, and docked DevTools; ensure `vp check` / `vp test`
  stay green.

## Risks & Mitigations

| Risk                                                                 | Mitigation                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| First launch blocked by Gatekeeper (unsigned)                        | Document right-click → Open / `xattr -dr com.apple.quarantine`; config leaves room for Developer ID signing + notarization later      |
| `?asset` icon path differs once packed into an asar                  | Verify the dev dock icon and the packaged `CFBundleIconFile` independently in quickstart; prefer the bundle icon source when packaged |
| electron-builder default `buildResources` collides with ignored `build/` | Keep artwork in tracked `resources/` and point `mac.icon` at it explicitly                                                         |
| `.icns` generation requires macOS tooling (`iconutil`)               | It is macOS-only project anyway; script fails loudly if a size is missing so a broken icon never ships silently (FR: edge case)        |
| Large binary icon committed to git                                   | Master is 8-bit 1024² (≈318 KB), not 16-bit; `.icns` is compact                                                                        |
| electron-builder version drift vs Electron 44                        | Pin a compatible builder major; verify a launch before merging                                                                        |

## Complexity Tracking

> No constitution violations. This table is intentionally empty.
