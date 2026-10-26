# Contract: Test Card Demo Site

This contract fixes the externally observable behaviour of the demo: how it
starts, which routes exist, what the edit file controls, how the reload proof and
probe behave, what the developer panels show, and what the picker and themes see.
It is guest content. It does not add or change any Tlachialoni shell, preload,
main-process, IPC, command, or persisted-state interface.

---

## 1. Start and server contract

| Item | Contract |
|------|----------|
| Command | `pnpm test-card` from the repository root |
| Server | Vite dev server for `examples/test-card` |
| Address | `http://localhost:3000/` by default |
| Busy port | Vite uses the next free port and prints the actual address; the maintainer enters that address in Tlachialoni |
| Setup | `pnpm install` once, then the one command |
| Live updates | Saving a source file updates the page through Vite HMR; no restart, rebuild, or manual refresh |
| Offline | Works with no internet after dependencies are installed; no external request is made at runtime |
| Direct routes | `/grid` and `/notes` load the SPA through Vite's fallback |
| Unknown path | Renders the local NotFound view, not a server error page |
| Public asset | `/probe.json` is served from `examples/test-card/public/probe.json` |
| Favicon | Declared as an inline data URI, so no favicon request or 404 appears |
| Packaging | The example is not included in the packaged Tlachialoni artifact |

No environment variable, account, service, or second install step is required.

---

## 2. Route and history contract

| Path | Page | Document title | Page identity |
|------|------|----------------|---------------|
| `/` | Card 01 | `01 Signal · Test Card` | `01 / SIGNAL` |
| `/grid` | Card 02 | `02 Grid · Test Card` | `02 / GRID` |
| `/notes` | Card 03 | `03 Notes · Test Card` | `03 / NOTES` |
| any other path | NotFound | `Lost · Test Card` | `LOST` |

**Rules**:
- A shared header links all three pages with large labels and marks the current
  page with `aria-current="page"`.
- Every demo page links to the other two demo pages; no demo page is a dead end.
- `router.afterEach` sets `document.title` from route metadata, so each route has
  the title above.
- The route, page number, page name, and specimen panel are visibly different on
  every page, so the page identity survives a still frame at 760 px.
- Back and forward use browser history and show the destination page. They do not
  increment the load count because the document is not reloaded.
- A direct load of any route starts the app at that route.
- The three pages are inside one document and one Tlachialoni target. No route
  opens a new window, tab, or external site.

---

## 3. Edit-points contract

The only file the recording edits is
`examples/test-card/src/edit-points.ts`. It opens with a banner comment that names
the three edit points and says that saving updates the page in place.

| Field | Type | Default | Required visible effect |
|-------|------|---------|-------------------------|
| `accentHue` | number | `24` | A large swatch, the page marker, the focus ring, and the accent rule change hue across the page. |
| `headline` | string | "A quiet test card for a live browser." | The largest heading on every page changes and wraps inside the viewport. |
| `layout` | `"split" \| "stacked"` | `"split"` | The action rail moves from the right side to the top band; the stage rearranges. |
| `copy` | object | placeholder strings | All visible non-headline copy can be replaced without touching a component or stylesheet. |

**Derived values**: `editCssVars` maps the config to `--accent-h`,
`--stage-columns`, `--stage-areas`, and `--stage-gap`.

**Rules**:
- Every field above lives in this one file. No component or stylesheet holds a
  second copy of a recording value or the placeholder copy.
- A saved change reaches the screen in under one second.
- A saved change does not reload the document: the load count and last-load time
  stay the same.
- The HMR boundary self-accepts and merges the new values into the live reactive
  object. It does not restart the app.
- A change applies to all three pages. The next page visited uses the new value.
- An empty or invalid value falls back rather than blanking the page: a finite
  hue wraps into 0–359, an empty headline uses the default, an unknown layout
  uses `split`, and empty copy uses the default string.
- The page remains usable if a value is edited to a malformed one.

---

## 4. Load-proof storage contract

| Item | Contract |
|------|----------|
| Storage | `sessionStorage`, per tab |
| Key | `test-card:load-proof` |
| Value | JSON `{ "count": number, "lastLoadAt": number }` |
| First load | Count is 1; time is the current local time |
| Full reload | Count increases by exactly 1; time updates |
| Hard reload | Count increases by exactly 1; time updates |
| SPA route move | Count and time do not change |
| Back / forward | Count and time do not change |
| HMR edit | Count and time do not change |
| New tab or window | Count starts again at 1 |
| Storage failure | The page shows count 1 and the current time for that load and stays usable |

**Display**:
- The count is shown as a two-digit value (`01`, `02`, `03`).
- The time is formatted once, with a 24-hour clock and seconds, for example
  `14:32:08`.
- Both sit in the header on every page, large enough to read when the 1440×900
  capture is shown at 760 px wide.
- The time does not tick, animate, or update without a load.

The count is written once in `main.ts` before mount. It is not written from a
component setup, route hook, or HMR handler.

---

## 5. Local probe contract

| Item | Contract |
|------|----------|
| Trigger | The primary action "Run local check" |
| Method | `GET` |
| URL | `probe.json` relative to the site base, with `?at=<epoch>-<sequence>` |
| Fetch cache | `cache: "no-store"` |
| Response | JSON object with a short `message` string |
| Success display | Text in the status card: `Local endpoint OK · <status> · <ms> ms` plus the message |
| Failure display | Readable text in the status card; page remains usable |
| Network visibility | Each trigger is a separate Network entry, even when repeated immediately |
| Timing | Measured with `performance.now()` and rounded to whole milliseconds |
| Scope | Same origin only; no external host, redirect, or service |

**Rules**:
- The JSON file is static; no server code or middleware is needed.
- A probe does not run on page load, on route change, or on idle.
- Repeated probes produce different URLs, so the cache does not hide them.
- The status card shows `Ready. Run the local check.` until the first action.
- A failed probe writes a console error and leaves the primary action usable for
  a retry.

---

## 6. Console contract

| Event | Console output | Level |
|-------|----------------|-------|
| Swatch clicked | `[test-card] <NN Name> · swatch inspected` | `info` |
| Primary action | `[test-card] <NN Name> · local check` | `info` |
| Probe failed | `[test-card] <NN Name> · local check failed: <reason>` | `error` |

**Rules**:
- A message is at most 120 characters and fits one line at the default DevTools
  font size.
- The page logs nothing on first paint, route change, idle, HMR, or theme change.
- The Console panel is empty until the maintainer acts, so the first line in a
  clip is the action the maintainer performed.
- Vite's own dev-client connection and HMR messages are dev-server output, not
  page output. They may appear when the Console shows verbose/debug output; the
  contract above covers only messages the page writes.

---

## 7. Landmark and picker contract

| Order | Landmark | Element | Visible label | Accessible name |
|-------|----------|---------|---------------|-----------------|
| 1 | Heading | `<h1>` | The configured headline | The same headline |
| 2 | Swatch | `<button type="button">` | "Accent swatch" | "Accent swatch" |
| 3 | Primary action | `<button type="button">` | "Run local check" | "Run local check" |
| 4 | Status card | `<article>` with a heading | "Status card" | "Status card" |

**Rules**:
- The page's four landmarks appear on all three demo pages, in this order. The
  NotFound fallback is not a recording page and only needs its link home.
- The page identity in the header is not a heading element. The `h1` inside the
  landmark panel is the sole heading target, so the picker has one unambiguous
  heading.
- The status card is an `article` with a heading and an `aria-live="polite"`
  region for the probe result.
- The visible label and the DevTools/accessible name match.
- The swatch target is at least 88×88 CSS px. The primary button is at least
  48 px tall. Both have a visible keyboard focus ring.
- Each landmark sits in its own region with whitespace between it and its
  neighbors; a picker hover highlight cannot overlap a neighbor.
- The landmarks keep their order and general position across reloads and route
  changes.
- The swatch is a real button; it is not a decorative div. The status card is a
  real article with a heading; it is not a bare span.

---

## 8. Neutral page and color-scheme contract

| Item | Contract |
|------|----------|
| Base palette | Off-white, near-black, and neutral grey in light; near-black and warm grey in dark |
| Accent count | One hue, controlled only by `accentHue` |
| Fonts | System sans-serif stack and system monospace stack; no external font file |
| Images | No external image, icon font, or media file |
| Scheme source | The device's preferred color scheme |
| First paint | `index.html` carries an inline critical style for `color-scheme`, background, and text so the correct scheme paints first |
| Scheme change | The page follows the device within one second, with no reload |
| Theme tokens | The page does not import or consume Tlapalli tokens |
| Motion | No continuous animation, autoplay, ticker, live clock, or background motion; only short hover/focus/active transitions |
| Reduced motion | `prefers-reduced-motion: reduce` removes the transitions |
| Contrast | Body text ≥ 4.5:1 in both schemes; large text ≥ 3:1 |
| Compression | Large flat fills, static text, and static hairline rules; no noise or per-frame texture |

The shell's eight themes and both color modes remain the only strong color changes
on screen when the page is open.

---

## 9. Vue DevTools contract

- The app is a real Vue 3 SPA mounted by `createApp`, not a static page.
- It runs from the Vite dev server, so Vue's development build is active.
- Components have stable names: `App`, `PageHeader`, `LoadProof`,
  `LandmarkPanel`, `CardOne`, `CardTwo`, `CardThree`, `NotFound`.
- The reactive `editPoints` object appears as normal setup state.
- Vue Router provides the route tree.
- The app does not bundle, install, or detect the Vue DevTools extension. The
  developer installs the extension in the guest session as usual.

---

## 10. Out of contract

- No Tlachialoni IPC, preload API, command, menu, theme, or persisted-state change.
- No real application data, authentication, form submission, or business logic.
- No routing beyond the three pages and the fallback.
- No analytics, deployment, hosting, CI, or automated clip generation.
- No external network request, font, image, or service.
- No theme switch inside the page; the shell owns its themes.
- No mobile-first layout or full accessibility audit.
