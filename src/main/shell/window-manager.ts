/**
 * Process-level owner of every window. It holds the one shared state store and
 * extension manager, tracks focus, routes IPC by sender, restores the workspace
 * on launch, and fans shared-preference changes out to all windows
 * (specs/012-multi-window).
 */

import { screen, type WebContents } from "electron";
import type { ExtensionStatus } from "@shared/extensions";
import type { StateStore } from "../state/store";
import type { ExtensionManager } from "../extensions/manager";
import { DEFAULT_TARGET, newWindowId, type WindowRecord } from "../state/schema";
import type { CommandResult } from "./commands";
import { AppWindow } from "./window";
import { cascadeBounds, ensureVisibleBounds, type WorkArea } from "./geometry";

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
    const parent = this.focused();
    const area = parent ? this.areaFor(parent) : primaryArea();
    const parentRecord = parent ? this.store.window(parent.windowId) : null;
    return this.spawn({
      id: newWindowId(),
      target: null,
      bounds: cascadeBounds(parent?.win.getBounds() ?? null, area),
      dockMode: parentRecord?.dockMode ?? "bottom",
      devtoolsOpen: false,
      stripVisible: false,
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
  }

  /** Marks the start of app shutdown so closing windows keep their records. */
  beginQuit(): void {
    this.quitting = true;
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
