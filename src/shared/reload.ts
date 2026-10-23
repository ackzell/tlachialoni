/**
 * Load-rim detection shared by the main process and the shell (specs/025).
 *
 * A rim mirrors any main-frame document load that keeps the current page visible:
 * a reload, a link click, a history move, or a same-origin palette navigation.
 * Site switches, cold starts, and failure loads keep the full-screen veil instead.
 *
 * Electron does not report cache-bypass intent on the navigation event, so the
 * command that started a reload carries that separately; this module keeps the
 * URL comparison and the normal/hard selection pure and testable.
 */

export type ReloadKind = "normal" | "hard";

function normalizedHref(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

/** Whether a navigation targets the document that is already on screen. */
export function isReloadNavigation(navigationUrl: string, shownUrl: string | null): boolean {
  if (shownUrl === null) return false;
  return normalizedHref(navigationUrl) === normalizedHref(shownUrl);
}

/**
 * The rim kind for a navigation. A pending reload command decides the kind while
 * it applies; otherwise an active hard rim survives redirects and other
 * continuations, and a fresh in-place load is normal.
 */
export function rimKindFor(
  isReload: boolean,
  pending: ReloadKind | null,
  active: ReloadKind | null,
): ReloadKind {
  if (isReload && pending !== null) return pending;
  return active ?? "normal";
}
