import { WebContentsView } from "electron";
import path from "node:path";

const SHELL_PRELOAD = path.join(__dirname, "../preload/shell.js");

/**
 * Creates the shell overlay view. It spans the window with a fully transparent
 * background so the site shows through wherever the shell renders nothing
 * (research: overlay composition). Visibility and bounds are managed by the
 * window controller.
 */
export function createShellView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: SHELL_PRELOAD,
    },
  });

  view.setBackgroundColor("#00000000");

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void view.webContents.loadURL(`${devUrl}/index.html`);
  } else {
    void view.webContents.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return view;
}
