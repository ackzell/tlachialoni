import { ipcMain } from "electron";
import type { AppWindow } from "./shell/window";
import type { ColorMode, VariantSlug } from "./state/schema";

/** Installs the typed IPC surface described in contracts/ipc.md. */
export function registerIpc(appWindow: AppWindow): void {
  ipcMain.handle("state:get", () => appWindow.getState());

  ipcMain.handle("command:run", (_event, payload: { id: string; arg?: unknown }) =>
    appWindow.runCommand(payload.id, payload.arg),
  );

  ipcMain.handle("target:validate", (_event, payload: { input: string }) =>
    appWindow.validateTarget(payload.input),
  );

  ipcMain.handle("theme:setVariant", (_event, payload: { variant: VariantSlug }) => {
    appWindow.setVariant(payload.variant);
    return { ok: true };
  });

  ipcMain.handle("theme:setColorMode", (_event, payload: { mode: ColorMode }) => {
    appWindow.setColorMode(payload.mode);
    return { ok: true };
  });

  ipcMain.handle("picker:arm", () => {
    appWindow.pickerArm();
  });

  ipcMain.handle("picker:disarm", () => {
    appWindow.pickerDisarm();
  });

  ipcMain.handle("window:close", () => {
    appWindow.closeWindow();
  });

  ipcMain.on("palette:visibility", (_event, payload: { open: boolean }) => {
    appWindow.setPaletteVisible(payload.open);
  });

  ipcMain.on("shell:ready", () => {
    appWindow.markShellReady();
  });

  ipcMain.on("site:focus-editable", (_event, payload: { editable: boolean }) => {
    appWindow.setEditableFocused(payload.editable);
  });

  ipcMain.on("picker:picked", (_event, payload: { x: number; y: number }) => {
    appWindow.pickerPick(payload.x, payload.y);
  });

  ipcMain.on("picker:hover", () => {
    // Reserved for future hover metadata; the preload owns the visible overlay.
  });
}
