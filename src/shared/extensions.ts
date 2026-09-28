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
  return phase !== "done" && phase !== "error";
}

/** Result of an extension command, matching the command registry's shape. */
export interface ExtensionResult {
  ok: boolean;
  reason?: string;
}
