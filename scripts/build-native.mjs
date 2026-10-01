/**
 * Compiles the swipe-navigation Node-API addon (native/swipe-navigation).
 *
 * macOS-only. Built straight with clang++ rather than through node-gyp: it is
 * one file against `node_api.h`, and node-gyp would add a toolchain, a
 * binding.gyp, and a rebuild step to every install on every platform for a file
 * only macOS ever loads. `-undefined dynamic_lookup` leaves the Node-API symbols
 * to be resolved by whatever loads the bundle, which is how a `.node` links
 * against the host process.
 *
 * Invoked by the electron-vite main config before bundling. A development run
 * that cannot compile starts without swipe navigation; a packaged build throws,
 * because shipping without the feature is a defect.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export const SWIPE_NAVIGATION_ADDON_FILE_NAME = "swipe-navigation.node";

/** Directory the compiled addon lands in, relative to the repo root. */
export const SWIPE_NAVIGATION_OUT_DIR = "out/native";

function repoRoot() {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

/**
 * The directory holding Node's `node_api.h`. Tried in order:
 *   1. a locally installed `node-api-headers` package;
 *   2. the Node headers beside the running Node binary;
 *   3. the `node-gyp` cache Electron tooling populates.
 * The addon is built for the running Node's ABI, and Node-API is ABI-stable
 * across versions, so any of these headers works.
 */
function nodeApiHeadersDir() {
  const candidates = [];

  try {
    candidates.push(
      path.join(path.dirname(require.resolve("node-api-headers/package.json")), "include"),
    );
  } catch {
    // Not installed; fall through.
  }

  candidates.push(path.resolve(path.dirname(process.execPath), "..", "include", "node"));

  const home = process.env.HOME;
  if (home) {
    candidates.push(path.join(home, ".electron-gyp"));
    candidates.push(path.join(home, ".node-gyp"));
  }

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "node_api.h"))) return candidate;
    // The caches nest headers one level down, under the ABI version.
    if (existsSync(candidate)) {
      for (const entry of readdirSync(candidate)) {
        const nested = path.join(candidate, entry, "include", "node");
        if (existsSync(path.join(nested, "node_api.h"))) return nested;
      }
    }
  }

  throw new Error(
    "Could not find node_api.h. Install `node-api-headers` or point DEVELOPER_DIR at Xcode.",
  );
}

/**
 * Compiles the addon when it is missing or older than its source. Returns the
 * output path, or null when the platform is not macOS or (in development) the
 * compile failed.
 */
export async function buildSwipeNavigationAddon({ dev, force = false }) {
  if (process.platform !== "darwin") return null;

  const root = repoRoot();
  const sourceFilePath = path.join(root, "native", "swipe-navigation", "swipe-navigation.mm");
  const outputFilePath = path.join(
    root,
    SWIPE_NAVIGATION_OUT_DIR,
    SWIPE_NAVIGATION_ADDON_FILE_NAME,
  );

  if (!force) {
    const [source, output] = await Promise.all([
      stat(sourceFilePath).catch(() => null),
      stat(outputFilePath).catch(() => null),
    ]);
    if (source && output && output.mtimeMs >= source.mtimeMs) return outputFilePath;
  }

  await mkdir(path.dirname(outputFilePath), { recursive: true });

  // Through xcrun so the compiler and linker come from the toolchain
  // `DEVELOPER_DIR` or xcode-select names, not whichever clang++ is first in
  // PATH.
  try {
    await execFileAsync("xcrun", [
      "clang++",
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-arch",
      "arm64",
      "-mmacosx-version-min=13.0",
      "-fobjc-arc",
      "-std=c++20",
      "-O2",
      "-Wall",
      "-I",
      nodeApiHeadersDir(),
      "-framework",
      "AppKit",
      "-o",
      outputFilePath,
      sourceFilePath,
    ]);
  } catch (error) {
    if (dev) {
      console.warn(
        "Failed to compile the swipe-navigation addon; starting without swipe navigation",
      );
      console.warn(error instanceof Error ? error.message : String(error));
      return null;
    }
    throw error;
  }

  return outputFilePath;
}
