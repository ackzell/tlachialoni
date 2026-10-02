# Contract: Release Command

The release surface is a small set of npm scripts. This contract fixes what each
does so releases stay reproducible and local.

## Commands

| Script             | Command                                                    | Effect                                                                 |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm tag:first`| `commit-and-tag-version --first-release -- --no-verify`    | Tag the current `package.json` version as the baseline; generate changelog; **no bump** |
| `pnpm tag`      | `commit-and-tag-version -- --no-verify`                    | Bump by Conventional Commits, write changelog, commit, tag `vX.Y.Z`    |
| `pnpm tag:minor`| `commit-and-tag-version --release-as minor -- --no-verify` | Same, forcing a minor bump                                             |
| `pnpm tag:major`| `commit-and-tag-version --release-as major -- --no-verify` | Same, forcing a major bump                                             |

## Rules

- **Single writer**: only these scripts change `package.json` → `version`.
- **Local only**: the command commits and tags locally. It MUST NOT push to a
  remote, and no CI workflow is added by this feature.
- **Bounded mutation**: the commit created by the command contains the version and
  changelog files only; unrelated uncommitted work is not folded in.
- **No network**: the command runs offline.
- **Ordering for artifacts**: for a release artifact to carry the tag's date, tag
  first, then `pnpm package` (see `contracts/release-identity.md`).

## First release runbook

1. `pnpm tag:first` — establishes `v0.1.0` from the current history.
2. Commit later work with Conventional Commits.
3. `pnpm tag` — bumps and tags the next version.
4. `pnpm package` — produces versioned artifacts in `release/`.

## Out of scope

- Pushing tags (`git push --follow-tags`), publishing, and GitHub Actions. These
  may be added later without changing the command shapes above.
