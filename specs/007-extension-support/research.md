# Research: Extension Support

## Electron's extension support (Electron 44)

From the Electron docs (`Chrome Extension Support`) and `electron.d.ts`:

- `session.extensions.loadExtension(path[, options])` loads an **unpacked**
  directory. Packed `.crx` files are not accepted, and there is no
  `installExtension` for the store.
- Loading is **per session** and supported only in **persistent** sessions;
  in-memory sessions throw.
- Extensions are **not remembered** across app runs; the app must call
  `loadExtension` every boot.
- Supported manifest keys are narrow: `content_scripts`, `devtools_page`,
  `background` (Manifest V2), `host_permissions` (MV3), `permissions`,
  `default_locale`, `name`, `version`, etc. **`background.service_worker` (MV3)
  is hosted, but a worker that throws while starting up is torn down**, so a
  modern service-worker extension that touches an API Electron doesn't compile —
  `chrome.debugger` — loses its background logic.
- `extensions` events: `extension-loaded`, `extension-ready`,
  `extension-unloaded`. `loadExtension` resolves with `{ id, name, version,
  path, url, manifest }` and logs warnings for unsupported APIs.
- `options.allowFileAccess` is only needed to inject into `file://` pages; the
  guest is `http(s)`, so it is left off.

Conclusion: the tool can faithfully install **DevTools extensions and
content-script extensions**, which is exactly the frontend-development use case.
Full store parity is impossible in Electron and is stated as a non-goal upstream.

## Getting a `.crx` from the store

Chrome's update endpoint still serves packages by ID:

```
https://clients2.google.com/service/update2/crx
  ?response=redirect
  &prodversion=<chrome version>
  &acceptformat=crx2,crx3
  &x=id%3D<id>%26uc
```

The response is a CRX container (CRX2 or CRX3). CRX3 layout: `Cr24` magic (4),
version `3` (4), header length (4), signed header, then the raw ZIP payload.
CRX2 layout: `Cr24` (4), version `2` (4), public-key length (4), signature
length (4), public key, signature, then the ZIP. Locating the ZIP offset is all
that is needed before a standard unzip.

This endpoint is unofficial and may change; the unpacked-folder path is the
durable fallback. The tool never bundles or auto-installs anything.

## Unzipping

`fflate`'s `unzipSync` is pure JS and already present transitively (via Vitest's
UI), so promoting it to a direct dependency adds no install weight and no native
build. Archive entries are written only after a path-escape check.

## Session isolation

Because the shell does not need persisted storage (it is local files plus IPC,
with all real state in `state.json`), moving the **shell** to a non-persistent
partition isolates it from extensions without resetting the **guest's** existing
cookies and localStorage. The guest keeps the default session, which is where
`loadExtension` runs.
