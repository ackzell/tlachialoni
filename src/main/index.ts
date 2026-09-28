import { app, Menu, session } from "electron";
import os from "node:os";
import path from "node:path";
import icon from "../../resources/icon.png?asset";
import { COMMANDS, type Accelerator } from "@shared/commands";
import { formatReleaseDate } from "@shared/release";
import { StateStore } from "./state/store";
import { ExtensionManager } from "./extensions/manager";
import { AppWindow } from "./shell/window";
import { runDockSelfTest, runExtensionSelfTest, runUiSnapshot } from "./dock-test";

let mainWindow: AppWindow | null = null;
let store: StateStore | null = null;
let extensions: ExtensionManager | null = null;

/**
 * App identity. The development Dock icon and the About panel use the same
 * committed artwork as the packaged bundle (see
 * specs/003-standalone-packaging/contracts/app-identity.md). The product name is
 * declared once in package.json; `app.getName()` resolves `productName`.
 *
 * The release date is baked in at build time from the `v<version>` tag (see
 * specs/006-release-versioning-about/contracts/release-identity.md) and shown in
 * the panel's credits area, which macOS renders below the version line.
 */
function configureAppIdentity(): void {
  if (process.platform === "darwin") app.dock?.setIcon(icon);
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    iconPath: icon,
    credits: `Released ${formatReleaseDate(__APP_RELEASE_DATE__)}`,
  });
}

// Keep automated checks away from the user's real state.
if (
  process.env.TLACHIALONI_DOCK_TEST === "1" ||
  process.env.TLACHIALONI_UI_SNAPSHOT === "1" ||
  process.env.TLACHIALONI_EXTENSION_TEST === "1"
) {
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

  const template: Electron.MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    { role: "editMenu" },
    { label: "View", submenu: viewItems },
  ];

  // Development-only: keep a transient shell surface on screen to style it
  // (specs/008-surface-preview).
  if (!app.isPackaged) {
    template.push({
      label: "Developer",
      submenu: [
        {
          label: "Preview Loading Veil",
          click: () => mainWindow?.previewLoadingVeil(),
        },
        {
          label: "Preview Failure View",
          click: () => mainWindow?.previewFailureView(),
        },
        {
          label: "Preview Extension Install",
          click: () => mainWindow?.previewExtensionStatus(),
        },
        { type: "separator" },
        {
          label: "Stop Preview",
          click: () => mainWindow?.stopSurfacePreview(),
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Builds the process-wide state store and extension manager and loads enabled
 * extensions into the guest session. Extension loading must happen before the
 * window's guest view starts loading, and the manager is process-wide so a
 * re-activated window reuses the already-loaded extensions.
 */
async function createWindow(): Promise<AppWindow> {
  let activeStore = store;
  let manager = extensions;
  if (!activeStore || !manager) {
    activeStore = new StateStore(path.join(app.getPath("userData"), "state.json"));
    manager = new ExtensionManager({
      store: activeStore,
      session: session.defaultSession,
      root: path.join(app.getPath("userData"), "extensions"),
    });
    await manager.loadAll();
    store = activeStore;
    extensions = manager;
  }
  const window = new AppWindow({ store: activeStore, extensions: manager });
  window.show();
  return window;
}

app.whenReady().then(async () => {
  installMenu();
  configureAppIdentity();
  mainWindow = await createWindow();

  // Dev-only: start the looping install status so the surface can be styled.
  if (!app.isPackaged && process.env.TLACHIALONI_DEMO_STATUS === "1") {
    mainWindow.previewExtensionStatus();
  }

  if (process.env.TLACHIALONI_DOCK_TEST === "1") {
    await runDockSelfTest(mainWindow);
    if (process.env.TLACHIALONI_GRACEFUL === "1") app.quit();
    else app.exit(0);
  } else if (process.env.TLACHIALONI_UI_SNAPSHOT === "1") {
    await runUiSnapshot(mainWindow);
    app.exit(0);
  } else if (process.env.TLACHIALONI_EXTENSION_TEST === "1") {
    await runExtensionSelfTest(mainWindow);
  }
});

app.on("window-all-closed", () => app.quit());

app.on("activate", () => {
  if (!mainWindow || mainWindow.win.isDestroyed()) {
    void createWindow().then((window) => {
      mainWindow = window;
    });
  }
});
