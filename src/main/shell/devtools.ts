import type { WebContentsView } from "electron";
import type { DockMode } from "../state/schema";

export interface DevToolsStatus {
  open: boolean;
  mode: DockMode;
}

/**
 * The window-local surface state DevTools writes to. Each window owns its own
 * dock side and open state (specs/012-multi-window), so the controller no longer
 * touches the shared store directly.
 */
export interface SurfaceState {
  dockMode(): DockMode;
  setDockMode(mode: DockMode): void;
  setDevtoolsOpen(open: boolean): void;
}

/**
 * DevTools docking. There is no supported API to change the dock side while
 * DevTools is open, so a side change closes and reopens them (research §2).
 *
 * The side can also be changed from inside DevTools itself, where no event tells
 * us; the front-end exposes `EUI.DockController...dockSide()`, so we poll it
 * while DevTools are open and persist any change.
 */
export class DevToolsController {
  private dockPoller: NodeJS.Timeout | null = null;
  private lastSyncedSide: DockMode | null = null;

  constructor(
    private readonly getView: () => WebContentsView | null,
    private readonly surface: SurfaceState,
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
    this.surface.setDockMode(mode);
    this.surface.setDevtoolsOpen(true);
    this.lastSyncedSide = mode;
    this.notify({ open: true, mode });
    this.startDockPolling();
    setTimeout(() => void this.syncDockSide(), 500);
  }

  close(): void {
    this.stopDockPolling();
    const wc = this.wc();
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    this.surface.setDevtoolsOpen(false);
    this.notify({ open: false, mode: this.surface.dockMode() });
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open(this.surface.dockMode());
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
    if (!this.isOpen()) this.open(this.surface.dockMode());
  }

  dispose(): void {
    this.stopDockPolling();
  }

  /** Reads the real dock side from the DevTools front-end and persists changes. */
  async syncDockSide(): Promise<DockMode | null> {
    const devtools = this.wc()?.devToolsWebContents;
    if (!devtools || devtools.isDestroyed()) return null;
    try {
      const side = (await devtools.executeJavaScript(
        "EUI.DockController.DockController.instance().dockSide()",
      )) as string;
      if (side === "bottom" || side === "right" || side === "left") {
        if (side !== this.lastSyncedSide) {
          this.lastSyncedSide = side;
          this.surface.setDockMode(side);
          this.notify({ open: true, mode: side });
        }
        return side;
      }
    } catch {
      // DevTools front-end not reachable; keep the last known side.
    }
    return null;
  }

  private startDockPolling(): void {
    this.stopDockPolling();
    this.dockPoller = setInterval(() => void this.syncDockSide(), 1000);
  }

  private stopDockPolling(): void {
    if (this.dockPoller) clearInterval(this.dockPoller);
    this.dockPoller = null;
  }
}
