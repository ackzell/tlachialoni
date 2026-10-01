import { ipcMain, type WebContents } from "electron";
import type { WindowManager } from "./shell/window-manager";
import type { ColorMode, VariantSlug } from "./state/schema";
import type { PageScrollEdge } from "@shared/scroll-edge";
/**
 * Installs the typed IPC surface described in
 * `specs/012-multi-window/contracts/ipc-routing.md`.
 *
 * Handlers are registered once for the process; each message is routed to the
 * window that sent it, so several windows can be served without re-registering
 * (which would throw on the second window).
 */
export function registerIpc(manager: WindowManager): void {
  const resolve = (sender: WebContents) => manager.resolveSender(sender);

  ipcMain.handle("state:get", (event) => resolve(event.sender)?.getState() ?? null);

  ipcMain.handle("command:run", (event, payload: { id: string; arg?: unknown }) => {
    const appWindow = resolve(event.sender);
    if (!appWindow) return { ok: false, reason: "Unknown window" };
    return manager.dispatch(appWindow, payload.id, payload.arg);
  });

  ipcMain.handle("target:validate", (event, payload: { input: string }) => {
    const appWindow = resolve(event.sender);
    if (!appWindow) return { ok: false, reason: "Unknown window" };
    return appWindow.validateTarget(payload.input);
  });

  ipcMain.handle("theme:setVariant", (event, payload: { variant: VariantSlug }) => {
    resolve(event.sender)?.setVariant(payload.variant);
    return { ok: true };
  });

  ipcMain.handle("theme:setColorMode", (event, payload: { mode: ColorMode }) => {
    resolve(event.sender)?.setColorMode(payload.mode);
    return { ok: true };
  });

  ipcMain.handle("theme:previewVariant", (event, payload: { variant: VariantSlug | null }) => {
    resolve(event.sender)?.previewVariant(payload.variant);
    return { ok: true };
  });

  ipcMain.handle("picker:arm", (event) => {
    resolve(event.sender)?.pickerArm();
  });

  ipcMain.handle("picker:disarm", (event) => {
    resolve(event.sender)?.pickerDisarm();
  });

  ipcMain.handle("window:close", (event) => {
    resolve(event.sender)?.closeWindow();
  });

  ipcMain.on("palette:visibility", (event, payload: { open: boolean }) => {
    resolve(event.sender)?.setPaletteVisible(payload.open);
  });

  ipcMain.on("shell:ready", (event) => {
    resolve(event.sender)?.markShellReady();
  });

  ipcMain.on("shell:settled", (event) => {
    resolve(event.sender)?.notifyShellSettled();
  });

  ipcMain.on("site:focus-editable", (event, payload: { editable: boolean }) => {
    resolve(event.sender)?.setEditableFocused(payload.editable);
  });

  ipcMain.on("page:scroll-edge", (event, payload: PageScrollEdge) => {
    resolve(event.sender)?.setPageScrollEdge(payload);
  });

  ipcMain.on("picker:picked", (event, payload: { x: number; y: number }) => {
    resolve(event.sender)?.pickerPick(payload.x, payload.y);
  });

  ipcMain.on("picker:hover", () => {
    // Reserved for future hover metadata; the preload owns the visible overlay.
  });
}
