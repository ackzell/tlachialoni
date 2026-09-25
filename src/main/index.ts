import { app, Menu } from "electron";
import os from "node:os";
import path from "node:path";
import { AppWindow } from "./shell/window";
import { runDockSelfTest, runUiSnapshot } from "./dock-test";

let mainWindow: AppWindow | null = null;

// Keep automated checks away from the user's real state.
if (process.env.LOCALBROWSER_DOCK_TEST === "1" || process.env.LOCALBROWSER_UI_SNAPSHOT === "1") {
  app.setPath("userData", path.join(os.tmpdir(), `localbrowser-docktest-${process.pid}`));
}

function installMenu(): void {
  // Keep the macOS app menu (Quit) and Edit roles (copy/paste in inputs), but
  // omit the View menu so its reload/devtools accelerators cannot conflict with
  // ours. The window itself still shows no chrome.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]));
}

app.whenReady().then(async () => {
  installMenu();
  mainWindow = new AppWindow();
  mainWindow.show();

  if (process.env.LOCALBROWSER_DOCK_TEST === "1") {
    await runDockSelfTest(mainWindow);
    if (process.env.LOCALBROWSER_GRACEFUL === "1") app.quit();
    else app.exit(0);
  } else if (process.env.LOCALBROWSER_UI_SNAPSHOT === "1") {
    await runUiSnapshot(mainWindow);
    app.exit(0);
  }
});

app.on("window-all-closed", () => app.quit());

app.on("activate", () => {
  if (!mainWindow || mainWindow.win.isDestroyed()) {
    mainWindow = new AppWindow();
    mainWindow.show();
  }
});
