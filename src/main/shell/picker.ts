import type { WebContentsView } from "electron";
import type { DevToolsController } from "./devtools";

/**
 * Element picker session. The overlay itself lives in the site preload (isolated
 * world); this controller owns arm/disarm and the inspect call. It is disarmed
 * on navigation so no stale overlay can survive (FR-013).
 */
export class PickerController {
  private armed = false;

  constructor(
    private readonly getView: () => WebContentsView | null,
    private readonly devtools: DevToolsController,
  ) {}

  isArmed(): boolean {
    return this.armed;
  }

  private send(armed: boolean): void {
    const view = this.getView();
    if (!view || view.webContents.isDestroyed()) return;
    view.webContents.send("picker:armed", { armed });
  }

  arm(): void {
    if (this.armed) return;
    this.armed = true;
    this.send(true);
  }

  disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    this.send(false);
  }

  toggle(): void {
    if (this.armed) this.disarm();
    else this.arm();
  }

  /** Called on navigation/reload: the page is replaced, so the overlay is gone. */
  invalidate(): void {
    if (this.armed) this.disarm();
  }

  pick(x: number, y: number): void {
    this.disarm();
    const view = this.getView();
    if (!view || view.webContents.isDestroyed()) return;
    this.devtools.ensureOpen();
    view.webContents.inspectElement(Math.round(x), Math.round(y));
  }
}
