import { describe, expect, it } from "vitest";
import { isHistoryArmedVisible } from "@shared/history";

describe("isHistoryArmedVisible", () => {
  it("is hidden when no gesture is armed", () => {
    expect(isHistoryArmedVisible(null, false)).toBe(false);
  });

  it("shows while a Back gesture is armed", () => {
    expect(isHistoryArmedVisible({ direction: "back", progress: 0.5 }, false)).toBe(true);
  });

  it("shows while a Forward gesture is armed", () => {
    expect(isHistoryArmedVisible({ direction: "forward", progress: 0.5 }, false)).toBe(true);
  });

  it("is hidden while the command palette is open", () => {
    expect(isHistoryArmedVisible({ direction: "back", progress: 0.5 }, true)).toBe(false);
  });
});
