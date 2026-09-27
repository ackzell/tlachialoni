import { describe, expect, it } from "vitest";
import { TLAPALLI_TOKENS, TLAPALLI_VARIANTS } from "../../src/shared/theme-tokens";
import { TOKEN_VARIABLES } from "../../src/renderer/src/theme/tokens";

describe("Tlapalli tokens", () => {
  it("offers eight variants", () => {
    expect(TLAPALLI_VARIANTS).toHaveLength(8);
    expect(new Set(TLAPALLI_VARIANTS).size).toBe(8);
  });

  it("defines every contract variable for every variant and mode", () => {
    for (const variant of TLAPALLI_VARIANTS) {
      for (const mode of ["dark", "light"] as const) {
        const tokens = (TLAPALLI_TOKENS as Record<string, Record<string, Record<string, string>>>)[
          variant
        ][mode];
        for (const variable of TOKEN_VARIABLES) {
          expect(tokens[variable], `${variant}/${mode}/${variable}`).toMatch(/^#[0-9a-fA-F]{6,8}$/);
        }
      }
    }
  });

  it("gives obsidian a monochrome background", () => {
    expect(TLAPALLI_TOKENS.obsidian.dark["--tb-bg"]).toBe("#020202");
  });
});
