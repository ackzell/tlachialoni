# Phase 0 Research: Test Card Demo Site

The repository already has Vite 7, Vue 3, the Vue plugin, and a pnpm install.
The feature therefore has no build-stack unknown. Research focused on the parts
that decide whether the six clips work in one take: **where the app lives and how
it starts**, **how an edit stays live without a full reload**, **how the reload
proof survives that**, **how the local probe appears in Network**, and **how the
neutral page can show off eight shell themes without competing with them**.

---

## 1. App placement and startup

- **Decision**: Create one Vite SPA at `examples/test-card` with its own
  `vite.config.ts` and `index.html`. The root `package.json` gains
  `"test-card": "vite --config examples/test-card/vite.config.ts"`. The config
  sets `root` to the example directory, applies `@vitejs/plugin-vue`, and asks
  for port 3000 with `strictPort: false` so a busy port falls through to the next
  free one and Vite prints the address. The example has no `package.json` and no
  workspace entry; it reuses the repository's installed Vite, Vue, and plugin.
  `vue-router` is added to the root dependencies because it is the only runtime
  package the example needs beyond Vue.
- **Rationale**: The maintainer runs `pnpm install` once, then `pnpm test-card`,
  which is the one-command rule. Reusing the root install avoids a second install
  step and a workspace package that exists only for a demo. `examples/` is
  outside the packaged file list (`out/**`, `package.json`, `resources/icon.png`),
  so the demo cannot leak into the shipped app.
- **Alternatives considered**:
  - *A standalone package under `examples/test-card` with its own `package.json`*:
    rejected — it needs its own install and a workspace entry, so a fresh clone
    needs more than the documented command.
  - *Serving the example through the root electron-vite config*: rejected — it
    would start the Electron shell, not the plain guest page, and would mix the
    demo into the app build.
  - *A static HTML page served by `npx serve`*: rejected — no Vue component tree
    for the Vue DevTools clip, no HMR, and it would add a package or a global
    install.
  - *Serving the example on a random Vite port*: rejected — the default target is
    `http://localhost:3000`, and recordings should not need a palette edit.

## 2. One edit file that Vite updates in place

- **Decision**: Put the recording values and the placeholder copy in
  `src/edit-points.ts`. The file opens with a banner comment that names the three
  edit points and the save behavior. It exports:
  - a `reactive` `editPoints` object with `accentHue`, `headline`, `layout`, and
    a nested `copy` set;
  - a computed `editCssVars` object that maps those values to CSS custom
    properties (`--accent-h`, `--stage-columns`, and the compact gap);
  - a `normalizeEditPoints` function that keeps a malformed hue, headline, or
    layout from blanking the page;
  - a self-accepting HMR block that copies the new module's values into the
    existing reactive object:

    ```ts
    import.meta.hot?.accept((next) => {
      if (next) Object.assign(editPoints, next.editPoints);
    });
    ```

  `App.vue` binds `editCssVars` on the root element and `data-layout` from the
  config. Plain CSS rules consume the variables; no other file holds a recording
  value or page copy.
- **Rationale**: A single file is the jump target for the recording. Editing a
  plain TypeScript module without an HMR boundary makes Vite reload the page,
  which would increment the load counter and fail SC-002. Self-accepting the
  module keeps the Vue app and the reactive object alive. Mutating the existing
  object means every component that already imported it re-renders; the computed
  CSS variables update at the same time.
- **Alternatives considered**:
  - *CSS custom properties in a stylesheet plus a config object in a second
    file*: rejected — the spec and the recording flow want one clearly marked
    place, and the headline cannot live in CSS alone.
  - *An SFC that holds the state*: rejected — values would sit in script and style
    blocks of a component, and a full component reload is less predictable than
    a module self-accept.
  - *No HMR accept block*: rejected — a normal TS dependency update falls through
    to a full reload, so the reload counter would change during a live-edit clip.
  - *Editing the CSS variables directly in DevTools*: rejected — the scenario is
    an editor save, not a DevTools edit.

## 3. A real Vue app for the Vue DevTools clip

- **Decision**: Build a real Vue 3 SPA with `<script setup>` components, named
  components, Vue Router, and the reactive `editPoints` object visible as normal
  setup state. Start it with the Vite dev server. Do not set
  `__VUE_PROD_DEVTOOLS__`, bundle the extension, or fake a component tree.
- **Rationale**: Vite's dev server uses Vue's development build, so the
  developer-installed Vue DevTools extension detects the app, shows the component
  tree, and exposes the reactive config. Named components (`App`, `PageHeader`,
  `LoadProof`, `LandmarkPanel`, `CardOne`, `CardTwo`, `CardThree`) make the tree
  readable in the extension clip. The extension remains a normal guest-session
  extension, installed by the developer, not shipped with Tlachialoni.
- **Alternatives considered**:
  - *A production build with `__VUE_PROD_DEVTOOLS__`*: rejected — the recording
    runs from the dev server, so the flag adds config without a benefit.
  - *A static page or a non-Vue app*: rejected — the extension clip needs a real
    Vue app to inspect.
  - *Pre-installing Vue DevTools with the demo*: rejected — violates the
    constitution's extension rule and the spec's out-of-scope boundary.

## 4. Three pages via Vue Router, without counting route moves as reloads

- **Decision**: Use `vue-router` with `createWebHistory(import.meta.env.BASE_URL)`
  and three routes: `/` (Card 01 · Signal), `/grid` (Card 02 · Grid), and
  `/notes` (Card 03 · Notes). Each route has a unique `meta.title`;
  `router.afterEach` writes it to `document.title`. A `/:pathMatch(.*)*` route
  renders a small NotFound page with a link home. A shared header links all three
  pages and marks the current one with `aria-current="page"`.
- **Rationale**: The three pages live in one document. Link clicks and back/forward
  are same-document history moves, so the load proof does not increment and a
  reload remains a distinct event. Vite's SPA fallback serves `index.html` for a
  direct path, so `/notes` opens correctly. Unique paths and titles make history
  movement unambiguous.
- **Alternatives considered**:
  - *Three separate HTML documents*: rejected — every link click is a full load,
    so the load counter rises during a history clip and the reload proof stops
    meaning "the maintainer reloaded".
  - *Hash history*: viable, but web history gives cleaner distinct paths for the
    history recording and needs no extra code.
  - *Manual `history.pushState`*: rejected — Vue Router already provides route
    matching, links, fallback, and title metadata.
- **Existing-shell note**: The Tlachialoni history overlay is a directional arrow,
  not a list of entries. The page itself must carry the visible change. The spec's
  history requirement was tightened to unique routes and titles plus an obvious
  page identity, which this design satisfies. The overlay still points the
  correct way during a trackpad gesture.

## 5. Reload proof in `sessionStorage`

- **Decision**: Store one JSON value at `test-card:load-proof`:
  `{ count: number, lastLoadAt: number }`. In `main.ts`, before mounting, read the
  value, validate it, add one to the count, set `lastLoadAt` to the current time,
  write it back, and pass the result to `App.vue` as a prop. `App.vue` formats the
  time once with `Intl.DateTimeFormat` and never ticks it. The count is padded to
  two digits for the still. If storage is unavailable or the value is corrupt,
  the page starts at count 1 with the current time and stays usable.
- **Rationale**: `sessionStorage` is per top-level browsing context: it survives a
  reload and a hard reload in the same tab, survives route changes, and resets in
  a new tab or window. Initializing in `main.ts` means an HMR component remount
  cannot bump the count; only a real document load runs that code. A single JSON
  key keeps the count and time consistent.
- **Alternatives considered**:
  - *`localStorage`*: rejected — it is shared by every tab and window, so a new
    tab would not show the start-at-1 behavior the spec asks for.
  - *A module-level counter*: rejected — it resets on every reload, so it cannot
    prove a reload.
  - *A cookie*: rejected — cookies are shared and are sent to the server; this is
    local presentation state.
  - *A count-only or time-only proof*: rejected — a count change is the clearest
    single-frame signal, and the time adds a second independent cue.
  - *A ticking clock*: rejected — it would break the calm default and add motion
    to every idle frame.

## 6. Local JSON probe

- **Decision**: Add `public/probe.json` with a short JSON body. The primary action
  builds a same-origin URL, adds a unique `?at=<timestamp>-<counter>` query, and
  calls `fetch(url, { cache: "no-store" })`. It measures elapsed time with
  `performance.now()`, parses the JSON, and puts a text result in the status card:
  success with status and milliseconds, or a readable failure. Each click produces
  a new URL, so each request is a separate Network entry. The action also writes
  one short console line. A failure writes a second console error and keeps the
  page usable.
- **Rationale**: A static file in Vite's public directory is served locally with
  no plugin, server code, or dependency. It works offline. A unique query plus
  `no-store` defeats the HTTP cache and makes repeated probes visible in the
  Network panel. The status card gives the page a meaningful result to show next
  to the docked panel.
- **Alternatives considered**:
  - *`import probe from "./probe.json"`*: rejected — the request would not appear
    in Network, so the DevTools clip would lose its point.
  - *A Vite middleware plugin with a dynamic response*: rejected — more code and
    a server-side surface for a fixed demo payload; the user asked for a local
    JSON file.
  - *A request to an external echo or time service*: rejected — violates offline
    operation and the no-external-request rule.
  - *A `POST` or form submission*: rejected — unnecessary for a read-only probe.

## 7. Neutral palette, one accent, and the device scheme

- **Decision**: Use a system font stack (`ui-sans-serif`, `system-ui`,
  `-apple-system`, `"Segoe UI"`, then `sans-serif`; a system monospace stack for
  labels). The palette is off-white, near-black, and neutral grey, with one accent
  driven by `--accent-h` in `hsl()`. Dark tokens live in a
  `@media (prefers-color-scheme: dark)` block. A tiny inline style in `index.html`
  sets `color-scheme` and the first-paint background and text color for both
  schemes, before the app or Vite's injected styles arrive. All motion is limited
  to short hover/focus/active transitions; the idle page has no animation,
  spinner, ticker, or timer. A `prefers-reduced-motion` rule removes the
  transitions.
- **Rationale**: The page must be the neutral card that makes eight shell themes
  pop. Tlapalli tokens belong to the shell, so the guest does not import them.
  The inline first-paint style is the only reliable way to avoid a flash of the
  wrong scheme under Vite's dev CSS injection. Flat neutral surfaces and static
  hairline rules also compress well.
- **Alternatives considered**:
  - *`light-dark()` plus `color-scheme`*: viable in current Chromium, but the
    first paint still needs explicit background/text values, so the inline
    critical style is required either way; the media query is simpler to read.
  - *Tlapalli tokens in the page*: rejected — it would make the shell themes
    compete with the page and blur the subject of the clip.
  - *A JavaScript scheme detector*: rejected — it runs after first paint and
    risks the flash the spec forbids.
  - *Gradients, noise, or a photographic test-card image*: rejected — more
    pixels change per frame and the files compress worse.
  - *An external font*: rejected — breaks offline operation and adds a request.

## 8. Layout that survives the recording sizes

- **Decision**: Use a fluid type scale: the headline is about `7rem` at 1440 px,
  body copy is `1.75rem`, the load-count numeral is `3.5rem`, the last-load time
  is `1.75rem`, and navigation labels, status text, and small labels use `1.5rem`.
  The stage is a two-column grid in the `split` layout and a single column with
  the action rail on top in the `stacked` layout. A `max-width: 1050px` query
  stacks the stage for a side-docked DevTools, and a `max-height: 620px` query
  tightens the type and gaps for a bottom-docked panel. The primary button and
  status card sit in the action rail, so they stay in the top region in both
  layouts. The page identity lives in the header and in a large number/word
  marker; each page also has a unique static specimen panel.
- **Rationale**: At 760 px display width from a 1440 px capture, `7rem` reads at
  about 59 px, `1.75rem` at about 15 px, and `1.5rem` at about 13 px. The headline
  and body clear the spec's 48/14 thresholds; navigation and status text stay
  readable. The rail placement keeps the DevTools scenario recordable without
  scrolling when the panel takes the bottom half of the window. The layout toggle
  moves the rail from the side to the top, which is an unmistakable change at
  portfolio size.
- **Alternatives considered**:
  - *Fixed pixel type*: rejected — it would break when DevTools narrows the page.
  - *Hiding content at small sizes*: rejected — the picker and scenario elements
    must stay present.
  - *A centered poster layout with no rail*: rejected — the primary action and
    result would fall below the fold under a bottom-docked panel.
  - *Scaling the whole page with a transform*: rejected — it would blur text and
    complicate picker hit testing.

## 9. Testing and checks without new tooling

- **Decision**: Put pure logic in `src/lib/load-proof.ts`,
  `src/lib/probe-url.ts`, and the normalization/export surface of
  `src/edit-points.ts`. Test them with Vitest in `tests/unit/test-card-*.test.ts`.
  Keep these helpers free of DOM-only and Vite-only globals: the load-proof helper
  accepts a minimal `getItem`/`setItem` adapter, the probe helper builds a string
  URL, and the edit module uses a local HMR type instead of `vite/client`. The
  browser fetch and the `import.meta.env` reads stay in DOM-typed example files
  that the tests do not import. Add `examples/test-card/tsconfig.json` and a root
  `typecheck:example` command, then append it to the existing `typecheck` chain.
  Validate the six visual scenarios manually with the quickstart. Do not add
  Playwright, Testing Library, or a browser-test dependency.
- **Rationale**: The repository keeps unit tests under `tests/unit` and uses
  Vitest with a node environment; `tsconfig.node.json` has no DOM library. Keeping
  the tested helpers DOM-free means the existing node-side typecheck and Vitest
  run can import them without adding DOM types to the main process. The pure
  helpers cover storage parsing, counter math, probe URL uniqueness, and value
  fallbacks. The visual requirements are about scale, stillness, theme contrast,
  and picker targets, which a human with a capture tool judges better than a DOM
  snapshot. This keeps the "no dependency beyond Vue and Vue Router" rule intact.
- **Alternatives considered**:
  - *Playwright*: rejected — a new dependency and a browser install for a demo
    page, outside the stated dependency budget.
  - *Component tests with `@vue/test-utils`*: rejected — another dependency, and
    the risky logic is already pure.
  - *Wiring the existing screenshot/GIF runner to this page*: rejected for this
    feature — the spec assumes manual clips, and changing the capture pipeline
    would broaden scope.

## 10. Edit-point safety and copy replacement

- **Decision**: `normalizeEditPoints` in the edit file coerces a finite hue into
  0–359, keeps a non-empty headline or falls back to the default, keeps a valid
  `split`/`stacked` value or falls back to `split`, and supplies default copy for
  empty strings. The README lists the defaults and the three edit points. The HMR
  merge copies top-level values and the nested copy object into the live state.
- **Rationale**: The maintainer edits one file by hand during a recording; a typo
  or an empty value must not leave a blank page on camera. Falling back to a known
  default keeps the recording recoverable without a restart. Keeping copy in the
  same object means the one marked file also satisfies the placeholder-copy
  requirement.
- **Alternatives considered**:
  - *Trusting the editor and TypeScript*: rejected — the values are edited live
    and can be temporarily invalid; TypeScript does not run in the browser.
  - *Throwing a visible error*: rejected — it would blank the card and break the
    clip.
  - *Hard-coding copy in each template*: rejected — replacement would touch many
    files and violate the one-location requirement.

## Resolved unknowns

| Unknown | Resolution |
|---------|------------|
| Where the app lives and how it starts | `examples/test-card`; root `pnpm test-card`; Vite root and port 3000 |
| Which dependencies are new | Only `vue-router`; Vite, Vue plugin, and Vue are already present |
| How a live edit avoids a full reload | Self-accepting edit module mutates the live reactive object |
| How Vue DevTools finds the app | Real Vue 3 SPA from the Vite dev server; named components and reactive state |
| How reload proof stays per-tab | One `sessionStorage` JSON value, initialized once in `main.ts` |
| How history stays distinct from reload | Vue Router keeps navigation in one document; only full loads bump the count |
| How the probe appears in Network | `fetch` of a public static JSON file with a unique query and `no-store` |
| How the page stays neutral and flash-free | System fonts, neutral tokens, one accent, media-query scheme, inline first paint |
| How the layout survives docked DevTools | Fluid type, a 1050 px width query, a 620 px height query, rail-first placement |
| How the work is checked | Pure Vitest helpers, example typecheck, manual visual quickstart |
