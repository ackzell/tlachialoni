# Quickstart: Extension Support

## Install from the Chrome Web Store

1. Press `⌘P`.
2. Paste a store URL (for example
   `https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi`)
   or the raw ID.
3. Choose **Install extension …** and press Enter.
4. Watch the status surface advance: looking up → downloading (with a progress
   bar) → verifying → unpacking → loading → done.
5. Open DevTools and confirm the extension's panel is present.

## Install an unpacked extension

1. Press `⌘P`, choose **Install extension from folder …**, pick a folder with a
   `manifest.json`.
2. Confirm the folder is copied into the tool's extension storage (the source
   folder can then be moved away).

## Manage

With `⌘P`:

- **Extension: {name}** — toggle enabled / disabled.
- **Update Extension: {name}** — refresh a store install.
- **Remove Extension: {name}** — unload and delete.
- **Reload Extensions** — re-load every enabled extension.
- **Reveal Extensions Folder** — open the storage folder in Finder.

## Where things live

- Extension folders: `<userData>/extensions/<slug>/`.
- Records: `state.json` (`extensions` array, schema version 2).

## Notes and limits

- Electron loads only unpacked extensions, so store installs download and unpack
  a `.crx`; the download endpoint is unofficial and the folder path is the
  fallback.
- Electron supports a subset of extension APIs, so some store extensions load
  and run only partially (notably anything that needs `chrome.debugger`, and an
  MV3 service worker that throws while starting up).
- Extensions run only against the guest page; the shell cannot be injected.
