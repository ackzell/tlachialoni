/**
 * Trackpad swipe navigation for macOS (specs/015, native path).
 *
 * The native addon (native/swipe-navigation) watches the scroll stream and uses
 * AppKit's `trackSwipeEventWithOptions` to own the rubber-band physics and the
 * release decision. This controller is the JS half: it answers whether a gesture
 * should be tracked (history available? page already at its side edge? not over
 * DevTools?), routes the gesture to the right window, and navigates on commit.
 *
 * Nothing here touches the guest page. The addon only listens to input, and the
 * overlay is painted by the shell renderer (see `history:armed`).
 */

import type { PageScrollEdge } from "@shared/scroll-edge";
import type { SwipeBeginRequest, SwipeDirection } from "./addon";
import { loadSwipeNavigationAddon } from "./load";
import { SWIPE_NAVIGATION_TUNING } from "./tuning";

type SwipeAction = "back" | "forward";

/**
 * Which window a gesture belongs to, and what it should do. Resolved by the
 * window's `onBegin` hook; the controller keeps only the identity across
 * progress/end.
 */
export interface SwipeGestureTarget {
  action: SwipeAction;
  /** Stable id echoed back by the addon; a window's site webContents id. */
  id: number;
}

/**
 * The window-side half of the integration. `AppWindow` implements this so the
 * controller can ask about a specific window without knowing its internals.
 */
export interface SwipeWindow {
  /** The native window handle to match against a scroll event. */
  nativeHandle(): Buffer;
  /** Whether the page under the pointer can still scroll horizontally. */
  pageScrollEdge(): PageScrollEdge;
  /** True while focus is inside the docked DevTools panel. */
  isDevToolsFocused(): boolean;
  /** Whether the pointer is over the DevTools panel (not the page). */
  isPointerOverDevTools(x: number, y: number): boolean;
  canGoBack(): boolean;
  canGoForward(): boolean;
  /** The guest webContents id, echoed back by the addon. */
  siteWebContentsId(): number;
  /** A gesture began; drives the armed overlay. */
  onSwipeProgress(action: SwipeAction, progress: number): void;
  /** A gesture ended; clears the overlay and, if committed, navigates. */
  onSwipeEnd(action: SwipeAction, committed: boolean): void;
}

/**
 * Owns the process-wide addon and the one scroll monitor. The monitor is
 * process-global, so there is exactly one controller; windows register with it
 * and are matched by their native handle.
 */
export class SwipeNavigation {
  private addon: ReturnType<typeof loadSwipeNavigationAddon> | null = null;
  private started = false;
  private readonly windows = new Set<SwipeWindow>();
  /** The window a live gesture belongs to, resolved at `onBegin`. */
  private gesture: { window: SwipeWindow; target: SwipeGestureTarget } | null = null;

  /**
   * Loads the addon and starts the monitor. Safe to call before any window
   * exists; windows register as they are created. A missing or broken addon
   * leaves swiping off and everything else working.
   */
  start(): void {
    if (this.started) return;
    if (process.platform !== "darwin") return;

    try {
      this.addon = loadSwipeNavigationAddon(__dirname);
    } catch (error) {
      console.warn(
        "Swipe navigation is unavailable:",
        error instanceof Error ? error.message : error,
      );
      return;
    }

    this.addon.start({
      ...SWIPE_NAVIGATION_TUNING,
      onBegin: this.handleBegin,
      onProgress: this.handleProgress,
      onEnd: this.handleEnd,
    });

    this.started = true;
    console.info("Swipe navigation started");
    if (!this.addon.isSwipeTrackingEnabled()) {
      console.info("Swipe navigation idle: 'Swipe between pages' is off in System Settings");
    }
  }

  stop(): void {
    if (!this.started || !this.addon) return;
    this.addon.stop();
    this.started = false;
    this.addon = null;
    this.gesture = null;
  }

  register(window: SwipeWindow): void {
    this.windows.add(window);
  }

  unregister(window: SwipeWindow): void {
    this.windows.delete(window);
    if (this.gesture?.window === window) this.gesture = null;
  }

  /** The window a scroll event's content-view handle belongs to. */
  private windowFor(handle: Buffer): SwipeWindow | null {
    for (const window of this.windows) {
      if (window.nativeHandle().equals(handle)) return window;
    }
    // Fallback: Electron's macOS handle is the window's content view, and a
    // BaseWindow's root view should match, but if a platform detail ever makes
    // the comparison miss, a single open window is unambiguous.
    if (this.windows.size === 1) return this.windows.values().next().value ?? null;
    return null;
  }

  private readonly handleBegin = (request: SwipeBeginRequest): { id: number } | undefined => {
    const window = this.windowFor(request.windowHandle);
    if (!window) return undefined;

    const action: SwipeAction = request.direction === "left" ? "back" : "forward";

    // History has to move in the direction the swipe is heading.
    if (action === "back" ? !window.canGoBack() : !window.canGoForward()) return undefined;

    // The page comes first: if something under the pointer can still scroll that
    // way, this is a page scroll, not a navigation.
    const edges = window.pageScrollEdge();
    if (action === "back" ? edges.canScrollLeft : edges.canScrollRight) return undefined;

    // A swipe over focused DevTools must scroll DevTools, never the guest page.
    if (window.isDevToolsFocused()) return undefined;
    if (window.isPointerOverDevTools(request.x, request.y)) return undefined;

    const target: SwipeGestureTarget = { action, id: window.siteWebContentsId() };
    this.gesture = { window, target };
    return { id: target.id };
  };

  private readonly handleProgress = (id: number, progress: number): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.target.id !== id) return;
    gesture.window.onSwipeProgress(gesture.target.action, progress);
  };

  private readonly handleEnd = (
    id: number,
    _direction: SwipeDirection,
    committed: boolean,
    _maxProgress: number,
  ): void => {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture || gesture.target.id !== id) return;
    gesture.window.onSwipeEnd(gesture.target.action, committed);
  };
}

/** The process-wide controller. */
export const swipeNavigation = new SwipeNavigation();
