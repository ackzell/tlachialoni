/// <reference lib="dom" />

import type { PageScrollEdge, ScrollEdgeCandidate } from "@shared/scroll-edge";
import { PAGE_AT_BOTH_EDGES, resolveScrollEdge } from "@shared/scroll-edge";

/** How often pointer/scroll movement re-reads the page, at most. */
const SCROLL_EDGE_THROTTLE_MS = 100;

function readCandidate(
  element: Element,
  isViewport: boolean,
  overflowX?: string,
): ScrollEdgeCandidate {
  const style = window.getComputedStyle(element);

  return {
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowX: overflowX ?? style.overflowX,
    overscrollBehaviorX: style.overscrollBehaviorX,
    direction: style.direction,
    isViewport,
  };
}

/**
 * A root left at `overflow-x: visible` takes the body's value for the viewport,
 * as CSS propagates it, while the body's own box then clips nothing, although
 * `getComputedStyle` still reports the value on the body for both.
 */
function readViewportOverflows(): { root: string; body: string } | undefined {
  const root = document.documentElement;
  const { body } = document;

  if (
    !body ||
    document.scrollingElement !== root ||
    window.getComputedStyle(root).overflowX !== "visible"
  ) {
    return undefined;
  }

  return { root: window.getComputedStyle(body).overflowX, body: "visible" };
}

function readChain(element: Element | null): ScrollEdgeCandidate[] {
  const chain: ScrollEdgeCandidate[] = [];
  const viewportOverflows = readViewportOverflows();

  for (let current = element; current; current = current.parentElement) {
    const overflowX =
      current === document.documentElement
        ? viewportOverflows?.root
        : current === document.body
          ? viewportOverflows?.body
          : undefined;

    chain.push(readCandidate(current, current === document.scrollingElement, overflowX));
  }

  return chain;
}

/**
 * Keeps the main process told what the page under the pointer can still scroll,
 * because a swipe has to be answered while its scroll event waits to be
 * delivered and there is no time to ask the page then.
 *
 * `wheel` matters as much as `pointermove`: scrolling a carousel to its end
 * moves no pointer, and the state at that moment is what the next gesture is
 * judged on.
 *
 * Passive and capture-only — the page scrolls exactly as it would without us.
 */
export function observePageScrollEdge(send: (pageScrollEdge: PageScrollEdge) => void): void {
  let pointer: { x: number; y: number } | undefined;
  let sent = PAGE_AT_BOTH_EDGES;
  let lastUpdatedAt = 0;
  let trailingUpdate: ReturnType<typeof setTimeout> | undefined;

  send(sent);

  const update = (): void => {
    if (!pointer) return;

    const pageScrollEdge = resolveScrollEdge(
      readChain(document.elementFromPoint(pointer.x, pointer.y)),
    );

    if (
      sent.canScrollLeft === pageScrollEdge.canScrollLeft &&
      sent.canScrollRight === pageScrollEdge.canScrollRight
    ) {
      return;
    }

    sent = pageScrollEdge;
    send(pageScrollEdge);
  };

  const throttledUpdate = (): void => {
    const elapsed = Date.now() - lastUpdatedAt;

    if (elapsed < SCROLL_EDGE_THROTTLE_MS) {
      // Where a scroller comes to rest is the state the next gesture is judged
      // on, and it arrives in the last event of a burst, which the leading edge
      // alone would drop.
      trailingUpdate ??= setTimeout(() => {
        trailingUpdate = undefined;
        lastUpdatedAt = Date.now();
        update();
      }, SCROLL_EDGE_THROTTLE_MS - elapsed);

      return;
    }

    lastUpdatedAt = Date.now();
    update();
  };

  const trackPointer = (event: PointerEvent): void => {
    pointer = { x: event.clientX, y: event.clientY };
    throttledUpdate();
  };

  window.addEventListener("pointermove", trackPointer, { passive: true });

  // Inside an iframe, such as a page's side panel, this window gets no more
  // pointer or wheel events, so entering one is the last word on where the
  // pointer is.
  window.addEventListener("pointerover", trackPointer, { capture: true, passive: true });

  window.addEventListener(
    "wheel",
    (event) => {
      // A scroll is the first thing a fresh page gets, and until something says
      // where the pointer is there is nothing to read the chain from.
      pointer = { x: event.clientX, y: event.clientY };
      throttledUpdate();
    },
    { capture: true, passive: true },
  );

  window.addEventListener("scroll", throttledUpdate, { capture: true, passive: true });
}
