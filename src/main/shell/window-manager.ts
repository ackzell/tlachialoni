/**
 * Process-level owner of every window. It holds the one shared state store and
 * extension manager, tracks focus, routes IPC by sender, restores the workspace
 * on launch, and fans shared-preference changes out to all windows
 * (specs/012-multi-window).
 */

import { app, Menu, screen, type WebContents } from "electron";
import type { ExtensionStatus } from "@shared/extensions";
import type { StateStore } from "../state/store";
import type { ExtensionManager } from "../extensions/manager";
import { DEFAULT_TARGET, newWindowId, type WindowRecord } from "../state/schema";
import type { CommandResult } from "./commands";
import { AppWindow } from "./window";
import { cascadeBounds, ensureVisibleBounds, type WorkArea } from "./geometry";
import { buildDockMenuTemplate, type DockRecentEntry } from "./dock-menu";

function workAreas(): WorkArea[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

function primaryArea(): WorkArea {
  return screen.getPrimaryDisplay().workArea;
}

export class WindowManager {
  private readonly windows = new Map<string, AppWindow>();
  private readonly byWebContents = new Map<number, AppWindow>();
  private readonly viewIds = new Map<string, number[]>();
  /** Most-recently-focused window id last. */
  private focusStack: string[] = [];
  /** The window that started the current extension action, for status routing. */
  private statusInitiator: AppWindow | null = null;
  /**
   * True once the app is quitting. Quitting closes every window, so their
   * `closed` handlers must NOT drop the records — the saved set is what the next
   * launch restores. Only a user-closed window is forgotten.
   */
  private quitting = false;

  constructor(
    private readonly store: StateStore,
    private readonly extensions: ExtensionManager,
  ) {
    // The manager owns the process-wide extension callbacks so they are not
    // overwritten by whichever window happens to be constructed last.
    this.extensions.onChange = () => this.broadcastShared();
    this.extensions.onStatus = (status) => this.routeStatus(status);
  }

  // ---- creation and restore -------------------------------------------

  /** The first window of a launch with no saved windows (FR-013). */
  createDefault(): AppWindow {
    const area = primaryArea();
    return this.spawn({
      id: newWindowId(),
      target: DEFAULT_TARGET,
      bounds: cascadeBounds(null, area),
      dockMode: "bottom",
      devtoolsOpen: false,
      stripVisible: false,
      titlebarMode: false,
      variant: "obsidian",
      colorMode: "system",
    });
  }

  /**
   * Opens an additional window: blank with the location prompt armed, cascaded
   * from the focused window and inheriting its dock side (FR-001, FR-011,
   * FR-016).
   */
  createNew(): AppWindow {
    return this.spawnNew(null);
  }

  /**
   * Opens a window on a specific (already validated) recent target, cascaded
   * from the focused window like New Window (FR-006).
   */
  openTarget(target: string): AppWindow {
    return this.spawnNew(target);
  }

  /**
   * Creates a window for New Window (`target` null) or a recent project. The two
   * share one path so the Dock menu and `window.new` cannot diverge (FR-011).
   */
  private spawnNew(target: string | null): AppWindow {
    const parent = this.focused();
    const area = parent ? this.areaFor(parent) : primaryArea();
    const parentRecord = parent ? this.store.window(parent.windowId) : null;
    return this.spawn({
      id: newWindowId(),
      target,
      bounds: cascadeBounds(parent?.win.getBounds() ?? null, area),
      dockMode: parentRecord?.dockMode ?? "bottom",
      devtoolsOpen: false,
      stripVisible: false,
      // A new window starts in the default overlay layout, regardless of the
      // window it was opened from (specs/016, FR-008).
      titlebarMode: false,
      // A new window inherits the focused window's theme.
      variant: parentRecord?.variant ?? "obsidian",
      colorMode: parentRecord?.colorMode ?? "system",
    });
  }

  /**
   * Restores the saved window set, falling back to a single default window on a
   * first launch or after every window was closed (FR-013, FR-014, FR-015).
   */
  restoreAll(): AppWindow[] {
    const records = this.store.get().windows;
    if (records.length === 0) return [this.createDefault()];
    const areas = workAreas();
    return records.map((record) =>
      this.spawn({ ...record, bounds: ensureVisibleBounds(record.bounds, areas) }),
    );
  }

  /** Creates the window for a record and wires it into the manager. */
  private spawn(record: WindowRecord): AppWindow {
    this.store.upsertWindow(record);
    const appWindow = new AppWindow({
      store: this.store,
      extensions: this.extensions,
      windowId: record.id,
      onNewWindow: () => {
        this.createNew();
      },
      onClosed: () => this.handleClosed(appWindow),
    });
    this.windows.set(record.id, appWindow);
    const shellId = appWindow.shellView.webContents.id;
    const siteId = appWindow.siteView.webContents.id;
    const ids = [shellId, siteId];
    this.viewIds.set(record.id, ids);
    for (const id of ids) this.byWebContents.set(id, appWindow);
    appWindow.win.on("focus", () => this.touch(record.id));
    this.touch(record.id);
    appWindow.show();
    this.refreshDockMenu();
    return appWindow;
  }

  private handleClosed(appWindow: AppWindow): void {
    this.windows.delete(appWindow.windowId);
    for (const id of this.viewIds.get(appWindow.windowId) ?? []) {
      this.byWebContents.delete(id);
    }
    this.viewIds.delete(appWindow.windowId);
    this.focusStack = this.focusStack.filter((id) => id !== appWindow.windowId);
    // A user-closed window is forgotten; a window closed by the app quitting is
    // kept so the whole workspace restores next launch (FR-014).
    if (!this.quitting) this.store.removeWindow(appWindow.windowId);
    if (this.statusInitiator === appWindow) this.statusInitiator = null;
    this.refreshDockMenu();
  }

  /** Marks the start of app shutdown so closing windows keep their records. */
  beginQuit(): void {
    this.quitting = true;
  }

  // ---- macOS Dock menu (specs/017-macos-dock-menu) ---------------------

  /**
   * Raises a window: restore it if minimized, then show and focus it and
   * activate the app, without disturbing any other window. Used by the Dock-icon
   * click path (`activate`); the Dock menu's own window list is macOS's (FR-004).
   */
  focusWindow(id: string): void {
    const appWindow = this.windows.get(id);
    if (!appWindow || appWindow.win.isDestroyed()) return;
    if (appWindow.win.isMinimized()) appWindow.win.restore();
    appWindow.win.show();
    appWindow.win.focus();
    app.focus({ steal: true });
    this.touch(id);
  }

  /**
   * A Dock-icon click: raise the most recently focused window, or open a new one
   * when the app is running with none (FR-007, FR-008).
   */
  activate(): void {
    const appWindow = this.focused();
    if (appWindow) this.focusWindow(appWindow.windowId);
    else this.createNew();
  }

  /**
   * Rebuilds and re-installs the macOS Dock menu. The native menu is static once
   * set, so it is re-set whenever the app-specific items could have changed. The
   * open-window list is NOT part of it: macOS/AppKit appends its own window list
   * (with the key window checked) to every Dock menu. A no-op off macOS
   * (FR-001, FR-005, FR-014).
   */
  refreshDockMenu(): void {
    if (process.platform !== "darwin") return;
    // Pull in targets recorded by other instances before composing the menu.
    this.store.refreshRecents();
    const recents: DockRecentEntry[] = this.store
      .get()
      .recents.map((recent) => ({ url: recent.url }));
    const template = buildDockMenuTemplate(recents, {
      newWindow: () => this.createNew(),
      openRecent: (url) => this.openTarget(url),
    });
    app.dock?.setMenu(Menu.buildFromTemplate(template));
  }

  // ---- dispatch and routing -------------------------------------------

  /** Resolves the window that sent an IPC message, or null if it is unknown. */
  resolveSender(sender: WebContents | null | undefined): AppWindow | null {
    if (!sender || sender.isDestroyed()) return null;
    return this.byWebContents.get(sender.id) ?? null;
  }

  /** Runs a command on a specific window, remembering extension initiators. */
  dispatch(appWindow: AppWindow, id: string, arg?: unknown): Promise<CommandResult> {
    if (id.startsWith("extensions.")) this.statusInitiator = appWindow;
    return appWindow.runCommand(id, arg);
  }

  /** Runs a command on the focused window (menu accelerators and clicks). */
  runOnFocused(id: string, arg?: unknown): Promise<CommandResult> {
    const appWindow = this.focused();
    if (!appWindow) return Promise.resolve({ ok: false, reason: "No window" });
    return this.dispatch(appWindow, id, arg);
  }

  focused(): AppWindow | null {
    for (let i = this.focusStack.length - 1; i >= 0; i--) {
      const id = this.focusStack[i];
      const appWindow = id ? this.windows.get(id) : undefined;
      if (appWindow) return appWindow;
    }
    return this.windows.values().next().value ?? null;
  }

  private touch(id: string): void {
    this.focusStack = this.focusStack.filter((entry) => entry !== id);
    this.focusStack.push(id);
  }

  private areaFor(appWindow: AppWindow): WorkArea {
    return screen.getDisplayMatching(appWindow.win.getBounds()).workArea;
  }

  // ---- shared preferences ---------------------------------------------

  /** Re-applies a shared preference (theme, color mode, extensions) everywhere. */
  broadcastShared(): void {
    for (const appWindow of this.windows.values()) appWindow.refreshFromShared();
  }

  private routeStatus(status: ExtensionStatus): void {
    const target = this.statusInitiator ?? this.focused();
    target?.setExtensionStatus(status);
  }
}
