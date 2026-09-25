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
 */
export class DevToolsController {
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
  }

  close(): void {
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
}
