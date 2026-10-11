import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureDevtoolsThemeOverride,
  devtoolsThemeOverrides,
} from "../../src/main/shell/devtools-theme-override";

const EMPTY = { dark: {}, light: {} };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tlachialoni-override-"));
const file = path.join(dir, "devtools-theme.override.json");

/** Writes the file and forces a distinct mtime so the loader notices it. */
function write(value: unknown, secondsAhead: number): void {
  fs.writeFileSync(file, JSON.stringify(value));
  const time = new Date(Date.now() + secondsAhead * 1000);
  fs.utimesSync(file, time, time);
}

afterEach(() => {
  configureDevtoolsThemeOverride(null);
});

describe("DevTools theme override loader", () => {
  it("is empty until configured", () => {
    configureDevtoolsThemeOverride(null);
    expect(devtoolsThemeOverrides()).toEqual(EMPTY);
  });

  it("reads both modes", () => {
    write({ dark: { "--sys-color-tonal-container": "#123456" }, light: {} }, 1);
    configureDevtoolsThemeOverride(file);
    const overrides = devtoolsThemeOverrides();
    expect(overrides.dark["--sys-color-tonal-container"]).toBe("#123456");
    expect(overrides.light).toEqual({});
  });

  it("keeps only custom-property string values", () => {
    write({ dark: { nope: "#ffffff", "--x": 42, "--ok": "#abcdef" } }, 2);
    configureDevtoolsThemeOverride(file);
    expect(devtoolsThemeOverrides().dark).toEqual({ "--ok": "#abcdef" });
  });

  it("re-reads when the file changes", () => {
    write({ dark: { "--a": "#111111" } }, 3);
    configureDevtoolsThemeOverride(file);
    expect(devtoolsThemeOverrides().dark["--a"]).toBe("#111111");
    write({ dark: { "--a": "#222222" } }, 4);
    expect(devtoolsThemeOverrides().dark["--a"]).toBe("#222222");
  });

  it("survives a malformed file without throwing", () => {
    write({ dark: { "--a": "#333333" } }, 5);
    configureDevtoolsThemeOverride(file);
    expect(devtoolsThemeOverrides().dark["--a"]).toBe("#333333");
    fs.writeFileSync(file, "{ not json");
    const time = new Date(Date.now() + 6000);
    fs.utimesSync(file, time, time);
    expect(() => devtoolsThemeOverrides()).not.toThrow();
  });

  it("falls back when the file is missing", () => {
    configureDevtoolsThemeOverride(path.join(dir, "absent.json"));
    expect(devtoolsThemeOverrides()).toEqual(EMPTY);
  });
});
