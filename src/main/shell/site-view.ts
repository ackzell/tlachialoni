import { WebContentsView, shell } from "electron";
import path from "node:path";
import { isAllowedUrl, isLocalHostname } from "../nav/policy";

export interface SiteViewEvents {
  onLoading: (loading: boolean) => void;
  onReady: (url: string) => void;
  onFailed: (url: string, reason: string) => void;
  onTitle: (title: string) => void;
}

const SITE_PRELOAD = path.join(__dirname, "../preload/site.js");

function openExternal(rawUrl: string): void {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void shell.openExternal(rawUrl);
    }
  } catch {
    // ignore malformed URLs
  }
}

/** Maps Chromium net error codes to a short human-readable reason. */
function failureReason(errorCode: number, errorDescription: string): string {
  switch (errorCode) {
    case -102:
      return "Connection refused";
    case -105:
      return "Name could not be resolved";
    case -106:
      return "The network is offline";
    case -118:
      return "The connection timed out";
    default:
      return errorDescription || `Load failed (${errorCode})`;
  }
}

/**
 * Creates the guest view. It is sandboxed with context isolation and no Node
 * access (constitution II; FR-014). Popups and non-local navigations are handed
 * to the system browser (FR-015).
 */
export function createSiteView(events: SiteViewEvents): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: SITE_PRELOAD,
    },
  });

  view.setBackgroundColor("#00000000");

  const wc = view.webContents;
  let failedUrl: string | null = null;

  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  wc.on("will-navigate", (details) => {
    if (!isAllowedUrl(details.url)) {
      details.preventDefault();
      openExternal(details.url);
    }
  });

  wc.on("did-start-loading", () => {
    failedUrl = null;
    events.onLoading(true);
  });
  wc.on("did-stop-loading", () => events.onLoading(false));

  wc.on("did-finish-load", () => {
    if (wc.isDestroyed()) return;
    // Chromium loads its own error page on a failed navigation, which still
    // fires did-finish-load; only that same URL is treated as failed.
    if (failedUrl && sameUrl(failedUrl, wc.getURL())) return;
    events.onReady(wc.getURL());
  });

  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // Ignore aborts (normal cancels/redirects) and subframe failures.
    if (!isMainFrame || errorCode === -3 || errorCode === 0) return;
    failedUrl = validatedURL;
    events.onFailed(validatedURL, failureReason(errorCode, errorDescription));
  });

  wc.on("page-title-updated", (_event, title) => events.onTitle(title));

  return view;
}

export { isLocalHostname };

function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}
