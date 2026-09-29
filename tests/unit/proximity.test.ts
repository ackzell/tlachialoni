import { describe, expect, it } from "vitest";
import {
  DWELL_MS,
  GRACE_MS,
  PROXIMITY_PX,
  ProximityTracker,
  type ProximityBounds,
} from "../../src/main/shell/proximity";
import { DRAG_BAND_HEIGHT, STRIP_HEIGHT } from "../../src/shared/shell";

const BOUNDS: ProximityBounds = { x: 100, y: 200, width: 1000, height: 800 };

/** An offset inside the thin trigger band but past the proximity reveal zone. */
const DWELL_OFFSET = DRAG_BAND_HEIGHT - 2;
/** An offset inside the taller strip, below the thin band. */
const STRIP_OFFSET = STRIP_HEIGHT - 4;

function cursorInBand(offsetY: number, offsetX = 500): { x: number; y: number } {
  return { x: BOUNDS.x + offsetX, y: BOUNDS.y + offsetY };
}

describe("ProximityTracker", () => {
  it("reveals immediately when the pointer touches the top edge", () => {
    const tracker = new ProximityTracker();
    const peeking = tracker.update({
      cursor: cursorInBand(PROXIMITY_PX),
      bounds: BOUNDS,
      now: 0,
      paused: false,
    });
    expect(peeking).toBe(true);
  });

  it("does not reveal below the edge before the dwell elapses", () => {
    const tracker = new ProximityTracker();
    // Inside the thin band but past the 4px edge: the dwell zone.
    expect(
      tracker.update({ cursor: cursorInBand(DWELL_OFFSET), bounds: BOUNDS, now: 0, paused: false }),
    ).toBe(false);
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: DWELL_MS - 1,
        paused: false,
      }),
    ).toBe(false);
  });

  it("reveals after dwelling in the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(DWELL_OFFSET), bounds: BOUNDS, now: 0, paused: false });
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: DWELL_MS,
        paused: false,
      }),
    ).toBe(true);
  });

  it("does not reveal below the thin band, even after the dwell", () => {
    const tracker = new ProximityTracker();
    // The strip region (below the band) is not a reveal trigger while hidden.
    expect(
      tracker.update({ cursor: cursorInBand(STRIP_OFFSET), bounds: BOUNDS, now: 0, paused: false }),
    ).toBe(false);
    expect(
      tracker.update({
        cursor: cursorInBand(STRIP_OFFSET),
        bounds: BOUNDS,
        now: DWELL_MS * 4,
        paused: false,
      }),
    ).toBe(false);
  });

  it("stays revealed while the pointer remains inside the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: 1000,
        paused: false,
      }),
    ).toBe(true);
  });

  it("keeps the strip while the pointer travels down onto it", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    // Below the thin band but inside the revealed strip: the controls stay usable.
    tracker.update({
      cursor: cursorInBand(STRIP_OFFSET),
      bounds: BOUNDS,
      now: 100,
      paused: false,
    });
    expect(
      tracker.update({
        cursor: cursorInBand(STRIP_OFFSET),
        bounds: BOUNDS,
        now: 100 + GRACE_MS * 2,
        paused: false,
      }),
    ).toBe(true);
  });

  it("keeps the strip during the grace period after leaving the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    const below = { x: BOUNDS.x + 500, y: BOUNDS.y + 200 };
    expect(tracker.update({ cursor: below, bounds: BOUNDS, now: 100, paused: false })).toBe(true);
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 100 + GRACE_MS - 1, paused: false }),
    ).toBe(true);
  });

  it("dismisses once the grace period elapses outside the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    const below = { x: BOUNDS.x + 500, y: BOUNDS.y + 200 };
    tracker.update({ cursor: below, bounds: BOUNDS, now: 100, paused: false });
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 100 + GRACE_MS, paused: false }),
    ).toBe(false);
  });

  it("cancels dismissal when the pointer re-enters during the grace period", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    const below = { x: BOUNDS.x + 500, y: BOUNDS.y + 200 };
    tracker.update({ cursor: below, bounds: BOUNDS, now: 100, paused: false });
    // Re-enter mid-grace, then leave again: the grace restarts from the new exit.
    tracker.update({ cursor: cursorInBand(10), bounds: BOUNDS, now: 300, paused: false });
    tracker.update({ cursor: below, bounds: BOUNDS, now: 400, paused: false });
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 400 + GRACE_MS - 1, paused: false }),
    ).toBe(true);
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 400 + GRACE_MS, paused: false }),
    ).toBe(false);
  });

  it("does not reveal a hidden strip while dragging", () => {
    const tracker = new ProximityTracker();
    const sample = (offsetY: number, now: number) => ({
      cursor: cursorInBand(offsetY),
      bounds: BOUNDS,
      now,
      paused: false,
      dragging: true,
    });
    // Cursor in the band, even at the edge, but the strip was hidden: a drag
    // must not create a reveal.
    expect(tracker.update(sample(2, 0))).toBe(false);
    expect(tracker.update(sample(DWELL_OFFSET, 1000))).toBe(false);
  });

  it("keeps a visible strip during a drag, even with the pointer outside the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false }); // reveal
    const below = { x: BOUNDS.x + 500, y: BOUNDS.y + 200 };
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 100, paused: false, dragging: true }),
    ).toBe(true);
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 5000, paused: false, dragging: true }),
    ).toBe(true);
  });

  it("dismisses after the drag ends when the pointer is away", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false }); // reveal
    const below = { x: BOUNDS.x + 500, y: BOUNDS.y + 200 };
    tracker.update({ cursor: below, bounds: BOUNDS, now: 100, paused: false, dragging: true });
    expect(tracker.update({ cursor: below, bounds: BOUNDS, now: 200, paused: false })).toBe(true);
    expect(
      tracker.update({ cursor: below, bounds: BOUNDS, now: 200 + GRACE_MS, paused: false }),
    ).toBe(false);
  });

  it("keeps a visible strip after the drag when the pointer stays in the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false }); // reveal
    tracker.update({
      cursor: cursorInBand(DWELL_OFFSET),
      bounds: BOUNDS,
      now: 100,
      paused: false,
      dragging: true,
    });
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: 1000,
        paused: false,
      }),
    ).toBe(true);
  });

  it("lets a hidden strip reveal by dwell after the drag ends", () => {
    const tracker = new ProximityTracker();
    tracker.update({
      cursor: cursorInBand(DWELL_OFFSET),
      bounds: BOUNDS,
      now: 0,
      paused: false,
      dragging: true,
    });
    // Still hidden when the drag ends, then the normal dwell applies.
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: 100,
        paused: false,
      }),
    ).toBe(false);
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: 100 + DWELL_MS,
        paused: false,
      }),
    ).toBe(true);
  });

  it("clears the peek and resets when paused", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    expect(tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 50, paused: true })).toBe(
      false,
    );
    expect(tracker.isPeeking).toBe(false);
    // Resuming restarts the dwell, so an immediate sample is not revealed.
    expect(
      tracker.update({
        cursor: cursorInBand(DWELL_OFFSET),
        bounds: BOUNDS,
        now: 60,
        paused: false,
      }),
    ).toBe(false);
  });

  it("treats a cursor outside the window width as outside the band", () => {
    const tracker = new ProximityTracker();
    tracker.update({ cursor: cursorInBand(2), bounds: BOUNDS, now: 0, paused: false });
    const offRight = { x: BOUNDS.x + BOUNDS.width + 1, y: BOUNDS.y + 2 };
    tracker.update({ cursor: offRight, bounds: BOUNDS, now: 100, paused: false });
    expect(
      tracker.update({ cursor: offRight, bounds: BOUNDS, now: 100 + GRACE_MS, paused: false }),
    ).toBe(false);
  });

  it("treats a cursor above the window as outside the band", () => {
    const tracker = new ProximityTracker();
    const above = { x: BOUNDS.x + 500, y: BOUNDS.y - 5 };
    expect(tracker.update({ cursor: above, bounds: BOUNDS, now: 0, paused: false })).toBe(false);
  });
});
