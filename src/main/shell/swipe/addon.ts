/**
 * Types for the swipe-navigation Node-API addon (native/swipe-navigation).
 *
 * The addon decides nothing about navigation: it watches macOS scroll events,
 * asks `onBegin` whether a gesture should be tracked, reports progress, and
 * reports the release outcome. Everything above it (history availability, which
 * view, whether to navigate) lives in `swipe.ts`.
 */

/**
 * Which way content travels under the fingers: `left` uncovers what came before
 * the page, `right` what came after it.
 */
export type SwipeDirection = "left" | "right";

export interface SwipeBeginRequest {
  /**
   * The event window's content view, the same `NSView*` a window's
   * `getNativeWindowHandle()` holds. Lets the controller find the window.
   */
  windowHandle: Buffer;
  /** Where the pointer is in the window, in top-left-origin points. */
  x: number;
  y: number;
  direction: SwipeDirection;
  /** Whether the fingers came down while the last swipe was still settling. */
  whileSettling: boolean;
}

export interface SwipeTarget {
  /** Echoed back on progress and at the end so the caller can find the view. */
  id: number;
}

export interface SwipeNavigationTuning {
  /**
   * The gesture progress at or above which one AppKit finished without first
   * reporting a release counts as a navigation. AppKit animates the amount to
   * exactly `1` for a completed swipe and back to `0` for one it did not.
   */
  completionAmount: number;
  /** How far horizontal scroll must beat vertical before it counts as a swipe. */
  horizontalDominanceRatio: number;
  /** Points of horizontal scroll below which a gesture is only jitter. */
  minimumHorizontalDelta: number;
  /** Points of vertical scroll after which a gesture can no longer become a swipe. */
  maximumVerticalDelta: number;
}

export interface SwipeNavigationAddonOptions extends SwipeNavigationTuning {
  /**
   * Answers whether the gesture should navigate, with the target view, or
   * nothing to leave the scrolling to the page. Called while the event waits to
   * be delivered, so it must not await anything.
   */
  onBegin: (request: SwipeBeginRequest) => SwipeTarget | undefined;
  /** Left out unless something is listening, since it runs once a frame. */
  onProgress?: (id: number, progress: number) => void;
  onEnd: (id: number, direction: SwipeDirection, committed: boolean, maxProgress: number) => void;
}

export interface SwipeNavigationAddon {
  /** The "Swipe between pages" setting in System Settings. */
  isSwipeTrackingEnabled: () => boolean;
  start: (options: SwipeNavigationAddonOptions) => void;
  stop: () => void;
}
