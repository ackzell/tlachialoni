/**
 * Extension domain types shared by the main-process manager and the shell
 * renderer. Pure module (no Electron imports) so it is unit-testable and safe to
 * import from the renderer.
 */

export type ExtensionSource = "store" | "folder";

/** One developer-installed extension, as persisted. */
export interface InstalledExtension {
  /** Stable local key and folder name under the extension root. */
  slug: string;
  /** Extension ID assigned by the platform; informational. */
  id: string;
  name: string;
  version: string;
  source: ExtensionSource;
  enabled: boolean;
  installedAt: number;
  /**
   * Whether the manifest is MV3 with a background service worker, which Electron
   * does not run. Persisted so the list can badge the extension after the
   * one-time install warning (specs/018, FR-010). Absent in records written
   * before this field; those read as `false` and are corrected on the next load,
   * which re-reads the manifest.
   */
  mv3ServiceWorker: boolean;
  /**
   * Whether the app rewrote this extension's manifest from MV3 to MV2 so its
   * background could run, and the rewritten copy is the one currently loaded
   * (specs/019). False both for extensions that never needed it and for ones
   * whose rewrite Electron refused — the latter keep the `MV3` badge, because
   * their background really is dead. Persisted so the list can say which of the
   * two happened.
   */
  mv2Shimmed: boolean;
}

/**
 * The transient phases of an install/update. `resolving` is store-only; folder
 * installs begin at `verifying`. `done` and `error` are terminal.
 */
export type ExtensionPhase =
  | "resolving"
  | "downloading"
  | "verifying"
  | "extracting"
  | "loading"
  | "warning"
  | "done"
  | "error";

/** Byte progress for a download; `total` is null when the length is unknown. */
export interface ExtensionProgress {
  received: number;
  total: number | null;
}

/**
 * What the status surface renders. Emitted by the manager and forwarded to the
 * shell; never persisted.
 */
export interface ExtensionStatus {
  phase: ExtensionPhase;
  /** Extension name once known, otherwise its ID or the pending source. */
  name?: string;
  message: string;
  progress?: ExtensionProgress;
  error?: string;
}

/** Phases during which an install is still running (the surface is "active"). */
export function isActivePhase(phase: ExtensionPhase): boolean {
  return phase !== "done" && phase !== "error" && phase !== "warning";
}

/**
 * Whether the status surface should dismiss this status on a timer.
 *
 * Only a `done` leaves on its own. A `warning` waits for the developer
 * (specs/018, FR-006) and an `error` waits to be read.
 *
 * This is a predicate over the status *value* on purpose, not a test for a
 * change in it. The surface component is mounted only while a status exists, so
 * a status that is already terminal on arrival — `Removed <name>`, the sole
 * status a removal emits — is the initial value and never fires a change
 * watcher. Keying the dismissal off the value is what keeps removal and install
 * behaving the same.
 */
export function shouldAutoDismiss(phase: ExtensionPhase): boolean {
  return phase === "done";
}

/** Result of an extension command, matching the command registry's shape. */
export interface ExtensionResult {
  ok: boolean;
  reason?: string;
}
