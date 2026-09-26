import { describe, expect, it } from "vitest";
import { describeTarget } from "../../src/renderer/src/utils/target";

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
