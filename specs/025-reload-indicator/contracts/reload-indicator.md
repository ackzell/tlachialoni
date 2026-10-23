# Contract: Load Rim

This contract fixes the externally observable interface of the feature: when the
rim appears, the event main sends the shell, where it paints, and how the two
kinds present. The rim renders **in the shell overlay** — never inside the guest
page — and is non-interactive. It is the complement to the full-screen veil: the
rim covers loads that keep the current page visible, while the veil covers loads
that replace it.

---

## 1. Trigger contract

The rim starts when a **main-frame, non-same-document navigation** begins while
the guest page is already on screen and no full-screen veil is active.

| Trigger | Kind | Notes |
|---------|------|-------|
| Reload command (`view.reload`, `⌘R`, palette, strip button) | `normal` | Command sets a one-shot pending kind before `webContents.reload()`. |
| Hard Reload command (`view.hardReload`, `⇧⌘R`, palette) | `hard` | Command sets the pending kind before `reloadIgnoringCache()`. |
| Page-initiated reload (`location.reload()`, meta refresh) | `normal` | Detected by same-URL navigation with no pending kind. |
| Link click to another page | `normal` | The old page stays visible until the new document commits. |
| History back / forward | `normal` | Same navigation hook; the old page stays until commit. |
| Same-origin palette navigation | `normal` | The veil is not raised, so the rim mirrors the load. |
| Cold start / first load | **no rim** | The full-screen veil owns it. |
| Palette target load to another origin (site switch) | **no rim** | The full-screen veil owns it. |
| Failure view retry | **no rim** | The veil owns it. |
| In-page route (`pushState`, hash, same-document history) | **no rim** | `isSameDocument` navigation. |
| Blank window (no committed URL) | **no rim** | Nothing to keep visible. |

**Rules**:
- A pending hard reload keeps the hard rim through a redirect or follow-up
  navigation in the same load; an explicit normal reload downgrades it.
- A new in-place load while a rim is visible refreshes/continues the single
  status; it never stacks (FR-008).
- A veiled target load clears the rim and the veil becomes the sole loading
  surface (FR-006/007/015).
- The rim is not raised by DevTools commands, extension operations, or any
  command other than the two page-reload commands.

---

## 2. Lifecycle contract

| Transition | Signal | Behavior |
|------------|--------|----------|
| Show | qualifying `did-start-navigation` | Send the status; shell expands to `full` mode. |
| Keep | another in-place load | Send the refreshed kind; one status remains. |
| Hide (success) | `did-stop-loading` | Send `null`; shell collapses after the leave settles. |
| Hide (failure) | `did-fail-load` | Send `null`; the failure view takes over. |
| Hide (superseded) | veiled `loadTarget` | Send `null`; the veil takes over. |
| Hide (veil) | veil raised / failure retry | Send `null`; the veil is the sole loading surface. |

The rim never changes on its own timer; it lives exactly as long as the load it
describes.

---

## 3. Hosting and placement contract

- The rim is a Vue component (`ReloadIndicator.vue`) rendered by `App.vue` in the
  shell overlay. It is mounted **before** the loading veil and failure view in the
  surface order, so those paint above it if they ever overlap.
- While visible, `desiredShellMode()` returns `"full"` so the shell spans the
  window; the guest page's bounds are unchanged.
- Placement: fixed to the guest page area, wrapping **all four edges**:
  - top edge at `STRIP_HEIGHT` whenever the strip surface is visible (pinned,
    peeking, or docked titlebar), otherwise at `0`;
  - right, bottom, and left edges at the window bounds.
- The component uses `pointer-events: none` and `aria-hidden="true"`; it never
  opts back into input.
- The guest page is not modified (constitution II): no DOM node, style, or script
  is added to it.

---

## 4. IPC contract

| Direction | Channel | Payload | Meaning |
|-----------|---------|---------|---------|
| main → shell | `viewport:reloading` | `{ hard: boolean, url: string }` | An in-place load started (or changed kind); show/refresh the rim. |
| main → shell | `viewport:reloading` | `null` | The load ended or was superseded; hide the rim. |

**Rules**:
- The channel is one-way, presentation-only, and per-window (routed like the other
  shell channels).
- `hard` is `true` only for the Hard Reload command; it is `false` for a normal
  reload, a page-initiated reload, or any in-place navigation.
- `url` is the target being loaded, for diagnostics; the shell does not display
  it.
- `src/preload/shell.ts` is unchanged: the generic `on(channel, callback)` bridge
  already carries the event, and `useShell` subscribes to it.
- No preload API, command id, accelerator, store field, or schema version changes.

---

## 5. Presentation contract

- **Core**: a 4px `--tb-accent` border around the page area, held at a constant
  opacity so it never fades into invisibility.
- **Contrast**: a 2px theme-tinted dark ring (`color-mix(accent, black)`) and a
  tighter neutral inset shadow inside the core, plus a `--tb-signature` bloom. The
  dark ring keeps the edge readable on white pages even when the shell theme's
  accent is light (for example amethyst dark over a white page).
- **Normal**: a slow inner bloom breathing over ~1.6 s; the core stays steady.
- **Hard**: the same base plus a **2px inner rim** inset further, using a darker
  accent mix, and trailing the base pulse by about **180 ms**; the base itself
  uses a double beat.
- **Colors**: Tlapalli tokens (`--tb-accent`, `--tb-signature`); the dark ring is
  the accent mixed with black, and the neutral shadow is a standard depth cue.
- **Motion**: `opacity` only for the animated layers; no layout animation.
- **Enter/leave**: a short fade on enter and a slightly slower fade on leave,
  matching the other transient surfaces.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` removes all
  animations and renders static rims; the inner hard rim is stronger (FR-013).
- **Lookup hooks**: the root carries
  `data-tlachialoni-reload-indicator` and `data-kind="normal" | "hard"` for
  screenshot scenes and manual inspection.
- **Absent states**: no text, no icon, no backdrop, no pointer target.

---

## 6. Dev preview contract

- The Developer menu gains **Preview Load Rim** and **Preview Hard Reload Rim**
  (dev builds only; the menu block is already gated by `!app.isPackaged`).
- Each preview holds the corresponding rim on screen until **Stop Preview** or
  another preview, using the existing `devPreview` union and `relayout()`, through
  `previewLoadRim(hard)`.
- Stopping the preview sends `viewport:reloading null` and lets the shell return
  to its computed mode.
- The preview is absent from packaged builds (FR-014).

---

## 7. Testing contract

- **Unit** (`tests/unit/reload.test.ts`):
  - `isReloadNavigation` — null committed URL, same `href` (including trailing
    slash normalization), different path/query/origin, and unparseable inputs.
  - `rimKindFor` — fresh in-place normal, page-initiated reload, pending
    normal/hard, hard continuation through a redirect, explicit normal downgrade,
    and a stale pending kind on a non-reload navigation.
- **Visual capture** (`pnpm screenshots` / `pnpm gifs`): the `reload` scene
  samples a normal reload and a hard reload; the frames show the two distinct
  rims.
- **Manual** (quickstart): motion feel, link/history/palette navigation, strip and
  titlebar placement, light-page contrast with a dark shell theme, reduced motion,
  click-through, no-guest-page-mutation, and the composition with the veil and
  failure view.
- **Checks**: `pnpm check`, `pnpm test`, and `pnpm typecheck` all pass.
