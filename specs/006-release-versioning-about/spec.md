# Feature Specification: Release Versioning & About Panel

**Feature Branch**: `006-release-versioning-about`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "How are we versioning the updates to this project? I want the same thing I have on tlapalli-vscode-theme/package.json: I can run the tag command and it does the rest — for now we can skip the GitHub Actions, having the tags with versions for the artifacts locally is enough. I also would like the About dialog to show the logo, the version and the release date."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cut a release with one command (Priority: P1)

The maintainer finishes a batch of work, commits it with Conventional Commit
messages, and runs `pnpm tag`. The command reads the commits since the last
release, decides the next semantic version, writes that version into
`package.json`, generates/updates `CHANGELOG.md`, commits the version bump, and
creates the `vX.Y.Z` git tag — all in one step, with no hand-edited files and no
network access.

**Why this priority**: This is the entire request. Today there is no versioning
ritual at all: `package.json` sits at `0.1.0` and there are no tags, so there is
no record of what shipped. Everything else builds on having tagged releases.

**Independent Test**: From a clean tree, run `pnpm tag`, confirm the version
changed in `package.json`, `CHANGELOG.md` gained an entry for it, and
`git tag` lists the new `vX.Y.Z` tag pointing at a release commit.

**Acceptance Scenarios**:

1. **Given** committed `feat:`/`fix:` work since the last tag, **When** the
   maintainer runs `pnpm tag`, **Then** the version bumps by the rule implied
   by those commits (minor for features, patch for fixes), `CHANGELOG.md` records
   the change, and a `vX.Y.Z` tag is created.
2. **Given** the maintainer wants a specific level, **When** they run
   `pnpm tag:minor` or `pnpm tag:major`, **Then** the version is forced to
   that level regardless of the commit mix.
3. **Given** a repository that has never been tagged, **When** the maintainer
   runs `pnpm tag:first`, **Then** the current version is tagged as the
   baseline without an invented bump, so every later `tag` computes from it.
4. **Given** the command runs, **When** it finishes, **Then** the working tree
   contains no changes beyond the version and changelog files the command wrote.

---

### User Story 2 - The About panel names what is running (Priority: P1)

The maintainer opens **Tlachialoni → About Tlachialoni** and sees the app's logo,
its version, and the date that version was released — enough to know exactly which
build is running when reporting or comparing behavior.

**Why this priority**: The About panel is the only place the app states its own
identity. The version already appears; the release date is what makes it possible
to map a running app back to a release.

**Independent Test**: Open the About panel in a packaged build and compare the
shown version and release date against `package.json` and the `vX.Y.Z` tag date.

**Acceptance Scenarios**:

1. **Given** a packaged build of a tagged version, **When** the About panel is
   opened, **Then** it shows the logo, the version matching `package.json`, and
   the release date matching that tag.
2. **Given** a build made before any tag exists, **When** the About panel is
   opened, **Then** the release date falls back to the build date and the panel
   still renders.
3. **Given** the app is running installed without the repository, **When** the
   About panel is opened, **Then** logo, version, and release date all resolve
   without the source tree or the network.

---

### User Story 3 - Local artifacts carry the version (Priority: P2)

The maintainer packages a release and finds the version already stamped into the
app bundle and the artifact filenames, so several releases can coexist locally and
a downloaded file identifies itself.

**Why this priority**: Versioned artifacts are what make local-only releases
useful without a publishing pipeline; they are cheap once the version is the
single source of truth.

**Independent Test**: Run `pnpm package` for a bumped version and confirm the
bundle reports that version and the `.dmg`/`.zip` names include it.

**Acceptance Scenarios**:

1. **Given** a bumped version in `package.json`, **When** the maintainer runs
   `pnpm package`, **Then** the produced `.dmg`/`.zip` filenames contain the
   version and the installed app reports the same version in the About panel.

---

### Edge Cases

- **No tags yet**: the first tag must establish a baseline (`tag:first`) rather
  than counting all history as one release; after that, `tag` bumps from the last
  tag.
- **Nothing to release**: running `tag` with no releasable commits must not
  invent a version; the command reports that there is nothing to release.
- **Pre-existing tag for the version**: if `v<version>` already exists, the release
  date is that tag's date; the tag command must refuse to double-tag.
- **Building outside a git checkout** (exported source, future CI): the release
  date falls back to the build date without failing the build.
- **Dirty tree**: the tag command must not silently fold unrelated uncommitted
  work into the release commit.
- **Changelog conflicts**: a merge conflict in `CHANGELOG.md` is resolved by hand
  like any other file; the command makes no attempt to merge histories.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `pnpm tag` MUST bump the version according to the Conventional
  Commit messages since the last tag, write it to `package.json`, update
  `CHANGELOG.md`, commit those files, and create an annotated `vX.Y.Z` tag.
- **FR-002**: `pnpm tag:minor` and `pnpm tag:major` MUST force the bump
  level; `pnpm tag:first` MUST tag the current version as the initial baseline
  without bumping.
- **FR-003**: Version changes MUST be produced only by the tag commands (no
  hand-edited version), and `package.json` MUST remain the single declaration
  site for the version.
- **FR-004**: Releasing MUST be local-only in this feature: no publishing step, no
  remote push, and no CI workflow is added or required. **Note**: This requirement
  is superseded by `specs/021-github-release-artifacts/spec.md`, which adds a
  GitHub Actions workflow for automated releases.
- **FR-005**: The About panel MUST show the app logo, the application name, the
  version, and the release date.
- **FR-006**: The release date MUST be the date of the git tag matching the
  current version; when no such tag exists, it MUST fall back to the build date.
- **FR-007**: Version and release date MUST be resolved at build time and baked
  into the artifact; the packaged app MUST NOT read git, the source tree, or the
  network to obtain them.
- **FR-008**: `pnpm package` MUST continue to produce the standalone macOS
  artifact and MUST stamp the version into the bundle and artifact filenames.
- **FR-009**: The existing development, build, check, and test workflows MUST
  continue to work unchanged.
- **FR-010**: The tag commands MUST NOT mutate tracked files other than the
  version and changelog files they are responsible for.

### Key Entities _(include if feature involves data)_

- **Version**: the semantic version string in `package.json`; drives the app
  bundle, artifact filenames, the About panel, and the tag name.
- **Release tag**: the annotated `vX.Y.Z` git tag; its date is the release date.
- **Changelog**: `CHANGELOG.md`, generated from Conventional Commits and committed
  with each release.
- **Release date**: the human-readable date shown in the About panel, derived from
  the release tag at build time.
- **Artifact**: the packaged `.app`/`.dmg`/`.zip` produced by electron-builder,
  carrying the version in its name and bundle.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A release (bump + changelog + commit + tag) is produced by one
  command with zero hand-edited version or changelog files.
- **SC-002**: Every packaged build opened without the repository shows the correct
  version and a release date that matches the tag date for tagged releases.
- **SC-003**: The version shown in the About panel equals the version in
  `package.json` equals the version in the artifact filename, in 100% of releases.
- **SC-004**: No new runtime dependency, network call, or source-tree read is
  introduced for release metadata (offline UI is preserved).
- **SC-005**: `pnpm dev`, `pnpm build`, `pnpm check`, and `pnpm test`
  all still succeed after the change.

## Assumptions

- Releases are cut by the maintainer on their own machine; distribution and
  signing remain out of scope (003).
- Commit messages follow Conventional Commits, as the existing history already
  does; no commit hook or commitizen UI is added in this feature.
- The About surface stays the native macOS About panel (not a custom in-app
  dialog); the logo already renders there and is unchanged.
- `commit-and-tag-version` is the chosen tooling, matching the maintainer's other
  project, and is a build-time-only dependency.
- The release date is shown in the panel's credits area as a short, human-readable
  date.
- No git tag push and no GitHub Actions are part of this feature; they may be
  added later without restructuring.
