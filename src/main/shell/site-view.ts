import { WebContentsView, shell } from "electron";
import path from "node:path";
import { isAllowedUrl, isLocalHostname } from "../nav/policy";
import {
  failureReason,
  framedUrlInConsole,
  frameFailureReason,
  framingPolicyInConsole,
  isIgnorableFailure,
  isResponseBlocked,
  type FramingPolicy,
} from "@shared/failure";
import type { FrameFailure } from "@shared/frame-notice";

export interface SiteViewEvents {
  onLoading: (loading: boolean) => void;
  /** A main-frame document navigation began (not an in-page route change). */
  onNavigateStart: (url: string) => void;
  onReady: (url: string) => void;
  onNavigated: (url: string) => void;
  onFailed: (url: string, reason: string) => void;
  /** A frame inside the page failed to load its own document (specs/028). */
  onFrameFailed: (failure: FrameFailure) => void;
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

/** How long to wait for the console line that names a framing policy. */
const FRAME_POLICY_GRACE_MS = 150;

/** A bounded policy memo; a page cannot grow it without bound. */
const MAX_TRACKED_FRAMES = 32;

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

  /**
   * The framing policy that refused each address. Chromium is inconsistent about
   * which address a refusal names: a cross-origin frame is quoted, a same-origin
   * one names the ancestor. So both are recorded, one keyed by the quoted
   * address and one by the frame that reported it, and a policy is only used
   * when one of them matches the failed frame (specs/028).
   */
  const policyByQuotedUrl = new Map<string, FramingPolicy>();
  const policyByFrameUrl = new Map<string, FramingPolicy>();

  const remember = (map: Map<string, FramingPolicy>, key: string, policy: FramingPolicy) => {
    if (map.size >= MAX_TRACKED_FRAMES && !map.has(key)) {
      const oldest = map.keys().next();
      if (!oldest.done) map.delete(oldest.value);
    }
    map.set(key, policy);
  };

  const rememberPolicy = (message: string, frameUrl: string | undefined): void => {
    const policy = framingPolicyInConsole(message);
    if (!policy) return;
    const quoted = framedUrlInConsole(message);
    if (quoted) remember(policyByQuotedUrl, quoted, policy);
    if (frameUrl) remember(policyByFrameUrl, frameUrl, policy);
  };

  /**
   * The policy that refused this address. Only a response block can be a framing
   * refusal, so another failure never borrows a policy from a different frame.
   * When neither map knows the frame, no family is named rather than guessing.
   */
  const policyFor = (url: string, errorCode: number): FramingPolicy | null => {
    if (!isResponseBlocked(errorCode)) return null;
    return policyByFrameUrl.get(url) ?? policyByQuotedUrl.get(url) ?? null;
  };

  const reportFrameFailure = (
    url: string,
    errorCode: number,
    errorDescription: string,
    policy: FramingPolicy | null,
  ): void => {
    events.onFrameFailed({
      url,
      reason: frameFailureReason(errorCode, errorDescription, policy),
      policy,
    });
  };

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

  // A local target that server-redirects to a public URL must not render here
  // (FR-001). Subframes are intentionally left alone: their initial loads would
  // otherwise open the system browser for ordinary embeds.
  wc.on("will-redirect", (details) => {
    if (!details.isMainFrame) return;
    if (!isAllowedUrl(details.url)) {
      details.preventDefault();
      openExternal(details.url);
    }
  });

  wc.on("did-start-navigation", (details) => {
    // In-page routes are not document loads; the shell should not treat them as
    // reloads or navigations (specs/025).
    if (!details.isMainFrame || details.isSameDocument) return;
    // A policy memo belongs to one page load; carrying it over would mislabel a
    // frame on the next page that failed for a different reason.
    policyByQuotedUrl.clear();
    policyByFrameUrl.clear();
    events.onNavigateStart(details.url);
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
    // Ignore aborts (normal cancels/redirects) and code 0.
    if (isIgnorableFailure(errorCode)) return;

    if (isMainFrame) {
      failedUrl = validatedURL;
      events.onFailed(validatedURL, failureReason(errorCode, errorDescription));
      return;
    }

    // A frame inside the page failed. Chromium paints nothing for a refused
    // frame, so the shell reports it (specs/028). The console line naming the
    // policy arrives first, but only just: when it has not landed yet, give it
    // a tick before reporting without the policy family.
    const known = policyFor(validatedURL, errorCode);
    if (known || !isResponseBlocked(errorCode)) {
      reportFrameFailure(validatedURL, errorCode, errorDescription, known);
      return;
    }
    setTimeout(() => {
      if (wc.isDestroyed()) return;
      reportFrameFailure(
        validatedURL,
        errorCode,
        errorDescription,
        policyFor(validatedURL, errorCode),
      );
    }, FRAME_POLICY_GRACE_MS);
  });

  wc.on("console-message", (event) => {
    const params = event as { message?: string; frame?: { url?: string } };
    if (params.message) rememberPolicy(params.message, params.frame?.url);
  });

  wc.on("page-title-updated", (_event, title) => events.onTitle(title));

  // Track the live URL, including in-page (SPA route) navigations.
  wc.on("did-navigate", (_event, url) => events.onNavigated(url));
  wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) events.onNavigated(url);
  });

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
