import type { SwipeNavigationTuning } from "./addon";

/**
 * Every number the feel of a swipe depends on, in one place, so tuning one is a
 * change to this file. `start()` hands the whole object to the addon.
 */
export const SWIPE_NAVIGATION_TUNING: SwipeNavigationTuning = {
  /**
   * The progress at or above which a gesture AppKit finished without first
   * reporting a release counts as a navigation. AppKit animates the amount to
   * exactly `1` for a swipe it completed and back to `0` for one it did not, so
   * anything short of the whole way is a cancel.
   */
  completionAmount: 0.99,

  /**
   * How far the accumulated horizontal scroll of a gesture has to beat its
   * vertical scroll before the gesture counts as horizontal. `1` is what
   * Chromium compares; raising it makes a diagonal flick scroll rather than
   * navigate.
   */
  horizontalDominanceRatio: 1,

  /** Points of horizontal scroll below which a gesture is only jitter. */
  minimumHorizontalDelta: 3,

  /**
   * Points of vertical scroll after which a gesture can no longer become a
   * swipe, however far it then travels sideways. Without it, a page scrolled
   * down and then flicked sideways navigates.
   */
  maximumVerticalDelta: 20,
};
