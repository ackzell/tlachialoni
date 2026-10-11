import type { WebContentsView } from "electron";
import type { DockMode } from "../state/schema";
import { devtoolsThemeScript, type DevtoolsThemeMode } from "./devtools-theme";
import { devtoolsThemeOverrides } from "./devtools-theme-override";

export interface DevToolsStatus {
  open: boolean;
  mode: DockMode;
}

/** This window's Tlapalli variant + resolved color mode, read on demand. */
export interface DevToolsTheme {
  variant: string;
  mode: DevtoolsThemeMode;
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
 * DevTools docking and theming. There is no supported API to change the dock
 * side while DevTools is open, so a side change closes and reopens them
 * (research §2).
 *
 * The side can also be changed from inside DevTools itself, where no event tells
 * us; the front-end exposes `EUI.DockController...dockSide()`, so we poll it
 * while DevTools are open and persist any change. The same tick re-asserts the
 * window's Tlapalli palette (see devtools-theme.ts), because DevTools reloads
 * itself on a dock change and re-themes itself from its own settings.
 */
export class DevToolsController {
  private dockPoller: NodeJS.Timeout | null = null;
  private lastSyncedSide: DockMode | null = null;

  constructor(
    private readonly getView: () => WebContentsView | null,
    private readonly surface: SurfaceState,
    private readonly notify: (status: DevToolsStatus) => void,
    private readonly getTheme: () => DevToolsTheme,
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
    setTimeout(() => void this.tick(), 500);
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

  /** Re-asserts the DevTools palette now (a variant or color mode changed). */
  refreshTheme(): void {
    void this.syncTheme();
  }

  /**
   * Paints the DevTools front-end with this window's variant. Idempotent, so the
   * poll re-runs it every tick — that is what re-applies the palette after a
   * dock change reloads DevTools, or after DevTools re-themes itself from its
   * own settings.
   */
  async syncTheme(): Promise<boolean> {
    const devtools = this.wc()?.devToolsWebContents;
    if (!devtools || devtools.isDestroyed()) return false;
    const { variant, mode } = this.getTheme();
    const overrides = devtoolsThemeOverrides();
    const script = devtoolsThemeScript(variant, mode, { override: overrides[mode] });
    if (!script) return false;
    try {
      await devtools.executeJavaScript(script);
      return true;
    } catch {
      // DevTools front-end not reachable yet; the next tick retries.
      return false;
    }
  }

  /** One poll tick: keep the palette and the dock side in step. */
  private async tick(): Promise<void> {
    await this.syncTheme();
    await this.syncDockSide();
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
    this.dockPoller = setInterval(() => void this.tick(), 1000);
  }

  private stopDockPolling(): void {
    if (this.dockPoller) clearInterval(this.dockPoller);
    this.dockPoller = null;
  }
}
