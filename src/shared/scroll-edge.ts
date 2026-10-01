/**
 * Scroll-edge detection for the trackpad swipe (clean-room).
 *
 * A swipe only navigates when the page under the pointer has nowhere left to go
 * sideways in that direction — the page comes first, as it does in Chrome. This
 * resolves what a chain of scroll containers (the element under the pointer out
 * to the viewport) can still do horizontally.
 */

export interface ScrollEdgeCandidate {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  overscrollBehaviorX: string;
  /** `rtl` puts `scrollLeft` at `0` on the right-hand end and negative from there. */
  direction: string;
  isViewport?: boolean;
}

export interface PageScrollEdge {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

/** A page with nowhere to go sideways, which is how an unread one is treated. */
export const PAGE_AT_BOTH_EDGES: PageScrollEdge = {
  canScrollLeft: false,
  canScrollRight: false,
};

/** Sub-pixel scroll offsets put the end of a scroller off an exact integer. */
const SCROLL_EDGE_EPSILON = 1;

const SCROLL_CONTAINER_OVERFLOWS = new Set(["auto", "scroll", "overlay"]);

/**
 * `hidden` scrolls only programmatically, and it is what truncates a row of text
 * beside `text-overflow: ellipsis` — counting it as a scroller would refuse a
 * swipe anywhere in such a list.
 */
const NON_SCROLLING_OVERFLOWS = new Set(["hidden", "clip"]);

const OVERSCROLL_CONTAINING_BEHAVIORS = new Set(["contain", "none"]);

/** The viewport scrolls on anything but an overflow that cuts the page off. */
function isScrollContainer(candidate: ScrollEdgeCandidate): boolean {
  if (candidate.isViewport === true) {
    return !NON_SCROLLING_OVERFLOWS.has(candidate.overflowX);
  }

  return SCROLL_CONTAINER_OVERFLOWS.has(candidate.overflowX);
}

/**
 * What the page can still do sideways, given the scroll containers from the
 * element under the pointer outwards. A scroller at its edge hands the scroll to
 * the one outside it, so every container in the chain has a say.
 *
 * `overscroll-behavior-x` of `contain` or `none` is how a page keeps a swipe to
 * itself, so a container carrying it claims the gesture in both directions.
 */
export function resolveScrollEdge(chain: ScrollEdgeCandidate[]): PageScrollEdge {
  let canScrollLeft = false;
  let canScrollRight = false;

  for (const candidate of chain) {
    if (!isScrollContainer(candidate)) continue;

    if (OVERSCROLL_CONTAINING_BEHAVIORS.has(candidate.overscrollBehaviorX)) {
      return { canScrollLeft: true, canScrollRight: true };
    }

    const scrollableWidth = candidate.scrollWidth - candidate.clientWidth;

    if (candidate.direction === "rtl") {
      canScrollLeft =
        canScrollLeft || -candidate.scrollLeft < scrollableWidth - SCROLL_EDGE_EPSILON;
      canScrollRight = canScrollRight || candidate.scrollLeft < -SCROLL_EDGE_EPSILON;
    } else {
      canScrollLeft = canScrollLeft || candidate.scrollLeft > SCROLL_EDGE_EPSILON;
      canScrollRight =
        canScrollRight || scrollableWidth - candidate.scrollLeft > SCROLL_EDGE_EPSILON;
    }

    if (canScrollLeft && canScrollRight) break;
  }

  return { canScrollLeft, canScrollRight };
}
