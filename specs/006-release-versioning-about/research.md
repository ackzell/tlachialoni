# Research: Release Versioning & About Panel

Phase 0 decisions for `006-release-versioning-about`. Each decision is recorded
with the alternatives that were considered and why they were not chosen.

## D1 — Release tool: `commit-and-tag-version`

**Decision**: Use `commit-and-tag-version` (devDependency, build-time only) with
`tag` / `tag:minor` / `tag:major` / `tag:first` scripts, exactly mirroring
`tlapalli-vscode-theme`.

**Why**: The repository history already follows Conventional Commits, which is the
input the tool consumes. The maintainer already uses this tool and its workflow
(deterministic bump, generated `CHANGELOG.md`, annotated `vX.Y.Z` tag), so there is
no new mental model and no new hosted service. It requires no network at release
time.

**Alternatives considered**:

- *Hand-rolled `scripts/release.ts`*: avoids a dependency but re-implements commit
  parsing, changelog formatting, and tag creation — more code to maintain and to
  get wrong, for no benefit here.
- *`release-it`*: more powerful (plugins, hooks, publishing) but a new tool with
  more configuration; its extra power is exactly the CI/publishing surface this
  feature defers.

## D2 — Release scope: local only

**Decision**: No remote push, no GitHub Actions, no publishing. The command
commits and tags locally; artifacts are produced separately by `npm run package`.

**Why**: The request explicitly defers CI ("for now we can skip the GitHub
Actions"), and the maintainer installs artifacts locally. Keeping the command
local also keeps it fast and offline.

**Deferred**: A future feature can add `git push --follow-tags` (the theme's
`publish` script) and a release workflow without changing the tag command's shape.

## D3 — Baseline for the first release

**Decision**: Provide `npm run tag:first`
(`commit-and-tag-version --first-release`), used once to tag the current `0.1.0`
as the baseline, generating the changelog from existing history without an
invented bump. Subsequent releases use `npm run tag`.

**Why**: With no tags, the tool would treat the entire history as one release and
apply a bump on top of `0.1.0`. Tagging the baseline explicitly makes every later
bump computed from a known point and keeps the first changelog meaningful.

## D4 — Version: keep `package.json` as the single source

**Decision**: The version continues to live only in `package.json`; the tools that
need it derive from there. No version literal is added to source.

**Why**: The constitution's Packaging & Distribution clause requires one source of
truth for version/identifier, and 003's `contracts/app-identity.md` already names
`package.json` as that site. electron-builder inherits it for the bundle and
artifact filenames; `app.getVersion()` exposes it at runtime.

## D5 — Release date: tag date baked in at build time

**Decision**: In `electron.vite.config.ts`, resolve the release date as the creation
date of the tag `v<package.version>` using
`git for-each-ref --format=%(creatordate:short) refs/tags/<tag>`; if the tag does
not exist (or git is unavailable), fall back to the current build date. Inject the
ISO date into the main bundle with electron-vite's `define` as
`__APP_RELEASE_DATE__`.

**Why**: The release date is a property of the release, not of the machine or the
moment of building, so the tag is the authoritative source. Baking it in at build
time satisfies FR-007 (no runtime git/source/network read) and works inside the
asar. `creatordate` yields the tagger date for the annotated tags that
`commit-and-tag-version` creates.

**Alternatives considered**:

- *Tracked release-date file written by the tag command*: exact and stable, but
  adds a second generated file and a custom `.versionrc` hook to keep in sync; the
  tag already carries the date.
- *Commit date (`git log -1 --format=%cs <tag>`)*: works, but reports the commit's
  date rather than the tag's; `creatordate` is the more precise signal.
- *Build date always*: wrong for a release cut on a different day than it was
  packaged, and indistinguishable across rebuilds.
- *Runtime read of a `package.json` field*: requires a writer at tag time and
  ships extra metadata; `define` is simpler.

## D6 — About surface: native macOS panel, credits line

**Decision**: Keep the native About panel (`app.setAboutPanelOptions`) and add the
release date as its `credits` string, formatted by a pure
`formatReleaseDate` helper in `src/shared/release.ts`. Name, version, and icon are
unchanged.

**Why**: The user confirmed the native panel already shows the logo and chose to
keep it. `credits` is the documented macOS field for free text below the version
line, so no custom UI, no new shell surface, and no motion work are needed. A pure
formatter keeps the only new logic unit-testable.

**Alternatives considered**:

- *Custom in-app dialog*: rejected by the user; would add a shell surface, command
  registration, motion, and dismissal rules for no requested benefit.
- *Putting the date in `version` (build version field)*: the field is meant for a
  build number, and the panel already shows the app version; `credits` reads
  better and does not overload version semantics.
