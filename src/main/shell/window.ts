import { app, BaseWindow, nativeTheme, type WebContentsView } from "electron";
import path from "node:path";
import { StateStore } from "../state/store";
import {
  DEFAULT_HEIGHT,
  DEFAULT_TARGET,
  DEFAULT_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  type ColorMode,
  type VariantSlug,
} from "../state/schema";
import { normalizeTarget } from "../nav/policy";
import { commandForInput, THEME_VARIANTS } from "@shared/commands";
import { TLAPALLI_TOKENS } from "@shared/theme-tokens";
import { createSiteView } from "./site-view";
import { createShellView } from "./shell-view";
import { DevToolsController } from "./devtools";
import { PickerController } from "./picker";
import { CommandRegistry } from "./commands";
import { registerIpc } from "../ipc";

export const STRIP_HEIGHT = 36;

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export class AppWindow {
  readonly win: BaseWindow;
  readonly store: StateStore;
  readonly siteView: WebContentsView;
  readonly shellView: WebContentsView;
  readonly devtools: DevToolsController;
  readonly picker: PickerController;
  readonly commands = new CommandRegistry();

  private loading = false;
  private failed = false;
  private paletteOpen = false;
  private editableFocused = false;
  private shellLoaded = false;
  private pendingShellMessages: Array<[string, unknown]> = [];
  private requestedTarget: string | null = null;
  private attachedDevTools: Electron.WebContents | null = null;

  constructor() {
    this.store = new StateStore(path.join(app.getPath("userData"), "state.json"));
    const state = this.store.get();

    this.win = new BaseWindow({
      width: state.bounds?.width ?? DEFAULT_WIDTH,
      height: state.bounds?.height ?? DEFAULT_HEIGHT,
      x: state.bounds?.x,
      y: state.bounds?.y,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      transparent: false,
      backgroundColor: this.backgroundColor(),
      show: false,
      title: "localbrowser",
    });

    this.siteView = createSiteView({
      onLoading: (loading) => this.setLoading(loading),
      onReady: (url) => this.handleReady(url),
      onFailed: (url, reason) => this.handleFailed(url, reason),
      onTitle: (title) => this.win.setTitle(title ? `${title} — localbrowser` : "localbrowser"),
    });

    this.shellView = createShellView();

    this.win.contentView.addChildView(this.siteView);
    this.win.contentView.addChildView(this.shellView);

    this.devtools = new DevToolsController(
      () => this.siteView,
      this.store,
      (status) => this.sendToShell("devtools:changed", status),
    );
    this.picker = new PickerController(() => this.siteView, this.devtools);

    this.registerCommands();
    registerIpc(this);

    this.wireEvents();
    this.relayout();
    this.loadTarget(state.target ?? DEFAULT_TARGET);
  }

  // ---- lifecycle -------------------------------------------------------

  show(): void {
    this.win.show();
    this.win.focus();
    this.siteView.webContents.focus();
    this.relayout();
    if (this.store.get().devtoolsOpen) this.devtools.open(this.store.get().dockMode);
    this.applyTheme();
  }

  private wireEvents(): void {
    this.win.on("resize", () => {
      this.relayout();
      this.store.setBounds(this.win.getBounds());
    });
    this.win.on("move", () => this.store.setBounds(this.win.getBounds()));
    this.win.on("close", () => {
      this.store.setBounds(this.win.getBounds());
      this.store.setDevtoolsOpen(this.devtools.isOpen());
    });
    this.win.on("closed", () => {
      this.devtools.dispose();
      this.detachDevToolsInput();
      // Views are not destroyed automatically with a BaseWindow.
      for (const view of [this.siteView, this.shellView]) {
        if (!view.webContents.isDestroyed()) view.webContents.close();
      }
    });

    this.siteView.webContents.on("before-input-event", this.handleInput);
    this.shellView.webContents.on("before-input-event", this.handleInput);

    // While focus is inside DevTools, key events go there — attach the same
    // dispatcher so shortcuts keep working from the DevTools panel too.
    this.siteView.webContents.on("devtools-opened", () => this.attachDevToolsInput());
    this.siteView.webContents.on("devtools-closed", () => this.detachDevToolsInput());

    this.siteView.webContents.on("did-navigate", () => this.picker.invalidate());
    this.siteView.webContents.on("did-navigate-in-page", () => this.picker.invalidate());
  }

  private readonly handleInput = (event: Electron.Event, input: Electron.Input): void => {
    if (input.type !== "keyDown") return;
    if (input.code === "Escape" && this.picker.isArmed()) {
      event.preventDefault();
      this.picker.disarm();
      return;
    }
    const command = commandForInput(input);
    if (!command) return;
    if ((command.id === "view.back" || command.id === "view.forward") && this.editableFocused) {
      return;
    }
    event.preventDefault();
    void this.commands.run(command.id);
  };

  private attachDevToolsInput(): void {
    const devtools = this.siteView.webContents.devToolsWebContents;
    if (!devtools || devtools.isDestroyed() || devtools === this.attachedDevTools) return;
    this.detachDevToolsInput();
    devtools.on("before-input-event", this.handleInput);
    this.attachedDevTools = devtools;
  }

  private detachDevToolsInput(): void {
    if (this.attachedDevTools && !this.attachedDevTools.isDestroyed()) {
      this.attachedDevTools.removeListener("before-input-event", this.handleInput);
    }
    this.attachedDevTools = null;
  }

  // ---- commands --------------------------------------------------------

  private registerCommands(): void {
    const { commands } = this;
    commands.register("palette.open", () => this.openPalette(""));
    commands.register("palette.close", () => this.closePalette());
    commands.register("palette.editUrl", () => this.openPalette(this.store.get().target ?? ""));
    commands.register("target.navigate", (arg) => {
      this.navigate(String(arg ?? ""));
    });
    commands.register("strip.toggle", () => this.toggleStrip());
    commands.register("view.reload", () => this.siteView.webContents.reload());
    commands.register("view.hardReload", () => this.siteView.webContents.reloadIgnoringCache());
    commands.register("view.back", () => {
      if (this.siteView.webContents.navigationHistory.canGoBack()) {
        this.siteView.webContents.navigationHistory.goBack();
      }
    });
    commands.register("view.forward", () => {
      if (this.siteView.webContents.navigationHistory.canGoForward()) {
        this.siteView.webContents.navigationHistory.goForward();
      }
    });
    commands.register("devtools.toggle", () => this.devtools.toggle());
    commands.register("devtools.dock.bottom", () => this.devtools.dock("bottom"));
    commands.register("devtools.dock.right", () => this.devtools.dock("right"));
    commands.register("devtools.dock.left", () => this.devtools.dock("left"));
    commands.register("picker.toggle", () => this.picker.toggle());
    for (const variant of THEME_VARIANTS) {
      commands.register(`theme.variant.${variant.slug}`, () => this.setVariant(variant.slug));
    }
    commands.register("theme.cycleMode", () => this.cycleColorMode());
    commands.register("failure.retry", () => {
      this.failed = false;
      this.relayout();
      this.siteView.webContents.reload();
    });
    commands.register("window.close", () => this.win.close());
  }

  // ---- public API used by IPC and the dock self-test -------------------

  getState() {
    return this.store.get();
  }

  async runCommand(id: string, arg?: unknown): Promise<CommandResult> {
    try {
      await this.commands.run(id, arg);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Command failed" };
    }
  }

  validateTarget(input: string) {
    return normalizeTarget(input);
  }

  navigate(input: string): CommandResult {
    const resolved = normalizeTarget(input);
    if (!resolved.ok || !resolved.url) return { ok: false, reason: resolved.reason };
    this.loadTarget(resolved.url);
    this.closePalette();
    return { ok: true };
  }

  setVariant(variant: VariantSlug): void {
    this.store.setVariant(variant);
    this.applyTheme();
    this.broadcastState();
  }

  setColorMode(mode: ColorMode): void {
    this.store.setColorMode(mode);
    this.applyTheme();
    this.broadcastState();
  }

  cycleColorMode(): void {
    const order: ColorMode[] = ["system", "dark", "light"];
    const current = this.store.get().colorMode;
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.setColorMode(next);
  }

  setPaletteVisible(open: boolean): void {
    this.paletteOpen = open;
    this.relayout();
    if (!open) this.siteView.webContents.focus();
  }

  closeWindow(): void {
    this.win.close();
  }

  setEditableFocused(editable: boolean): void {
    this.editableFocused = editable;
  }

  pickerArm(): void {
    this.picker.arm();
  }

  pickerDisarm(): void {
    this.picker.disarm();
  }

  pickerPick(x: number, y: number): void {
    this.picker.pick(x, y);
  }

  // ---- internals -------------------------------------------------------

  private loadTarget(url: string): void {
    this.failed = false;
    this.loading = true;
    this.requestedTarget = url;
    this.relayout();
    this.reportLoading(true);
    void this.siteView.webContents.loadURL(url);
  }

  private handleReady(url: string): void {
    this.loading = false;
    this.failed = false;
    this.relayout();
    if (url) {
      this.store.setTarget(url);
      this.store.recordRecent(url);
    }
    this.reportLoading(false);
    this.sendToShell("viewport:ready", { url });
    this.broadcastState();
  }

  private handleFailed(url: string, reason: string): void {
    // Ignore a late failure from a navigation that has since been superseded.
    if (this.requestedTarget && sameUrl(url, this.requestedTarget) === false) return;
    this.loading = false;
    this.failed = true;
    this.closePalette();
    this.relayout();
    this.sendToShell("viewport:failed", { url, reason });
  }

  private setLoading(loading: boolean): void {
    this.loading = loading;
    this.relayout();
    this.reportLoading(loading);
  }

  private reportLoading(loading: boolean): void {
    this.sendToShell("viewport:loading", { loading });
  }

  private openPalette(initial: string): void {
    this.paletteOpen = true;
    this.relayout();
    this.sendToShell("palette:open", { initial });
    this.shellView.webContents.focus();
  }

  private closePalette(): void {
    this.paletteOpen = false;
    this.relayout();
    this.sendToShell("palette:close", {});
  }

  private toggleStrip(): void {
    const visible = !this.store.get().stripVisible;
    this.store.setStripVisible(visible);
    this.relayout();
    this.broadcastState();
  }

  private applyTheme(): void {
    const state = this.store.get();
    nativeTheme.themeSource = state.colorMode;
    this.win.setBackgroundColor(this.backgroundColor());
    this.sendToShell("theme:apply", {
      variant: state.variant,
      colorMode: state.colorMode,
      resolved: this.resolvedMode(),
    });
  }

  private resolvedMode(): "dark" | "light" {
    const mode = this.store.get().colorMode;
    if (mode === "dark" || mode === "light") return mode;
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }

  private backgroundColor(): string {
    const tokens = TLAPALLI_TOKENS[this.store.get().variant] ?? TLAPALLI_TOKENS.obsidian;
    return tokens[this.resolvedMode()]["--lb-bg"];
  }

  private broadcastState(): void {
    this.sendToShell("state:changed", this.store.get());
  }

  private sendToShell(channel: string, payload?: unknown): void {
    if (!this.shellLoaded) {
      this.pendingShellMessages.push([channel, payload]);
      return;
    }
    const wc = this.shellView.webContents;
    if (wc.isDestroyed()) return;
    wc.send(channel, payload);
  }

  isShellReady(): boolean {
    return this.shellLoaded;
  }

  /** Called when the renderer has mounted and subscribed to IPC. */
  markShellReady(): void {
    if (this.shellLoaded) return;
    this.shellLoaded = true;
    const queued = this.pendingShellMessages;
    this.pendingShellMessages = [];
    for (const [channel, payload] of queued) this.sendToShell(channel, payload);
    this.broadcastState();
    this.applyTheme();
    this.pickerDisarm();
  }

  private relayout(): void {
    const { width, height } = this.win.getContentBounds();
    this.siteView.setBounds({ x: 0, y: 0, width, height });

    const overlayActive = this.paletteOpen || this.loading || this.failed;
    if (overlayActive) {
      this.shellView.setBounds({ x: 0, y: 0, width, height });
      this.shellView.setVisible(true);
    } else if (this.store.get().stripVisible) {
      this.shellView.setBounds({ x: 0, y: 0, width, height: STRIP_HEIGHT });
      this.shellView.setVisible(true);
    } else {
      this.shellView.setVisible(false);
    }
  }
}

function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}
