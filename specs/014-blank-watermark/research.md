# Phase 0 Research: Blank-Page Watermark

This records the decisions behind the plan. The feature is small; the interesting
questions were "what is the blank page today," "how do we theme part of an SVG," and
"how does the surface stay on screen at all."

## 1. What the blank page is today

- **Finding**: There is no dedicated "new page" component. When a window has no
  target, the guest view is never loaded (it is transparent), so the visible
  background is the native `BaseWindow` color, resolved from the window's Tlapalli
  variant `--tb-bg`. The shell overlay then renders `CommandPalette.vue` in
  `location` scope, whose `.palette-backdrop` covers the window with a dim + blur.
- **Implication**: The "page" to decorate is not a component at all; it must be a new
  surface, and it must paint beneath the palette.

## 2. Where to render the mark

- **Decision**: A new shell-renderer component (`BlankView.vue`), mounted as the
  bottom-most surface in `App.vue`.
- **Rationale**: The shell already owns every tool surface and the theme tokens; the
  guest view must stay untouched (constitution II). Rendering in the shell keeps the
  mark out of the page and lets it share the exact theme resolution the rest of the
  UI uses.
- **Alternatives rejected**:
  - *Load a local blank page into the guest view*: touches the guest session and the
    sandboxed site preload for a purely cosmetic result.
  - *Set the native window background to an image*: Electron's `BaseWindow`
    background is a color only.

## 3. Keeping the surface on screen (the shell-mode bug)

- **Finding**: After 013, `desiredShellMode()` returns `band` whenever no full-window
  surface is up, and `band` sizes the shell `WebContentsView` to
  `{0, 0, width, DRAG_BAND_HEIGHT}`. A renderer surface at `inset: 0` would be
  **clipped to the top 36px** and invisible once the palette closed. Before 013 the
  shell was hidden entirely in that state, with the same result.
- **Decision**: Treat "blank" as a full-window state: `desiredShellMode()` returns
  `full` for a window whose record target is `null`.
- **Rationale**: The mark must persist after the palette is dismissed; the only way
  the shell can paint a full-window surface is `full`. A blank window has no page to
  obscure, so keeping the shell full costs nothing visible beyond the intended mark.
- **Alternatives rejected**:
  - *A dedicated third `ShellMode`*: more state for no benefit; "blank" is already a
    reason a full surface is up, like the veil or palette.
  - *Special-case the band height on blank windows*: the band exists to be 36px; it
    would still clip the mark.
- **Consequence**: The drag band keeps working because it is a child of the same
  full-window shell and still provides the top drag region.

## 4. Theming the mark: inline SVG + `currentColor`

- **Decision**: Inline the mark as raw SVG in the component and set the two inner
  chevrons (`path334`, `path335`) to `fill:currentColor`, with the host element
  setting `color: var(--tb-accent)`.
- **Rationale**: `currentColor` resolves against the element's computed `color`, so
  the accents track the window's variant with zero JS and no re-render. It requires
  the SVG to be part of the live document, which in turn requires inlining rather
  than a background image or `<img>` (both isolate the SVG from the page's `color`).
- **Alternatives rejected**:
  - *Background-image / `<img>`*: cannot target internal paths; the accents would be
    fixed art.
  - *CSS `mask-image`*: the mark's outer disc is opaque, so its alpha channel is a
    solid disc — masking would flatten the artwork into a single silhouette.
  - *Runtime string replacement* of a fixed fill: fragile and implicit.
  - *Edit the source art to the accent color*: works only for one variant and bakes a
    single theme's color into the icon art.
- **Asset handling**: a derived copy (`assets/logo.svg`) with exactly the two
  `currentColor` substitutions, so the committed source art stays the icon-build
  input and the invariant between the two is easy to check (`diff` shows only the two
  lines).

## 5. Light/dark treatment

- **Decision**: In light mode, apply `filter: invert(1) hue-rotate(180deg)` to the
  surface.
- **Rationale**: The mark carries an opaque white disc, so on a near-white backdrop
  it all but vanishes. Inverting turns it into a dark mark. Plain `invert(1)`,
  however, also flips the hue of the now-themed accent chevrons; adding
  `hue-rotate(180deg)` cancels that flip so a colored variant keeps its hue. Grays are
  unaffected, so the default (obsidian) look is unchanged.
- **Alternatives rejected**:
  - *No inversion*: the disc disappears on light backdrops.
  - *Recolor every path per mode*: a large rewrite of the art for a watermark.

## 6. Testing approach

- **Decision**: Unit-test the shared predicate only; validate the visual surface
  manually.
- **Rationale**: The surface lives in a `WebContentsView` with no DOM harness in the
  test setup, so its appearance and the light/dark filter are manual checks. The one
  piece of logic with real inputs — "is this window blank?" — is pure and shared, so
  it gets table tests alongside `isStripSurfaceVisible`.
