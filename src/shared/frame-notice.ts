/**
 * Markers for frames inside the page that could not load (specs/028).
 *
 * Chromium paints a blocked frame as an opaque white canvas and puts no error
 * page in it. Chrome and Firefox can substitute a document because they own frame
 * loading; Electron cannot load a document into a subframe, so the guest page
 * carries one transient box instead, drawn by the preload in a closed shadow root
 * (constitution II, third sanctioned exception). Living in the page's own document
 * is what lets the box be placed in the same layout pass that reflows the frame.
 */
import type { FramingPolicy } from "./failure";

/** One failed frame, as the guest view reports it. */
export interface FrameFailure {
  url: string;
  reason: string;
  policy: FramingPolicy | null;
}

/** One failed frame as the page draws it. */
export interface FrameMarker {
  url: string;
  reason: string;
  policy: FramingPolicy | null;
  /**
   * Dev preview only: draw the card without waiting for a matching frame. Never
   * set for a real failure (specs/008, specs/028).
   */
  preview?: boolean;
}

/** The theme values the box needs, pushed from main so it follows the window. */
export interface FrameNoticeStyle {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  border: string;
}

/** What main hands the page when the marker set or the theme changes. */
export interface FrameNoticeUpdate {
  markers: FrameMarker[];
  style: FrameNoticeStyle | null;
}

/**
 * Adds a marker unless that address is already marked. A frame that fails twice
 * in one page load is one marker, not two.
 */
export function addFrameMarker(markers: FrameMarker[], failure: FrameFailure): FrameMarker[] {
  if (markers.some((marker) => marker.url === failure.url)) return markers;
  return [...markers, { ...failure }];
}

/**
 * Drops the markers for addresses the page no longer has a frame for. The page
 * reports those itself, because only it can see an iframe removed or repointed.
 */
export function dropFrameMarkers(markers: FrameMarker[], urls: string[]): FrameMarker[] {
  const kept = markers.filter((marker) => !urls.includes(marker.url));
  return kept.length === markers.length ? markers : kept;
}
