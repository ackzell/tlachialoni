/**
 * Generates src/shared/theme-tokens.ts (the shell's own `--tb-*` roles) and
 * src/shared/devtools-theme-tokens.ts (the Chromium DevTools `--color-ref-*`
 * reference palette) from the Tlapalli theme system.
 *
 * Tlapalli is MIT-licensed (see NOTICE). The generated files are committed, so
 * builds need no network. Re-run this script only when the upstream theme
 * changes:  node scripts/build-theme-tokens.ts
 */

import fs from "node:fs";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/ackzell/tlapalli-vscode-theme/main/themes/";

const SLUGS = [
  "obsidian",
  "gold",
  "turquoise",
  "quartz",
  "lapis-lazuli",
  "amethyst",
  "jade",
  "fire-opal",
] as const;

/** CSS variable -> ordered candidate VSCode color keys. */
const ROLE_KEYS: Record<string, string[]> = {
  "--tb-bg": ["editor.background"],
  "--tb-bg-elevated": ["editorWidget.background", "editor.background"],
  "--tb-surface": ["button.background", "badge.background", "editorWidget.background"],
  "--tb-fg": ["editor.foreground"],
  "--tb-fg-muted": ["descriptionForeground", "editor.foreground"],
  "--tb-fg-subtle": ["editorLineNumber.foreground", "descriptionForeground"],
  "--tb-border": ["panel.border", "sideBar.border", "editorGroup.border"],
  "--tb-accent": ["textLink.foreground", "editor.foreground"],
  "--tb-signature": ["activityBarBadge.background", "button.background"],
  "--tb-selection": ["editor.selectionBackground"],
  "--tb-hover": ["list.hoverBackground", "editor.selectionBackground"],
  "--tb-error": ["list.errorForeground", "errorForeground"],
  "--tb-progress": ["progressBar.background", "activityBarBadge.background"],
};

type Colors = Record<string, string>;

/** One TextMate scope rule from a Tlapalli theme's `tokenColors`. */
interface TokenColor {
  scopes: string[];
  color: string;
}

interface Theme {
  colors: Colors;
  tokenColors: TokenColor[];
}

async function fetchTheme(file: string): Promise<Theme> {
  const res = await fetch(`${BASE}${file}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
  const json = (await res.json()) as {
    colors?: Colors;
    tokenColors?: Array<{ scope?: string | string[]; settings?: { foreground?: string } }>;
  };
  const tokenColors: TokenColor[] = [];
  for (const entry of json.tokenColors ?? []) {
    const raw = Array.isArray(entry.scope) ? entry.scope : [entry.scope];
    const scopes = raw
      .filter((scope): scope is string => typeof scope === "string")
      .flatMap((scope) => scope.split(","))
      .map((scope) => scope.trim())
      .filter(Boolean);
    const color = entry.settings?.foreground;
    if (typeof color === "string" && color.startsWith("#")) {
      tokenColors.push({ scopes, color });
    }
  }
  return { colors: json.colors ?? {}, tokenColors };
}

function pick(colors: Colors, keys: string[]): string {
  for (const key of keys) {
    const value = colors[key];
    if (typeof value === "string" && value.startsWith("#")) return value;
  }
  return "#000000";
}

// ---- color helpers -----------------------------------------------------

type Rgb = [number, number, number];

function parse(hex: string): [number, number, number, number] {
  const raw = hex.replace("#", "");
  const alpha = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) : 255;
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
    alpha,
  ];
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Blends `from` toward `to` by `ratio`, preserving any 8-digit alpha. Used to
 * make the raw line-number color legible as shell UI text.
 */
function blend(from: string, to: string, ratio: number): string {
  const a = parse(from);
  const b = parse(to);
  const channel = (index: number): string =>
    Math.round(a[index] + (b[index] - a[index]) * ratio)
      .toString(16)
      .padStart(2, "0");
  const alpha = Math.round(a[3] + (b[3] - a[3]) * ratio);
  const rgb = `#${channel(0)}${channel(1)}${channel(2)}`;
  return alpha === 255 ? rgb : `${rgb}${alpha.toString(16).padStart(2, "0")}`;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return [
    Math.round(channel(hn + 1 / 3) * 255),
    Math.round(channel(hn) * 255),
    Math.round(channel(hn - 1 / 3) * 255),
  ];
}

/** Stops every DevTools reference palette family is declared at. */
const REF_STOPS = {
  neutral: [0, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 94, 95, 98, 99, 100],
  "neutral-variant": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100],
  primary: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100],
  secondary: [0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 99, 100],
  tertiary: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100],
  error: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100],
} as const;

/** Tone (HCT-ish lightness %) Chromium's own accent ramps sit at, per stop. */
const ACCENT_LIGHTNESS: Record<number, number> = {
  0: 0,
  10: 0.15,
  15: 0.2,
  20: 0.23,
  25: 0.28,
  30: 0.33,
  35: 0.38,
  40: 0.43,
  50: 0.53,
  60: 0.63,
  70: 0.73,
  80: 0.82,
  90: 0.91,
  95: 0.94,
  99: 0.975,
  100: 1,
};

/** Saturation today's Chromium ramps keep at each stop (1 = the seed's). */
const ACCENT_SATURATION: Record<number, number> = {
  0: 0,
  10: 0.75,
  15: 0.8,
  20: 0.85,
  25: 0.88,
  30: 0.9,
  35: 0.92,
  40: 0.95,
  50: 1,
  60: 1,
  70: 0.95,
  80: 0.85,
  90: 0.75,
  95: 0.6,
  99: 0.4,
  100: 0,
};

/**
 * How far `neutral-variant` leans toward the accent hue at its mid tones.
 */
const VARIANT_TINT = 0.15;

/** Accent hues are capped so a mineral never turns neon in DevTools chrome. */
const MAX_ACCENT_SATURATION = 0.75;

function mostSaturated(colors: string[]): string {
  let best = colors[0] ?? "#000000";
  let bestSat = -1;
  for (const color of colors) {
    if (typeof color !== "string" || !color.startsWith("#")) continue;
    const [, s] = rgbToHsl(parse(color) as unknown as Rgb);
    if (s > bestSat) {
      bestSat = s;
      best = color;
    }
  }
  return best;
}

function accentRamp(
  hue: number,
  saturation: number,
  stops: readonly number[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const stop of stops) {
    const l = ACCENT_LIGHTNESS[stop] ?? 0.5;
    const s = Math.min(saturation * (ACCENT_SATURATION[stop] ?? 1), MAX_ACCENT_SATURATION);
    out[String(stop)] = hex(hslToRgb(hue, s, l));
  }
  return out;
}

/**
 * How far the dark end of the neutral ramp is held back from the light one.
 * DevTools paints its dark surfaces, containers and dividers (stops 10-40) from
 * the low end, so a straight interpolation puts them a third of the way to white
 * and the docked panel's chrome reads as a generic mid-grey. Easing the ramp
 * keeps those stops hugging the variant's background, while the light stops that
 * light mode uses (90-100) barely move.
 */
const NEUTRAL_DARK_EASE = 0.45;

/**
 * Interpolates the neutral ramp from black, through the variant's own dark
 * background (the DevTools dark surface), to its light background (the light
 * surface), with the dark half eased down. Both ends are the theme's real
 * surfaces, so the docked panel lands on the same base colours as the shell; the
 * stops between them are the tinted greys DevTools needs for dividers,
 * containers and text.
 */
function neutralAt(stop: number, darkBg: string, lightBg: string): string {
  if (stop <= 10) return blend("#000000", darkBg, stop / 10);
  const t = (stop - 10) / 90;
  const eased = t * (NEUTRAL_DARK_EASE + (1 - NEUTRAL_DARK_EASE) * t);
  return blend(darkBg, lightBg, eased);
}

/** The mineral's signature colour: the most saturated accent the theme declares. */
function accentColor(dark: Theme, light: Theme): string {
  return mostSaturated([
    pick(light.colors, ["textLink.foreground", "activityBarBadge.background"]),
    pick(dark.colors, ["textLink.foreground", "activityBarBadge.background"]),
  ]);
}

function refPaletteFor(dark: Theme, light: Theme): Record<string, string> {
  const darkBg = pick(dark.colors, ["editor.background"]);
  const lightBg = pick(light.colors, ["editor.background"]);

  const [accentHue, accentSaturation] = rgbToHsl(parse(accentColor(dark, light)) as unknown as Rgb);

  const errorSeed = pick(dark.colors, ["list.errorForeground", "errorForeground"]);
  const [errorHue, errorSaturation] = rgbToHsl(parse(errorSeed) as unknown as Rgb);

  const neutral: Record<string, string> = {};
  for (const stop of REF_STOPS.neutral) neutral[String(stop)] = neutralAt(stop, darkBg, lightBg);

  const primary = accentRamp(accentHue, accentSaturation, REF_STOPS.primary);
  const secondary = accentRamp(accentHue, accentSaturation * 0.5, REF_STOPS.secondary);
  const tertiary = accentRamp(accentHue + 130, accentSaturation * 0.8, REF_STOPS.tertiary);
  const error = accentRamp(errorHue, errorSaturation, REF_STOPS.error);

  const neutralVariant: Record<string, string> = {};
  for (const stop of REF_STOPS["neutral-variant"]) {
    const base = neutral[String(stop)] ?? "#000000";
    const accent = primary[String(stop)] ?? base;
    neutralVariant[String(stop)] = blend(base, accent, VARIANT_TINT);
  }

  const families: Record<string, Record<string, string>> = {
    neutral,
    "neutral-variant": neutralVariant,
    primary,
    secondary,
    tertiary,
    error,
  };

  const out: Record<string, string> = {};
  for (const [family, stops] of Object.entries(REF_STOPS)) {
    for (const stop of stops) {
      out[`--color-ref-${family}${stop}`] = families[family][String(stop)];
    }
  }
  return out;
}

/**
 * DevTools' syntax token -> the TextMate scopes in a Tlapalli theme that carry
 * that role. DevTools paints source views from these `--sys-color-token-*`
 * variables, and they are hard-wired to the non-host-overridable colour families
 * (blue/green/orange/pink...), so they have to be set directly.
 */
const TOKEN_SCOPES: Record<string, string[]> = {
  "token-keyword": ["keyword"],
  "token-string": ["string"],
  "token-string-special": ["string.regexp", "constant.character.escape"],
  "token-number": ["constant.numeric"],
  "token-atom": ["constant"],
  "token-type": ["entity.name.type.class", "support.class"],
  "token-definition": ["entity.name.function"],
  "token-builtin": ["support.function", "support.class"],
  "token-tag": ["entity.name.tag"],
  "token-attribute": ["entity.other.attribute-name"],
  "token-attribute-value": ["string"],
  "token-pseudo-element": ["entity.other.attribute-name.id"],
  "token-comment": ["comment"],
  "token-variable": ["variable"],
  "token-variable-special": ["variable.parameter.function"],
  "token-property": ["support.type.property-name.json"],
  "token-property-special": ["constant.other.color"],
  "token-deleted": ["markup.deleted"],
  "token-inserted": ["markup.inserted"],
};

/** Exact scope first, then the first scope under that name, per candidate. */
function resolveToken(tokenColors: TokenColor[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const exact = tokenColors.find((entry) => entry.scopes.includes(candidate));
    if (exact) return exact.color;
  }
  for (const candidate of candidates) {
    const nested = tokenColors.find((entry) =>
      entry.scopes.some((scope) => scope.startsWith(`${candidate}.`)),
    );
    if (nested) return nested.color;
  }
  return null;
}

function syntaxOverrides(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, candidates] of Object.entries(TOKEN_SCOPES)) {
    const color = resolveToken(theme.tokenColors, candidates);
    if (color) out[`--sys-color-${token}`] = color;
  }
  return out;
}

/**
 * Chromium builds its `surface1..5` (toolbar, menus, cards) by mixing a
 * hardcoded blue into the mode's base. We rebuild them from the variant's own
 * accent ramp so the DevTools chrome carries the mineral's hue; the same
 * percentages Chromium uses keep the light/dark contrast relationships.
 */
const SURFACE_PERCENTAGES = [5, 8, 11, 12, 14];

function surfaceOverrides(accent: string, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  SURFACE_PERCENTAGES.forEach((percent, index) => {
    out[`--sys-color-surface${index + 1}`] = `color-mix(in srgb, ${accent} ${percent}%, ${base})`;
  });
  return out;
}

/**
 * WCAG contrast target for a syntax colour inside a selected row. DevTools paints
 * a selected row's node text with the raw token colours — its breadcrumb and node
 * label styles are `:host`-scoped inside shadow roots, so no stylesheet of ours
 * can restyle them — which leaves those colours readable on the panel background
 * but not on the selection tone.
 */
const SELECTION_CONTRAST = 4.5;

function srgb(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** The same colour with any 8-digit alpha dropped. */
function opaque(color: string): string {
  const [r, g, b] = parse(color);
  return hex([r, g, b]);
}

/** `color` composited over `background`, as an opaque hex. */
function flatten(color: string, background: string): string {
  const [r, g, b, rawAlpha] = parse(color);
  const alpha = rawAlpha / 255;
  const [backR, backG, backB] = parse(background);
  return hex([
    Math.round(r * alpha + backR * (1 - alpha)),
    Math.round(g * alpha + backG * (1 - alpha)),
    Math.round(b * alpha + backB * (1 - alpha)),
  ]);
}

function luminance(color: string): number {
  const [r, g, b] = parse(color);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(color: string, background: string): number {
  const foreground = luminance(flatten(color, background));
  const behind = luminance(flatten(background, background));
  const [hi, lo] = [foreground, behind].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour a selected row's tokens are lifted toward: the theme's foreground,
 * carried on toward the panel's text colour when the foreground alone is too dim
 * to clear the target on the selection tone (the dark minerals keep a mid-tone
 * editor foreground).
 */
function selectionInk(foreground: string, onSurface: string, tone: string): string {
  if (contrast(foreground, tone) >= SELECTION_CONTRAST) return opaque(foreground);
  for (let ratio = 0.1; ratio <= 1.0001; ratio += 0.1) {
    const candidate = blend(foreground, onSurface, ratio);
    if (contrast(candidate, tone) >= SELECTION_CONTRAST) return opaque(candidate);
  }
  return opaque(onSurface);
}

/** Lifts one token colour toward `ink` until it clears the target on `tone`. */
function selectionColor(color: string, ink: string, tone: string): string {
  if (contrast(color, tone) >= SELECTION_CONTRAST) return opaque(color);
  for (let ratio = 0.1; ratio <= 1.0001; ratio += 0.1) {
    const candidate = blend(color, ink, ratio);
    if (contrast(candidate, tone) >= SELECTION_CONTRAST) return opaque(candidate);
  }
  return opaque(ink);
}

/**
 * The token colours a *selected* row inherits, so its node text stays legible on
 * the selection tone while the rest of the panel keeps the theme's exact syntax
 * colours. devtools-theme.ts applies these inline on the selected row, which is
 * the only way to reach the shadow-rooted node text.
 *
 * The `--override-node-text-*` aliases matter as much as the tokens: DevTools'
 * breadcrumb host resolves those once, at the host, from the document-level
 * tokens — so a value set on the row below it must be re-declared, or the crumb
 * keeps the old colour.
 */
function selectionMap(
  tokens: Record<string, string>,
  foreground: string,
  onSurface: string,
  tone: string,
): Record<string, string> {
  const ink = selectionInk(foreground, onSurface, tone);
  const lifted: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens))
    lifted[name] = selectionColor(value, ink, tone);
  const at = (name: string): string => lifted[name] ?? selectionColor(onSurface, ink, tone);
  return {
    ...lifted,
    "--override-node-text-label-color": at("--sys-color-token-tag"),
    "--override-node-text-class-color": at("--sys-color-token-attribute"),
    "--override-node-text-id-color": at("--sys-color-token-attribute"),
    "--override-node-text-multiple-descriptors-id": at("--sys-color-token-variable"),
    "--override-node-text-multiple-descriptors-class": at("--sys-color-token-property"),
  };
}

/**
 * The selected-row tone: the mineral's own hue, deep and saturated, rather than
 * the reference ramp's washed-out `secondary30`. A dark fill is what lets the
 * raw syntax colours read on it, so the token lift below has little left to do.
 * (Lifted from the same values a Tlapalli user landed on by hand: the accent hue
 * at 75% saturation, 10% lightness.)
 */
const SELECTION_SATURATION = 0.75;
const SELECTION_LIGHTNESS = 0.13;

interface DevtoolsPalette {
  /** Mode-agnostic reference stops, applied as `--color-ref-*` + `--ref-palette-*`. */
  ref: Record<string, string>;
  /** Per-mode semantic overrides Chromium hardwires and we have to replace. */
  dark: Record<string, string>;
  light: Record<string, string>;
  /** Per-mode token colours for a selected row (see selectionOverrides). */
  selection: { dark: Record<string, string>; light: Record<string, string> };
}

function devtoolsPaletteFor(dark: Theme, light: Theme): DevtoolsPalette {
  const ref = refPaletteFor(dark, light);
  const darkTokens = syntaxOverrides(dark);
  const lightTokens = syntaxOverrides(light);
  const [accentHue, accentSaturation] = rgbToHsl(parse(accentColor(dark, light)) as unknown as Rgb);
  // A neutral mineral (obsidian) has no hue to saturate, so it keeps a neutral
  // fill rather than being given an arbitrary one.
  const toneSaturation = Math.min(SELECTION_SATURATION, accentSaturation * 2);
  const darkTone = hex(hslToRgb(accentHue, toneSaturation, SELECTION_LIGHTNESS));
  const lightTone = ref["--color-ref-primary90"];

  return {
    ref,
    dark: {
      // The selected-row fill: the mineral's own hue, deepened rather than the
      // reference ramp's washed-out `secondary30`. A dark, saturated tone is
      // what makes the raw syntax colours read on it.
      "--sys-color-tonal-container": darkTone,
      ...surfaceOverrides(ref["--color-ref-primary80"], ref["--color-ref-neutral10"]),
      ...darkTokens,
    },
    light: {
      ...surfaceOverrides(ref["--color-ref-primary40"], ref["--color-ref-neutral100"]),
      ...lightTokens,
    },
    selection: {
      dark: selectionMap(
        darkTokens,
        pick(dark.colors, ["editor.foreground"]),
        ref["--color-ref-neutral90"],
        darkTone,
      ),
      light: selectionMap(
        lightTokens,
        pick(light.colors, ["editor.foreground"]),
        ref["--color-ref-neutral10"],
        lightTone,
      ),
    },
  };
}

// ---- shell tokens ------------------------------------------------------

/**
 * How far `--tb-fg-subtle` is pulled toward `--tb-fg`. The raw
 * `editorLineNumber.foreground` is nearly invisible against the shell
 * background, so we blend it toward the foreground: brighter in dark modes,
 * darker in light modes, still dimmer than `--tb-fg-muted`.
 */
const SUBTLE_FG_MIX = 0.1;

function tokensFor(colors: Colors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cssVar, keys] of Object.entries(ROLE_KEYS)) out[cssVar] = pick(colors, keys);
  out["--tb-fg-subtle"] = blend(out["--tb-fg-subtle"], out["--tb-fg"], SUBTLE_FG_MIX);
  return out;
}

function write(relative: string, body: string): void {
  const here = import.meta.dirname ?? process.cwd();
  const target = path.resolve(here, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  process.stdout.write(`wrote ${path.relative(process.cwd(), target)}\n`);
}

const BANNER =
  "// GENERATED by scripts/build-theme-tokens.ts — do not edit by hand.\n" +
  "// Color values derived from the Tlapalli theme (MIT); see NOTICE.\n\n";

async function main(): Promise<void> {
  const variants: Record<string, { dark: Record<string, string>; light: Record<string, string> }> =
    {};
  const devtools: Record<string, DevtoolsPalette> = {};

  for (const slug of SLUGS) {
    const [dark, light] = await Promise.all([
      fetchTheme(`tlapalli-${slug}-theme.json`),
      fetchTheme(`tlapalli-${slug}-light-theme.json`),
    ]);
    variants[slug] = { dark: tokensFor(dark.colors), light: tokensFor(light.colors) };
    devtools[slug] = devtoolsPaletteFor(dark, light);
    process.stdout.write(`  ${slug}: ok\n`);
  }

  write(
    "../src/shared/theme-tokens.ts",
    BANNER +
      `export const TLAPALLI_TOKENS = ${JSON.stringify(variants, null, 2)} as const\n\n` +
      `export const TLAPALLI_VARIANTS = ${JSON.stringify(SLUGS, null, 2)} as const\n\n` +
      `export type TlapalliVariant = (typeof TLAPALLI_VARIANTS)[number]\n`,
  );

  const stops = Object.fromEntries(
    Object.entries(REF_STOPS).map(([family, list]) => [family, list]),
  );

  write(
    "../src/shared/devtools-theme-tokens.ts",
    BANNER +
      `/**\n` +
      ` * The Chromium DevTools reference palette ("--color-ref-*"), rebuilt per\n` +
      ` * Tlapalli variant. DevTools derives every semantic "--sys-color-*" token\n` +
      ` * from these families, so overriding them retunes the whole panel.\n` +
      ` *\n` +
      ` * One palette per variant: DevTools picks the dark or light set of stops via\n` +
      ` * its own \`theme-with-dark-background\` class, so \`ref\` is mode-agnostic.\n` +
      ` *\n` +
      ` * \`dark\`/\`light\` carry the semantic tokens Chromium hardwires and the\n` +
      ` * reference layer cannot reach: the \`surface1..5\` chrome (Chromium mixes a\n` +
      ` * fixed blue into them) and the \`token-*\` syntax colours (fixed to the\n` +
      ` * non-overridable hue families). They are applied for the active mode only.\n` +
      ` *\n` +
      ` * \`selection\` carries those same \`token-*\` colours lifted toward the theme\n` +
      ` * foreground until each clears 4.5:1 on the selection tone. The injector\n` +
      ` * writes them inline on the selected row, whose node text lives in a shadow\n` +
      ` * root that no stylesheet of ours can reach.\n` +
      ` */\n` +
      `export const DEVTOOLS_REF_STOPS = ${JSON.stringify(stops, null, 2)} as const\n\n` +
      `export const DEVTOOLS_THEME_TOKENS = ${JSON.stringify(devtools, null, 2)} as const\n\n` +
      `export type DevtoolsVariant = keyof typeof DEVTOOLS_THEME_TOKENS\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
