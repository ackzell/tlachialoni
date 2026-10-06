# Data Model: GitHub Release Artifacts

**Date**: 2026-10-06

## Entities

### Tag

| Attribute | Type | Description |
|---|---|---|
| name | string | The git tag name (e.g., `v1.2.3`) |
| version | string | The semantic version (e.g., `1.2.3`) |
| ref | string | The git ref (e.g., `refs/tags/v1.2.3`) |

**Validation Rules**:
- Tag name MUST start with `v` followed by a valid semantic version.
- Version MUST match the version in `package.json`.

**Relationships**:
- A Tag triggers the workflow.
- A Tag names the Release.

---

### Release

| Attribute | Type | Description |
|---|---|---|
| title | string | The tag name (e.g., `v1.2.3`) |
| body | string | The changelog section for that version |
| artifacts | list[Artifact] | The attached files |
| draft | boolean | Always `false` |
| prerelease | boolean | Always `false` |

**Validation Rules**:
- Title MUST equal the tag name.
- Body MUST contain the changelog section for the tagged version.
- Artifacts MUST include at least the `.dmg` and `.zip` files.

**Relationships**:
- A Release is created by the workflow.
- A Release has many Artifacts.

---

### Artifact

| Attribute | Type | Description |
|---|---|---|
| filename | string | The artifact filename (e.g., `Tlachialoni-1.2.3-arm64.dmg`) |
| path | string | The path to the file in the workflow workspace |
| type | string | `dmg` or `zip` |
| signed | boolean | Always `false` (ad-hoc) |

**Validation Rules**:
- Filename MUST contain the version.
- File MUST be produced by `pnpm package`.
- File MUST be attached to the Release.

**Relationships**:
- An Artifact belongs to a Release.

---

## State Transitions

```
Tag pushed ──► Workflow triggered ──► Build started
                                          │
                                          ▼
                                    Version check
                                          │
                           ┌──────────────┴──────────────┐
                           ▼                              ▼
                       Mismatch                        Match
                           │                              │
                           ▼                              ▼
                      Workflow fails              pnpm install
                                                          │
                                                          ▼
                                                    pnpm package
                                                          │
                                                          ▼
                                                   Artifacts built
                                                          │
                                                          ▼
                                                  Release created
                                                          │
                                                          ▼
                                                  Artifacts attached
                                                          │
                                                          ▼
                                                   Workflow succeeds
```
