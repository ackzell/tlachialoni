# Phase 0 Research: Load Rim

The feature lands inside patterns the repository already established: the
transient shell surface and shell-mode machine (specs/015, 023, 024), the one-way
main → shell presentation channels, and the Tlapalli token/motion vocabulary.
Research therefore focused on the genuinely open questions: **how to distinguish
a reload from an ordinary navigation**, **how to know a reload is hard**, **when
the indicator should end**, **where it can paint without blocking input**, and
**how to render two distinct rims without adding a dependency**.

---

## 1. Deciding what an in-place load is

- **Decision**: Treat **every main-frame, non-same-document
  `did-start-navigation` while the guest page is already shown and no veil is
  active** as a rim trigger. A navigation whose URL equals the last committed
  document URL is a **reload**; a different URL is a normal **in-place
  navigation** (link, history, or same-origin palette target). The predicates
  live in pure `src/shared/reload.ts` (`isReloadNavigation`, `rimKindFor`), with
  URL comparison by normalized `href` (falling back to string equality for
  unparseable inputs).
- **Rationale**: The veil is a "replacing the page" surface: cold start, a target
  load to another origin, and failure loads. When the old page stays visible until
  the next document commits, a rim is the honest signal for the same load — and it
  covers link clicks, history moves, and same-origin palette navigations without
  duplicating the veil. `did-start-navigation` supplies the target URL and the
  `isSameDocument` flag in one event; using the last **committed** URL (`shownUrl`)
  keeps a cold start from ever reading as an in-place load.
- **Alternatives considered**:
  - *Rim only for explicit reloads*: rejected — misses the requested complement
    for link clicks and history moves.
  - *Rim for every load, including site switches*: rejected — it would duplicate
    and fight the full-screen veil; the veil remains the sole surface when it is
    raised.
  - *`did-start-loading` plus `webContents.getURL()`*: rejected — `getURL()` still
    returns the old document at that point, so a link click is indistinguishable
    from a reload.
  - *A URL-only comparison without `isSameDocument`*: rejected — SPA
    `pushState`/hash changes would flash the rim.

## 2. Knowing whether the reload is hard

- **Decision**: The Reload and Hard Reload commands set a one-shot
  `pendingReloadKind: "normal" | "hard" | null` immediately before calling
  `webContents.reload()` / `reloadIgnoringCache()`. The next main-frame
  navigation consumes it; an absent pending kind means a page-initiated reload or
  an in-place navigation and therefore `"normal"`.
- **Rationale**: Electron does not report cache-bypass intent on the navigation
  event, so the only reliable source of "hard" is the command that initiated it.
  Consuming the flag on the next navigation prevents it from leaking into a later
  unrelated load; a navigation to a different URL discards it.
- **Alternatives considered**:
  - *Infer from `reloadIgnoringCache` at the WebContents level*: not exposed on any
    navigation event; there is no per-navigation cache-bypass flag to read.
  - *Show a hard rim for any reload while DevTools is open*: rejected — false
    positives and unrelated to the command.
  - *Keep a hard rim through every follow-up navigation*: accepted only as a
    continuation, so a redirect does not downgrade the hard reload mid-load.

## 3. When the rim starts and ends

- **Decision**: Start on any qualifying `did-start-navigation`; end on
  `did-stop-loading` (the existing `onLoading(false)` path), and clear it
  immediately on `did-fail-load` (failure view), on `loadTarget` when the veil is
  raised, and whenever the full-screen veil owns the load.
- **Rationale**: `did-stop-loading` fires after the document and its subresources
  settle, which is what "the load finished" means to the developer.
  `did-finish-load` fires too early (before late subresources). Clearing on the
  existing failure and veiled-target paths satisfies FR-007/FR-015 and prevents a
  stale rim over the veil or failure view.
- **Alternatives considered**:
  - *`did-finish-load`*: rejected — hides the rim while the page is still busy.
  - *A fixed timer*: rejected — it would lie for slow or fast servers and could
    leave a rim after a failure.
  - *A renderer-owned timer*: rejected — main already owns the load lifecycle and
    the shell-mode collapse timing.

## 4. Hosting and placement without blocking input

- **Decision**: Render the rim in the shell overlay and make
  `desiredShellMode()` return `"full"` while it is visible, exactly like the zoom
  and viewport readouts (specs/023/024). Inset the rim's top edge by
  `STRIP_HEIGHT` whenever the strip surface is visible (pinned, peeking, or docked
  titlebar), so it wraps the **guest page area** on all four sides. The component
  is `pointer-events: none` and `aria-hidden`.
- **Rationale**: The default `band` shell mode is only `DRAG_BAND_HEIGHT` (10 px)
  tall and only covers the top, so it cannot paint a four-edge rim; `full` gives it
  the whole window. This is the same hosting used by the existing non-interactive
  badges, which deliberately do not opt back into pointer events. In titlebar mode
  the page already starts below the docked strip; in overlay mode the strip floats
  over the page's top edge, so the rim yields to it rather than painting through
  it.
- **Alternatives considered**:
  - *A dedicated top band view*: rejected — it cannot wrap the sides and bottom,
    and it would add a second surface to the shell-mode machine.
  - *Painting inside the 10 px drag band*: rejected — it only covers the top edge
    and would visually fight the drag affordance.
  - *Anchoring at a fixed top of 0 even under the docked strip*: rejected —
    violates FR-009.

## 5. Visual treatment: a CSS-only four-edge rim

- **Decision**: One component with a four-edge rim and an optional hard echo:
  - **Core**: a 4px `--tb-accent` border around the page area, held at a constant
    opacity so it never fades into invisibility.
  - **Contrast**: a 2px theme-tinted dark ring (`color-mix(accent, black)`) and a
    tighter neutral inset shadow inside the core, plus a `--tb-signature` bloom.
    The dark ring keeps the edge readable on white pages even when the shell
    theme's accent is light (for example amethyst dark over a white page).
  - **Normal**: a slow inner bloom breathing over ~1.6 s.
  - **Hard**: the same base plus a 2px inner rim that is inset further, uses a
    darker accent mix, and trails the base pulse by about 180 ms; the base itself
    uses a double beat.
  - Reduced motion: all animations are removed; the rims render static with the
    inner (hard) rim stronger (FR-013).
- **Rationale**: A pure CSS treatment keeps the shell bundle small and respects
  the repo's "no new dependency" posture. Opacity-only animation is
  compositor-friendly and deterministic. The two-tone edge solves the real
  contrast problem: the rim must read against the **guest page**, which may be
  light or dark independently of the shell's theme, so a single token color is
  not enough.
- **Alternatives considered**:
  - *A single `--tb-progress` line*: rejected — it washed out on light pages and
    on themes whose accent is light.
  - *Canvas or SVG animation*: rejected — more code and a render loop for a
    border decoration.
  - *Lottie or a GIF*: rejected — a dependency and a binary asset for a surface
    that tokens and keyframes already express.
  - *A Chrome-style determinate fill*: explicitly rejected by the clarification
    (indeterminate motion only).

## 6. Dev preview and automated capture

- **Decision**: Extend the existing Developer menu with **Preview Load Rim** and
  **Preview Hard Reload Rim**, driven by a new `previewLoadRim(hard)` method and
  the existing `devPreview` union (dev-only, absent from packaged builds). The
  screenshot runner's `reload` scene samples the live rim during a normal reload
  and a hard reload.
- **Rationale**: Motion is the feature, and the existing preview mechanism is the
  established way to iterate it with live HMR (specs/008, FR-014). Screenshots
  already had a reload scene; with a real rim it now captures the actual surface
  rather than an empty page, and showing both kinds documents the distinction.
- **Alternatives considered**:
  - *Only the real reload for iteration*: rejected — the reload window is often
    too short to style comfortably.
  - *A packaged preview*: rejected — preview affordances must be absent from
    shipping builds.

## 7. Testing strategy

- **Decision**: Unit-test the pure detection/kind helpers
  (`tests/unit/reload.test.ts`: `isReloadNavigation`, `rimKindFor`); validate
  motion, composition, in-place navigation, light-page contrast, reduced motion,
  and click-through manually (quickstart); capture both kinds through the
  existing screenshot scene. No new integration harness.
- **Rationale**: The electron-level event sequence is already exercised by the
  app's load lifecycle, and a brittle in-process navigation harness would add
  little over the pure predicates plus real loads. The pure predicates are the
  only branches likely to regress (URL normalization, null cold start, pending
  kind, continuation).
- **Alternatives considered**:
  - *Extend `dock-test.ts` with a reload assertion*: viable but heavier; it would
    have to race a real network load. The screenshot scene and manual checklist
    cover the same path.

## 8. Persistence and schema

- **Decision**: No persisted field and no schema change. The rim is
  `{ hard: boolean } | null` per window, plus a one-shot command-scoped pending
  kind.
- **Rationale**: It describes a live load, not a preference; restoring a rim on
  launch would be false. Mirrors the transient zoom/viewport statuses.
- **Alternatives considered**:
  - *Persist the last reload kind*: rejected — meaningless after launch and would
    require a migration.
