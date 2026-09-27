# Contract: Packaging Command

The user-facing interface of this feature is a single command that produces an
installable artifact. This contract fixes its inputs, effects, and outputs.

## Command

```sh
npm run package
```

### Prerequisites

- macOS 13+ on Apple silicon.
- Dependencies installed (`npm install`) — including the new `electron-builder`
  devDependency (build-time only).
- No signing credentials required.

### Behavior

1. Build the app with electron-vite (`electron-vite build` → `out/`).
2. Package `out/` with electron-builder into a macOS app bundle and containers.
3. Write everything to `release/` (gitignored). No tracked file is modified.

An equivalent `npm run package:mac` (or `build:mac`) alias MAY exist for clarity;
the canonical command is `package`.

### Effects

| Effect                    | Location                                    |
| ------------------------- | ------------------------------------------- |
| Intermediate build        | `out/`                                      |
| App bundle                | `release/mac-arm64/Tlachialoni.app`         |
| Disk image                | `release/Tlachialoni-<version>.dmg`         |
| Zip archive               | `release/Tlachialoni-<version>-mac.zip`     |
| Signed / notarized        | **No** (deferred; see notes)                |

Final file names follow electron-builder's `productName`/`version` conventions; the
contract is the *contents and location*, not the exact casing of every file.

### Exit codes

- `0` — artifact produced.
- non-zero — fail loudly; a missing or malformed icon MUST NOT yield a bundle with
  a default icon.

### Guarantees (mapped to requirements)

- FR-001/FR-002: one command → a double-clickable `.app` that runs without the repo.
- FR-006/FR-009: only `out/` and `release/` are written; both ignored by git.
- FR-007: succeeds without signing credentials; unsigned output is expected.
- FR-008: does not change `npm run dev`, `npm run build`, `npm run preview`,
  `npm run check`, or `npm run test`.

### Notes / non-goals

- **Signing & notarization** are deferred. An unsigned bundle is blocked by
  Gatekeeper on first launch from another machine; the user opens it via
  right-click → Open, or clears the quarantine attribute. The configuration keeps
  `mac.identity`/notarization available so enabling them is additive.
- **Windows/Linux** targets are out of scope.
- **Universal/Intel** builds are out of scope (`arm64` only).
