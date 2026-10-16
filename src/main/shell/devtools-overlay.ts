import type { WebContents } from "electron";

/**
 * Turns off the built-in DevTools "viewport size on resize" readout (specs/024).
 *
 * That readout is drawn by an OverlayAgent DevTools creates on its **own** CDP
 * session, so it cannot be disabled from the inspected page's session — a
 * page-session `Overlay.setShowViewportSizeOnResize` leaves it on (Chromium/
 * Puppeteer #6819; also, Electron's `webContents.debugger` cannot even attach
 * while DevTools is open). It must be turned off from the DevTools front-end, on
 * DevTools' own connection. The front-end exposes no SDK model for it, but its
 * host binding `InspectorFrontendHost.sendMessageToBackend` sends a raw CDP
 * message over that connection, which is the documented "send it from DevTools"
 * route. Returns whether the message was sent.
 *
 * The front-end re-applies its own default (`true`) when its overlay model
 * restarts — for example after a dock change reloads DevTools — so callers
 * re-assert this on the existing DevTools poll tick.
 */
export async function suppressDevToolsResizeOverlay(devtools: WebContents): Promise<boolean> {
  if (devtools.isDestroyed()) return false;
  try {
    return (await devtools.executeJavaScript(RESIZE_OVERLAY_SUPPRESSION_SCRIPT)) === true;
  } catch {
    // The front-end is not reachable yet; the next tick retries. Never throw —
    // DevTools itself must keep working.
    return false;
  }
}

/**
 * Sends `Overlay.setShowViewportSizeOnResize({ show: false })` on the DevTools
 * connection through whichever host send-binding the front-end exposes. Written
 * defensively so an unknown front-end layout is a no-op rather than an error. The
 * message id is bumped each call so it never collides with DevTools' own ids.
 */
const RESIZE_OVERLAY_SUPPRESSION_SCRIPT = `(() => {
  try {
    const g = globalThis;
    const ifh = g.InspectorFrontendHost;
    const dt = g.DevToolsAPI;
    let host = null;
    if (ifh && typeof ifh.sendMessageToBackend === "function") host = ifh;
    else if (dt && typeof dt.sendMessageToBackend === "function") host = dt;
    if (!host) return false;
    const id = (g.__tlachialoniOverlaySuppressId = (g.__tlachialoniOverlaySuppressId || 900000) + 1);
    host.sendMessageToBackend(JSON.stringify({
      id: id,
      method: "Overlay.setShowViewportSizeOnResize",
      params: { show: false },
    }));
    return true;
  } catch (error) {
    return false;
  }
})()`;
