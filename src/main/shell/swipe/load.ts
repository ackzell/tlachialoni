import path from "node:path";
import type { SwipeNavigationAddon } from "./addon";

export const SWIPE_NAVIGATION_ADDON_FILE_NAME = "swipe-navigation.node";

/**
 * Loads the addon from a path rather than importing it, so the bundler leaves
 * it alone and Electron's asar layer sends the load to the unpacked copy.
 *
 * `directory` is where the app's bundles sit. In development that is
 * `out/main`, and the build script writes the addon to `out/native`, so we look
 * beside the bundle first and then in the sibling native directory.
 */
export function loadSwipeNavigationAddon(directory: string): SwipeNavigationAddon {
  const candidates = [
    path.join(directory, SWIPE_NAVIGATION_ADDON_FILE_NAME),
    path.join(directory, "..", "native", SWIPE_NAVIGATION_ADDON_FILE_NAME),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const addonModule = { exports: {} as SwipeNavigationAddon };
      process.dlopen(addonModule, candidate);
      return addonModule.exports;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Swipe navigation addon not found");
}
