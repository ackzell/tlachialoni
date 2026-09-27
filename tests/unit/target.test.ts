import { describe, expect, it } from "vitest";
import { describeTarget, splitTargetLabel } from "../../src/renderer/src/utils/target";

describe("describeTarget", () => {
  it("shows host and path for deep routes", () => {
    expect(describeTarget("http://localhost:3000/en/guide").label).toBe("localhost:3000/en/guide");
  });

  it("keeps query strings and drops a bare root slash", () => {
    expect(describeTarget("http://localhost:3000/?q=1").label).toBe("localhost:3000/?q=1");
    expect(describeTarget("http://localhost:3000").label).toBe("localhost:3000");
    expect(describeTarget("https://localhost:5173/").label).toBe("localhost:5173");
  });

  it("flags https as secure", () => {
    expect(describeTarget("https://localhost:5173").secure).toBe(true);
    expect(describeTarget("http://localhost:5173").secure).toBe(false);
  });

  it("handles empty and malformed values", () => {
    expect(describeTarget("")).toEqual({ label: "", secure: false });
    expect(describeTarget(null)).toEqual({ label: "", secure: false });
    expect(describeTarget("not a url").label).toBe("not a url");
  });
});

describe("splitTargetLabel", () => {
  it("splits host, port, and path segments on : and /", () => {
    expect(splitTargetLabel("localhost:5173/api/users?tab=1")).toEqual([
      "localhost:",
      "5173/",
      "api/",
      "users?tab=1",
    ]);
  });

  it("keeps a trailing separator with the preceding unit", () => {
    expect(splitTargetLabel("localhost:5173/guide/")).toEqual(["localhost:", "5173/", "guide/"]);
  });

  it("handles a bare host and port", () => {
    expect(splitTargetLabel("localhost:3000")).toEqual(["localhost:", "3000"]);
  });

  it("passes malformed and empty labels through as one unit", () => {
    expect(splitTargetLabel("not a url")).toEqual(["not a url"]);
    expect(splitTargetLabel("")).toEqual([""]);
  });

  it("reassembles IPv6 literals exactly", () => {
    expect(splitTargetLabel("[::1]:3000").join("")).toBe("[::1]:3000");
  });

  it("never loses text on long paths", () => {
    const label = "localhost:3000/a/b/c/d/e/f/g/h?x=1";
    expect(splitTargetLabel(label).join("")).toBe(label);
    expect(splitTargetLabel(label).length).toBeGreaterThan(6);
  });
});
