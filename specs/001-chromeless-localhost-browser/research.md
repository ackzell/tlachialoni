# Phase 0 Research: Chromeless Localhost Browser

Consolidated decisions from the design interview plus targeted Electron 44 and
Tlapalli investigation. Each section states the decision, why, and what was
rejected. Items marked **(verify in M0)** are assumptions the spike must confirm.

## 1. Runtime and window model

- **Decision**: Electron 44.4.5 with a frameless `BaseWindow` composed of
  `WebContentsView`s — one for the target site, one for the Vue shell.
- **Rationale**: Electron natively docks Chromium DevTools
  (`webContents.openDevTools({ mode })`), which is the feature the whole tool is
  built around. `BaseWindow` + `WebContentsView` is the current supported
  multi-view composition API; `BrowserView` is deprecated. Sibling views allow
  the shell overlay (strip/palette) to sit above the site without touching the
  site's DOM.
- **Alternatives considered**: NW.js (cannot dock DevTools natively; would need a
  `<webview>`-embedded DevTools workaround with extension limitations); Electrobun
  (its default renderer is WKWebView, so no Chromium DevTools; CEF support is
  bundled but has no documented docked DevTools API); plain Chrome `--app`
  (undocked DevTools, no frameless control). All rejected in favor of Electron.
- **Notes**: `WebContentsView` has no `setAutoResize`; re-layout on the window's
  `resize` event using `getContentBounds()`. View bounds are parent-relative DIPs.
  On window `closed`, the views' `webContents` must be closed explicitly.

## 2. DevTools docking and dock-side switching

- **Decision**: open DevTools on the site view with an explicit mode
  (`'bottom' | 'right' | 'left'`). To change sides at runtime, `closeDevTools()`
  then `openDevTools({ mode })`.
- **Rationale**: `openDevTools` applies a dock mode, but calling it while DevTools
  is already open short-circuits, so the new mode is not applied reliably.
  Close+reopen is the supported path. (Electron applies dock state via an
  internal DevTools-frontend call; that path is undocumented and fragile, so it is
  not used.)
- **Alternatives considered**: internal `EUI.DockController...setDockSide()` at
  runtime (rejected: private API, breaks on Chromium upgrades); `undocked`
  (rejected: does not meet the docked requirement).
- **Notes**: `inspectElement(x, y)` coordinates are DIPs relative to the site
  view's viewport (the same space as `before-mouse-event`'s `mouse.x/y`), not
  window or screen coordinates. `#32131`: `view.getBounds()` is not reduced by a
  docked DevTools inset, so an overlay view still spans the docked panel —
  acceptable because our overlays are modal and transient. **(verify in M0)**:
  framing (`frame:false`) does not block docking on macOS; switch among all three
  sides cleanly.

## 3. Input interception and the editable-focus guard

- **Decision**: register app shortcuts with `webContents.on('before-input-event')`
  on every view (site and shell) and route them through one command dispatcher.
  Maintain an `editableFocused` boolean, updated by the guest preload on
  `focusin`/`focusout`, so `⌘←`/`⌘→` fall through to text editing inside inputs.
- **Rationale**: `before-input-event` fires before page key handling and can
  `preventDefault()`, and it is emitted for whichever WebContents has focus — so
  shortcuts work even when focus is in the guest page. The event payload has no
  editability field, and a per-keystroke `executeJavaScript` round-trip is
  wasteful, hence the preload-maintained flag.
- **Alternatives considered**: application menu accelerators (rejected: a menu bar
  violates the chromeless principle); `globalShortcut` (rejected: system-wide, not
  app-scoped); per-keystroke `executeJavaScript('document.activeElement…')`
  (fallback only).

## 4. Navigation policy (local targets, popups)

- **Decision**: a single `nav/policy.ts` validates and normalizes targets. Allowed
  hosts are loopback (`localhost`, `127.0.0.0/8`, `::1`), private ranges
  (`10/8`, `172.16/12`, `192.168/16`), and dev hostnames (`*.localhost`,
  `*.local`, `*.test`); schemes are limited to `http`/`https`. Shorthand `:5173`,
  `5173`, and `localhost:5173` normalize to `http://localhost:5173`. Guest popups
  (`setWindowOpenHandler`) and main-frame navigations to non-local addresses
  (`will-navigate`) are denied and handed to `shell.openExternal`.
- **Rationale**: matches the clarified spec (local-only), and these are the
  Electron-supported interception points. `setWindowOpenHandler` works on a
  `WebContentsView` guest; `will-navigate` covers user/page-initiated main-frame
  navigation only (not `loadURL`/`goBack`, not hash changes, not `target=_blank`).
- **Alternatives considered**: allow any http/https (rejected in clarification);
  reverse-proxy or allowlist UI (rejected: complexity).

## 5. Loading and failure signals

- **Decision**: show the loading veil on `did-start-loading`, hide it on
  `did-finish-load`, and show the failure view on `did-fail-load` when
  `isMainFrame === true` and the Chromium error code indicates a network failure
  (filtering `-3` `ERR_ABORTED`; connection refused is `-102`).
- **Rationale**: there is no first-paint event for on-screen rendering (`paint` is
  offscreen-only), so `did-finish-load` is the safest visible-content signal.
  HTTP 4xx/5xx are not load failures — the server responded — so those render as
  normal pages.
- **Alternatives considered**: `dom-ready` as the hide signal (earlier but can
  precede full render; can be used if `did-finish-load` feels slow); treating HTTP
  errors as failures (rejected: conflicts with how dev servers show error
  overlays).

## 6. Element picker (hover highlight + click to inspect)

- **Decision**: implement the picker in the guest preload. On arm, main messages
  the preload, which attaches capture-phase `mousemove`/`click` listeners and draws
  a `position: fixed; pointer-events: none` highlight box; hover and click events
  are sent to main over a dedicated IPC channel. On click, main calls
  `inspectElement(rectCenterX, rectCenterY)` (page-relative DIPs) and disarms.
- **Rationale**: keeps the protocol off page globals and out of application logs;
  the overlay is created only while armed and removed on disarm, honoring the
  "guest page is sacred" principle. A preload runs in an isolated world for a
  `WebContentsView` guest and can use `contextBridge`/`ipcRenderer`.
- **Alternatives considered**: `executeJavaScript` + `console-message` JSON channel
  (rejected: stringly, collides with app logs, spoofable);
  `executeJavaScriptInIsolatedWorld` injected script (viable fallback, but a
  preload bridge is cleaner and typed). A permanently injected picker (rejected:
  violates the constitution).
- **Cleanup**: disarm removes the node and listeners; a navigation generation
  counter (updated on `did-navigate`/`dom-ready`) hard-disarms and prevents reuse of
  stale element references. **(verify in M0/M3)**: overlay and click capture
  behave correctly with the docked DevTools inset.

## 7. Overlay composition and transparency

- **Decision**: the shell `WebContentsView` spans the window with a transparent
  background (`view.setBackgroundColor('#00000000')`) and renders nothing visible
  until a surface is invoked. Strip and palette are components of that one view.
- **Rationale**: one overlay view avoids managing several transient views and
  input-forwarding complexity; the window itself does not need `transparent: true`
  because the site view behind the overlay is opaque. Sibling views stack in child
  order, and re-adding a view raises it.
- **Alternatives considered**: a separate transparent palette window (rejected:
  positioning/focus sync complexity); a full-window overlay with
  `setIgnoreMouseEvents` forwarding (rejected: fiddly input forwarding). Note:
  `setBorderRadius` cut-outs still capture clicks, so no rounded-corner click-through
  tricks.

## 8. Window dragging

- **Decision**: the strip's page declares `app-region: drag` (with
  `-webkit-app-region` for compatibility) and marks its controls `no-drag`;
  `frame: false` on the `BaseWindow`.
- **Rationale**: confirmed in Electron source that a `WebContentsView` registers a
  draggable-region provider and regions apply only when the window is frameless;
  draggable regions swallow pointer events, so controls need `no-drag`.
- **Alternatives considered**: native title bar / `titleBarStyle: 'hiddenInset'`
  (rejected: the tool wants no title bar at all). When the strip is hidden the
  window is only movable by invoking the strip (`⌘B`) — accepted as the cost of
  chromeless.

## 9. Persisted state and multiple instances

- **Decision**: a hand-rolled, versioned JSON store in `app.getPath('userData')`.
  Writes go to a temp file in the same directory, `fsync`, then `rename` (atomic).
  Scalars are last-writer-wins; the recents list is read-merge-write (dedupe,
  newest first, bounded) so concurrent instances do not lose entries. No
  `requestSingleInstanceLock`, because multiple instances are a feature (FR-023).
- **Rationale**: Electron ships no JSON store; atomic rename prevents readers from
  seeing partial files; merging keeps recents useful across instances.
- **Alternatives considered**: `electron-store`/`conf` (rejected: extra dependency
  for a tiny store, and their locking semantics are no stronger than this for our
  case); a database (rejected: not needed); an OS file lock (optional, deferred —
  acceptable last-writer-wins is specified in FR-004).
- **Shape**: see `contracts/state.schema.json` and `data-model.md`.

## 10. Theme tokens (Tlapalli)

- **Decision**: generate a committed TypeScript module of CSS-variable values for
  all 8 variants × dark/light from Tlapalli's consolidated theme source, via
  `scripts/build-theme-tokens.ts`. The shell references only the CSS variables.
- **Rationale**: Tlapalli is MIT-licensed and its consolidated theme file exposes
  role-named keys (`background`, `text`, `border`, `error`, `element.hover`, …)
  that map cleanly onto shell surfaces — one file, 16 themes, no 16-way parsing at
  runtime.
- **Alternatives considered**: parsing the 16 VSCode `colors` maps at runtime
  (rejected: unnecessary work, and the consolidated map is already role-shaped);
  hand-copying hex values (rejected: drifts from upstream).
- **Sources**: `ackzell/tlapalli-vscode-theme` (`zed-themes/tlapalli.json`), cross-checked
  against the VSCode `colors` keys where a token is missing. Variants: obsidian,
  gold, turquoise, quartz, lapis lazuli, amethyst, jade, fire opal. Attribution
  required by MIT (add `NOTICE`); do not reuse the logo assets.
- **Mapping**: see `contracts/theme-tokens.md`.

## 11. Typography

- **Decision**: `@fontsource-variable/source-code-pro` (5.3.0) imported by the
  renderer entry; Vite emits the woff2 assets into the renderer build with hashed
  names. Font family `'Source Code Pro Variable'` with a system monospace fallback.
- **Rationale**: local bundling means no network at runtime (FR-018); the variable
  package covers the weights the shell needs in one import.
- **Alternatives considered**: `@fontsource/source-code-pro` static weights
  (fine, more imports); a `<link>` to Google Fonts (rejected: network dependency);
  system-only fonts (rejected: violates the Tlapalli identity principle).

## 12. Build and checks

- **Decision**: electron-vite 5.0.0 scaffolds and builds the app (`electron-vite dev`
  / `build` / `preview`); Vite+ 1.0.0-rc supplies `vp check` (format + lint +
  type-check) and `vp test` (Vitest). Vite+ never replaces electron-vite's
  dev/build.
- **Rationale**: electron-vite understands Electron's main/preload/renderer split
  and gives renderer HMR; Vite+ gives the same check ergonomics used in the
  author's other projects with no custom plumbing.
- **Alternatives considered**: Electron Forge + Vite plugin (viable; heavier);
  Vite+ as the primary CLI (rejected: it does not model Electron's three targets);
  hand-rolled Vite config (rejected: needless work). electron-vite v5 notes:
  `externalizeDeps` is on by default; function-form nested configs removed.
- **Renderer entries**: one renderer entry for the shell (the site is a separate
  `WebContentsView`), so multi-entry configuration is not required.

## 13. Testing strategy

- **Decision**: unit-test the pure logic — URL normalization and local-target
  policy, recents merge/dedupe/bound, state schema defaults and migration,
  Tlapalli token mapping — with Vitest via `vp test`. Verify window, DevTools,
  picker, theming, and failure behavior through the scripted scenarios in
  `quickstart.md`.
- **Rationale**: the risky parts are UI/OS integration, which unit tests cannot
  cover; the deterministic logic is exactly what benefits from tests.
- **Alternatives considered**: full E2E automation with a driver (deferred: heavy
  for a personal tool at this stage; the quickstart scenarios are the acceptance
  path).

## Open items to confirm during implementation

1. Docked DevTools inside a `WebContentsView` on macOS, all three sides, frameless **(M0, gate)**.
2. Which hide signal (did-finish-load vs dom-ready) feels right against real dev servers **(M1)**.
3. Picker overlay + click capture with the docked panel inset **(M3)**.
4. DevTools theme actually follows `nativeTheme.themeSource` on macOS builds **(M4)**.
5. Whether the palette overlay visually covering docked DevTools is acceptable, or an inset is needed **(M2/M4)**.
