import { describe, expect, it } from "vitest";
import { formatReleaseDate } from "../../src/shared/release";

describe("formatReleaseDate", () => {
  it("renders an ISO date long-form", () => {
    expect(formatReleaseDate("2026-09-28")).toBe("September 28, 2026");
  });

  it("handles a leap day", () => {
    expect(formatReleaseDate("2024-02-29")).toBe("February 29, 2024");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatReleaseDate("not-a-date")).toBe("not-a-date");
    expect(formatReleaseDate("2026/09/28")).toBe("2026/09/28");
  });

  it("returns an impossible date unchanged", () => {
    expect(formatReleaseDate("2026-13-45")).toBe("2026-13-45");
  });
});
