/**
 * Dev-only live overrides for the DevTools palette.
 *
 * A small JSON file (gitignored, at the repo root) lets palette values be tried
 * without a rebuild: main re-reads it when its mtime changes and folds it into
 * the injected custom properties, so anything DevTools reads can be moved —
 * `--sys-color-tonal-container` for the selected-row tone, `--sys-color-surface4`
 * for the toolbar, a `--color-ref-*` stop, a syntax token, all of them.
 *
 * Shape:
 *   {
 *     "dark":  { "--sys-color-tonal-container": "rgb(0 74 119 / 100%)" },
 *     "light": { "--sys-color-tonal-container": "rgb(211 227 253 / 100%)" }
 *   }
 *
 * Packaged builds configure no file, so the loader is a no-op there.
 */

import fs from "node:fs";

export interface DevtoolsThemeOverrides {
  dark: Record<string, string>;
  light: Record<string, string>;
}

const EMPTY: DevtoolsThemeOverrides = { dark: {}, light: {} };

let filePath: string | null = null;
let lastMtimeMs = -1;
let lastWarning: string | null = null;
let loaded = false;
let cached: DevtoolsThemeOverrides = EMPTY;

/** One-line description of what a load produced, for the dev console. */
function summarize(overrides: DevtoolsThemeOverrides): string {
  return `dark ${Object.keys(overrides.dark).length}, light ${Object.keys(overrides.light).length}`;
}

/** Points the loader at the override file; null disables it (packaged builds). */
export function configureDevtoolsThemeOverride(file: string | null): void {
  filePath = file;
  lastMtimeMs = -1;
  lastWarning = null;
  loaded = false;
  cached = EMPTY;
}

function strings(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith("--") && typeof value === "string") out[key] = value;
    }
  }
  return out;
}

/**
 * The current overrides, re-reading the file when it changes. A missing or
 * malformed file never throws: the generated palette simply wins, and the reason
 * is written to stderr once per distinct problem so edits stay visible.
 */
export function devtoolsThemeOverrides(): DevtoolsThemeOverrides {
  if (!filePath) return EMPTY;
  try {
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs === lastMtimeMs) return cached;
    lastMtimeMs = stat.mtimeMs;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const next: DevtoolsThemeOverrides = {
      dark: strings(json["dark"]),
      light: strings(json["light"]),
    };
    // Report every distinct load so an edit is visible in the dev console.
    if (!loaded || JSON.stringify(next) !== JSON.stringify(cached)) {
      process.stdout.write(`devtools theme override: ${summarize(next)}\n`);
    }
    loaded = true;
    cached = next;
    lastWarning = null;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      // No override file (or it was removed): the generated palette wins.
      if (loaded) {
        loaded = false;
        process.stdout.write("devtools theme override: none (file removed)\n");
      }
      cached = EMPTY;
      lastMtimeMs = -1;
      return cached;
    }
    const message = String(error);
    if (message !== lastWarning) {
      lastWarning = message;
      process.stderr.write(`devtools theme override ignored (${message}): ${filePath}\n`);
    }
  }
  return cached;
}
