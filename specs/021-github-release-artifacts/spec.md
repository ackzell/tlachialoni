# Feature Specification: GitHub Release Artifacts

**Feature Branch**: `021-github-release-artifacts`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "we will update the spec 006. we now will implement a release workflow involving packaging and putting artifacts on github"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Push a tag, get a downloadable release (Priority: P1)

The maintainer finishes a batch of work, runs `pnpm tag` to bump the version and
create a `vX.Y.Z` tag, then pushes to GitHub with `git push --follow-tags`. Within
minutes, a GitHub Release appears with the `.dmg` and `.zip` artifacts attached —
anyone can download them from the Releases page. No local packaging step is needed
to share the app.

**Why this priority**: This is the entire request. Today, sharing the app means
packaging locally and manually distributing the artifact. The goal is to make the
GitHub Release the distribution channel.

**Independent Test**: Push a `v*` tag to GitHub, wait for the workflow to finish,
and confirm a GitHub Release exists with the correct artifacts attached.

**Acceptance Scenarios**:

1. **Given** a `vX.Y.Z` tag is pushed to GitHub, **When** the workflow completes,
   **Then** a GitHub Release is created with the tag name as its title.
2. **Given** the workflow runs, **When** it finishes, **Then** the release has
   the `.dmg` and `.zip` files attached and downloadable.
3. **Given** the workflow runs, **When** it finishes, **Then** the release body
   contains the changelog section for that version.
4. **Given** the workflow runs, **When** it finishes, **Then** the artifacts are
   ad-hoc signed (no Developer ID), matching the local build behavior.

---

### User Story 2 - Version mismatch fails the build (Priority: P2)

The maintainer pushes a tag whose version does not match `package.json`. The
workflow fails immediately with a clear error, preventing a mismatched release
from being published.

**Why this priority**: A release with wrong version metadata is worse than no
release — it confuses users and breaks the version-as-single-source-of-truth
principle from spec 006.

**Independent Test**: Push a tag with a version that does not match `package.json`
and confirm the workflow fails.

**Acceptance Scenarios**:

1. **Given** a tag `vX.Y.Z` where `X.Y.Z` does not match the version in
   `package.json`, **When** the workflow runs, **Then** it fails with a clear
   error message.
2. **Given** the version matches, **When** the workflow runs, **Then** it
   proceeds to build and release.

---

### Edge Cases

- **Tag pushed without workflow permissions**: the workflow needs `contents: write`
  to create a release; without it, the build succeeds but release creation fails.
- **Large artifacts**: `.dmg` files can be large; GitHub Releases have a 2GB
  per-file limit, which is sufficient for this app.
- **Concurrent tag pushes**: two tags pushed simultaneously may race; GitHub
  Releases handles this gracefully (last write wins).
- **Workflow fails mid-build**: no release is created; the tag exists but has no
  artifacts. The maintainer can re-run the workflow or delete and re-tag.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A GitHub Actions workflow MUST trigger on push of `v*` tags.
- **FR-002**: The workflow MUST run on a macOS runner (the app is macOS-only).
- **FR-003**: The workflow MUST verify that the tag version matches the version
  in `package.json`; on mismatch, it MUST fail with a clear error.
- **FR-004**: The workflow MUST run `pnpm install` and `pnpm package` to build
  the `.dmg` and `.zip` artifacts.
- **FR-005**: The workflow MUST create a GitHub Release with the tag name as the
  title and the changelog section for that version as the body.
- **FR-006**: The workflow MUST attach the `.dmg` and `.zip` files to the release.
- **FR-007**: The workflow MUST NOT sign or notarize the artifacts (ad-hoc only,
  matching local build behavior).
- **FR-008**: The workflow MUST have `contents: write` permission to create
  releases.
- **FR-009**: The existing local release flow (`pnpm tag && pnpm package`) MUST
  continue to work unchanged.
- **FR-010**: The workflow MUST NOT publish to npm, Open VSX, or any other
  registry — GitHub Releases only.

### Key Entities _(include if feature involves data)_

- **Release**: the GitHub Release created by the workflow, with a title, body,
  and attached artifacts.
- **Artifact**: the `.dmg` and `.zip` files produced by `pnpm package`, attached
  to the release.
- **Tag**: the `vX.Y.Z` git tag that triggers the workflow and names the release.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pushing a `v*` tag produces a GitHub Release with downloadable
  artifacts in under 10 minutes.
- **SC-002**: The release body contains the correct changelog section for the
  tagged version.
- **SC-003**: The attached artifacts match what `pnpm package` produces locally
  (same filenames, same version stamping).
- **SC-004**: A version mismatch between the tag and `package.json` causes the
  workflow to fail with a clear error.
- **SC-005**: The local release flow (`pnpm tag && pnpm package`) continues to
  work without modification.

## Assumptions

- The maintainer has a GitHub account with a personal access token (or uses
  the automatic `GITHUB_TOKEN`) sufficient to create releases.
- The repository is public or the maintainer is comfortable with private
  releases; no specific visibility requirement is stated.
- No signing or notarization is required for the initial release; the app is
  distributed ad-hoc signed, same as local builds.
- The workflow uses `macos-latest` runner (or a pinned macOS version) since
  the app is macOS-only.
- The changelog extraction logic follows the same pattern used in the
  `tlapalli-vscode-theme` project (extract version section from `CHANGELOG.md`).
- No retention policy for artifacts is specified; GitHub's default release
  artifact retention applies.
