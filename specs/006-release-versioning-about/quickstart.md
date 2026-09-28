# Quickstart: Release Versioning & About Panel

Run these scenarios from the repository root after implementation.

## 1. Establish the baseline (once)

```sh
npm run tag:first
git tag -l            # expect v0.1.0
head -20 CHANGELOG.md # expect a 0.1.0 entry generated from history
```

The first run must not invent a new version and must not push anywhere.

## 2. Cut a release

```sh
# make a change, commit it as e.g. "feat(scope): ..."
npm run tag
git tag -l                    # expect a new vX.Y.Z
git describe --tags --abbrev=0
git show --stat HEAD          # only version + changelog files in the release commit
```

Verify the bump level matches the commit mix (feature → minor, fix → patch), and
that `package.json` carries the new version.

## 3. Build versioned artifacts

```sh
npm run package
ls release/*.dmg release/*.zip   # filenames include the version
```

## 4. Verify the About panel

1. Install `release/mac-arm64/Tlachialoni.app` (or open in place).
2. Open **Tlachialoni → About Tlachialoni**.
3. Confirm the panel shows the logo, the version matching `package.json`, and the
   release date matching the `vX.Y.Z` tag's date.

## 5. Fallback behavior

```sh
# with no tag for the current version
npm run build
```

The About panel falls back to the build date; the build must not fail when git or
the tag is unavailable.

## 6. Workflow unchanged

```sh
npm run dev
npm run check
npm run test
```

All succeed, and `npm run dev` shows the existing app identity.
