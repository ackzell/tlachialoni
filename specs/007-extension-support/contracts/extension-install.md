# Contract: Extension Installation

## Input recognition (`src/shared/extension-id.ts`)

`parseExtensionId(input: string): string | null`

Returns the 32-character extension ID (`[a-p]`) when `input` is:

- a raw ID (`^[a-p]{32}$`), or
- a Chrome Web Store URL whose path contains such a segment, on host
  `chromewebstore.google.com`, `chrome.google.com`, or
  `chromewebstore.googleusercontent.com` (e.g.
  `https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi`).

Otherwise `null`. Pure; used by both the palette (to offer an install row) and
the installer (to resolve an ID).

## Container (`src/main/extensions/crx.ts`)

`crxZipOffset(buffer: Buffer): number` — the byte offset of the ZIP payload.
Throws on a non-CRX magic or an unknown version. CRX3: `12 + headerLength`.
CRX2: `16 + publicKeyLength + signatureLength`.

`extractCrxToDir(buffer: Buffer, destDir: string): void` — extracts the ZIP
payload into `destDir`. Every entry name is normalized to forward slashes and
refused if it is absolute or contains a `..` segment that resolves outside
`destDir` (FR-012). Directory entries are created; file entries are written.

`readManifest(dir: string): { name: string; version: string }` — reads and
parses `manifest.json`; throws a readable error when it is missing or invalid.

## Manager (`src/main/extensions/manager.ts`)

```ts
type Source = "store" | "folder";

interface InstalledExtension {
  slug: string; id: string; name: string; version: string;
  source: Source; enabled: boolean; installedAt: number;
}

class ExtensionManager {
  constructor(opts: { store: StateStore; session: Electron.Session; root: string });
  onChange: (() => void) | null;
  onStatus: ((status: ExtensionStatus) => void) | null;

  loadAll(): Promise<void>;
  installFromStore(input: string): Promise<CommandResult>;
  installFromFolder(): Promise<CommandResult>;
  setEnabled(slug: string, enabled: boolean): Promise<CommandResult>;
  toggle(slug: string): Promise<CommandResult>;
  remove(slug: string): Promise<CommandResult>;
  update(slug: string): Promise<CommandResult>;
  revealRoot(): void;
}
```

Invariants:

- Extensions load only into `opts.session` (the guest session). The shell runs in
  a different session and is never passed here.
- Every mutating method ends by writing state and calling `onChange`; every
  install/update emits `onStatus` at each phase and a terminal `done`/`error`.
- A failed install leaves no folder under `root` and no record in state.
- `remove` unloads the extension (if loaded) before deleting its folder.

## Status phases

`resolving → downloading → verifying → extracting → loading → done | error`

`downloading` carries `progress: { received, total | null }`; `total` is `null`
when the response has no content length. `done` and `error` are terminal.

## Palette rows

| Query | Rows added |
| --- | --- |
| parses as an extension ID/URL | `extensions.install` with the ID as argument (there is no standalone store-install command, so a blank palette shows no dead entry) |
| any installed extension | `extensions.toggle` (arg `slug`), `extensions.remove` (arg `slug`), and for `source: "store"` also `extensions.update` (arg `slug`) |

Row keys are namespaced (`extension.install`, `extension:toggle:<slug>`, …) so
they never collide with target or command rows.
