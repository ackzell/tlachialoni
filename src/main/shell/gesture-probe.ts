/**
 * TEMPORARY diagnostic probe for the trackpad history gesture (specs/015, M0
 * spike). Observes only — it never changes how the app behaves, and it prints one
 * line per gesture rather than one line per event. Deleted once research.md §10
 * records the outcome.
 *
 * Why one line per gesture: a two-finger swipe emits dozens of events, and
 * dumping them all buries the three facts that actually decide the detector.
 *
 *   1. Do the phases arrive reliably? (begin -> updates -> end, once each)
 *   2. Is released momentum distinguishable from a live finger?
 *   3. How much travel does a deliberate swipe actually produce?
 *
 * A "gesture" here is just a run of input events separated by a pause, so the
 * probe needs no start/stop key: do one pass at a time, and the log labels them
 * #1, #2, ... in the order you performed them.
 */

import type { BaseWindow, Event, InputEvent, WebContentsView } from "electron";

/** Pause that ends one gesture and starts the next. */
const SEGMENT_IDLE_MS = 400;

/** Safety valve so a stuck stream cannot grow without bound. */
const MAX_SAMPLES = 800;

/** The delta fields, read directly because they are native getters. */
interface WheelFields {
  deltaX?: number;
  deltaY?: number;
  canScroll?: boolean;
  hasPreciseScrollingDeltas?: boolean;
}

interface Sample {
  type: string;
  at: number;
  dx: number | undefined;
  dy: number | undefined;
}

/** Events we track; everything else is ignored so the log stays about the gesture. */
const TRACKED = new Set([
  "gestureScrollBegin",
  "gestureScrollUpdate",
  "gestureScrollEnd",
  "gestureFlingStart",
  "gestureFlingCancel",
  "mouseWheel",
]);

/** Shown once at the end so the per-gesture lines stay short. */
function sessionVerdict(label: string, begins: number, gestures: number): void {
  console.log(
    `[probe:${label}] ---- ${gestures} gesture(s), ${begins} begin event(s) total ----\n` +
      `[probe:${label}] If every gesture is one physical flick and begins == gestures,\n` +
      `[probe:${label}] momentum never opens a new gesture and the detector can latch\n` +
      `[probe:${label}] on begin with no cooldown timer.`,
  );
}

export interface GestureProbeHandle {
  dispose: () => void;
}

/** Installs the probe on one view. Returns a handle that removes it again. */
export function installGestureProbe(
  _win: BaseWindow,
  view: WebContentsView,
  label: string,
): GestureProbeHandle {
  let samples: Sample[] = [];
  let lastAt = 0;
  let index = 0;
  let begins = 0;

  const onInput = (_event: Event, input: InputEvent): void => {
    if (!TRACKED.has(input.type)) return;
    const now = Date.now();
    const wheel = input as InputEvent & WheelFields;

    // A pause ends the current gesture. Flush first, then start the new one.
    if (samples.length > 0 && now - lastAt >= SEGMENT_IDLE_MS) {
      report(label, index, samples);
      index += 1;
      samples = [];
    }

    if (input.type === "gestureScrollBegin") begins += 1;
    samples.push({ type: input.type, at: now, dx: wheel.deltaX, dy: wheel.deltaY });
    if (samples.length > MAX_SAMPLES) samples.shift();
    lastAt = now;
  };

  view.webContents.on("input-event", onInput);

  console.log(
    `[probe:${label}] live. Question: does released momentum open a NEW gesture?\n` +
      `[probe:${label}] Do these four passes, pausing ~1s between each:\n` +
      `[probe:${label}]   1. hard flick right, lift immediately\n` +
      `[probe:${label}]   2. hard flick left, lift immediately\n` +
      `[probe:${label}]   3. hard flick right again (repeatability)\n` +
      `[probe:${label}]   4. flick right, then keep the pointer over the page and wait\n` +
      `[probe:${label}]      until the momentum has fully died before doing anything else.\n` +
      `[probe:${label}] Expect beg=1 on every line.`,
  );

  return {
    dispose: () => {
      if (samples.length > 0) report(label, index, samples);
      sessionVerdict(label, begins, index + (samples.length > 0 ? 1 : 0));
      if (!view.webContents.isDestroyed()) view.webContents.removeListener("input-event", onInput);
    },
  };
}

/**
 * Prints one line per gesture, plus a session verdict.
 *
 * The only question this run answers: does released momentum ever open a NEW
 * gesture? `beg` must be 1 for a single flick. A `beg` of 2 or more means
 * momentum re-enters as a fresh gesture and the detector needs an extra guard.
 */
function report(label: string, index: number, samples: Sample[]): void {
  const n = (type: string): number => samples.filter((s) => s.type === type).length;

  const begin = n("gestureScrollBegin");
  const update = n("gestureScrollUpdate");
  const end = n("gestureScrollEnd");

  // Where the begin and end land in the stream. A `beg` in the second half means
  // momentum started a new gesture; `end` late just means the fling decayed first.
  const span = samples.length > 1 ? samples[samples.length - 1].at - samples[0].at : 0;
  const beginAt = samples.findIndex((s) => s.type === "gestureScrollBegin");
  const endAt = samples.findIndex((s) => s.type === "gestureScrollEnd");
  const beginPct =
    beginAt < 0
      ? "n/a"
      : `${Math.round(((samples[beginAt].at - samples[0].at) / Math.max(1, span)) * 100)}%`;
  const endPct =
    endAt < 0
      ? "n/a"
      : `${Math.round(((samples[endAt].at - samples[0].at) / Math.max(1, span)) * 100)}%`;

  // Updates after the end = momentum still running once the platform called it.
  const afterEnd =
    endAt < 0
      ? -1
      : samples.slice(endAt + 1).filter((s) => s.type === "gestureScrollUpdate").length;

  // More than one begin is NOT evidence that momentum restarts: flicking repeatedly
  // with a short pause merges several real gestures into one idle segment, and each
  // brings its own begin/end pair. Momentum would show a begin with NO end before
  // it. So count only those.
  let openBegins = 0;
  for (const s of samples) {
    if (s.type === "gestureScrollBegin") openBegins += 1;
    else if (s.type === "gestureScrollEnd") openBegins = Math.max(0, openBegins - 1);
  }

  const verdict =
    begin === 0
      ? "??  no begin seen — retry this pass"
      : openBegins > 0
        ? `!!  ${openBegins} begin(s) with no end — momentum DOES restart`
        : begin === 1
          ? "OK  one gesture"
          : `OK  ${begin} gestures merged (pauses under ${SEGMENT_IDLE_MS}ms)`;

  console.log(
    `[probe:${label}] #${index + 1}  beg=${begin} upd=${update} end=${end}  ` +
      `begin@${beginPct} end@${endPct}  post-end-updates=${afterEnd}  ` +
      `${String(span).padStart(4)}ms  unclosed=${openBegins}  ${verdict}`,
  );
}
