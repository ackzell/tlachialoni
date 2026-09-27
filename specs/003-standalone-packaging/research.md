# Phase 0 Research: Standalone macOS Application Packaging

This document resolves the open technical decisions for turning the electron-vite
build into a standalone macOS app. Format per plan: **Decision / Rationale /
Alternatives considered**.

## 1. Packager

- **Decision**: **electron-builder**.
- **Rationale**: electron-vite is already the build layer and electron-builder is
  its documented, widely used companion; it produces a `.app` plus `dmg`/`zip`
  from a simple declarative config, supports `mac.icon`/`mac.target`/`arch`, and
  exposes a signing/notarization path we can enable later without restructuring.
- **Alternatives considered**: **Electron Forge** — viable, but the project's
  `research.md` for `001` already evaluated Forge as "heavier" when choosing
  electron-vite; adding it now would introduce a second build orchestrator next to
  electron-vite for no gain. **Hand-rolled packaging** — rejected: reinvents code
  signing, asar packing, and dmg creation.

## 2. Output location & ignored directories

- **Decision**: package into `release/` (`directories.output`).
- **Rationale**: `release/` is already in `.gitignore`, satisfying FR-009 (output
  ignored by version control) with no `.gitignore` change. `out/` remains
  electron-vite's intermediate build.
- **Alternatives considered**: electron-builder's default `dist/` — also ignored
  here, but `release/` reads more clearly next to `out/`. `build/` — already
  gitignored and used for build resources, so it must not hold output.

## 3. electron-vite ↔ electron-builder integration

- **Decision**: keep electron-vite as the only code-builder; run
  `electron-vite build` then `electron-builder`. Set `files` to include `out/**`
  (and `package.json`), with `main` already pointing at `./out/main/index.js`.
- **Rationale**: this is the electron-vite-recommended split — electron-vite owns
  main/preload/renderer bundling and HMR; electron-builder only wraps the result
  into a bundle. `externalizeDeps` is already on, so runtime deps stay external and
  are collected by electron-builder.
- **Alternatives considered**: letting electron-builder build the app — rejected;
  it does not model Electron's three targets the way electron-vite does.

## 4. Icon pipeline

- **Decision**: keep three artifacts under `resources/`:
  1. `logo.svg` — human-editable source art (committed);
  2. `icon.png` — 1024×1024 **8-bit RGBA** master raster (committed; also the
     development dock icon);
  3. `icon.icns` — macOS bundle icon, generated from the master by a small script
     (`scripts/build-icons.sh`) that builds an `.iconset` and calls `iconutil`.
- **Rationale**: Electron's `nativeImage` cannot read SVG, and macOS bundles need
  `icns`; committing a raster master keeps builds deterministic and offline. A
  16-bit export was reduced to 8-bit (8.4 MB → ~318 KB) without visible loss so the
  binary stays reasonable in git.
- **Alternatives considered**: committing only `icns` — rejected: loses the
  editable source and the runtime master. A Node rasterizer dependency (sharp /
  `@resvg/resvg-js`) — rejected: the art is already exported, and `iconutil` ships
  with macOS, so no extra dependency is warranted. `.icon` (Icon Composer) —
  deferred; `icns` remains valid and sufficient.

## 5. `?asset` icon path and packaging

- **Decision**: import the runtime icon in the main process with electron-vite's
  `?asset` suffix (copied into `out/` and path-resolved), and add
  `"electron-vite/node"` to `tsconfig.node.json` `types` so it type-checks.
- **Rationale**: a bare `__dirname` path works in dev but breaks once the app is
  inside an asar; `?asset` yields a packaged-safe path. The bundle icon itself
  comes from `CFBundleIconFile` set by electron-builder, so `app.dock.setIcon` is
  only needed for `npm run dev`.
- **Alternatives considered**: reading the PNG from `resources/` at an absolute
  source path — rejected: breaks in the installed app. Skipping the dev dock icon
  entirely — rejected: the dev experience should match the shipped identity.

## 6. Signing & notarization

- **Decision**: produce an **unsigned (ad-hoc)** artifact now; keep the config
  ready for Developer ID signing + notarization later. Document the first-launch
  Gatekeeper workaround.
- **Rationale**: the audience is the developer themself (spec Assumptions); a
  paid Apple Developer ID is not required for local use, and the constitution's
  Packaging & Distribution section explicitly permits an ad-hoc/unsigned artifact
  as long as signing can be added without restructuring.
- **Alternatives considered**: ad-hoc signing only (`identity: "-"`) — effectively
  what an unsigned local build already is. Notarizing now — rejected: needs an
  Apple account and adds pipeline complexity out of scope for this feature.

## 7. App identity (single source of truth)

- **Decision**: `productName: Tlachialoni`, `appId: com.ackzell.tlachialoni`,
  `name: tlachialoni`, bundle version from `package.json` `version`. Declared once
  in `package.json`/`electron-builder.yml` and consumed by the bundle, the
  application menu, and the About panel.
- **Rationale**: satisfies FR-003 (identity from one point of truth) and gives the
  installed app its own name in Finder, the menu bar, and ⌘Tab rather than the
  runtime's default.
- **Alternatives considered**: hard-coding the name in `index.ts` as well —
  rejected: two sources of truth drift. See `contracts/app-identity.md`.

## 8. Architecture scope

- **Decision**: build **`arm64` only** (`mac.target = [dmg, zip]`).
- **Rationale**: the spec's target platform is Apple silicon; a universal build
  doubles artifact size and build time for no current benefit. `dmg` is the
  installable container; `zip` is a lightweight fallback.
- **Alternatives considered**: `universal` — deferred until (if ever) Intel is
  needed; the config change is a one-liner.

## Open items to confirm during implementation

1. Exact `out/` subpath electron-vite assigns to a main-process `?asset`, so
   `files`/asar packaging includes it (verify by inspecting `out/` after build).
2. Whether electron-builder needs an explicit `mac.identity: null` to guarantee an
   unsigned build on a machine that happens to have signing identities installed.
3. Whether the `.icns` is committed or generated during `npm run package`; commit
   it _and_ keep the script, so a clean checkout packages without running the
   script yet stays reproducible.
