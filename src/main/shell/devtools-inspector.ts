/**
 * Dev-only inspector for the DevTools front-end itself.
 *
 * Electron refuses `openDevTools()` on a DevTools WebContents (its type is
 * `remote` — the call is a silent no-op), so the only way to inspect the panel's
 * own DOM and custom properties is to point a bundled DevTools front-end at the
 * DevTools target over the remote debugging protocol.
 *
 * That needs two switches, appended before the app is ready:
 *   --remote-debugging-port  so `/json` can list the targets
 *   --remote-allow-origins   because Chromium >= 111 rejects a WebSocket whose
 *                            origin is not on the allow-list, and the front-end's
 *                            origin (`devtools://devtools`) is not by default
 *
 * With those, `devtools://devtools/bundled/inspector.html?ws=<target>` attaches
 * to the DevTools document, so its Elements/Styles panes show the inline
 * `--color-ref-*` / `--sys-color-*` properties and what consumes each of them.
 */

import { BrowserWindow } from "electron";

const TARGET_PREFIX = "devtools://devtools/bundled/";
const FRONTEND = "devtools://devtools/bundled/inspector.html";
const POLL_MS = 300;
const TIMEOUT_MS = 20_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The DevTools front-end's debugger socket, once it is listed. */
async function findDevtoolsSocket(port: number): Promise<string | null> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = (await response.json()) as Array<{
        url?: string;
        webSocketDebuggerUrl?: string;
      }>;
      const target = targets.find((entry) => String(entry.url ?? "").startsWith(TARGET_PREFIX));
      if (target?.webSocketDebuggerUrl) {
        return String(target.webSocketDebuggerUrl).replace(/^ws:\/\//, "");
      }
    } catch {
      // The endpoint is not up yet; keep waiting.
    }
    await wait(POLL_MS);
  }
  return null;
}

/**
 * Opens an inspector on the DevTools front-end. Resolves to null when the target
 * never appears (e.g. no docked panel), so a failure is never fatal.
 */
export async function openDevtoolsInspector(port: number): Promise<BrowserWindow | null> {
  const socket = await findDevtoolsSocket(port);
  if (!socket) return null;
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Tlachialoni — DevTools inspector",
  });
  await win.loadURL(`${FRONTEND}?ws=${socket}`);
  return win;
}
