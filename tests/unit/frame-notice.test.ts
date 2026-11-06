import { describe, expect, it } from "vitest";
import {
  addFrameMarker,
  dropFrameMarkers,
  type FrameFailure,
  type FrameMarker,
} from "../../src/shared/frame-notice";

const failed = (url: string): FrameFailure => ({
  url,
  reason: "Blocked by the framed site's response headers",
  policy: null,
});

const urls = (markers: FrameMarker[]): string[] => markers.map((marker) => marker.url);

describe("addFrameMarker", () => {
  it("adds one marker per failed frame", () => {
    let markers: FrameMarker[] = [];
    markers = addFrameMarker(markers, failed("https://a.dev/"));
    markers = addFrameMarker(markers, failed("https://b.dev/"));
    expect(urls(markers)).toEqual(["https://a.dev/", "https://b.dev/"]);
  });

  it("does not add the same address twice", () => {
    const once = addFrameMarker([], failed("https://a.dev/"));
    expect(addFrameMarker(once, failed("https://a.dev/"))).toBe(once);
  });

  it("keeps the reason and policy", () => {
    const markers = addFrameMarker([], {
      url: "https://a.dev/",
      reason: "Blocked by the framed site's X-Frame-Options header",
      policy: "x-frame-options",
    });
    expect(markers[0]?.reason).toContain("X-Frame-Options");
    expect(markers[0]?.policy).toBe("x-frame-options");
  });

  it("never marks a real failure as the dev preview", () => {
    const markers = addFrameMarker([], failed("https://a.dev/"));
    expect(markers[0]?.preview).toBeUndefined();
  });
});

describe("dropFrameMarkers", () => {
  const two = (): FrameMarker[] =>
    addFrameMarker(addFrameMarker([], failed("https://a.dev/")), failed("https://b.dev/"));

  it("drops the addresses the page reported missing", () => {
    expect(urls(dropFrameMarkers(two(), ["https://a.dev/"]))).toEqual(["https://b.dev/"]);
  });

  it("returns the same array when nothing was dropped", () => {
    const markers = two();
    expect(dropFrameMarkers(markers, ["https://c.dev/"])).toBe(markers);
  });

  it("can drop every marker", () => {
    expect(dropFrameMarkers(two(), ["https://a.dev/", "https://b.dev/"])).toEqual([]);
  });

  it("ignores an empty report", () => {
    const markers = two();
    expect(dropFrameMarkers(markers, [])).toBe(markers);
  });
});
