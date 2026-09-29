/**
 * Pure pointer-proximity tracker for the always-on drag band (specs/013).
 *
 * Electron draggable regions ignore all pointer events, so the band cannot sense
 * the pointer itself; main samples the cursor and this tracker decides whether
 * the strip should be peeking. It owns no timers — `update` is called on an
 * interval and receives the timestamp, so the whole state machine is testable
 * without a running window.
 */

import { DRAG_BAND_HEIGHT, STRIP_HEIGHT } from "@shared/shell";

/** Pointer must be this close to the window top to reveal immediately. */
export const PROXIMITY_PX = 4;

/** Resting this long inside the band reveals the strip. */
export const DWELL_MS = 400;

/** The strip stays this long after the pointer leaves the band. */
export const GRACE_MS = 600;

export interface ProximityBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProximitySample {
  /** Cursor position in screen DIP. */
  cursor: { x: number; y: number };
  /** Window content bounds in screen DIP. */
  bounds: ProximityBounds;
  /** Monotonic millisecond timestamp. */
  now: number;
  /** Unfocused window or a full-window surface. */
  paused: boolean;
  /**
   * A drag holds whatever the strip is already doing: it never creates a reveal
   * when the strip was hidden, and it never dismisses one that was showing. When
   * the drag is not active the pointer rules below apply as usual.
   */
  dragging?: boolean;
}

export class ProximityTracker {
  private peeking = false;
  private inBandSince: number | null = null;
  private leftSince: number | null = null;

  constructor(
    private readonly bandHeight: number = DRAG_BAND_HEIGHT,
    private readonly stripHeight: number = STRIP_HEIGHT,
    private readonly proximity: number = PROXIMITY_PX,
    private readonly dwellMs: number = DWELL_MS,
    private readonly graceMs: number = GRACE_MS,
  ) {}

  get isPeeking(): boolean {
    return this.peeking;
  }

  /** Feeds one sample and returns the resulting peek state. */
  update(sample: ProximitySample): boolean {
    if (sample.paused) {
      this.reset();
      return false;
    }

    // A drag (or a future double-click interaction) holds the current state:
    // it neither reveals a hidden strip nor dismisses a visible one.
    if (sample.dragging) {
      if (this.peeking) this.leftSince = null;
      return this.peeking;
    }

    const relX = sample.cursor.x - sample.bounds.x;
    const relY = sample.cursor.y - sample.bounds.y;
    const withinX = relX >= 0 && relX < sample.bounds.width;
    const withinY = relY >= 0 && relY < sample.bounds.height;
    // The reveal trigger is the thin band, but once the strip is showing the pointer
    // may travel down onto it (the strip is taller than the band); the larger held
    // region keeps it revealed so its controls stay usable (FR-006).
    const heldHeight = this.peeking ? this.stripHeight : this.bandHeight;
    const inBand = withinX && withinY && relY < this.bandHeight;
    const inHeld = withinX && withinY && relY < heldHeight;

    if (!inHeld) {
      this.inBandSince = null;
      this.leftSince ??= sample.now;
      if (this.peeking && sample.now - this.leftSince >= this.graceMs) {
        this.peeking = false;
      }
      return this.peeking;
    }

    // Inside the held region: cancel any pending dismissal.
    this.leftSince = null;

    // Touching the very top reveals at once, without waiting for the dwell.
    if (withinX && relY >= 0 && relY <= this.proximity) {
      this.peeking = true;
      this.inBandSince ??= sample.now;
      return this.peeking;
    }

    if (this.peeking) return true;

    // Still hidden: only the thin band can start the dwell. When not peeking the
    // held region equals the band, so this is always true here.
    if (!inBand) return false;

    this.inBandSince ??= sample.now;
    if (sample.now - this.inBandSince >= this.dwellMs) this.peeking = true;
    return this.peeking;
  }

  reset(): void {
    this.peeking = false;
    this.inBandSince = null;
    this.leftSince = null;
  }
}
