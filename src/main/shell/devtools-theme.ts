/**
 * Repaints the docked Chromium DevTools with a Tlapalli variant's palette.
 *
 * Every DevTools surface — including the ones inside shadow roots (the Elements
 * tree rows, the breadcrumb, the node labels) — colours itself from CSS custom
 * properties, which inherit across shadow boundaries. Custom properties are
 * therefore the one lever that reaches all of it; an injected stylesheet cannot
 * (a document-level sheet never crosses into a shadow root, and the component
 * sheets are bundled).
 *
 * DevTools derives every semantic `--sys-color-*` token from a small reference
 * palette (`--color-ref-*`, declared in its `design_system_tokens.css`). The host
 * normally supplies that palette through the `devtools://theme/colors.css`
 * stylesheet, but as inline styles on `<html>` our values win over that
 * stylesheet — and over DevTools re-applying its own theme — without editing any
 * DevTools CSS.
 *
 * Two things the reference layer cannot reach are set directly, per mode:
 *   - the `--sys-color-surface1..5` chrome (toolbar, menus), which Chromium
 *     builds by mixing a fixed blue into the mode's base; and
 *   - the `--sys-color-token-*` syntax colours, which point at fixed hue
 *     families (blue/green/orange/pink...) that are not host-overridable.
 *
 * A third is set per *element*: a selected row keeps the raw syntax colours (its
 * breadcrumb and node-label rules are `:host`-scoped inside a shadow root), which
 * are tuned for the panel background and read poorly on the selection tone. The
 * generator pre-lifts those tokens toward the foreground, and this module writes
 * them inline on the selected row, where they inherit into the shadow tree.
 *
 * DevTools picks its dark or light set of stops from the
 * `theme-with-dark-background` class, so we force that class to make the panel
 * follow the window's color mode instead of the OS.
 */

import { DEVTOOLS_THEME_TOKENS } from "@shared/devtools-theme-tokens";

export type DevtoolsThemeMode = "dark" | "light";

interface DevtoolsPalette {
  /** Mode-agnostic reference stops, written as `--color-ref-*` + `--ref-palette-*`. */
  ref: Record<string, string>;
  /** Per-mode semantic overrides applied as-is. */
  dark: Record<string, string>;
  light: Record<string, string>;
  /** Per-mode token colours written inline on a selected row. */
  selection: { dark: Record<string, string>; light: Record<string, string> };
}

/** A flat map of custom properties applied after the generated palette. */
export type DevtoolsOverride = Record<string, string>;

export interface DevtoolsThemeOptions {
  /** Dev-only overrides; applied last, so they win over the generated palette. */
  override?: DevtoolsOverride;
}

/**
 * Set on a row we have lifted, so the next pass can undo it when the row is no
 * longer selected (inline properties are not cleared by removing a class).
 */
const MARKER = "data-tlachialoni-selected";

/**
 * Marks the exact palette currently applied. The guard compares it instead of a
 * single token, so an override-only change (a dev edit) still re-applies.
 */
const REVISION_PROPERTY = "--tlachialoni-theme-rev";

function revisionOf(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The DevTools palette for one variant, or null when unthemed. */
export function devtoolsPalette(variant: string): DevtoolsPalette | null {
  const palette = (DEVTOOLS_THEME_TOKENS as Record<string, DevtoolsPalette>)[variant];
  return palette ?? null;
}

/**
 * Every custom property the script sets. Each `--color-ref-*` is also written as
 * its `--ref-palette-*` twin, so the palette holds whether DevTools resolves
 * through the host-styleable layer or straight off the reference one.
 */
function devtoolsProperties(
  palette: DevtoolsPalette,
  mode: DevtoolsThemeMode,
  override: DevtoolsOverride,
): Record<string, string> {
  const props: Record<string, string> = {};
  const add = (name: string, value: string): void => {
    props[name] = value;
    if (name.startsWith("--color-ref-")) {
      props[name.replace("--color-ref-", "--ref-palette-")] = value;
    }
  };
  for (const [name, value] of Object.entries(palette.ref)) add(name, value);
  for (const [name, value] of Object.entries(palette[mode])) add(name, value);
  for (const [name, value] of Object.entries(override)) add(name, value);
  return props;
}

/**
 * Builds the in-page script that repaints DevTools, or null for a variant with
 * no palette. The script is idempotent: it no-ops the palette write when the
 * applied revision and mode already match, so main can call it on a timer to
 * self-heal after DevTools reloads itself, and it re-applies whenever either
 * changes. The selected-row lift is (re)applied on every call, and a class
 * observer keeps it in step between calls so clicking a row feels immediate.
 */
export function devtoolsThemeScript(
  variant: string,
  mode: DevtoolsThemeMode,
  options: DevtoolsThemeOptions = {},
): string | null {
  const palette = devtoolsPalette(variant);
  if (!palette) return null;

  const base = devtoolsProperties(palette, mode, options.override ?? {});
  const selection = palette.selection[mode] ?? {};
  const signature = revisionOf(JSON.stringify([variant, mode, base]));
  const props = { ...base, [REVISION_PROPERTY]: signature };
  const dark = mode === "dark";

  return [
    "(() => {",
    "  const root = document.documentElement;",
    "  if (!root) return false;",
    `  window.__tlachialoniSelection = ${JSON.stringify(selection)};`,
    "  const deepQuery = (selector) => {",
    "    const found = [];",
    "    const walk = (root) => {",
    "      found.push(...root.querySelectorAll(selector));",
    "      for (const el of root.querySelectorAll('*')) {",
    "        if (el.shadowRoot) walk(el.shadowRoot);",
    "      }",
    "    };",
    "    walk(document);",
    "    return found;",
    "  };",
    "  window.__tlachialoniApplySelection = () => {",
    "    const values = window.__tlachialoniSelection;",
    "    const names = Object.keys(values);",
    `    for (const row of deepQuery("[${MARKER}]")) {`,
    "      for (const name of names) row.style.removeProperty(name);",
    `      row.removeAttribute("${MARKER}");`,
    "    }",
    '    for (const row of deepQuery("li.selected")) {',
    "      for (const name of names) row.style.setProperty(name, values[name]);",
    `      row.setAttribute("${MARKER}", "");`,
    "    }",
    "  };",
    "  window.__tlachialoniApplySelection();",
    "  if (!window.__tlachialoniSelectionObserver) {",
    "    let pending = 0;",
    "    const schedule = () => {",
    "      if (pending) return;",
    "      pending = setTimeout(() => {",
    "        pending = 0;",
    "        window.__tlachialoniApplySelection();",
    "      }, 80);",
    "    };",
    "    const observer = new MutationObserver(schedule);",
    '    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });',
    "    window.__tlachialoniSelectionObserver = observer;",
    "  }",
    `  const props = ${JSON.stringify(props)};`,
    `  const dark = ${dark};`,
    `  if (root.style.getPropertyValue(${JSON.stringify(REVISION_PROPERTY)}) === ${JSON.stringify(signature)} &&`,
    '      root.classList.contains("theme-with-dark-background") === dark) return false;',
    "  for (const name in props) root.style.setProperty(name, props[name]);",
    '  root.classList.toggle("theme-with-dark-background", dark);',
    '  root.style.colorScheme = dark ? "dark" : "light";',
    "  return true;",
    "})()",
  ].join("\n");
}
