import { app, Menu } from "electron";
import os from "node:os";
import path from "node:path";
import icon from "../../resources/icon.png?asset";
import { COMMANDS, type Accelerator } from "@shared/commands";
import { AppWindow } from "./shell/window";
import { runDockSelfTest, runUiSnapshot } from "./dock-test";

let mainWindow: AppWindow | null = null;

/**
 * App identity. The development Dock icon and the About panel use the same
 * committed artwork as the packaged bundle (see
 * specs/003-standalone-packaging/contracts/app-identity.md). The product name is
 * declared once in package.json; `app.getName()` resolves `productName`.
 */
function configureAppIdentity(): void {
  if (process.platform === "darwin") app.dock?.setIcon(icon);
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    iconPath: icon,
  });
}

// Keep automated checks away from the user's real state.
if (process.env.TLACHIALONI_DOCK_TEST === "1" || process.env.TLACHIALONI_UI_SNAPSHOT === "1") {
  app.setPath("userData", path.join(os.tmpdir(), `tlachialoni-docktest-${process.pid}`));
}

/** Commands whose accelerators live on the menu so they work from any panel. */
const MENU_COMMAND_IDS = [
  "palette.open",
  "palette.editUrl",
  "strip.toggle",
  "view.reload",
  "view.hardReload",
  "devtools.toggle",
  "devtools.dock.bottom",
  "devtools.dock.right",
  "devtools.dock.left",
  "focus.toggle",
  "picker.toggle",
];

function toElectronAccelerator(accelerator: Accelerator): string {
  const parts: string[] = [];
  if (accelerator.meta) parts.push("CommandOrControl");
  if (accelerator.alt) parts.push("Alt");
  if (accelerator.shift) parts.push("Shift");
  parts.push(
    accelerator.code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Arrow/, ""),
  );
  return parts.join("+");
}

function installMenu(): void {
  // Menu accelerators are handled by the OS menu, so these shortcuts keep working
  // even while focus is inside the DevTools panel (where the page's
  // before-input-event never fires). The window still shows no chrome.
  const viewItems = COMMANDS.filter(
    (command) => command.accelerator && MENU_COMMAND_IDS.includes(command.id),
  ).map((command) => ({
    label: command.label,
    accelerator: toElectronAccelerator(command.accelerator as Accelerator),
    click: () => {
      void mainWindow?.runCommand(command.id);
    },
  }));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { label: "View", submenu: viewItems },
    ]),
  );
}

app.whenReady().then(async () => {
  installMenu();
  configureAppIdentity();
  mainWindow = new AppWindow();
  mainWindow.show();

  if (process.env.TLACHIALONI_DOCK_TEST === "1") {
    await runDockSelfTest(mainWindow);
    if (process.env.TLACHIALONI_GRACEFUL === "1") app.quit();
    else app.exit(0);
  } else if (process.env.TLACHIALONI_UI_SNAPSHOT === "1") {
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
