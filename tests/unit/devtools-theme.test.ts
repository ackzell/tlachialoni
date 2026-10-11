import { describe, expect, it } from "vitest";
import { DEVTOOLS_REF_STOPS, DEVTOOLS_THEME_TOKENS } from "../../src/shared/devtools-theme-tokens";
import { devtoolsPalette, devtoolsThemeScript } from "../../src/main/shell/devtools-theme";

const HEX = /^#[0-9a-f]{6,8}$/;

interface Palette {
  ref: Record<string, string>;
  dark: Record<string, string>;
  light: Record<string, string>;
  selection: { dark: Record<string, string>; light: Record<string, string> };
}

const palettes = DEVTOOLS_THEME_TOKENS as unknown as Record<string, Palette>;
const stops = DEVTOOLS_REF_STOPS as unknown as Record<string, readonly number[]>;

/** WCAG relative luminance; ignores any trailing alpha. */
function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("DevTools reference palette", () => {
  it("covers every Chromium reference stop for every variant", () => {
    for (const [variant, palette] of Object.entries(palettes)) {
      for (const [family, familyStops] of Object.entries(stops)) {
        for (const stop of familyStops) {
          const variable = `--color-ref-${family}${stop}`;
          expect(palette.ref[variable], `${variant}/${variable}`).toMatch(HEX);
        }
      }
    }
  });

  it("gives every variant its own neutral ramp", () => {
    const darkest = new Set(Object.values(palettes).map((p) => p.ref["--color-ref-neutral10"]));
    expect(darkest.size).toBe(Object.keys(palettes).length);
  });

  it("anchors the neutral ramp on the variant's own dark and light surfaces", () => {
    expect(palettes.obsidian.ref["--color-ref-neutral0"]).toBe("#000000");
    expect(palettes.obsidian.ref["--color-ref-neutral10"]).toBe("#020202");
    expect(palettes.obsidian.ref["--color-ref-neutral100"]).toBe("#fdfdfd");
    expect(palettes.amethyst.ref["--color-ref-neutral10"]).toBe("#060407");
    expect(palettes.amethyst.ref["--color-ref-neutral100"]).toBe("#faf8fb");
  });

  it("lightens monotonically so DevTools' stops stay ordered", () => {
    for (const palette of Object.values(palettes)) {
      const ramp = stops.neutral ?? [];
      for (let i = 1; i < ramp.length; i++) {
        const previous = luminance(palette.ref[`--color-ref-neutral${ramp[i - 1]}`]);
        const current = luminance(palette.ref[`--color-ref-neutral${ramp[i]}`]);
        expect(current, `neutral${ramp[i]}`).toBeGreaterThan(previous);
      }
    }
  });

  it("keeps the dark container stops hugging the background", () => {
    // neutral25 is the dark-mode base (the toolbar/container); it must sit in
    // the bottom quarter of the ramp, not a third of the way to the text colour.
    for (const [variant, palette] of Object.entries(palettes)) {
      const bg = luminance(palette.ref["--color-ref-neutral10"]);
      const ink = luminance(palette.ref["--color-ref-neutral90"]);
      const container = luminance(palette.ref["--color-ref-neutral25"]);
      expect(container - bg, `${variant}/neutral25`).toBeLessThan((ink - bg) * 0.25);
    }
  });
});

describe("DevTools hardwired overrides", () => {
  it("derives the surface1..5 chrome from the variant's accent, not Chromium's blue", () => {
    for (const [variant, palette] of Object.entries(palettes)) {
      for (const mode of ["dark", "light"] as const) {
        for (let surface = 1; surface <= 5; surface++) {
          const value = palette[mode][`--sys-color-surface${surface}`];
          expect(value, `${variant}/${mode}/surface${surface}`).toContain("color-mix(");
          expect(value, `${variant}/${mode}/surface${surface}`).not.toContain("#6991d6");
          expect(value, `${variant}/${mode}/surface${surface}`).not.toContain("#d1e1ff");
        }
      }
    }
  });

  it("maps syntax tokens to the theme's own token colors per mode", () => {
    for (const palette of Object.values(palettes)) {
      for (const mode of ["dark", "light"] as const) {
        for (const token of ["keyword", "string", "comment", "number", "tag"]) {
          expect(palette[mode][`--sys-color-token-${token}`], `${mode}/${token}`).toMatch(HEX);
        }
        // Keyword and string must differ, or source is unreadable.
        expect(palette[mode]["--sys-color-token-keyword"]).not.toBe(
          palette[mode]["--sys-color-token-string"],
        );
      }
    }
  });

  it("keeps the dark selection legible against the selection tone", () => {
    // DevTools paints a selected row with `--sys-color-tonal-container` and, for
    // most trees, its text with `--sys-color-on-tonal-container` (secondary90).
    // The selected Elements row has to clear a readable ratio on every variant.
    for (const [variant, palette] of Object.entries(palettes)) {
      const tone = palette.dark["--sys-color-tonal-container"];
      const on = palette.ref["--color-ref-secondary90"];
      expect(contrast(tone, on), `${variant}/selection`).toBeGreaterThanOrEqual(6);
    }
  });

  it("lifts the selected row's tokens to a readable contrast, in both modes", () => {
    const tokens = [
      "--sys-color-token-tag",
      "--sys-color-token-attribute",
      "--sys-color-token-comment",
      "--sys-color-token-keyword",
    ];
    for (const [variant, palette] of Object.entries(palettes)) {
      for (const mode of ["dark", "light"] as const) {
        const tone =
          mode === "dark"
            ? palette.dark["--sys-color-tonal-container"]
            : palette.ref["--color-ref-primary90"];
        for (const token of tokens) {
          expect(
            contrast(palette.selection[mode][token], tone),
            `${variant}/${mode}/${token}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("deepens the dark selection tone, neutral for a mineral with no hue", () => {
    // Turquoise's accent hue, saturated and deepened — the same treatment a
    // Tlapalli user landed on by hand (hsl(178 75% 10%), nudged up in lightness).
    // Obsidian has no hue, so its fill stays neutral rather than being handed an
    // arbitrary one.
    const turquoise = palettes.turquoise.dark["--sys-color-tonal-container"];
    expect(contrast(turquoise, "#ffffff")).toBeGreaterThan(10);
    const obsidian = palettes.obsidian.dark["--sys-color-tonal-container"].replace("#", "");
    expect(obsidian.slice(0, 2)).toBe(obsidian.slice(2, 4));
    expect(obsidian.slice(2, 4)).toBe(obsidian.slice(4, 6));
  });

  it("carries the node-text override aliases DevTools resolves above the row", () => {
    for (const palette of Object.values(palettes)) {
      expect(palette.selection.dark["--override-node-text-label-color"]).toMatch(HEX);
      expect(palette.selection.light["--override-node-text-label-color"]).toMatch(HEX);
    }
  });
});

describe("devtoolsThemeScript", () => {
  it("writes the reference stops as both color-ref and ref-palette inline styles", () => {
    const script = devtoolsThemeScript("obsidian", "dark");
    expect(script).toBeTruthy();
    expect(script).toContain('"--color-ref-neutral10":"#020202"');
    expect(script).toContain('"--ref-palette-neutral10":"#020202"');
  });

  it("includes the mode's hardwired overrides", () => {
    const dark = devtoolsThemeScript("amethyst", "dark");
    const light = devtoolsThemeScript("amethyst", "light");
    expect(dark).toContain('"--sys-color-token-keyword":"#8a5a9dee"');
    expect(light).toContain('"--sys-color-token-keyword":"#9772a6"');
    expect(dark).toContain("color-mix(in srgb, #d9aff4 5%, #060407)");
    expect(light).toContain("color-mix(in srgb, #801bc0 12%, #faf8fb)");
  });

  it("applies dev overrides last, with the ref-palette twin", () => {
    const tweaked = devtoolsThemeScript("amethyst", "dark", {
      override: { "--sys-color-tonal-container": "#123456", "--color-ref-neutral10": "#010203" },
    });
    expect(tweaked).toContain('"--sys-color-tonal-container":"#123456"');
    expect(tweaked).toContain('"--color-ref-neutral10":"#010203"');
    expect(tweaked).toContain('"--ref-palette-neutral10":"#010203"');
  });

  it("marks each palette with a revision so override edits re-apply", () => {
    const plain = devtoolsThemeScript("amethyst", "dark");
    const tweaked = devtoolsThemeScript("amethyst", "dark", {
      override: { "--sys-color-tonal-container": "#123456" },
    });
    expect(plain).toContain("--tlachialoni-theme-rev");
    expect(tweaked).not.toBe(plain);
  });

  it("writes the selection lift inline on the selected row", () => {
    const script = devtoolsThemeScript("amethyst", "dark");
    expect(script).toContain("__tlachialoniApplySelection");
    expect(script).toContain("data-tlachialoni-selected");
    expect(script).toContain("li.selected");
  });

  it("pierces shadow roots to find the selected rows", () => {
    // The Elements tree and breadcrumb rows live inside shadow roots, so a plain
    // document query finds nothing.
    const script = devtoolsThemeScript("amethyst", "dark");
    expect(script).toContain("deepQuery");
    expect(script).toContain("shadowRoot");
  });

  it("forces the DevTools class to match the window's color mode", () => {
    expect(devtoolsThemeScript("amethyst", "dark")).toContain("const dark = true");
    expect(devtoolsThemeScript("amethyst", "light")).toContain("const dark = false");
  });

  it("no-ops for a variant with no palette", () => {
    expect(devtoolsThemeScript("not-a-variant", "dark")).toBeNull();
  });

  it("exposes the palette by variant", () => {
    expect(devtoolsPalette("obsidian")).not.toBeNull();
    expect(devtoolsPalette("not-a-variant")).toBeNull();
  });
});
