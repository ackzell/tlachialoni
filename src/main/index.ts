import { app, Menu, session } from "electron";
import os from "node:os";
import path from "node:path";
import icon from "../../resources/icon.png?asset";
import { COMMANDS, THEME_VARIANTS, type Accelerator } from "@shared/commands";
import { formatReleaseDate } from "@shared/release";
import { StateStore } from "./state/store";
import { ExtensionManager } from "./extensions/manager";
import { WindowManager } from "./shell/window-manager";
import { swipeNavigation } from "./shell/swipe/navigation";
import { registerIpc } from "./ipc";
import type { AppWindow } from "./shell/window";
import { runDockSelfTest, runExtensionSelfTest, runUiSnapshot } from "./dock-test";
import { runScreenshots, seedScreenshotState } from "./screenshots";

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
  process.env.TLACHIALONI_EXTENSION_TEST === "1" ||
  process.env.TLACHIALONI_SCREENSHOTS === "1"
) {
  app.setPath("userData", path.join(os.tmpdir(), `tlachialoni-docktest-${process.pid}`));
}

/**
 * Menu-bar groups, in order, as a Chrome/Safari-style set of app-specific
 * top-level menus (Apple HIG: custom menus sit between View and Window). A
 * `null` entry is a separator. Every item is a catalog command id, so labels and
 * accelerators stay sourced from `COMMANDS`.
 *
 * These menus are static: state such as the active theme or recents is
 * intentionally not shown (it would need a rebuild on every change).
 */
const MENU_SECTIONS: Array<{ label: string; items: Array<string | null> }> = [
  {
    label: "View",
    items: [
      "palette.open",
      "palette.openTheme",
      null,
      "view.reload",
      "view.hardReload",
      null,
      "strip.toggle",
    ],
  },
  {
    label: "History",
    items: ["view.back", "view.forward", null, "palette.editUrl"],
  },
  {
    label: "DevTools",
    items: [
      "devtools.toggle",
      null,
      "devtools.dock.bottom",
      "devtools.dock.right",
      "devtools.dock.left",
      null,
      "focus.toggle",
      "picker.toggle",
    ],
  },
  {
    label: "Theme",
    items: [
      ...THEME_VARIANTS.map((variant) => `theme.variant.${variant.slug}`),
      null,
      "theme.cycleMode",
    ],
  },
  {
    label: "Extensions",
    items: ["extensions.installFolder", "extensions.reload", "extensions.revealFolder"],
  },
];

/**
 * Commands that must never carry an OS accelerator: macOS would then swallow
 * `⌘←`/`⌘→` app-wide and break native text navigation in editable fields. They
 * remain clickable menu items; the page-level dispatcher owns the keyboard path
 * and yields the keys to focused inputs.
 */
const NO_OS_ACCELERATOR = new Set(["view.back", "view.forward"]);

function menuItemFor(
  manager: WindowManager,
  commandId: string,
): Electron.MenuItemConstructorOptions {
  const command = COMMANDS.find((entry) => entry.id === commandId);
  if (!command) throw new Error(`Unknown menu command: ${commandId}`);
  // A "Theme: Jade" row reads fine in the palette; inside the Theme menu the
  // prefix is redundant.
  const label = command.id.startsWith("theme.variant.")
    ? command.label.replace(/^Theme: /, "")
    : command.label;
  const accelerator =
    command.accelerator && !NO_OS_ACCELERATOR.has(command.id)
      ? toElectronAccelerator(command.accelerator)
      : undefined;
  return {
    label,
    accelerator,
    click: () => {
      void manager.runOnFocused(command.id);
    },
  };
}

function buildSection(
  manager: WindowManager,
  section: { label: string; items: Array<string | null> },
): Electron.MenuItemConstructorOptions {
  return {
    label: section.label,
    submenu: section.items.map((id): Electron.MenuItemConstructorOptions =>
      id === null ? { type: "separator" } : menuItemFor(manager, id),
    ),
  };
}

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

function installMenu(manager: WindowManager): void {
  // Menu accelerators are handled by the OS menu, so these shortcuts keep working
  // even while focus is inside the DevTools panel (where the page's
  // before-input-event never fires). Each item acts on the focused window. The
  // window still shows no chrome.
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "File",
      submenu: [menuItemFor(manager, "window.new"), menuItemFor(manager, "window.close")],
    },
    ...MENU_SECTIONS.map((section) => buildSection(manager, section)),
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
  ];

  // Development-only: keep a transient shell surface on screen to style it
  // (specs/008-surface-preview).
  if (!app.isPackaged) {
    template.push({
      label: "Developer",
      submenu: [
        {
          label: "Preview Loading Veil",
          click: () => manager.focused()?.previewLoadingVeil(),
        },
        {
          label: "Preview Failure View",
          click: () => manager.focused()?.previewFailureView(),
        },
        {
          label: "Preview Extension Install",
          click: () => manager.focused()?.previewExtensionStatus(),
        },
        {
          label: "Preview History Navigation",
          click: () => manager.focused()?.previewHistoryArm(),
        },
        { type: "separator" },
        {
          label: "Stop Preview",
          click: () => manager.focused()?.stopSurfacePreview(),
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Builds the process-wide state store, extension manager, and window manager,
 * loads the enabled extensions into the guest session, then restores the saved
 * window set (or a single default window). Extension loading must happen before
 * any guest view starts loading.
 */
async function boot(): Promise<{ manager: WindowManager; windows: AppWindow[] }> {
  const store = new StateStore(path.join(app.getPath("userData"), "state.json"));
  const extensions = new ExtensionManager({
    store,
    session: session.defaultSession,
    root: path.join(app.getPath("userData"), "extensions"),
  });
  await extensions.loadAll();

  const manager = new WindowManager(store, extensions);
  registerIpc(manager);
  installMenu(manager);
  const windows = manager.restoreAll();
  return { manager, windows };
}

app.whenReady().then(async () => {
  configureAppIdentity();
  // Start the process-wide trackpad swipe monitor (macOS only; a missing addon
  // leaves swiping off and everything else working).
  swipeNavigation.start();
  // Dev-only: seed a deterministic frame and sample history before the store is
  // built, so the capture run never depends on (or touches) real state.
  if (process.env.TLACHIALONI_SCREENSHOTS === "1") {
    seedScreenshotState(app.getPath("userData"));
  }
  const { manager, windows } = await boot();
  // Quitting closes every window; keep their records so the workspace restores.
  // A window closed by the user (⌘W) still removes its record on its own.
  app.on("before-quit", () => manager.beginQuit());
  const primary = windows[0] ?? manager.focused();

  // Dev-only: start the looping install status so the surface can be styled.
  if (!app.isPackaged && process.env.TLACHIALONI_DEMO_STATUS === "1") {
    primary?.previewExtensionStatus();
  }

  if (!primary) return;
  if (process.env.TLACHIALONI_DOCK_TEST === "1") {
    await runDockSelfTest(primary);
    if (process.env.TLACHIALONI_GRACEFUL === "1") app.quit();
    else app.exit(0);
  } else if (process.env.TLACHIALONI_UI_SNAPSHOT === "1") {
    await runUiSnapshot(primary);
    app.exit(0);
  } else if (process.env.TLACHIALONI_SCREENSHOTS === "1") {
    await runScreenshots(primary);
    app.exit(0);
  } else if (process.env.TLACHIALONI_EXTENSION_TEST === "1") {
    await runExtensionSelfTest(primary);
  }
});

app.on("window-all-closed", () => app.quit());
