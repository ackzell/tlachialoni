# Phase 1 Data Model: Chromeless Localhost Browser

All persisted state lives in one JSON document (see `contracts/state.schema.json`).
Entities below describe fields, validation, and transitions. Values are
technology-agnostic descriptions of what must be true; storage details are in the
contract.

## Entity: PersistedState (Preferences)

The single record restored on launch and updated as the developer works.

| Field | Type | Default | Purpose / requirements |
| --- | --- | --- | --- |
| `schemaVersion` | integer ≥ 1 | `1` | Enables forward migration; readers must handle older versions |
| `target` | string \| null | `http://localhost:3000` | The target to load on launch; must satisfy the local-target policy |
| `recents` | RecentEntry[] | `[]` | Ordered, deduplicated targets; newest first; bounded |
| `dockMode` | `bottom` \| `right` \| `left` | `bottom` | DevTools dock side (FR-002, FR-008) |
| `devtoolsOpen` | boolean | `true` | Whether DevTools were open at exit (FR-003) |
| `stripVisible` | boolean | `false` | Drag strip visibility (FR-009) |
| `bounds` | `{ x, y, width, height }` integers | centered 1440 × 900 | Window frame to restore (FR-004) |
| `variant` | VariantSlug | `obsidian` | Tlapalli mineral variant (FR-016) |
| `colorMode` | `system` \| `dark` \| `light` | `system` | Color mode override (FR-017) |

### Validation rules (applied on load and on write)

- **Local-target policy**: `target` and every `recents[].url` must be an
  `http`/`https` URL whose host is loopback (`localhost`, `127.0.0.0/8`, `::1`),
  a private range (`10/8`, `172.16/12`, `192.168/16`), or a dev hostname
  (`*.localhost`, `*.local`, `*.test`). Invalid entries are dropped; an invalid
  `target` falls back to the default (FR-001, FR-006).
- **Bounds**: width/height clamped to at least 480 × 360; the frame must intersect
  a currently connected display, otherwise the window is recentered at the default
  size.
- **Recents**: deduplicated by normalized URL, newest first, bounded (maximum 10).
- **Unknown/missing fields**: unknown fields ignored; missing fields receive
  defaults; a corrupt file is discarded in favor of defaults (no partial reads,
  because writes are atomic).
- **Concurrency (FR-004)**: `variant`, `colorMode`, `dockMode`, `devtoolsOpen`,
  `stripVisible` are shared last-writer-wins; `recents` is merged on write;
  `target` and `bounds` are last-writer-wins across instances.

## Entity: Target

The single address rendered in a window.

| Attribute | Description |
| --- | --- |
| `url` | Normalized absolute URL (`http://host:port/path`) |
| `host`, `port` | Derived; used by the policy and the failure view label |
| `isValid` | Result of the local-target policy |

**Normalization** (FR-006): `:5173` → `http://localhost:5173`; `5173` →
`http://localhost:3000` is **not** implied — a bare number is treated as a port on
`localhost`; `localhost:5173` → `http://localhost:5173`; a full `http(s)://` URL is
kept as-is after policy validation; any other scheme or non-local host is rejected
with feedback and the current target is unchanged.

## Entity: RecentEntry

| Attribute | Description |
| --- | --- |
| `url` | Normalized target URL |
| `lastOpenedAt` | Ordering key (newest first) |

Recorded only after a target loads successfully. Merged (not overwritten) when
multiple instances write, so no instance's history is lost.

## Entity: PickerSession

Transient (never persisted); governs the `⌘⇧C` element picker (FR-012, FR-013).

| State | Meaning | Transitions |
| --- | --- | --- |
| `idle` | No overlay, no listeners | `arm` → `armed` |
| `armed` | Overlay + capture-phase listeners active in the guest | `hover` (stays armed, updates highlight) · `pick` → `idle` (inspect then cleanup) · `cancel` (Esc / `⌘⇧C`) → `idle` · `navigation`/`reload` → `idle` (invalidate) |

**Invariant**: on any transition to `idle`, the overlay node and all listeners are
removed, and no element handles are retained across navigations (FR-013).

## Entity: Command

The unit the palette and keybindings both invoke (FR-020).

| Attribute | Description |
| --- | --- |
| `id` | Stable identifier (e.g. `devtools.toggle`) |
| `title` | Palette label |
| `keybinding` | Optional accelerator label shown in the palette |
| `enabledWhen` | Optional predicate (e.g. `back` disabled with no history) |

The catalog and accelerator map are the contract in
`contracts/commands-and-keys.md`.

## Entity: ThemeSelection

| Attribute | Description |
| --- | --- |
| `variant` | One of the eight mineral slugs |
| `mode` | `system` \| `dark` \| `light` |
| `resolvedMode` | `dark` \| `light` after applying the system preference when `mode = system` |

Changing either applies CSS variables to the shell and sets
`nativeTheme.themeSource` so DevTools follow (FR-016, FR-017).

## Lifecycle: target view

```text
launch/relaunch ─▶ loading ─▶ ready
                      │
                      ├─▶ failed ─(Retry / new target)─▶ loading
                      └─(navigation to non-local)─▶ handed to system browser (view unchanged)
```

- `loading` shows the loading veil (FR-021).
- `failed` shows the failure view with Retry and Edit URL (FR-019).
- Non-local main-frame navigations and popups never enter this machine; they are
  denied and opened externally (FR-015).
