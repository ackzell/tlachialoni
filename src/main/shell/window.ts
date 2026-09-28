import { app, BaseWindow, nativeTheme, session, webContents, type WebContentsView } from "electron";
import path from "node:path";
import { StateStore } from "../state/store";
import { ExtensionManager } from "../extensions/manager";
import { isActivePhase, type ExtensionStatus } from "@shared/extensions";
import {
  DEFAULT_HEIGHT,
  DEFAULT_TARGET,
  DEFAULT_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  type ColorMode,
  type VariantSlug,
} from "../state/schema";
import { normalizeTarget, shouldVeilTarget } from "../nav/policy";
import { commandForInput, THEME_VARIANTS } from "@shared/commands";
import { isStripSurfaceVisible } from "@shared/shell";
import { TLAPALLI_TOKENS } from "@shared/theme-tokens";
import { createSiteView } from "./site-view";
import { createShellView } from "./shell-view";
import { DevToolsController } from "./devtools";
import { PickerController } from "./picker";
import { CommandRegistry, type CommandResult } from "./commands";
import { registerIpc } from "../ipc";

export const STRIP_HEIGHT = 36;

/** How long main waits for the renderer settle ack before collapsing anyway. */
const SHELL_SETTLE_TIMEOUT_MS = 500;

type ShellMode = "full" | "strip" | "hidden";

/** Bigger modes win when deciding whether a collapse needs the settle wait. */
const SHELL_MODE_RANK: Record<ShellMode, number> = { hidden: 0, strip: 1, full: 2 };

export type { CommandResult };

export interface AppWindowOptions {
  /** Shared state store; a window creates its own when omitted. */
  store?: StateStore;
  /** Extension manager; a window creates its own when omitted. */
  extensions?: ExtensionManager;
}

export class AppWindow {
  readonly win: BaseWindow;
  readonly store: StateStore;
  readonly extensions: ExtensionManager;
  readonly siteView: WebContentsView;
  readonly shellView: WebContentsView;
  readonly devtools: DevToolsController;
  readonly picker: PickerController;
  readonly commands = new CommandRegistry();

  private showLoading = false;
  private failed = false;
  private failedUrl: string | null = null;
  private paletteOpen = false;
  private shellMode: ShellMode = "hidden";
  private pendingSettle = false;
  private settleTimer: NodeJS.Timeout | null = null;
  private previewVariantSlug: VariantSlug | null = null;
  private editableFocused = false;
  private shellLoaded = false;
  private buttonsVisible = false;
  private extensionStatus: ExtensionStatus | null = null;
  private statusDemoTimer: NodeJS.Timeout | null = null;
  /** Dev-only: a transient shell surface being previewed (see specs/008). */
  private devPreview: "loading" | "failure" | null = null;
  private pendingShellMessages: Array<[string, unknown]> = [];
  private requestedTarget: string | null = null;
  private attachedDevTools: Electron.WebContents | null = null;
  private currentUrl: string;
  /**
   * The URL of the document actually committed to the view, or null before the
   * first paint. Unlike `currentUrl` it is never seeded from persisted state, so
   * a cold start reads as "nothing painted" and still veils (see loadTarget).
   */
  private shownUrl: string | null = null;

  constructor(options: AppWindowOptions = {}) {
    this.store = options.store ?? new StateStore(path.join(app.getPath("userData"), "state.json"));
    this.extensions =
      options.extensions ??
      new ExtensionManager({
        store: this.store,
        session: session.defaultSession,
        root: path.join(app.getPath("userData"), "extensions"),
      });
    this.extensions.onChange = () => this.broadcastState();
    this.extensions.onStatus = (status) => this.setExtensionStatus(status);

    const state = this.store.get();
    this.currentUrl = state.target ?? DEFAULT_TARGET;

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
      title: "Tlachialoni",
    });

    this.siteView = createSiteView({
      onLoading: (loading) => this.setLoading(loading),
      onReady: (url) => this.handleReady(url),
      onNavigated: (url) => this.handleNavigated(url),
      onFailed: (url, reason) => this.handleFailed(url, reason),
      onTitle: (title) => this.win.setTitle(title ? `${title} — Tlachialoni` : "Tlachialoni"),
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
      this.clearPendingSettle();
      this.clearStatusDemo();
      this.devtools.dispose();
      this.detachDevToolsInput();
      nativeTheme.removeListener("updated", this.handleNativeThemeUpdated);
      // Views are not destroyed automatically with a BaseWindow.
      for (const view of [this.siteView, this.shellView]) {
        if (!view.webContents.isDestroyed()) view.webContents.close();
      }
    });

    // While colorMode is "system", follow live OS dark/light switches so the
    // shell and window background re-resolve without a restart (FR-017).
    nativeTheme.on("updated", this.handleNativeThemeUpdated);

    this.siteView.webContents.on("before-input-event", this.handleInput);
    this.shellView.webContents.on("before-input-event", this.handleInput);

    // Mouse back/forward buttons. On Windows/Linux the OS surfaces them as app
    // commands; on macOS mouse drivers (Logitech Options+ and friends) deliver
    // the thumb buttons as synthesized swipe events, the same way Safari and
    // Chrome receive them, so a swipe navigates history.
    this.win.on("app-command", (_event, command) => {
      if (command === "browser-backward") void this.commands.run("view.back");
      else if (command === "browser-forward") void this.commands.run("view.forward");
    });
    this.win.on("swipe", (_event, direction) => {
      if (direction === "left") void this.commands.run("view.back");
      else if (direction === "right") void this.commands.run("view.forward");
    });

    // While focus is inside DevTools, key events go there — attach the same
    // dispatcher so shortcuts keep working from the DevTools panel too.
    this.siteView.webContents.on("devtools-opened", () => this.attachDevToolsInput());
    this.siteView.webContents.on("devtools-closed", () => this.detachDevToolsInput());
  }

  private readonly handleInput = (event: Electron.Event, input: Electron.Input): void => {
    if (input.type !== "keyDown") return;
    if (input.code === "Escape" && this.picker.isArmed()) {
      event.preventDefault();
      this.picker.disarm();
      return;
    }
    // Esc clears a finished extension status; an install in flight is not
    // cancellable, so it is left alone.
    if (
      input.code === "Escape" &&
      this.extensionStatus &&
      !isActivePhase(this.extensionStatus.phase)
    ) {
      event.preventDefault();
      this.dismissExtensionStatus();
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
    commands.register("palette.open", () => this.togglePalette());
    commands.register("palette.close", () => this.closePalette());
    commands.register("palette.editUrl", (arg) =>
      this.openPalette(typeof arg === "string" && arg.trim() ? arg : this.currentUrl),
    );
    commands.register("target.navigate", (arg) => this.navigate(String(arg ?? "")));
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
    commands.register("focus.toggle", () => this.toggleFocus());
    commands.register("picker.toggle", () => this.picker.toggle());
    for (const variant of THEME_VARIANTS) {
      commands.register(`theme.variant.${variant.slug}`, () => this.setVariant(variant.slug));
    }
    commands.register("theme.cycleMode", () => this.cycleColorMode());
    commands.register("failure.retry", () => {
      this.failed = false;
      this.showLoading = true;
      this.relayout();
      this.reportLoading(true);
      this.siteView.webContents.reload();
    });
    commands.register("failure.dismiss", () => this.dismissFailure());
    commands.register("window.close", () => this.win.close());

    commands.register("extensions.install", (arg) =>
      this.extensions.installFromStore(String(arg ?? "")),
    );
    commands.register("extensions.installFolder", () => this.extensions.installFromFolder());
    commands.register("extensions.reload", () => this.extensions.reloadAll());
    commands.register("extensions.revealFolder", () => this.extensions.revealRoot());
    commands.register("extensions.toggle", (arg) => this.extensions.toggle(String(arg ?? "")));
    commands.register("extensions.remove", (arg) => this.extensions.remove(String(arg ?? "")));
    commands.register("extensions.update", (arg) => this.extensions.update(String(arg ?? "")));
    commands.register("extensions.dismissStatus", () => this.dismissExtensionStatus());
  }

  // ---- public API used by IPC and the dock self-test -------------------

  getState() {
    return this.store.get();
  }

  /**
   * Shows the extension status surface. The window stays full-window while a
   * status is present so the surface is never clipped; the renderer dismisses a
   * finished one through `extensions.dismissStatus`.
   */
  private setExtensionStatus(status: ExtensionStatus): void {
    this.extensionStatus = status;
    this.sendToShell("extension:status", status);
    this.relayout();
  }

  /** Clears a finished (`done`/`error`) status and defers the collapse to its leave. */
  dismissExtensionStatus(): void {
    if (!this.extensionStatus) return;
    this.extensionStatus = null;
    this.sendToShell("extension:status", null);
    this.relayout(true);
  }

  // ---- dev surface previews (specs/008-surface-preview) ----------------
  //
  // Development-only: put a single transient shell surface into a representative
  // state and hold it there so it can be styled with live HMR. The surfaces that
  // are easy to summon for real (the palette with ⌘P, the strip with ⌘B, the
  // picker with ⌘⇧C) are intentionally not previewed.

  /** Dev-only: shows the loading veil against a representative target. */
  previewLoadingVeil(): void {
    this.enterDevPreview();
    this.devPreview = "loading";
    this.sendToShell("viewport:loading", { loading: true, url: "http://localhost:5173" });
    this.relayout();
  }

  /** Dev-only: shows the failure view with a representative target and reason. */
  previewFailureView(): void {
    this.enterDevPreview();
    this.devPreview = "failure";
    this.sendToShell("viewport:failed", {
      url: "http://localhost:3000",
      reason: "Connection refused",
      previousUrl: "http://localhost:5173",
    });
    this.relayout();
  }

  /** Dev-only: starts the looping extension install status. */
  previewExtensionStatus(): void {
    this.enterDevPreview();
    this.startExtensionStatusDemo();
  }

  /** Dev-only: clears whichever surface is being previewed. */
  stopSurfacePreview(): void {
    this.exitDevPreview();
    this.clearStatusDemo();
    this.dismissExtensionStatus();
    this.relayout(true);
  }

  /** Drops any other preview before starting a new one (only one at a time). */
  private enterDevPreview(): void {
    this.exitDevPreview();
    this.clearStatusDemo();
    this.dismissExtensionStatus();
  }

  /** Restores the renderer signals a loading/failure preview overrode. */
  private exitDevPreview(): void {
    const preview = this.devPreview;
    if (!preview) return;
    this.devPreview = null;
    if (preview === "loading") {
      this.sendToShell("viewport:loading", {
        loading: false,
        url: this.requestedTarget ?? this.currentUrl,
      });
    } else {
      this.sendToShell("viewport:ready", { url: this.currentUrl });
    }
  }

  /**
   * Dev-only: drives a looping, realistic install so `InstallStatus.vue` stays
   * on screen to be styled with live HMR. Not reachable in a packaged build.
   */
  startExtensionStatusDemo(): void {
    this.clearStatusDemo();
    const total = 670658;
    const frames: Array<{ hold: number; status: ExtensionStatus }> = [
      {
        hold: 800,
        status: {
          phase: "resolving",
          name: "fmkadmapgofadopljbjfkapdkoienihi",
          message: "Looking up the extension",
        },
      },
      ...Array.from({ length: 24 }, (_, index): { hold: number; status: ExtensionStatus } => ({
        hold: 110,
        status: {
          phase: "downloading",
          name: "React Developer Tools",
          message: "Downloading from the Chrome Web Store",
          progress: { received: Math.round((total * (index + 1)) / 24), total },
        },
      })),
      {
        hold: 600,
        status: {
          phase: "verifying",
          name: "React Developer Tools",
          message: "Verifying the package",
        },
      },
      {
        hold: 800,
        status: { phase: "extracting", name: "React Developer Tools", message: "Unpacking files" },
      },
      {
        hold: 600,
        status: { phase: "loading", name: "React Developer Tools", message: "Loading extension" },
      },
      {
        hold: 1600,
        status: {
          phase: "done",
          name: "React Developer Tools",
          message: "Installed React Developer Tools",
        },
      },
      {
        hold: 2200,
        status: {
          phase: "error",
          name: "React Developer Tools",
          message: "Couldn't install React Developer Tools",
          error: "The store returned HTTP 404",
        },
      },
    ];

    let index = 0;
    const tick = (): void => {
      const frame = frames[index % frames.length];
      this.setExtensionStatus(frame.status);
      index += 1;
      this.statusDemoTimer = setTimeout(tick, frame.hold);
    };
    tick();
  }

  private clearStatusDemo(): void {
    if (this.statusDemoTimer) {
      clearTimeout(this.statusDemoTimer);
      this.statusDemoTimer = null;
    }
  }

  async runCommand(id: string, arg?: unknown): Promise<CommandResult> {
    try {
      const result = await this.commands.run(id, arg);
      if (result && typeof result === "object" && "ok" in result) return result;
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
    this.previewVariantSlug = null;
    this.store.setVariant(variant);
    this.applyTheme();
    this.broadcastState();
  }

  /**
   * Applies a variant transiently while the palette selection moves through the
   * theme rows; it is never persisted and is dropped when the palette closes.
   */
  previewVariant(variant: VariantSlug | null): void {
    if (!this.paletteOpen) return;
    this.previewVariantSlug = variant;
    this.pushTheme();
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
    if (!open) {
      this.clearThemePreview();
      this.siteView.webContents.focus();
    }
    this.relayout();
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
    // A real navigation owns the surfaces from here; drop any dev preview so the
    // page stays interactive and the renderer follows the actual load.
    this.devPreview = null;
    if (this.statusDemoTimer) {
      this.clearStatusDemo();
      this.dismissExtensionStatus();
    }
    // A same-origin path change over an already-painted page is the site
    // navigating itself; it needs no veil (the old frame stays until commit).
    // Read `failed` before clearing it: a load from the failure view always veils.
    const veil = shouldVeilTarget({
      shownUrl: this.shownUrl,
      nextUrl: url,
      failed: this.failed,
    });
    this.failed = false;
    this.failedUrl = null;
    this.showLoading = veil;
    this.requestedTarget = url;
    this.relayout();
    if (veil) this.reportLoading(true);
    // did-fail-load drives the failure view; swallow the rejection so a refused
    // connection is not reported as an unhandled promise.
    void this.siteView.webContents.loadURL(url).catch(() => {});
  }

  private handleReady(url: string): void {
    // Only a raised veil owes a renderer leave; without one there is nothing to
    // wait for before collapsing the shell.
    const veilWasUp = this.showLoading;
    this.showLoading = false;
    this.failed = false;
    if (url) {
      this.currentUrl = url;
      this.shownUrl = url;
      this.store.setTarget(url);
      this.store.recordRecent(url);
    }
    this.reportLoading(false);
    this.sendToShell("viewport:ready", { url });
    this.broadcastState();
    // The veil's fade-out happens in the renderer; hold the collapse for it.
    this.relayout(veilWasUp);
  }

  /**
   * Tracks the live URL (including in-page SPA route changes) so ⌘L prefills
   * the real current page and the persisted target follows where you are.
   * Recents are recorded only on full loads, so routing does not spam them.
   */
  private handleNavigated(url: string): void {
    this.picker.invalidate();
    if (!url || url === this.currentUrl) return;
    this.currentUrl = url;
    this.shownUrl = url;
    this.store.setTarget(url);
    this.broadcastState();
  }

  private handleFailed(url: string, reason: string): void {
    // Ignore a late failure from a navigation that has since been superseded.
    if (this.requestedTarget && sameUrl(url, this.requestedTarget) === false) return;
    this.showLoading = false;
    this.failed = true;
    this.failedUrl = url;
    this.closePalette();
    this.relayout();
    // Offer a way back only when we actually have a different working target.
    const previousUrl = this.currentUrl && !sameUrl(this.currentUrl, url) ? this.currentUrl : null;
    this.sendToShell("viewport:failed", { url, reason, previousUrl });
  }

  /** Returns from the failure view to the last successfully loaded target. */
  private dismissFailure(): void {
    const previous = this.currentUrl;
    if (!this.failedUrl || !previous || sameUrl(previous, this.failedUrl)) return;
    this.loadTarget(previous);
  }

  private setLoading(loading: boolean): void {
    // The veil is raised only for a site switch (or a cold start / failure load).
    // Link clicks and iframe loads never cover the view, and neither does a
    // same-origin palette navigation: the old frame stays visible until the new
    // one commits, so there is no white flash to hide (matches Chrome).
    if (!loading) this.showLoading = false;
    this.relayout();
    this.reportLoading(this.showLoading);
  }

  private reportLoading(loading: boolean): void {
    this.sendToShell("viewport:loading", {
      loading,
      url: this.requestedTarget ?? this.currentUrl,
    });
  }

  private openPalette(initial: string): void {
    this.paletteOpen = true;
    // Pull in targets other instances recorded since our last read (FR-004).
    this.store.refreshRecents();
    this.relayout();
    this.broadcastState();
    this.sendToShell("palette:open", { initial });
    this.shellView.webContents.focus();
  }

  /**
   * `⌘P` toggles the palette: it opens empty when closed and dismisses when it
   * is already open, so the same key that summons it also puts it away. Closing
   * mirrors `Esc` — the renderer plays its leave and returns focus to the page.
   */
  private togglePalette(): void {
    if (this.paletteOpen) {
      this.closePalette();
      return;
    }
    this.openPalette("");
  }

  private closePalette(): void {
    this.clearThemePreview();
    this.paletteOpen = false;
    // Defer the collapse: the renderer owns the palette's leave, and main must
    // keep the shell full-window until it reports finished (settle protocol).
    // Without this a main-initiated close (⌘P toggle, ⌘J) hides the shell view
    // instantly and the exit animation never plays. When the close lands on the
    // veil or failure view the desired mode is already `full`, so nothing defers.
    this.sendToShell("palette:close", {});
    this.relayout(true);
  }

  /**
   * Moves keyboard focus between the guest page and the docked DevTools panel.
   * `⌘J` reaches this from both places: the page's `before-input-event` when the
   * page (or shell) has focus, and the app-menu accelerator when DevTools does —
   * DevTools does not bind plain `⌘J`, so the key equivalent falls through to the
   * menu (unlike `⌘P`, which DevTools consumes).
   */
  private toggleFocus(): void {
    // The palette owns input while open; hand focus back to the page first.
    if (this.paletteOpen) {
      this.closePalette();
      this.siteView.webContents.focus();
      return;
    }

    const devtools = this.siteView.webContents.devToolsWebContents;
    const devtoolsAlive = devtools !== null && !devtools.isDestroyed();

    if (devtoolsAlive && webContents.getFocusedWebContents() === devtools) {
      this.siteView.webContents.focus();
    } else if (devtoolsAlive) {
      devtools.focus();
    } else {
      this.siteView.webContents.focus();
    }
  }

  private toggleStrip(): void {
    const visible = !this.store.get().stripVisible;
    this.store.setStripVisible(visible);
    // Broadcast first so the renderer can play its leave, then hold the
    // collapse for it when hiding (contracts/settle-protocol.md).
    this.broadcastState();
    this.relayout(!visible);
  }

  private readonly handleNativeThemeUpdated = (): void => {
    // Only the system mode is runtime-following; explicit overrides must stick.
    if (this.store.get().colorMode === "system") this.pushTheme();
  };

  private applyTheme(): void {
    nativeTheme.themeSource = this.store.get().colorMode;
    this.pushTheme();
  }

  /** Dropped whenever the palette closes or a variant is committed. */
  private clearThemePreview(): void {
    if (this.previewVariantSlug === null) return;
    this.previewVariantSlug = null;
    this.pushTheme();
  }

  private activeVariant(): VariantSlug {
    return this.previewVariantSlug ?? this.store.get().variant;
  }

  /** Pushes the active variant + resolved mode to the window background and shell. */
  private pushTheme(): void {
    if (this.win.isDestroyed()) return;
    const state = this.store.get();
    this.win.setBackgroundColor(this.backgroundColor());
    this.sendToShell("theme:apply", {
      variant: this.activeVariant(),
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
    const tokens = TLAPALLI_TOKENS[this.activeVariant()] ?? TLAPALLI_TOKENS.obsidian;
    return tokens[this.resolvedMode()]["--tb-bg"];
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

  /**
   * The renderer reports that all surface leave transitions have finished, so a
   * deferred collapse may now be applied (contracts/settle-protocol.md).
   */
  notifyShellSettled(): void {
    if (!this.pendingSettle) return;
    this.clearPendingSettle();
    this.applyShellMode(this.desiredShellMode());
  }

  private desiredShellMode(): ShellMode {
    if (
      this.paletteOpen ||
      this.showLoading ||
      this.failed ||
      this.extensionStatus ||
      this.devPreview
    ) {
      return "full";
    }
    if (this.store.get().stripVisible) return "strip";
    return "hidden";
  }

  /**
   * The macOS traffic lights are real AppKit controls that Electron hides on a
   * frameless window. Showing them only while the drag strip is on screen keeps
   * the chromeless default: the strip is the window's title bar, so the controls
   * belong to it and come and go with `⌘B`. Mirrors the strip's render condition
   * exactly (`stripVisible && !paletteOpen`); both sides read the shared
   * predicate so they can never drift. A cached value keeps the frequent
   * resize-driven relayouts from re-issuing the native call.
   */
  private syncWindowButtons(): void {
    const visible = isStripSurfaceVisible(this.store.get(), this.paletteOpen);
    if (visible === this.buttonsVisible) return;
    this.buttonsVisible = visible;
    if (!this.win.isDestroyed()) this.win.setWindowButtonVisibility(visible);
  }

  /**
   * Applies view bounds. A deferred, smaller mode keeps the current bounds
   * until the renderer's leave settles or the safety timeout fires, so exit
   * animations are never cut; motion is best-effort and never blocks state.
   */
  private relayout(defer = false): void {
    this.syncWindowButtons();
    const { width, height } = this.win.getContentBounds();
    this.siteView.setBounds({ x: 0, y: 0, width, height });

    const desired = this.desiredShellMode();
    const collapsing =
      SHELL_MODE_RANK[desired] < SHELL_MODE_RANK[this.shellMode] && (defer || this.pendingSettle);

    if (collapsing && this.shellLoaded) {
      this.armSettleTimeout();
      // A resize during the wait keeps the current mode at the new size.
      if (!defer) this.applyShellMode(this.shellMode);
      return;
    }

    this.clearPendingSettle();
    this.applyShellMode(desired);
  }

  private applyShellMode(mode: ShellMode): void {
    const { width, height } = this.win.getContentBounds();
    if (mode === "full") {
      this.shellView.setBounds({ x: 0, y: 0, width, height });
      this.shellView.setVisible(true);
    } else if (mode === "strip") {
      this.shellView.setBounds({ x: 0, y: 0, width, height: STRIP_HEIGHT });
      this.shellView.setVisible(true);
    } else {
      this.shellView.setVisible(false);
    }
    this.shellMode = mode;
  }

  private armSettleTimeout(): void {
    this.pendingSettle = true;
    if (this.settleTimer) return;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (!this.pendingSettle) return;
      this.pendingSettle = false;
      this.applyShellMode(this.desiredShellMode());
    }, SHELL_SETTLE_TIMEOUT_MS);
  }

  private clearPendingSettle(): void {
    this.pendingSettle = false;
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
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
