# Phase 1 Data Model: Load Rim

The feature introduces one ephemeral per-window status (whether an in-place load
is running and which kind), one command-scoped pending value, and one pure helper.
There is no new persisted entity, no schema change, and no database; the rim
renders in the shell.

---

## Entity: Load Rim (status)

An ephemeral, non-interactive shell surface signalling an in-flight in-place load:
a reload, a link click, a history move, or a same-origin palette navigation.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `reloading` | `{ hard: boolean } \| null` | `AppWindow`, per window, **not persisted** | `null` = not shown. |
| `hard` | `boolean` | the initiating command | `false` for a normal load, a page-initiated reload, or any in-place navigation; `true` only while the Hard Reload command's load is active. |
| shell ref | `reloading: { hard: boolean } \| null` | `useShell` | Drives `<ReloadIndicator :hard="reloading.hard" />`. |

**Validation rules**:
- FR-001/004: at most one status per window; `hard` selects the heavier inner rim.
- FR-005: cleared on `did-stop-loading`, failure, or a veiled target load.
- FR-008: a second load refreshes/continues the same status; it never stacks.
- FR-011: presentation only — `pointer-events: none`, `aria-hidden`.
- FR-012: never written into the guest page.
- Not persisted: no `WindowRecord` field, no schema bump.

---

## Entity: Pending Reload Kind (one-shot command intent)

The command-scoped value that carries cache-bypass intent from the command to the
next navigation.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `pendingReloadKind` | `"normal" \| "hard" \| null` | `AppWindow`, **not persisted** | Set immediately before `reload()` / `reloadIgnoringCache()`. |
| consumed by | next main-frame, non-same-document `did-start-navigation` | `AppWindow` | Reset to `null` after consumption or when a different URL starts. |

**Rules**:
- A pending kind only applies when the navigation is a reload (URL equals the
  committed URL).
- With no pending kind, a same-URL navigation is a page-initiated reload and an
  in-place navigation is a normal load; both read as `"normal"`.
- A navigation to a different URL discards the pending kind (FR-015).
- While a hard rim is active, a redirect or follow-up navigation in the same load
  keeps the hard rim (FR-004); an explicit new normal reload downgrades it.

---

## Entity: Load Predicate and Kind Selection (pure)

`src/shared/reload.ts`, shared by main and Vitest.

| Function | Signature | Behavior |
|----------|-----------|----------|
| `isReloadNavigation` | `(navigationUrl: string, shownUrl: string \| null) => boolean` | `false` when nothing is committed; otherwise URL-`href` equality (string fallback when unparseable). |
| `rimKindFor` | `(isReload: boolean, pending: ReloadKind \| null, active: ReloadKind \| null) => ReloadKind` | A pending reload command decides the kind; otherwise an active hard rim survives a redirect/continuation, and a fresh in-place load is normal. |
| `ReloadKind` | `"normal" \| "hard"` | The two visually distinct treatments. |

---

## Lifecycle

```
  idle
    │
    │ Reload / Hard Reload command (pending kind set)
    │ or link / history / same-origin palette navigation (pending = null)
    │ or page-initiated same-URL reload (pending = null)
    ▼
  rim { hard }
    │  ▲
    │  │ another in-place load: refresh/continue, keep one status
    ▼  │
  rim { hard }
    │
    ├── did-stop-loading ─────────────────▶ idle (fade out)
    ├── did-fail-load ────────────────────▶ idle; failure view takes over
    ├── loadTarget with veil (site switch) ▶ idle; veil takes over
    └── veil raised / failure retry ──────▶ idle; veil is the sole surface
```

**State transitions**:
- `idle → rim`: any main-frame `did-start-navigation` while the guest page is
  shown and no veil/failure is active.
- `rim{normal} → rim{hard}` and the reverse: a new reload command while the rim is
  visible; one status remains.
- `rim → idle`: loading stops, failure, or a veiled target load.
- No transition from a blank window (no committed URL): no rim for a cold start
  (FR-006).

---

## Relationship to existing entities

| Existing entity | Relationship |
|-----------------|--------------|
| `AppWindow` (`src/main/shell/window.ts`) | Gains the rim status, `pendingReloadKind`, the navigation hook, and one more `full`-mode condition. |
| `SiteViewEvents` (`src/main/shell/site-view.ts`) | Gains `onNavigateStart(url)` from `did-start-navigation`. |
| Shell renderer (`App.vue`, `useShell`, `ReloadIndicator.vue`) | The surface; one new ref and one new component. |
| Reload commands (`src/shared/commands.ts`) | Unchanged ids, labels, and accelerators; their handlers now set the pending kind. |
| Link clicks / history / palette navigation | Flow through the same `did-start-navigation` hook and read as normal in-place loads. |
| Zoom / viewport readouts (specs/023/024) | Sibling transient, pointer-through surfaces; same `full` shell hosting. |
| `WindowRecord` (`src/main/state/schema.ts`) | **Unchanged** — no persisted field, no schema bump. |
| Guest preload (`src/preload/site.ts`) | **Unchanged** — the feature reads navigation events in main; the page is not touched. |
