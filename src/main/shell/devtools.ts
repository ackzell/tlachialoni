import type { WebContentsView } from "electron";
import type { StateStore } from "../state/store";
import type { DockMode } from "../state/schema";

export interface DevToolsStatus {
  open: boolean;
  mode: DockMode;
}

/**
 * DevTools docking. There is no supported API to change the dock side while
 * DevTools is open, so a side change closes and reopens them (research §2).
 *
 * The side can also be changed from inside DevTools itself; the front-end
 * reloads when that happens, and `EUI.DockController...dockSide()` reports the
 * real value, so we sync from there to keep the persisted side truthful.
 */
export class DevToolsController {
  private devtoolsListener: (() => void) | null = null;

  constructor(
    private readonly getView: () => WebContentsView | null,
    private readonly store: StateStore,
    private readonly notify: (status: DevToolsStatus) => void,
  ) {}

  private wc() {
    const view = this.getView();
    if (!view || view.webContents.isDestroyed()) return null;
    return view.webContents;
  }

  isOpen(): boolean {
    return this.wc()?.isDevToolsOpened() ?? false;
  }

  open(mode: DockMode): void {
    const wc = this.wc();
    if (!wc) return;
    if (!wc.isDevToolsOpened()) {
      wc.openDevTools({ mode });
    }
    this.store.setDockMode(mode);
    this.store.setDevtoolsOpen(true);
    this.notify({ open: true, mode });
    this.attachDockSync(wc);
    setTimeout(() => void this.syncDockSide(), 500);
  }

  close(): void {
    this.detachDockSync();
    const wc = this.wc();
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    this.store.setDevtoolsOpen(false);
    this.notify({ open: false, mode: this.store.get().dockMode });
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open(this.store.get().dockMode);
  }

  /** Opens if closed; moves the dock side if open. */
  dock(mode: DockMode): void {
    const wc = this.wc();
    if (!wc) return;
    if (wc.isDevToolsOpened()) {
      wc.once("devtools-closed", () => this.open(mode));
      wc.closeDevTools();
    } else {
      this.open(mode);
    }
  }

  ensureOpen(): void {
    if (!this.isOpen()) this.open(this.store.get().dockMode);
  }

  /** Reads the real dock side from the DevTools front-end. */
  async syncDockSide(): Promise<DockMode | null> {
    const wc = this.wc();
    const devtools = wc?.devToolsWebContents;
    if (!devtools || devtools.isDestroyed()) return null;
    try {
      const side = (await devtools.executeJavaScript(
        "EUI.DockController.DockController.instance().dockSide()",
      )) as string;
      if (side === "bottom" || side === "right" || side === "left") {
        this.store.setDockMode(side);
        this.notify({ open: true, mode: side });
        return side;
      }
    } catch {
      // DevTools front-end not reachable; keep the last known side.
    }
    return null;
  }

  private attachDockSync(wc: Electron.WebContents): void {
    const devtools = wc.devToolsWebContents;
    if (!devtools || devtools.isDestroyed()) return;
    this.detachDockSync();
    const handler = (): void => {
      void this.syncDockSide();
    };
    devtools.on("did-finish-load", handler);
    this.devtoolsListener = () => devtools.removeListener("did-finish-load", handler);
  }

  private detachDockSync(): void {
    this.devtoolsListener?.();
    this.devtoolsListener = null;
  }
}
