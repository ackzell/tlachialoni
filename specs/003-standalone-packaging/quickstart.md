# Quickstart & Validation: Standalone macOS Packaging

Runnable scenarios that prove the feature end-to-end. Each maps to a user story or
success criterion in `spec.md`. These are the acceptance path — unit tests cover
only pure helpers (e.g. metadata/icon-path resolution).

## Prerequisites

- macOS 13+ on Apple silicon.
- Dependencies installed: `npm install` (pulls the `electron-builder` devDependency).
- A local dev server for a target if you want to test rendering, e.g. something on
  `http://localhost:3000`.

## 0. Dev parity (identity before packaging)

```sh
npm run dev
```

**Expected**: the Dock shows the app's own icon (not the default Electron icon),
confirming the `?asset` icon path resolves in development. See
`contracts/app-identity.md`.

## 1. Produce the artifact (US2 / SC-001 / SC-006)

```sh
rm -rf release
time npm run package
```

**Expected**:

- The command completes with exit code `0` in under five minutes.
- `release/` contains `mac-arm64/Tlachialoni.app`, a `Tlachialoni-<version>.dmg`,
  and a `Tlachialoni-<version>-mac.zip`.
- `git status` shows **no** tracked file changes (only `out/` and `release/`, both
  ignored) — verifies FR-006/FR-009.

## 2. Run without the repository (US1 / SC-002) — the headline scenario

```sh
cp -R "release/mac-arm64/Tlachialoni.app" /Applications/
mv /path/to/tlachialoni /path/to/tlachialoni-moved   # take the source tree away
```

Then open **Tlachialoni** from Spotlight/Launchpad/Dock (double-click).

**Expected**:

- The app window opens and renders the default target exactly as under `npm run dev`.
- With the source checkout renamed/moved, the app still launches — it does not read
  from the repository (FR-002/FR-005).
- If macOS blocks the first launch (unsigned), right-click → **Open**, or run
  `xattr -dr com.apple.quarantine /Applications/Tlachialoni.app`, then reopen.
  Document this in the README.

Restore the checkout afterwards.

## 3. Identity in the OS (US3 / SC-003)

With the installed app running:

- **Dock** and **⌘Tab switcher**: the app's own icon.
- **Application menu** and **About** panel: `Tlachialoni` (not "Electron").
- **Finder**: `/Applications/Tlachialoni.app` shows the product name and icon.

## 4. Icon quality (SC-004)

```sh
sips -g pixelWidth -g pixelHeight -g bitsPerSample resources/icon.png
iconutil --convert iconset --output /tmp/rt.iconset resources/icon.icns   # inspect sizes
```

**Expected**: `icon.png` is 1024×1024, 8-bit, with alpha; `icon.icns` contains
16/32/128/256/512 and `@2x` variants with no upscaled retina sizes.

## 5. Offline UI (SC-005)

Disable networking, then launch the installed app against a local target.

**Expected**: the shell UI (palette, strip, failure view) renders fully — icon,
theme values, and typography are bundled, not fetched.

## 6. Constitutional behavior preserved (post-install)

In the installed app, re-run the `001` core checks:

- Zero permanent chrome (strip/palette/failure are transient).
- `⌘⇧J` toggles **real** Chromium DevTools, docked (bottom/right/left).
- Theme variants/mode still switch instantly and persist across relaunch.

**Expected**: identical behavior to the development build.

## 7. Checks stay green (FR-008)

```sh
npm run check
npm run test
npm run dev        # and confirm the normal dev flow still works
```

**Expected**: all pass; packaging added no regressions.

## Rollback / cleanup

```sh
rm -rf release
rm -rf /Applications/Tlachialoni.app
```

`out/` (electron-vite intermediate) may remain; it is gitignored.
