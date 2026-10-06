# Quickstart: GitHub Release Artifacts

**Date**: 2026-10-06

This guide validates that the GitHub Release workflow works end-to-end.

## Prerequisites

- A GitHub repository with the workflow file (`.github/workflows/release.yml`)
- A `v*` tag pushed to the repository
- The tag version matches `package.json`

## Validation Steps

### 1. Push a tag

```bash
# Ensure the working tree is clean
git status

# Create and push a tag (or use an existing one)
git tag v0.1.13
git push origin v0.1.13
```

### 2. Wait for the workflow

Go to the repository's **Actions** tab and watch the `Release` workflow run.
It should complete in under 10 minutes.

### 3. Verify the release

Go to the repository's **Releases** page. You should see a new release with:

- **Title**: `v0.1.13` (matching the tag)
- **Body**: The changelog section for version 0.1.13
- **Assets**:
  - `Tlachialoni-0.1.13-arm64.dmg`
  - `Tlachialoni-0.1.13-arm64-mac.zip`

### 4. Download and install

Download the `.dmg`, open it, and drag `Tlachialoni.app` to `/Applications`.
Launch the app and verify:

- The app opens correctly
- The About panel shows version `0.1.13`
- The release date matches the tag date

## Expected Outcomes

| Check | Expected |
|---|---|
| Workflow status | Success |
| Release created | Yes |
| Release title | Matches tag name |
| Release body | Contains changelog for version |
| DMG attached | Yes |
| ZIP attached | Yes |
| App installs | Yes |
| About panel version | Matches tag version |

## Failure Cases

| Case | Expected Behavior |
|---|---|
| Tag version ≠ package.json version | Workflow fails with clear error |
| Workflow fails mid-build | No release created |
| Large artifacts (>2GB) | GitHub rejects upload |
