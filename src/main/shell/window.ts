import { BaseWindow, nativeTheme, screen, webContents, type WebContentsView } from "electron";
import { StateStore } from "../state/store";
import { ExtensionManager } from "../extensions/manager";
import { isActivePhase, type ExtensionStatus } from "@shared/extensions";
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  type Bounds,
  type ColorMode,
  type VariantSlug,
  type WindowRecord,
} from "../state/schema";
import { normalizeTarget, shouldVeilTarget } from "../nav/policy";
import {
  commandForInput,
  COLOR_MODES,
  colorModeCommandId,
  THEME_VARIANTS,
  type Scope,
} from "@shared/commands";
import {
  DRAG_BAND_HEIGHT,
  STRIP_HEIGHT,
  isBlankSurfaceVisible,
  isStripSurfaceVisible,
  titlebarInset,
} from "@shared/shell";
import { TLAPALLI_TOKENS } from "@shared/theme-tokens";
import { isHistoryArmedVisible, type HistoryArmed } from "@shared/history";
import { isReloadNavigation, rimKindFor, type ReloadKind } from "@shared/reload";
import { createSiteView } from "./site-view";
import { createShellView } from "./shell-view";
import { framesEqual } from "./geometry";
import { DevToolsController, type SurfaceState } from "./devtools";
import { PickerController } from "./picker";
import { installGestureProbe, type GestureProbeHandle } from "./gesture-probe";
import { ProximityTracker } from "./proximity";
import { CommandRegistry, type CommandResult } from "./commands";
import { swipeNavigation, type SwipeWindow } from "./swipe/navigation";
import type { ZoomGestureEvent } from "./swipe/addon";
import { PAGE_AT_BOTH_EDGES, type PageScrollEdge } from "@shared/scroll-edge";
import {
  DEFAULT_ZOOM_INDEX,
  clampZoomIndex,
  stepZoom,
  zoomFactor,
  zoomPercent,
} from "@shared/zoom";
import { normalizeViewportSize, viewportSizeEquals, type ViewportSize } from "@shared/viewport";

/** How long main waits for the renderer settle ack before collapsing anyway. */
const SHELL_SETTLE_TIMEOUT_MS = 500;

/** How often the always-on drag band samples the pointer (specs/013). */
const PROXIMITY_POLL_MS = 150;

/** How long after the last move the window still counts as being dragged. */
const DRAG_SETTLE_MS = 200;

/** How long the transient zoom indicator stays up after the last change. */
const ZOOM_INDICATOR_MS = 1500;

/** How long the transient viewport-size readout stays up after the last change. */
const VIEWPORT_INDICATOR_MS = 1500;

/**
 * Page zoom changes the page's CSS viewport, so it fires the page `resize` too.
 * For this long after a zoom step the size readout is suppressed, so pinching
 * shows only the zoom readout, not a size readout flashing on every step.
 */
const ZOOM_RESIZE_SUPPRESS_MS = 400;

/** Keyboard zoom within this window is one press arriving on both paths. */
const ZOOM_KEY_DEDUPE_MS = 20;

/** Accumulated mouse-wheel travel (its precise deltas are ~1–2 each) per step. */
const ZOOM_WHEEL_MOUSE_STEP = 12;

/** Accumulated trackpad Command + scroll travel (px) per zoom step (more = calmer). */
const ZOOM_WHEEL_TRACKPAD_STEP = 120;

/** Accumulated pinch magnification per zoom step (more = calmer). */
const ZOOM_PINCH_STEP = 0.3;

/** Idle gap that ends a gesture and clears its leftover travel. */
const ZOOM_GESTURE_IDLE_MS = 160;

/** Debounce for persisting the zoom step, so a gesture never fsyncs per step. */
const ZOOM_PERSIST_MS = 300;

/**
 * Shell overlay heights. `band` is the thin always-on drag/reveal region that keeps
 * the page below the top edge clickable; `strip` grows the overlay just enough for
 * the painted strip (target + controls) whenever it is pinned or peeking.
 */
type ShellMode = "full" | "strip" | "band";

/** Bigger modes win when deciding whether a collapse needs the settle wait. */
const SHELL_MODE_RANK: Record<ShellMode, number> = { band: 0, strip: 1, full: 2 };

export type { CommandResult };

export interface AppWindowOptions {
  /** The process-wide state store shared by every window. */
  store: StateStore;
  /** The process-wide extension manager shared by every window. */
  extensions: ExtensionManager;
  /** This window's stable record id. */
  windowId: string;
  /** Runs the `window.new` command; owned by the window manager. */
  onNewWindow?: () => void;
  /** Called once the window has fully closed, so the manager can clean up. */
  onClosed?: () => void;
  /** Called after this window's color mode changes, so the menu mark can follow. */
  onColorModeChanged?: () => void;
}

export class AppWindow implements SwipeWindow {
  readonly win: BaseWindow;
  readonly store: StateStore;
  readonly extensions: ExtensionManager;
  readonly siteView: WebContentsView;
  readonly shellView: WebContentsView;
  readonly devtools: DevToolsController;
  readonly picker: PickerController;
  readonly commands = new CommandRegistry();
  /** This window's stable identity, matching its persisted record. */
  readonly windowId: string;

  private readonly onNewWindow: () => void;
  private readonly onClosed: () => void;
  private readonly onColorModeChanged: () => void;

  private showLoading = false;
  private failed = false;
  private failedUrl: string | null = null;
  /** The transient load rim, or null when no in-place load is running (specs/025). */
  private reloading: { hard: boolean } | null = null;
  /** Command intent for the next navigation: normal reload or cache bypass. */
  private pendingReloadKind: ReloadKind | null = null;
  private paletteOpen = false;
  private shellMode: ShellMode = "band";
  private pendingSettle = false;
  private settleTimer: NodeJS.Timeout | null = null;
  /** Whether the strip is currently revealed by pointer proximity (transient). */
  private peek = false;
  /** Dev-only: holds the pointer-reveal sampler still for an automated capture. */
  private proximityFrozen = false;
  private readonly proximity = new ProximityTracker();
  private proximityTimer: NodeJS.Timeout | null = null;
  /** True briefly after a window move, so a drag does not trigger a peek. */
  private dragging = false;
  private dragSettleTimer: NodeJS.Timeout | null = null;
  private previewVariantSlug: VariantSlug | null = null;
  private editableFocused = false;
  private shellLoaded = false;
  private buttonsVisible = false;
  private extensionStatus: ExtensionStatus | null = null;
  private statusDemoTimer: NodeJS.Timeout | null = null;
  /** Dev-only: a transient shell surface being previewed (see specs/008). */
  private devPreview: "loading" | "failure" | "history" | "reload" | null = null;
  /** TEMPORARY: the specs/015 M0 spike probe; absent unless debugging is on. */
  private gestureProbe: GestureProbeHandle | null = null;
  /** The live armed signal driving the edge overlay (specs/015). */
  private historyArmed: HistoryArmed | null = null;
  /** This window's persistent zoom step; the guest renders at ZOOM_STEPS[zoomIndex]. */
  private zoomIndex: number;
  /** The transient zoom confirmation, shown briefly after any change. */
  private zoomStatus: { percent: number } | null = null;
  private zoomTimer: NodeJS.Timeout | null = null;
  /** Running gesture travel, mapped to ladder steps (one accumulator per source). */
  private zoomMouseAccumulator = 0;
  private zoomWheelAccumulator = 0;
  private zoomPinchAccumulator = 0;
  private gestureIdleTimer: NodeJS.Timeout | null = null;
  /** Last keyboard zoom, so the menu and input dispatcher cannot double-step. */
  private lastKeyboardZoomAt = 0;
  /** Debounced persistence of the zoom step (never fsync per gesture step). */
  private zoomPersistTimer: NodeJS.Timeout | null = null;
  /** Dev-only: keeps the armed overlay cycling for styling. */
  private historyPreviewTimer: NodeJS.Timeout | null = null;
  /** Latest report of what the page under the pointer can still scroll. */
  private scrollEdge: PageScrollEdge = PAGE_AT_BOTH_EDGES;
  /** The guest page's reported viewport, so the docked panel's band is exact. */
  private pageViewport: { width: number; height: number } | null = null;
  /** The transient viewport-size readout (rendered in the shell, specs/024). */
  private viewportStatus: { width: number; height: number } | null = null;
  private viewportTimer: NodeJS.Timeout | null = null;
  /** The last page viewport read, so a poll/event only reacts to real changes. */
  private lastViewport: ViewportSize | null = null;
  /** Until this time, page resizes are zoom-induced and skip the size readout. */
  private zoomResizeUntil = 0;
  private pendingShellMessages: Array<[string, unknown]> = [];
  private requestedTarget: string | null = null;
  private attachedDevTools: Electron.WebContents | null = null;
  private currentUrl: string;
  /** True once any target has been loaded, so the window stops reading as blank. */
  private targetEverLoaded = false;
  /**
   * The URL of the document actually committed to the view, or null before the
   * first paint. Unlike `currentUrl` it is never seeded from persisted state, so
   * a cold start reads as "nothing painted" and still veils (see loadTarget).
   */
  private shownUrl: string | null = null;

  constructor(options: AppWindowOptions) {
    this.store = options.store;
    this.extensions = options.extensions;
    this.windowId = options.windowId;
    this.onNewWindow = options.onNewWindow ?? (() => {});
    this.onClosed = options.onClosed ?? (() => {});
    this.onColorModeChanged = options.onColorModeChanged ?? (() => {});

    const record = this.record();
    this.currentUrl = record?.target ?? "";
    this.zoomIndex = clampZoomIndex(record?.zoomIndex ?? DEFAULT_ZOOM_INDEX);

    this.win = new BaseWindow({
      width: record?.bounds?.width ?? DEFAULT_WIDTH,
      height: record?.bounds?.height ?? DEFAULT_HEIGHT,
      x: record?.bounds?.x,
      y: record?.bounds?.y,
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
      onNavigateStart: (url) => this.handleNavigateStart(url),
      onReady: (url) => this.handleReady(url),
      onNavigated: (url) => this.handleNavigated(url),
      onFailed: (url, reason) => this.handleFailed(url, reason),
      onTitle: (title) => {
        if (this.win.isDestroyed()) return;
        this.win.setTitle(title ? `${title} — Tlachialoni` : "Tlachialoni");
      },
    });

    this.shellView = createShellView();

    this.win.contentView.addChildView(this.siteView);
    this.win.contentView.addChildView(this.shellView);

    this.devtools = new DevToolsController(
      () => this.siteView,
      this.surfaceState(),
      (status) => this.sendToShell("devtools:changed", status),
      () => ({ variant: this.activeVariant(), mode: this.resolvedMode() }),
    );
    this.picker = new PickerController(() => this.siteView, this.devtools);

    // Register with the process-wide swipe controller; a scroll event is matched
    // to this window by its native handle (specs/015, native path).
    swipeNavigation.register(this);

    this.registerCommands();

    // Own the zoom ladder while letting Chromium actually render the zoom. NOTE:
    // `manual` zoom mode looks right but does not repaint the page (setZoomFactor
    // changes the value yet devicePixelRatio stays put), so `isolated` is used:
    // per-webContents, rendering works, and the level persists across navigation.
    this.siteView.webContents.setZoomMode("isolated");
    this.applyZoomFactor();
    if (process.env["TLACHIALONI_ZOOM_DEBUG"] === "1") this.installZoomDebug();

    // TEMPORARY: the specs/015 M0 spike probe. Observes only; see
    // src/main/shell/gesture-probe.ts. Deleted once research.md §10 records it.
    if (process.env["TLACHIALONI_GESTURE_DEBUG"] === "1") {
      this.gestureProbe = installGestureProbe(this.win, this.siteView, "site");
    }

    this.wireEvents();
    this.relayout();
    if (this.currentUrl) this.loadTarget(this.currentUrl);
  }

  // ---- per-window record -----------------------------------------------

  private record(): WindowRecord | null {
    return this.store.window(this.windowId);
  }

  /** Whether this window docks the strip permanently (specs/016). */
  private titlebarActive(): boolean {
    return this.record()?.titlebarMode ?? false;
  }

  /** This window's DevTools/strip state, backed by its persisted record. */
  private surfaceState(): SurfaceState {
    return {
      dockMode: () => this.record()?.dockMode ?? "bottom",
      setDockMode: (mode) => {
        this.store.patchWindow(this.windowId, { dockMode: mode });
      },
      setDevtoolsOpen: (open) => {
        this.store.patchWindow(this.windowId, { devtoolsOpen: open });
      },
    };
  }

  // ---- lifecycle -------------------------------------------------------

  show(): void {
    // Capture the frame to restore before `show()`: macOS repositions the
    // window when it is first ordered on screen, and the move/resize handlers
    // then persist that repositioned frame over the saved one.
    const saved = this.record()?.bounds ?? null;
    this.win.show();
    // macOS constrains a window to the display's work area when it is first
    // ordered on screen, so a restored frame that extended past the work area —
    // or was saved on another display — is silently clamped or relocated at
    // launch. Re-applying the saved frame after `show()` bypasses that
    // constraint, restoring the exact position and monitor the user left it on
    // (specs/013 restore fix). Deferred a tick so it lands after macOS has
    // finished ordering the window.
    if (saved) setImmediate(() => this.restoreBounds(saved));
    this.win.focus();
    this.startProximity();
    if (this.targetEverLoaded || this.currentUrl) this.siteView.webContents.focus();
    else this.shellView.webContents.focus();
    this.relayout();
    const record = this.record();
    if (record?.devtoolsOpen && (this.targetEverLoaded || this.currentUrl)) {
      this.devtools.open(record.dockMode);
    }
    this.applyTheme();
  }

  /**
   * Re-applies the captured saved frame, overriding any clamp or relocation
   * macOS applied while ordering the window on screen.
   */
  private restoreBounds(saved: Bounds): void {
    if (this.win.isDestroyed()) return;
    if (framesEqual(this.win.getBounds(), saved)) return;
    this.win.setBounds(saved);
  }

  private wireEvents(): void {
    this.win.on("resize", () => {
      this.relayout();
      this.store.patchWindow(this.windowId, { bounds: this.win.getBounds() });
    });
    this.win.on("move", () => {
      this.store.patchWindow(this.windowId, { bounds: this.win.getBounds() });
      this.noteWindowMoved();
    });
    // Keep the proximity sampler alive for the window's lifetime. macOS moves a
    // window to another Space without reliably re-emitting focus/show, so an
    // earlier revision that stopped on blur/hide left the strip unrevealed after
    // a Space change until the window was refocused. Each tick pauses itself when
    // the window is hidden or unfocused, so a live timer costs nothing.
    this.win.on("focus", () => this.startProximity());
    this.win.on("show", () => this.startProximity());
    this.win.on("restore", () => this.startProximity());
    this.win.on("close", () => {
      this.store.patchWindow(this.windowId, {
        bounds: this.win.getBounds(),
        devtoolsOpen: this.devtools.isOpen(),
        // A debounced zoom write may still be pending; fold it into this one.
        zoomIndex: this.zoomIndex,
      });
      if (this.zoomPersistTimer) {
        clearTimeout(this.zoomPersistTimer);
        this.zoomPersistTimer = null;
      }
    });
    this.win.on("closed", () => {
      this.clearPendingSettle();
      this.clearStatusDemo();
      this.clearZoomTimer();
      this.clearViewportTimer();
      if (this.gestureIdleTimer) {
        clearTimeout(this.gestureIdleTimer);
        this.gestureIdleTimer = null;
      }
      this.clearHistoryPreview();
      this.gestureProbe?.dispose();
      this.gestureProbe = null;
      swipeNavigation.unregister(this);
      this.stopProximity();
      this.clearDragSuppress();
      this.devtools.dispose();
      this.detachDevToolsInput();
      nativeTheme.removeListener("updated", this.handleNativeThemeUpdated);
      // Views are not destroyed automatically with a BaseWindow.
      for (const view of [this.siteView, this.shellView]) {
        if (!view.webContents.isDestroyed()) view.webContents.close();
      }
      this.onClosed();
    });

    // While colorMode is "system", follow live OS dark/light switches so the
    // shell and window background re-resolve without a restart (FR-017).
    nativeTheme.on("updated", this.handleNativeThemeUpdated);

    this.siteView.webContents.on("before-input-event", this.handleInput);
    this.shellView.webContents.on("before-input-event", this.handleInput);

    // Mouse back/forward thumb buttons. On Windows/Linux the OS surfaces them as
    // app commands; on macOS mouse drivers (Logitech Options+ and friends)
    // deliver the thumb buttons as synthesized swipe events, the same way Safari
    // and Chrome receive them.
    this.win.on("app-command", (_event, command) => {
      if (command === "browser-backward") void this.commands.run("view.back");
      else if (command === "browser-forward") void this.commands.run("view.forward");
    });
    // On macOS the native addon (specs/015) consumes trackpad swipes via
    // trackSwipeEventWithOptions, so they never reach this handler — only mouse
    // thumb buttons arrive here.
    this.win.on("swipe", (_event, direction) => {
      if (direction === "left") void this.commands.run("view.back");
      else if (direction === "right") void this.commands.run("view.forward");
    });

    // A gesture is meaningless once the window is gone or unfocused.
    this.win.on("blur", () => this.clearHistoryArm());
    this.win.on("hide", () => this.clearHistoryArm());

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
      this.openPalette(typeof arg === "string" && arg.trim() ? arg : this.currentUrl, "location"),
    );
    commands.register("palette.openTheme", () => this.openPalette("", "theme"));
    commands.register("target.navigate", (arg) => this.navigate(String(arg ?? "")));
    commands.register("strip.toggle", () => this.toggleStrip());
    commands.register("titlebar.toggle", () => this.toggleTitlebar());
    commands.register("view.reload", () => this.reloadSite("normal"));
    commands.register("view.hardReload", () => this.reloadSite("hard"));
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
    commands.register("view.zoomIn", () => this.keyboardZoom(1));
    commands.register("view.zoomOut", () => this.keyboardZoom(-1));
    commands.register("view.zoomReset", () => this.keyboardZoomReset());
    commands.register("devtools.toggle", () => this.devtools.toggle());
    commands.register("devtools.dock.bottom", () => this.devtools.dock("bottom"));
    commands.register("devtools.dock.right", () => this.devtools.dock("right"));
    commands.register("devtools.dock.left", () => this.devtools.dock("left"));
    commands.register("focus.toggle", () => this.toggleFocus());
    commands.register("picker.toggle", () => this.picker.toggle());
    for (const variant of THEME_VARIANTS) {
      commands.register(`theme.variant.${variant.slug}`, () => this.setVariant(variant.slug));
    }
    for (const mode of COLOR_MODES) {
      commands.register(colorModeCommandId(mode.slug), () => this.setColorMode(mode.slug));
    }
    commands.register("failure.retry", () => {
      this.failed = false;
      this.showLoading = true;
      this.relayout();
      this.reportLoading(true);
      this.siteView.webContents.reload();
    });
    commands.register("failure.dismiss", () => this.dismissFailure());
    commands.register("window.new", () => this.onNewWindow());
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

  // ---- public API used by IPC and window manager -----------------------

  getState() {
    return this.store.composeWindowView(this.windowId);
  }

  /**
   * Shows the extension status surface. The window stays full-window while a
   * status is present so the surface is never clipped; the renderer dismisses a
   * finished one through `extensions.dismissStatus`.
   */
  setExtensionStatus(status: ExtensionStatus): void {
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

  // ---- zoom (specs/023) ------------------------------------------------

  /** Applies this window's persisted zoom to the guest view. */
  private applyZoomFactor(): void {
    if (this.siteView.webContents.isDestroyed()) return;
    this.siteView.webContents.setZoomFactor(zoomFactor(this.zoomIndex));
  }

  private zoomBy(delta: number): void {
    this.setZoomIndex(stepZoom(this.zoomIndex, delta));
  }

  /**
   * Keyboard zoom. The command can arrive twice for one press — the View menu's OS
   * accelerator and the view's `before-input-event` dispatcher both match it — so
   * presses within a few milliseconds collapse to one step.
   */
  private keyboardZoom(delta: number): void {
    if (!this.acceptKeyboardZoom()) return;
    this.zoomBy(delta);
  }

  private keyboardZoomReset(): void {
    if (!this.acceptKeyboardZoom()) return;
    this.setZoomIndex(DEFAULT_ZOOM_INDEX);
  }

  private acceptKeyboardZoom(): boolean {
    const now = Date.now();
    if (now - this.lastKeyboardZoomAt < ZOOM_KEY_DEDUPE_MS) return false;
    this.lastKeyboardZoomAt = now;
    return true;
  }

  /** Sets the step, applies it, flashes the indicator, and persists (debounced). */
  private setZoomIndex(index: number): void {
    const next = clampZoomIndex(index);
    this.zoomIndex = next;
    this.applyZoomFactor();
    // A zoom changes the page's CSS viewport, which fires the page resize; keep the
    // size readout out of the way while the zoom settles (ROWS: zoom feedback only).
    this.zoomResizeUntil = Date.now() + ZOOM_RESIZE_SUPPRESS_MS;
    // Re-assert on the next tick: in a non-manual zoom mode Chromium may apply its
    // own wheel step after us; our absolute factor must be the value that sticks.
    setImmediate(() => this.applyZoomFactor());
    this.scheduleZoomPersist();
    this.showZoomIndicator();
  }

  /**
   * Persists the zoom step shortly after it settles. Writing on every step does a
   * synchronous fsync, which stalls the main process mid-gesture and makes fast
   * wheel/pinch input feel like it is being dropped.
   */
  private scheduleZoomPersist(): void {
    if (this.zoomPersistTimer) return;
    this.zoomPersistTimer = setTimeout(() => {
      this.zoomPersistTimer = null;
      this.store.patchWindow(this.windowId, { zoomIndex: this.zoomIndex });
    }, ZOOM_PERSIST_MS);
  }

  /**
   * A native zoom gesture (Command + scroll, or a trackpad pinch) from the swipe
   * addon's NSEvent monitor. It belongs to the guest page, so it is ignored while
   * the pointer is over the docked DevTools or DevTools has focus (FR-019).
   */
  onZoomGesture(event: ZoomGestureEvent): void {
    if (this.isDevToolsFocused() || this.isPointerOverDevTools(event.x, event.y)) return;

    if (process.env["TLACHIALONI_ZOOM_DEBUG"] === "1") {
      console.log(
        "[zoom-debug]",
        event.source,
        "discrete=",
        event.discrete,
        "precise=",
        event.precise,
        "deltaY=",
        event.deltaY,
        "magnification=",
        event.magnification,
      );
    }

    if (event.source === "pinch") {
      this.accumulateZoom("pinch", event.magnification);
      return;
    }

    if (event.discrete) {
      // Mouse wheel: many small precise events per notch. Accumulate them; the
      // mouse's delta sign is opposite the trackpad's, so it is not negated.
      this.accumulateZoom("mouse", event.deltaY);
    } else {
      // Trackpad Command + scroll: a continuous stream, so accumulate it.
      this.accumulateZoom("wheel", -event.deltaY);
    }
  }

  /** Accumulates gesture travel and advances the ladder one step per threshold. */
  private accumulateZoom(kind: "mouse" | "wheel" | "pinch", zoomInPositiveDelta: number): void {
    if (!Number.isFinite(zoomInPositiveDelta) || zoomInPositiveDelta === 0) return;
    const threshold =
      kind === "pinch"
        ? ZOOM_PINCH_STEP
        : kind === "mouse"
          ? ZOOM_WHEEL_MOUSE_STEP
          : ZOOM_WHEEL_TRACKPAD_STEP;
    if (kind === "pinch") this.zoomPinchAccumulator += zoomInPositiveDelta;
    else if (kind === "mouse") this.zoomMouseAccumulator += zoomInPositiveDelta;
    else this.zoomWheelAccumulator += zoomInPositiveDelta;
    if (process.env["TLACHIALONI_ZOOM_DEBUG"] === "1") {
      console.log("[zoom-debug]", kind, "delta=", zoomInPositiveDelta, "threshold=", threshold);
    }
    this.consumeZoomSteps(kind, threshold);
    // A gesture ends when the input pauses; clear the leftover so it never leaks
    // into the next gesture.
    if (this.gestureIdleTimer) clearTimeout(this.gestureIdleTimer);
    this.gestureIdleTimer = setTimeout(() => {
      this.gestureIdleTimer = null;
      this.zoomMouseAccumulator = 0;
      this.zoomWheelAccumulator = 0;
      this.zoomPinchAccumulator = 0;
    }, ZOOM_GESTURE_IDLE_MS);
  }

  private consumeZoomSteps(kind: "mouse" | "wheel" | "pinch", threshold: number): void {
    for (;;) {
      const value =
        kind === "pinch"
          ? this.zoomPinchAccumulator
          : kind === "mouse"
            ? this.zoomMouseAccumulator
            : this.zoomWheelAccumulator;
      if (Math.abs(value) < threshold) return;
      const direction = value > 0 ? 1 : -1;
      if (kind === "pinch") this.zoomPinchAccumulator -= direction * threshold;
      else if (kind === "mouse") this.zoomMouseAccumulator -= direction * threshold;
      else this.zoomWheelAccumulator -= direction * threshold;
      this.zoomBy(direction);
    }
  }

  /**
   * Shows/refreshes the transient zoom readout and restarts its dismissal timer.
   * It renders in the shell (never scaled by page zoom), so the shell must span
   * the window while it is visible.
   */
  private showZoomIndicator(): void {
    this.zoomStatus = { percent: zoomPercent(this.zoomIndex) };
    this.sendToShell("zoom:changed", { ...this.zoomStatus, insets: this.viewportInsets() });
    this.relayout();
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => this.hideZoomIndicator(), ZOOM_INDICATOR_MS);
  }

  /** Clears the zoom readout and lets the shell collapse once it settles. */
  private hideZoomIndicator(): void {
    this.clearZoomTimer();
    if (!this.zoomStatus) return;
    this.zoomStatus = null;
    this.sendToShell("zoom:changed", null);
    this.relayout(true);
  }

  private clearZoomTimer(): void {
    if (this.zoomTimer) {
      clearTimeout(this.zoomTimer);
      this.zoomTimer = null;
    }
  }

  /** Dev-only: logs the raw input stream so the gesture path can be tuned. */
  private installZoomDebug(): void {
    this.siteView.webContents.on("input-event", (_event, input) => {
      const raw = input as { type?: string; modifiers?: string[] };
      if (raw.type === "mouseWheel" || raw.type?.startsWith("gesturePinch")) {
        console.log("[zoom-debug] input", raw.type, "mods=", raw.modifiers);
      }
    });
    this.siteView.webContents.on("zoom-changed", (_event, direction) => {
      console.log("[zoom-debug] zoom-changed", direction);
    });
  }

  /**
   * A shared preference (installed extensions) changed; push this window's
   * composed state. Theme is per-window and is not touched here (FR-009).
   */
  refreshFromShared(): void {
    this.broadcastState();
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

  /**
   * Dev-only: holds the armed history overlay on screen, alternating Back and
   * Forward, so its look and motion can be iterated with live HMR (specs/008).
   * The swipe detector itself is not wired up yet; this previews the surface.
   */
  previewHistoryArm(): void {
    this.enterDevPreview();
    this.devPreview = "history";
    this.startHistoryPreview();
    this.relayout();
  }

  /** Dev-only: holds the load rim on screen so its look and motion can be styled. */
  previewLoadRim(hard = false): void {
    this.enterDevPreview();
    this.devPreview = "reload";
    this.reloading = { hard };
    this.sendToShell("viewport:reloading", {
      hard,
      url: this.requestedTarget ?? this.currentUrl ?? "http://localhost:5173",
    });
    this.relayout();
  }

  /** Dev-only: clears whichever surface is being previewed. */
  stopSurfacePreview(): void {
    this.exitDevPreview();
    this.clearStatusDemo();
    this.dismissExtensionStatus();
    this.clearHistoryPreview();
    this.relayout(true);
  }

  /** Drops any other preview before starting a new one (only one at a time). */
  private enterDevPreview(): void {
    this.exitDevPreview();
    this.clearStatusDemo();
    this.dismissExtensionStatus();
    this.clearHistoryPreview();
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
    } else if (preview === "failure") {
      this.sendToShell("viewport:ready", { url: this.currentUrl });
    } else if (preview === "reload") {
      this.reloading = null;
      this.sendToShell("viewport:reloading", null);
    } else {
      // The history preview never overrode a viewport signal; just drop the arm.
      this.clearHistoryPreview();
    }
  }

  // ---- two-finger history swipe (specs/015, native path) ----------------

  /** Latest report of what the page under the pointer can still scroll. */
  setPageScrollEdge(edge: PageScrollEdge): void {
    this.scrollEdge = edge;
  }

  /**
   * The guest page reported its viewport (see `page:viewport`). This is both the
   * value shown and the trigger — the page fires `resize` for a window resize, a
   * DevTools panel resize, and a dock change, so no polling is needed. Main stores
   * the physical page size (for the panel band and badge placement) and shows the
   * shell readout with the value the page (and DevTools) reports.
   */
  onPageViewport(size: { width: number; height: number }): void {
    // Ignore a pre-layout (zero) report; the gate is permissive until a real size
    // is known, which is safer than treating the whole window as DevTools.
    if (!(size.width > 0) || !(size.height > 0)) return;
    const next = normalizeViewportSize(size);
    const changed = !viewportSizeEquals(this.lastViewport, next);
    this.lastViewport = next;
    // Page zoom changes the CSS viewport but not the page's physical size, so the
    // resize it causes is ignored: recomputing the panel band from it would jitter
    // the badges up and down, and it would flash the size readout. While zooming,
    // only the zoom readout shows.
    if (Date.now() < this.zoomResizeUntil) return;
    const factor = zoomFactor(this.zoomIndex);
    // Page zoom shrinks the CSS viewport; the panel band is physical, so keep the
    // physical size for the gate and for placing the (unscaled) shell badge.
    this.pageViewport = {
      width: Math.round(next.width * factor),
      height: Math.round(next.height * factor),
    };

    if (changed) {
      this.showViewportStatus(next);
    } else if (this.viewportStatus) {
      // Same size still on screen: keep it up without re-emitting.
      this.restartViewportTimer();
    }
  }

  /** Shows/refreshes the size readout and restarts its dismissal timer. */
  private showViewportStatus(size: ViewportSize): void {
    this.viewportStatus = size;
    this.sendToShell("viewport:changed", { ...size, insets: this.viewportInsets() });
    this.relayout();
    this.restartViewportTimer();
  }

  /** Clears the readout and lets the shell collapse once it settles. */
  private hideViewportStatus(): void {
    this.clearViewportTimer();
    if (!this.viewportStatus) return;
    this.viewportStatus = null;
    this.sendToShell("viewport:changed", null);
    this.relayout(true);
  }

  private restartViewportTimer(): void {
    this.clearViewportTimer();
    this.viewportTimer = setTimeout(() => this.hideViewportStatus(), VIEWPORT_INDICATOR_MS);
  }

  private clearViewportTimer(): void {
    if (this.viewportTimer) {
      clearTimeout(this.viewportTimer);
      this.viewportTimer = null;
    }
  }

  /**
   * Insets that place a shell badge at the guest page's corner: the docked DevTools
   * panel occupies one edge, and the page (unscaled) sits in the rest. The size
   * readout uses the page's top-right; the zoom readout the page's bottom-right.
   */
  private viewportInsets(): { top: number; right: number; bottom: number } {
    const { width, height } = this.win.getContentBounds();
    const inset = titlebarInset(this.titlebarActive());
    const dock = this.record()?.dockMode ?? "bottom";
    const page = this.pageViewport;
    const panelW = page ? Math.max(0, width - page.width) : 0;
    const panelH = page ? Math.max(0, height - inset - page.height) : 0;
    return {
      top: inset,
      right: dock === "right" ? panelW : 0,
      bottom: dock === "bottom" ? panelH : 0,
    };
  }

  /**
   * The window-side half of the swipe integration (see swipe/navigation.ts). The
   * native addon owns the gesture; these answer its questions and apply its
   * outcome.
   */
  nativeHandle(): Buffer {
    return this.win.getNativeWindowHandle();
  }

  pageScrollEdge(): PageScrollEdge {
    return this.scrollEdge;
  }

  isDevToolsFocused(): boolean {
    const devtools = this.siteView.webContents.devToolsWebContents;
    return (
      this.devtools.isOpen() &&
      devtools !== null &&
      !devtools.isDestroyed() &&
      webContents.getFocusedWebContents() === devtools
    );
  }

  /**
   * Whether the pointer is over the docked DevTools panel. Uses the guest page's
   * own reported viewport, so the panel's band is exact: the page keeps the rest
   * of the window. A coarse half-window heuristic silently dropped zooms over a
   * third of the page, so this must be the real geometry.
   */
  isPointerOverDevTools(x: number, y: number): boolean {
    if (!this.devtools.isOpen()) return false;
    const viewport = this.pageViewport;
    // The page's size is not known yet: do not block the gesture.
    if (!viewport) return false;
    const { width } = this.win.getContentBounds();
    const inset = titlebarInset(this.titlebarActive());
    const dock = this.record()?.dockMode ?? "bottom";
    // The panel takes one edge; the page holds the rest, anchored opposite it.
    if (dock === "bottom") return y >= inset + viewport.height;
    if (dock === "right") return x >= viewport.width;
    return x < width - viewport.width;
  }

  canGoBack(): boolean {
    return this.siteView.webContents.navigationHistory.canGoBack();
  }

  canGoForward(): boolean {
    return this.siteView.webContents.navigationHistory.canGoForward();
  }

  siteWebContentsId(): number {
    return this.siteView.webContents.id;
  }

  /** A gesture advanced: show/refresh the armed edge overlay. */
  onSwipeProgress(action: "back" | "forward", progress: number): void {
    if (this.gesturePaused()) {
      this.clearHistoryArm();
      return;
    }
    this.setHistoryArmed({ direction: action, progress });
  }

  /** A gesture ended: clear the overlay and, when committed, move history. */
  onSwipeEnd(action: "back" | "forward", committed: boolean): void {
    this.setHistoryArmed(null);
    if (!committed) return;
    void this.commands.run(action === "back" ? "view.back" : "view.forward");
  }

  /** True while a surface that owns input is up; the overlay stays out of the way. */
  private gesturePaused(): boolean {
    return (
      this.paletteOpen ||
      this.showLoading ||
      this.failed ||
      this.extensionStatus !== null ||
      this.devPreview !== null ||
      this.picker.isArmed()
    );
  }

  /** Drops the armed overlay (focus loss, a surface opening, teardown). */
  private clearHistoryArm(): void {
    if (this.historyArmed === null) return;
    this.setHistoryArmed(null);
  }

  /**
   * Records the armed signal and mirrors it to the shell. Growing to `full` so
   * the edge overlay can paint is immediate; clearing defers the shrink so the
   * overlay's leave is not cut (the settle protocol, like the strip and palette).
   */
  private setHistoryArmed(next: HistoryArmed | null): void {
    const visibilityChanged =
      (next === null) !== (this.historyArmed === null) ||
      (next?.direction ?? null) !== (this.historyArmed?.direction ?? null);
    this.historyArmed = next;
    this.sendToShell("history:armed", next);
    if (visibilityChanged) this.relayout(next === null);
  }

  /** Dev-only: alternates the armed direction so both edges can be styled. */
  private startHistoryPreview(): void {
    this.clearHistoryPreview();
    const directions: Array<"back" | "forward"> = ["back", "forward"];
    let index = 0;
    const tick = (): void => {
      const direction = directions[index % directions.length];
      index += 1;
      this.setHistoryArmed({ direction, progress: 0.6 });
    };
    tick();
    this.historyPreviewTimer = setInterval(tick, 1600);
  }

  private clearHistoryPreview(): void {
    if (this.historyPreviewTimer) {
      clearInterval(this.historyPreviewTimer);
      this.historyPreviewTimer = null;
    }
    this.setHistoryArmed(null);
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

  /** Sets this window's variant only; each window has its own theme (FR-009). */
  setVariant(variant: VariantSlug): void {
    this.previewVariantSlug = null;
    this.store.patchWindow(this.windowId, { variant });
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

  /** This window's color mode, read by the menu for its selection mark. */
  colorMode(): ColorMode {
    return this.record()?.colorMode ?? "system";
  }

  /** Sets this window's color mode only (FR-009). */
  setColorMode(mode: ColorMode): void {
    if (this.record()?.colorMode === mode) return;
    this.store.patchWindow(this.windowId, { colorMode: mode });
    this.applyTheme();
    this.broadcastState();
    this.onColorModeChanged();
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

  /**
   * Dev-only: holds the pointer-reveal sampler still. A window capture is whatever
   * the window server shows, so an automated run must not have the strip appear
   * just because the cursor happened to be resting near the top edge (specs/013).
   */
  freezeProximity(frozen: boolean): void {
    if (this.proximityFrozen === frozen) return;
    this.proximityFrozen = frozen;
    if (frozen) this.setPeek(false);
  }

  pickerDisarm(): void {
    this.picker.disarm();
  }

  pickerPick(x: number, y: number): void {
    this.picker.pick(x, y);
  }

  // ---- internals -------------------------------------------------------

  /**
   * Reload the guest page and mark the rim kind (specs/025). The veil and the
   * failure view own their loads, so a reload under either gets no rim.
   */
  private reloadSite(kind: ReloadKind): void {
    this.pendingReloadKind =
      this.shownUrl !== null && !this.showLoading && !this.failed ? kind : null;
    if (kind === "hard") {
      this.siteView.webContents.reloadIgnoringCache();
    } else {
      this.siteView.webContents.reload();
    }
  }

  /**
   * A main-frame document navigation began. When the guest page is already on
   * screen and no full-screen veil owns the load, the rim mirrors it — reloads,
   * link clicks, history moves, and same-origin palette navigations alike. A
   * site switch, cold start, or failure load keeps the veil as its sole surface.
   * In-page routes never reach here (specs/025).
   */
  private handleNavigateStart(url: string): void {
    const isReload = isReloadNavigation(url, this.shownUrl);
    const pending = this.pendingReloadKind;
    this.pendingReloadKind = null;

    if (this.showLoading || this.failed || this.shownUrl === null) {
      this.setReloading(null);
      return;
    }

    // A pending command decides a reload's kind; a redirect (or any follow-up
    // navigation in the same load) keeps the kind already on screen.
    const active = this.reloading === null ? null : this.reloading.hard ? "hard" : "normal";
    this.setReloading({ hard: rimKindFor(isReload, pending, active) === "hard" });
  }

  /** Shows, refreshes, or clears the transient load rim (specs/025). */
  private setReloading(next: { hard: boolean } | null): void {
    if (next === null) {
      if (this.reloading === null) return;
      this.reloading = null;
      this.sendToShell("viewport:reloading", null);
      this.relayout(true);
      return;
    }
    if (this.reloading?.hard === next.hard) return;
    this.reloading = next;
    this.sendToShell("viewport:reloading", {
      hard: next.hard,
      url: this.requestedTarget ?? this.currentUrl,
    });
    this.relayout();
  }

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
    // The veil owns a site switch; otherwise the rim follows the navigation.
    if (veil) this.setReloading(null);
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
    // A fresh document can carry a different origin's default zoom; re-assert ours.
    this.applyZoomFactor();
    if (url) {
      this.currentUrl = url;
      this.shownUrl = url;
      this.targetEverLoaded = true;
      this.store.patchWindow(this.windowId, { target: url });
      this.store.recordRecent(url);
    }
    this.reportLoading(false);
    this.sendToShell("viewport:ready", { url });
    this.broadcastState();
    this.reportHistoryAvailability();
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
    // Any navigation — including the one a committed swipe just triggered, or one
    // from a link or the palette — drops the armed overlay (specs/015).
    this.clearHistoryArm();
    // History moved (or a fresh load replaced the stack): refresh the strip's
    // back/forward availability before the early return below.
    this.reportHistoryAvailability();
    // Keep this window's zoom across navigation (Chromium remembers it per origin).
    this.applyZoomFactor();
    if (!url || url === this.currentUrl) return;
    this.currentUrl = url;
    this.shownUrl = url;
    this.targetEverLoaded = true;
    this.store.patchWindow(this.windowId, { target: url });
    this.broadcastState();
  }

  private handleFailed(url: string, reason: string): void {
    // Ignore a late failure from a navigation that has since been superseded.
    if (this.requestedTarget && sameUrl(url, this.requestedTarget) === false) return;
    this.setReloading(null);
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
    if (!loading) {
      this.showLoading = false;
      this.setReloading(null);
    }
    this.relayout();
    this.reportLoading(this.showLoading);
  }

  private reportLoading(loading: boolean): void {
    this.sendToShell("viewport:loading", {
      loading,
      url: this.requestedTarget ?? this.currentUrl,
    });
  }

  private openPalette(initial: string, scope: Scope = "all"): void {
    this.paletteOpen = true;
    // Pull in targets other instances recorded since our last read (FR-004).
    this.store.refreshRecents();
    this.relayout();
    this.broadcastState();
    this.sendToShell("palette:open", { initial, scope });
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
    // In titlebar mode the strip is already permanent (specs/016). Leave the
    // persisted pin untouched so the overlay layout the developer had is exactly
    // the one they get back when the mode ends.
    if (this.titlebarActive()) return;
    const pinned = !(this.record()?.stripVisible ?? false);
    this.store.patchWindow(this.windowId, { stripVisible: pinned });
    // Pinning grows the overlay to the strip height; unpinning defers the shrink so
    // the renderer's leave animation is not cut (specs/013, settle protocol).
    // `relayout` refreshes the traffic lights off the shared predicate.
    this.broadcastState();
    this.relayout(true);
  }

  /**
   * Toggles titlebar mode (specs/016): the strip docks permanently and the guest
   * content is pushed below it. Enabling applies at once; disabling restores the
   * page to full immediately while the shell's `strip -> band` shrink defers
   * through the settle protocol so the strip's leave animation is not cut (the
   * same path unpinning uses).
   */
  private toggleTitlebar(): void {
    const next = !this.titlebarActive();
    this.store.patchWindow(this.windowId, { titlebarMode: next });
    if (next) this.setPeek(false);
    this.broadcastState();
    this.relayout(true);
  }

  private readonly handleNativeThemeUpdated = (): void => {
    // Only this window's "system" mode follows live OS switches; explicit
    // overrides stick. Theme is per-window (FR-009).
    if ((this.record()?.colorMode ?? "system") === "system") this.pushTheme();
  };

  /**
   * Pushes this window's theme to its background, shell and docked DevTools.
   * `nativeTheme` is intentionally NOT set: it is process-wide and would make one
   * window's color mode change every window (and the guest page). Those follow
   * the OS; only the tool's own surfaces are per-window.
   */
  private applyTheme(): void {
    this.pushTheme();
  }

  /** Dropped whenever the palette closes or a variant is committed. */
  private clearThemePreview(): void {
    if (this.previewVariantSlug === null) return;
    this.previewVariantSlug = null;
    this.pushTheme();
  }

  private activeVariant(): VariantSlug {
    return this.previewVariantSlug ?? this.record()?.variant ?? "obsidian";
  }

  /** Pushes the active variant + resolved mode to the window background and shell. */
  private pushTheme(): void {
    if (this.win.isDestroyed()) return;
    this.win.setBackgroundColor(this.backgroundColor());
    this.sendToShell("theme:apply", {
      variant: this.activeVariant(),
      colorMode: this.record()?.colorMode ?? "system",
      resolved: this.resolvedMode(),
    });
    // The docked DevTools follow this window's variant too.
    this.devtools.refreshTheme();
  }

  private resolvedMode(): "dark" | "light" {
    const mode = this.record()?.colorMode ?? "system";
    if (mode === "dark" || mode === "light") return mode;
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }

  private backgroundColor(): string {
    const tokens = TLAPALLI_TOKENS[this.activeVariant()] ?? TLAPALLI_TOKENS.obsidian;
    return tokens[this.resolvedMode()]["--tb-bg"];
  }

  private broadcastState(): void {
    this.sendToShell("state:changed", this.getState());
  }

  /**
   * Pushes whether history can move in each direction, so the strip's back and
   * forward buttons can disable themselves. Transient (never persisted): it
   * tracks the live guest navigation stack.
   */
  private reportHistoryAvailability(): void {
    const history = this.siteView.webContents.navigationHistory;
    this.sendToShell("history:availability", {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });
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
    // Start the renderer in sync with the current transient reveal.
    this.sendToShell("strip:peek", this.peek);
    this.sendToShell("history:armed", this.historyArmed);
    this.reportHistoryAvailability();
    this.applyTheme();
    this.pickerDisarm();
    // A brand-new window starts blank and offers the location entry (FR-011).
    if (!this.targetEverLoaded && !this.currentUrl && !this.paletteOpen) {
      this.openPalette("", "location");
    }
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
      this.devPreview ||
      // The load rim wraps the page edges and needs the whole window, so the
      // shell spans it while the rim is up (specs/025).
      this.reloading !== null ||
      // The zoom and viewport readouts render in the shell (specs/023/024), so the
      // shell must span the window to paint the page's corners.
      this.zoomStatus !== null ||
      this.viewportStatus !== null ||
      // An armed history signal paints a full-height edge overlay, so the shell
      // must span the window to host it (specs/015).
      isHistoryArmedVisible(this.historyArmed, this.paletteOpen) ||
      // A blank window (no target yet) keeps the shell full-window so its
      // watermark backdrop stays painted even after the location palette is
      // dismissed; the band would clip it to the top strip.
      isBlankSurfaceVisible({ target: this.record()?.target ?? null })
    ) {
      return "full";
    }
    // The thin transparent band is always present so the window is always
    // draggable and can sense a reveal; when the strip is pinned or peeking the
    // overlay grows just enough to paint it (specs/013).
    return isStripSurfaceVisible(
      {
        stripVisible: this.record()?.stripVisible ?? false,
        peeking: this.peek,
        titlebarMode: this.titlebarActive(),
      },
      this.paletteOpen,
    )
      ? "strip"
      : "band";
  }

  /**
   * The macOS traffic lights are real AppKit controls that Electron hides on a
   * frameless window. Showing them only while the drag strip is on screen keeps
   * the chromeless default: the strip is the window's title bar, so the controls
   * belong to it — pinned with `⌘B` or transiently revealed by the pointer
   * (specs/013). Mirrors the strip's render condition exactly
   * (`(stripVisible || peeking) && !paletteOpen`); both sides read the shared
   * predicate so they can never drift. A cached value keeps the frequent
   * resize-driven relayouts from re-issuing the native call.
   */
  private syncWindowButtons(): void {
    const visible = isStripSurfaceVisible(
      {
        stripVisible: this.record()?.stripVisible ?? false,
        peeking: this.peek,
        titlebarMode: this.titlebarActive(),
      },
      this.paletteOpen,
    );
    if (visible === this.buttonsVisible) return;
    this.buttonsVisible = visible;
    if (!this.win.isDestroyed()) this.win.setWindowButtonVisibility(visible);
  }

  // ---- always-on drag band (specs/013) --------------------------------

  /** Starts sampling the pointer for the band; safe to call repeatedly. */
  private startProximity(): void {
    if (this.proximityTimer || this.win.isDestroyed()) return;
    this.proximityTimer = setInterval(() => this.sampleProximity(), PROXIMITY_POLL_MS);
    this.sampleProximity();
  }

  private stopProximity(): void {
    if (this.proximityTimer) {
      clearInterval(this.proximityTimer);
      this.proximityTimer = null;
    }
    this.proximity.reset();
    this.setPeek(false);
  }

  private sampleProximity(): void {
    if (this.win.isDestroyed()) {
      this.stopProximity();
      return;
    }
    // A hidden or minimized window has nothing to sense; clear and wait.
    if (!this.win.isVisible()) {
      this.proximity.reset();
      this.setPeek(false);
      return;
    }
    this.setPeek(
      this.proximity.update({
        cursor: screen.getCursorScreenPoint(),
        bounds: this.win.getContentBounds(),
        now: Date.now(),
        paused: this.proximityPaused(),
        dragging: this.dragging,
      }),
    );
  }

  private proximityPaused(): boolean {
    return (
      !this.win.isFocused() ||
      this.proximityFrozen ||
      this.titlebarActive() ||
      this.paletteOpen ||
      this.showLoading ||
      this.failed ||
      this.extensionStatus !== null ||
      this.devPreview !== null
    );
  }

  /** Applies a peek change to this window's strip and traffic lights. */
  private setPeek(peeking: boolean): void {
    if (peeking === this.peek) return;
    this.peek = peeking;
    this.sendToShell("strip:peek", peeking);
    // A reveal grows the overlay so the strip is not clipped (applied at once); a
    // dismiss defers the shrink so the strip's leave animation is not cut and runs
    // through the settle protocol (specs/013, contracts/settle-protocol.md).
    this.relayout(!peeking);
  }

  /**
   * Marks the window as being dragged: the tracker holds the strip's current
   * state for the drag, then normal pointer rules resume after the last move.
   */
  private noteWindowMoved(): void {
    if (!this.win.isFocused()) return;
    this.dragging = true;
    if (this.dragSettleTimer) clearTimeout(this.dragSettleTimer);
    this.dragSettleTimer = setTimeout(() => {
      this.dragSettleTimer = null;
      this.dragging = false;
    }, DRAG_SETTLE_MS);
  }

  private clearDragSuppress(): void {
    if (this.dragSettleTimer) {
      clearTimeout(this.dragSettleTimer);
      this.dragSettleTimer = null;
    }
    this.dragging = false;
  }

  /**
   * Applies view bounds. A deferred, smaller mode keeps the current bounds
   * until the renderer's leave settles or the safety timeout fires, so exit
   * animations are never cut; motion is best-effort and never blocks state.
   */
  private relayout(defer = false): void {
    // A guest view can still emit load events while its window is tearing down;
    // never touch a destroyed BaseWindow (specs/012-multi-window fix).
    if (this.win.isDestroyed()) return;
    this.syncWindowButtons();
    const { width, height } = this.win.getContentBounds();
    // Titlebar mode docks the strip and pushes the guest content (and any docked
    // DevTools) below it, so the page viewport reflects the reduced height; the
    // default overlay keeps the page full-bleed (specs/016).
    const inset = titlebarInset(this.titlebarActive());
    this.siteView.setBounds({ x: 0, y: inset, width, height: Math.max(0, height - inset) });

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
    if (this.win.isDestroyed()) return;
    const { width, height } = this.win.getContentBounds();
    if (mode === "full") {
      this.shellView.setBounds({ x: 0, y: 0, width, height });
    } else {
      const bandHeight = mode === "strip" ? STRIP_HEIGHT : DRAG_BAND_HEIGHT;
      this.shellView.setBounds({ x: 0, y: 0, width, height: bandHeight });
    }
    this.shellView.setVisible(true);
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
