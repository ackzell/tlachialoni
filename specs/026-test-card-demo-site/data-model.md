# Phase 1 Data Model: Test Card Demo Site

The demo has no server data and no application store. It has one hand-edited
configuration, one per-tab load record, three page descriptors, one transient
probe result, one interaction log format, and four picker landmarks. The only
persisted value is the load record in `sessionStorage`.

---

## Entity: Edit Points

The recording values and the placeholder copy. One reactive object in
`examples/test-card/src/edit-points.ts`.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `accentHue` | `number` | `24` | Sets `--accent-h`; drives the swatch, page marker, focus ring, and accent rule. |
| `headline` | `string` | "A quiet test card for a live browser." | The largest text on every page. |
| `layout` | `"split" \| "stacked"` | `"split"` | Sets `--stage-columns` and `--stage-areas`; the action rail sits right or on top. |
| `copy` | object | placeholder strings | Eyebrow, summary, page names, page summaries, specimen labels, status labels. |

**Derived CSS custom properties** (`editCssVars`):

| Property | Source | Notes |
|----------|--------|-------|
| `--accent-h` | `accentHue` normalized to 0–359 | Consumed by `hsl(var(--accent-h) …)`. |
| `--stage-columns` | `layout` | `minmax(0, 1.4fr) minmax(20rem, 0.6fr)` for split; `minmax(0, 1fr)` for stacked. |
| `--stage-areas` | `layout` | `"hero rail"` for split; `"rail" "hero"` for stacked. |
| `--stage-gap` | `layout` | A slightly larger gap in stacked mode so the two bands read as separate. |

**Validation rules**:
- A non-finite or missing hue falls back to 24 and is wrapped into 0–359.
- An empty or whitespace-only headline falls back to the default headline.
- An unknown layout falls back to `"split"`.
- Missing or empty copy strings fall back to the default copy for that key.
- The file remains editable while the dev server runs. HMR merges top-level
  values and the nested copy object into the existing reactive object.

**HMR rule**: The module self-accepts. A save updates the live object; it does not
restart the app or reload the document. The load count and last-load time stay
unchanged.

---

## Entity: Load Proof

The per-tab proof that the document loaded. One JSON value in
`sessionStorage`.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `count` | positive integer | stored value + 1 | `1` on the first load in a tab. |
| `lastLoadAt` | epoch milliseconds | `Date.now()` at load | Formatted once for display; never ticks. |

**Storage key**: `test-card:load-proof`

**Stored shape**: `{ "count": 3, "lastLoadAt": 1761395528123 }`

**Validation rules**:
- The stored value must parse as an object with an integer `count ≥ 1` and a
  finite `lastLoadAt`. Anything else is treated as absent.
- A read or write failure (blocked storage, quota, private mode) falls back to
  count 1 and the current time in memory. The page stays usable.
- The count is rendered zero-padded to two digits (`01`, `02`, `03`).
- The time is rendered once with `Intl.DateTimeFormat`, using a 24-hour clock and
  seconds.
- The load proof is visible in the top header on every page and never scrolls
  away.

**Lifecycle**:

```text
  new tab / no stored value
        │
        ▼
  count = 1, lastLoadAt = now ──▶ render
        │
        │ full document load (normal or hard reload)
        ▼
  count = previous + 1, lastLoadAt = now ──▶ render
        │
        ├── SPA route change ───────────────▶ unchanged
        ├── back / forward (same document) ─▶ unchanged
        ├── HMR edit ───────────────────────▶ unchanged
        └── new tab / window ───────────────▶ resets to 1
```

**Initialization rule**: `main.ts` reads and bumps the value once, before the app
mounts, and passes it to `App.vue` as a prop. Component setup and HMR remounts must
not bump it. The pure helper accepts a minimal `getItem`/`setItem` adapter, so its
tests stay in the repository's node-side Vitest environment.

---

## Entity: Demo Page

One of three linked pages, plus the fallback.

| Field | Type | Page 01 | Page 02 | Page 03 |
|-------|------|---------|---------|---------|
| `id` | `"one" \| "two" \| "three" \| "not-found"` | `one` | `two` | `three` |
| `path` | string | `/` | `/grid` | `/notes` |
| `documentTitle` | string | `01 Signal · Test Card` | `02 Grid · Test Card` | `03 Notes · Test Card` |
| `navLabel` | string | `01 Signal` | `02 Grid` | `03 Notes` |
| `number` | string | `01` | `02` | `03` |
| `name` | string | `Signal` | `Grid` | `Notes` |
| `specimen` | `"bars" \| "grid" \| "lines"` | `bars` | `grid` | `lines` |
| `copyKey` | `"pageOne" \| "pageTwo" \| "pageThree"` | `pageOne` | `pageTwo` | `pageThree` |

**Validation rules**:
- Paths, document titles, nav labels, and page names are unique.
- Every demo page links to the other two demo pages and marks the current one.
- Every demo page renders the same four landmarks and the same load proof.
- The fallback has its own title (`Lost · Test Card`) and a link to `/`; it is not
  a recording page and does not need the four landmarks.
- A direct load of `/grid` or `/notes` is served by Vite's SPA fallback.

---

## Entity: Probe Result

The transient state of the local JSON request shown in the status card.

| State | Fields | Status card text |
|-------|--------|------------------|
| `idle` | — | "Ready. Run the local check." |
| `pending` | — | "Checking the local endpoint…" |
| `success` | `httpStatus`, `elapsedMs`, `message`, `at` | "Local endpoint OK · 200 · 12 ms" plus the body message. |
| `error` | `message`, `at` | "Local endpoint unavailable. " plus the reason. |

**Request contract**:
- Method: `GET`
- Path: `probe.json` relative to the site base, with a unique
  `?at=<epoch>-<sequence>` query.
- Fetch options: `cache: "no-store"`.
- Expected body: JSON with a short `message` string; unknown extra fields are
  ignored.
- Same origin only. No external host.

**Transition rules**:
- `idle → pending → success | error` on the primary action.
- `success | error → pending` on a repeat action.
- Each repeat gets a new query, so each request is a separate Network entry.
- A failure writes a readable status and a console error; it does not throw out of
  the click handler or disable the page.
- The result is local to the page instance. Navigating to another route starts
  fresh at `idle`.

---

## Entity: Interaction Log

The short console output produced by actions.

| Field | Type | Notes |
|-------|------|-------|
| `pageLabel` | string | `01 Signal`, `02 Grid`, or `03 Notes`. |
| `action` | string | `swatch inspected`, `local check`, or `local check failed`. |
| `level` | `"info" \| "error"` | `error` only for a failed probe. |
| `message` | string | `[test-card] <pageLabel> · <action>`, at most 120 characters. |

**Rules**:
- The swatch click and primary button each write one `info` line.
- A failed probe adds one `error` line after the action line.
- No line is written on first paint, route change, idle, or HMR.
- The console is empty until the maintainer acts.

---

## Entity: Landmark

A picker target on every page.

| Role | Element | Visible label | Accessible name | Order |
|------|---------|---------------|-----------------|-------|
| Heading | `<h1>` | the configured headline | the same text | 1 |
| Swatch | `<button type="button">` | "Accent swatch" | "Accent swatch" | 2 |
| Primary action | `<button type="button">` | "Run local check" | "Run local check" | 3 |
| Status card | `<article>` | "Status card" heading | "Status card" | 4 |

**Validation rules**:
- The visible label and the accessible name match.
- The order is stable across reloads and route changes.
- The swatch target is at least 88×88 CSS px; the primary button is at least
  48 px tall.
- Landmarks sit in separate grid regions with visible whitespace. A hover
  highlight around one must not touch a neighbor.
- The swatch and primary button have visible `:focus-visible` states.

---

## Relationships

| Entity | Used by | Relationship |
|--------|---------|--------------|
| Edit Points | `App.vue`, `LandmarkPanel.vue`, page views | Applied as CSS variables and copy; one reactive source. |
| Load Proof | `App.vue`, `LoadProof.vue` | Created once in `main.ts`; displayed in the header. |
| Demo Page | `router.ts`, `PageHeader.vue`, page views | Route metadata and page identity. |
| Probe Result | `LandmarkPanel.vue` | Transient state of the status card. |
| Interaction Log | `LandmarkPanel.vue` | Console messages for actions. |
| Landmark | `LandmarkPanel.vue` | Four stable picker and DevTools targets. |

No entity is shared with Tlachialoni's shell, main process, preload, or state
store. There is no schema migration and no persisted application data.
